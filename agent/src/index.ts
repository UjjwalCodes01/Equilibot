/**
 * EquiliBot Agent — Main Orchestrator (Phase 3)
 *
 * The Observe → Calculate → Verify → Execute loop with:
 * - Execution mode ladder (observe → simulate → canary → active)
 * - Runtime pre-submit policy enforcement
 * - Metrics collection and telemetry API
 * - Signer abstraction (local / managed)
 * - Graceful shutdown with cleanup
 */

import { createPublicClient, http, webSocket, type Address, type Hex } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { getConfig } from './config/index.js'
import { getAddresses } from './config/addresses.js'
import { getPairDefinitions } from './config/pairs.js'
import { MarketObserver } from './services/market-observer.js'
import { OracleService } from './services/oracle-service.js'
import { GasService } from './services/gas-service.js'
import { BalanceService } from './services/balance-service.js'
import { QuoteService } from './services/quote-service.js'
import { PolicyService } from './services/policy-service.js'
import { SimulationService } from './services/simulation-service.js'
import { ExecutionService } from './services/execution-service.js'
import { GuardOracleService } from './services/guard-oracle-service.js'
import { AlertService } from './services/alert-service.js'
import { RiskMonitor } from './services/risk-monitor.js'
import { AuditStore } from './services/audit-store.js'
import { createSigner } from './services/signer.js'
import { MetricsCollector } from './services/metrics-collector.js'
import { TelemetryServer } from './services/telemetry-server.js'
import { RebalanceDetector } from './strategy/rebalance-detector.js'
import { IntentBuilder } from './strategy/intent-builder.js'
import { AutonomousTaskRunner } from './strategy/autonomous-task-runner.js'
import { checkProfitability } from './strategy/profitability.js'
import { validatePreSubmit, type ExecutionMode } from './strategy/runtime-policy.js'
import { CircuitBreaker } from './utils/circuit-breaker.js'
import { createLogger } from './utils/logger.js'
import { equiliBotModuleAbi } from './abi/equilibot-module.js'
import { swapGuardAbi } from './abi/swap-guard.js'
import type {
  TradingPair,
  MarketSnapshot,
  PoolState,
  OraclePrice,
} from './types/index.js'

const log = createLogger('orchestrator')

// ─── State ───────────────────────────────────────────────────────

let pairs: TradingPair[] = []
const poolToPair = new Map<Address, TradingPair>()
const lastProcessedBlock = new Map<Address, bigint>()
let isProcessing = false

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.status('INITIALIZING', 'EquiliBot Agent starting...')

  // 1. Load config
  const config = getConfig()
  const addresses = getAddresses()
  const executionMode = config.EXECUTION_MODE as ExecutionMode

  const alertService = new AlertService(
    config.ALERT_WEBHOOK_URL,
    config.ALERT_MIN_SEVERITY,
    config.ALERT_DEDUP_COOLDOWN_MS
  )

  const riskMonitor = new RiskMonitor({
    policyRejectionWindowMs: config.ALERT_POLICY_REJECTION_WINDOW_MIN * 60_000,
    policyRejectionThreshold: config.ALERT_POLICY_REJECTION_THRESHOLD,
    oracleNullWindowMs: config.ALERT_ORACLE_NULL_WINDOW_MIN * 60_000,
    oracleNullThreshold: config.ALERT_ORACLE_NULL_THRESHOLD,
    rpcFailureThreshold: config.ALERT_RPC_FAILURE_THRESHOLD,
  })

  // 2. Create signer
  const signer = createSigner(
    config.SIGNER_MODE,
    config.AGENT_PRIVATE_KEY as Hex | undefined,
    config.MANAGED_SIGNER_ADDRESS as Address | undefined,
    config.MANAGED_SIGNER_PROVIDER,
    config.RPC_PRIVATE_URL,
    config.AWS_REGION,
    config.AWS_KMS_KEY_ID
  )

  // Signer health check
  const signerHealthy = await signer.healthCheck()
  if (!signerHealthy) {
    log.fatal({ stage: 'INIT' }, 'FATAL: Signer health check failed')
    process.exit(1)
  }

  log.info(
    {
      stage: 'INIT',
      chainId: config.CHAIN_ID,
      agent: signer.address,
      signerMode: signer.mode,
      executionMode,
      module: addresses.module,
      guard: addresses.guard,
      safe: addresses.safe,
    },
    'Configuration loaded'
  )

  // 3. Initialize HTTP client
  const chain = config.CHAIN_ID === 56 ? bsc : bscTestnet
  const httpClient = createPublicClient({
    chain,
    transport: http(config.RPC_HTTP_URL),
  })

  // 4. Pre-flight checks
  await runPreflightChecks(
    httpClient,
    addresses,
    signer.address,
    config.CHAIN_ID,
    config.RPC_WSS_URL,
    executionMode
  )

  // 5. Read on-chain policy parameters
  const policyParams = await readPolicyParams(httpClient, addresses.guard)

  // 6. Initialize all services
  const observer = new MarketObserver(
    config.RPC_HTTP_URL,
    config.RPC_WSS_URL,
    config.CHAIN_ID
  )

  const oracleService = new OracleService(config.PYTH_HERMES_URL)
  const gasService = new GasService(httpClient)
  const balanceService = new BalanceService(httpClient, addresses.safe)
  const quoteService = new QuoteService(httpClient, addresses.pancakeQuoterV2)

  const policyService = new PolicyService(
    httpClient,
    addresses.guard,
    signer.address
  )

  const guardOracleService = new GuardOracleService(httpClient, addresses.guard)

  const simulationService = new SimulationService(
    config.RPC_HTTP_URL,
    signer.address,
    config.SIGNER_MODE,
    addresses.module,
    addresses.safe,
    config.AGENT_PRIVATE_KEY as Hex | undefined,
    config.SIMULATION_TIMEOUT_MS
  )

  const executionService = new ExecutionService(
    httpClient,
    addresses.module,
    signer,
    config.CHAIN_ID,
    config.RPC_HTTP_URL,
    config.RPC_PRIVATE_URL
  )

  const auditStore = new AuditStore(
    fileURLToPath(new URL('../../data/audit', import.meta.url))
  )
  await auditStore.init()

  const metricsCollector = new MetricsCollector()
  const circuitBreaker = new CircuitBreaker(config.MAX_CONSECUTIVE_FAILURES)

  // 7. Initialize telemetry server
  const telemetryServer = new TelemetryServer(
    config.TELEMETRY_PORT,
    config.TELEMETRY_BIND_ADDRESS,
    config.TELEMETRY_ALLOWED_ORIGIN,
    config.TELEMETRY_API_TOKEN
  )

  // Read min trade amounts from SwapGuard
  const minTradeAmounts = new Map<Address, bigint>()
  const pairDefinitions = getPairDefinitions(config.CHAIN_ID)
  for (const pairDef of pairDefinitions) {
    const minA = await httpClient.readContract({
      address: addresses.guard,
      abi: swapGuardAbi,
      functionName: 'minTradeAmount',
      args: [pairDef.tokenA.address],
    })
    const minB = await httpClient.readContract({
      address: addresses.guard,
      abi: swapGuardAbi,
      functionName: 'minTradeAmount',
      args: [pairDef.tokenB.address],
    })
    minTradeAmounts.set(pairDef.tokenA.address, minA)
    minTradeAmounts.set(pairDef.tokenB.address, minB)
  }

  const detector = new RebalanceDetector({
    minDeviationBps: config.MIN_DEVIATION_BPS,
    minTradeAmounts,
  })

  const intentBuilder = new IntentBuilder({
    safeAddress: addresses.safe,
    routerAddress: addresses.pancakeSmartRouter,
    maxSlippageBps: policyParams.maxSlippageBps,
    maxDeadlineDelaySeconds: Number(policyParams.maxDeadlineDelay),
  })

  // 8. Resolve pool addresses from V3 Factory
  pairs = await observer.resolvePools(addresses.pancakeV3Factory, pairDefinitions)

  if (pairs.length === 0) {
    log.fatal({ stage: 'INIT' }, 'No pools resolved — nothing to watch. Exiting.')
    process.exit(1)
  }

  for (const pair of pairs) {
    poolToPair.set(pair.poolAddress, pair)
  }

  const taskRunner = new AutonomousTaskRunner({
    config,
    executionMode,
    pairs,
    getPoolState: (poolAddress: Address) => observer.getPoolState(poolAddress),
    oracleService,
    gasService,
    balanceService,
    quoteService,
    intentBuilder,
    policyService,
    guardOracleService,
    simulationService,
    executionService,
    auditStore,
    metrics: metricsCollector,
    circuitBreaker,
    alertService,
    riskMonitor,
  })

  // 9. Start services
  await gasService.start()

  // Set telemetry deps
  telemetryServer.setDeps({
    metrics: metricsCollector,
    auditStore,
    circuitBreaker,
    executionMode,
    pairsWatched: pairs.length,
    chainId: config.CHAIN_ID,
    taskRunner,
  })
  telemetryServer.setPolicyCache({
    maxSlippageBps: policyParams.maxSlippageBps,
    maxDeadlineDelay: policyParams.maxDeadlineDelay.toString(),
    cooldownSeconds: policyParams.cooldownSeconds.toString(),
  })
  await telemetryServer.start()
  taskRunner.start()

  let rpcHealthCheckInFlight = false
  const rpcHealthInterval = setInterval(() => {
    if (rpcHealthCheckInFlight) {
      return
    }

    rpcHealthCheckInFlight = true
    void (async () => {
      try {
        const blockNumber = await httpClient.getBlockNumber()
        const recoveryAlert = riskMonitor.recordRpcSuccess(blockNumber)
        if (recoveryAlert) {
          await alertService.notify(recoveryAlert)
        }
      } catch (error) {
        const degradationAlert = riskMonitor.recordRpcFailure(error)
        if (degradationAlert) {
          await alertService.notify(degradationAlert)
        }
      } finally {
        rpcHealthCheckInFlight = false
      }
    })()
  }, config.ALERT_RPC_CHECK_INTERVAL_MS)

  // 10. Register the pipeline as the observer callback
  observer.onUpdate(async (poolAddress: Address, poolState: PoolState) => {
    if (circuitBreaker.isTripped) {
      log.warn({ stage: 'SYSTEM' }, 'Circuit breaker tripped — ignoring update')
      return
    }

    if (isProcessing) {
      log.debug({ stage: 'OBSERVE', poolAddress }, 'Pipeline busy, skipping update')
      return
    }

    const lastBlock = lastProcessedBlock.get(poolAddress)
    if (lastBlock !== undefined && lastBlock >= poolState.blockNumber) {
      return
    }

    const pair = poolToPair.get(poolAddress)
    if (!pair) return

    isProcessing = true
    try {
      await runPipeline(
        pair,
        poolState,
        config,
        executionMode,
        oracleService,
        gasService,
        balanceService,
        quoteService,
        detector,
        intentBuilder,
        policyService,
        guardOracleService,
        simulationService,
        executionService,
        auditStore,
        metricsCollector,
        circuitBreaker,
        alertService,
        riskMonitor
      )
      lastProcessedBlock.set(poolAddress, poolState.blockNumber)
    } finally {
      isProcessing = false
    }
  })

  // 11. Start the observer
  await observer.start(pairs)
  log.status(
    'OBSERVING',
    `EquiliBot Agent is live — mode=${executionMode}, watching ${pairs.length} pools`
  )

  // Graceful shutdown
  const shutdown = async () => {
    log.status('PAUSED', 'Shutting down...')
    observer.stop()
    taskRunner.stop()
    gasService.stop()
    clearInterval(rpcHealthInterval)
    await telemetryServer.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => { shutdown() })
  process.on('SIGTERM', () => { shutdown() })
  process.on('unhandledRejection', (reason) => {
    log.error({ stage: 'SYSTEM', error: reason }, 'Unhandled promise rejection')
  })
}

// ─── Pipeline ────────────────────────────────────────────────────

async function runPipeline(
  pair: TradingPair,
  poolState: PoolState,
  config: ReturnType<typeof getConfig>,
  executionMode: ExecutionMode,
  oracleService: OracleService,
  gasService: GasService,
  balanceService: BalanceService,
  quoteService: QuoteService,
  detector: RebalanceDetector,
  intentBuilder: IntentBuilder,
  policyService: PolicyService,
  guardOracleService: GuardOracleService,
  simulationService: SimulationService,
  executionService: ExecutionService,
  auditStore: AuditStore,
  metrics: MetricsCollector,
  circuitBreaker: CircuitBreaker,
  alertService: AlertService,
  riskMonitor: RiskMonitor
): Promise<void> {
  const pipelineStartTime = Date.now()
  metrics.incrementPipelineRuns()

  try {
    // ── OBSERVE: Build market snapshot ──────────────────────────

    const feedIds: Hex[] = []
    if (pair.pythFeedIdA) feedIds.push(pair.pythFeedIdA)
    if (pair.pythFeedIdB) feedIds.push(pair.pythFeedIdB)

    const oraclePrices = await oracleService.getPrices(feedIds)
    let oraclePriceA: OraclePrice | null = pair.pythFeedIdA
      ? oraclePrices.get(pair.pythFeedIdA) ?? null
      : null
    let oraclePriceB: OraclePrice | null = pair.pythFeedIdB
      ? oraclePrices.get(pair.pythFeedIdB) ?? null
      : null

    if (!oraclePriceB && oraclePriceA) {
      oraclePriceB = await guardOracleService.deriveQuoteTokenUsdFromBaseToken(
        pair.tokenA,
        pair.tokenB,
        oraclePriceA
      )
    }

    if (!oraclePriceA && oraclePriceB) {
      oraclePriceA = await guardOracleService.deriveQuoteTokenUsdFromBaseToken(
        pair.tokenB,
        pair.tokenA,
        oraclePriceB
      )
    }

    // Stablecoin synthetic $1.00 fallback — BUSD/USDT/USDC are always pegged.
    // Pyth feed and on-chain guard oracle may be stale for deprecated coins like BUSD.
    const KNOWN_STABLECOINS = new Set(['BUSD', 'USDT', 'USDC', 'DAI'])
    const SYNTHETIC_STABLE_PRICE: OraclePrice = {
      price: 100_000_000n,
      confidence: 500_000n,
      exponent: -8,
      publishTime: Math.floor(Date.now() / 1000),
      feedId: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
    }
    if (!oraclePriceB && KNOWN_STABLECOINS.has(pair.tokenB.symbol)) {
      oraclePriceB = SYNTHETIC_STABLE_PRICE
    }
    if (!oraclePriceA && KNOWN_STABLECOINS.has(pair.tokenA.symbol)) {
      oraclePriceA = SYNTHETIC_STABLE_PRICE
    }

    if (!oraclePriceA || !oraclePriceB) {
      const oracleAlert = riskMonitor.recordOracleUnavailable(pair.id)
      if (oracleAlert) {
        await alertService.notify(oracleAlert)
      }
    }

    const blockNumber = poolState.blockNumber
    const [safeBalanceA, safeBalanceB] = await Promise.all([
      balanceService.getBalance(pair.tokenA.address, blockNumber),
      balanceService.getBalance(pair.tokenB.address, blockNumber),
    ])

    const snapshot: MarketSnapshot = {
      pair,
      pool: poolState,
      oraclePriceA,
      oraclePriceB,
      gasPrice: gasService.getGasPrice(),
      safeBalanceA,
      safeBalanceB,
      blockNumber,
      timestamp: Date.now(),
    }

    // ── CALCULATE: Detect opportunity ──────────────────────────
    const opportunity = detector.detect(snapshot)

    if (!opportunity) {
      return
    }

    metrics.incrementOpportunities()
    await auditStore.recordOpportunity(opportunity)

    // ── OBSERVE-ONLY GATE ──────────────────────────────────────
    if (executionMode === 'observe') {
      log.info(
        { stage: 'CALCULATE', pair: pair.id, mode: executionMode },
        'Observe-only mode — opportunity logged, no further action'
      )
      metrics.incrementSkip('observe-only mode')
      await auditStore.recordSkip(pair.id, 'Observe-only mode', snapshot)
      return
    }

    // ── CALCULATE: Check gas acceptability ──────────────────────
    if (!gasService.isGasPriceAcceptable(config.MAX_GAS_PRICE_MULTIPLIER)) {
      log.warn(
        {
          stage: 'CALCULATE',
          pair: pair.id,
          gasPrice: gasService.getGasPrice().toString(),
          rollingAvg: gasService.getRollingAverage().toString(),
        },
        'Gas price spike — blocking execution'
      )
      metrics.incrementSkip('Gas price spike')
      await auditStore.recordSkip(pair.id, 'Gas price spike', snapshot)
      return
    }

    // ── CALCULATE: Get on-chain quote via QuoterV2 ─────────────
    const tokenInAddr = opportunity.direction === 'BUY_A' ? pair.tokenB.address : pair.tokenA.address
    const tokenOutAddr = opportunity.direction === 'BUY_A' ? pair.tokenA.address : pair.tokenB.address

    const quoteResult = await quoteService.getExactInputSingleQuote(
      tokenInAddr,
      tokenOutAddr,
      pair.feeTier,
      opportunity.suggestedAmountIn
    )

    if (!quoteResult || quoteResult.amountOut === 0n) {
      log.warn(
        { stage: 'CALCULATE', pair: pair.id },
        'Quote returned zero or failed, skipping'
      )
      metrics.incrementSkip('Quote failed or zero output')
      await auditStore.recordSkip(pair.id, 'Quote failed or zero output', snapshot)
      return
    }

    // ── CALCULATE: Check profitability ─────────────────────────
    const tokenIn = opportunity.direction === 'BUY_A' ? pair.tokenB : pair.tokenA
    const tokenOut = opportunity.direction === 'BUY_A' ? pair.tokenA : pair.tokenB

    const tokenInPriceInNative = deriveNativePrice(
      tokenIn.symbol,
      oraclePriceA,
      oraclePriceB,
      pair,
      opportunity.direction === 'BUY_A' ? 'B' : 'A'
    )
    const tokenOutPriceInNative = deriveNativePrice(
      tokenOut.symbol,
      oraclePriceA,
      oraclePriceB,
      pair,
      opportunity.direction === 'BUY_A' ? 'A' : 'B'
    )

    if (tokenInPriceInNative === 0n || tokenOutPriceInNative === 0n) {
      log.warn(
        {
          stage: 'CALCULATE',
          pair: pair.id,
          tokenInPriceInNative: tokenInPriceInNative.toString(),
          tokenOutPriceInNative: tokenOutPriceInNative.toString(),
        },
        'Unable to derive native token valuation from oracle data, skipping'
      )
      metrics.incrementSkip('Missing native valuation')
      await auditStore.recordSkip(pair.id, 'Missing native valuation from oracle feeds', snapshot)
      return
    }

    const profitResult = checkProfitability(
      {
        expectedAmountOut: quoteResult.amountOut,
        minAmountOut: 0n,
        amountIn: opportunity.suggestedAmountIn,
        gasPrice: gasService.getGasPrice(),
        gasRollingAverage: gasService.getRollingAverage(),
        tokenOutPriceInNative,
        tokenInPriceInNative,
        tokenOutDecimals: tokenOut.decimals,
        tokenInDecimals: tokenIn.decimals,
      },
      config.MIN_PROFIT_MULTIPLIER,
      config.MAX_GAS_PRICE_MULTIPLIER
    )

    if (!profitResult.isProfitable) {
      log.info(
        { stage: 'CALCULATE', pair: pair.id, reason: profitResult.reason },
        'SKIP: not profitable'
      )
      metrics.incrementSkip(profitResult.reason)
      await auditStore.recordSkip(pair.id, profitResult.reason, snapshot)
      return
    }

    // ── CALCULATE: Build intent ────────────────────────────────
    const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

    const intent = intentBuilder.build(
      opportunity,
      quoteResult.amountOut,
      profitResult.estimatedGasCost,
      profitResult.estimatedProfitInNative,
      blockTimestamp
    )

    const swapRequest = intentBuilder.toSwapRequest(intent)
    await auditStore.recordIntent(intent)

    // ── VERIFY: Policy pre-validation ──────────────────────────
    const policyResult = await policyService.validateIntent(intent, swapRequest)
    await auditStore.recordPolicyResult(intent.id, pair.id, policyResult)
    metrics.incrementPolicyChecks(policyResult.passed)

    if (!policyResult.passed) {
      const policyAlert = riskMonitor.recordPolicyRejection(
        policyResult.error ?? 'Unknown policy rejection'
      )
      if (policyAlert) {
        await alertService.notify(policyAlert)
      }

      log.info(
        {
          stage: 'VERIFY',
          intentId: intent.id,
          pair: pair.id,
          reason: policyResult.error,
        },
        `REJECTED: policy check failed — ${policyResult.error}`
      )
      return
    }

    // ── VERIFY: Fork simulation ────────────────────────────────
    const simResult = await simulationService.simulate(intent, swapRequest)
    await auditStore.recordSimulation(intent.id, pair.id, simResult)
    metrics.incrementSimulations(simResult.success)

    if (!simResult.success) {
      log.info(
        {
          stage: 'VERIFY',
          intentId: intent.id,
          pair: pair.id,
          revertReason: simResult.revertReason,
        },
        `REJECTED: simulation failed — ${simResult.revertReason}`
      )
      const tripped = circuitBreaker.recordFailure(simResult.revertReason, `simulation:${pair.id}`)
      if (tripped) {
        await alertService.notify({
          eventType: 'circuit-breaker-tripped',
          severity: 'fatal',
          title: 'Circuit breaker tripped during simulation failures',
          details: {
            pair: pair.id,
            reason: simResult.revertReason,
          },
          dedupeKey: 'circuit-breaker-tripped',
          cooldownMs: 300000,
        })
      }
      return
    }

    // ── SIMULATE-ONLY GATE ─────────────────────────────────────
    if (executionMode === 'simulate') {
      log.info(
        { stage: 'VERIFY', intentId: intent.id, pair: pair.id, mode: executionMode },
        'Simulate-only mode — simulation passed, no execution'
      )
      metrics.incrementSkip('simulate-only mode')
      await auditStore.recordSkip(pair.id, 'Simulate-only mode', snapshot)
      return
    }

    // ── VERIFY: Runtime pre-submit policy ──────────────────────
    const oraclePriceForTokenIn =
      opportunity.direction === 'BUY_A' ? oraclePriceB : oraclePriceA

    const runtimeResult = validatePreSubmit(
      intent,
      {
        executionMode,
        canaryMaxTradeUsd: config.CANARY_MAX_TRADE_USD,
        runtimeMaxNotionalUsd: config.RUNTIME_MAX_NOTIONAL_USD,
        safeAddress: config.SAFE_ADDRESS,
      },
      oraclePriceForTokenIn,
      pipelineStartTime
    )

    if (!runtimeResult.passed) {
      log.info(
        {
          stage: 'VERIFY',
          intentId: intent.id,
          pair: pair.id,
          reason: runtimeResult.reason,
        },
        `REJECTED: runtime policy — ${runtimeResult.reason}`
      )
      metrics.incrementSkip(runtimeResult.reason)
      await auditStore.recordSkip(pair.id, runtimeResult.reason, snapshot)
      return
    }

    // ── EXECUTE: Submit on-chain ───────────────────────────────
    const executionRecord = await executionService.execute(intent, swapRequest)
    await auditStore.recordExecution(executionRecord, pair.id)
    metrics.incrementExecutions(executionRecord.status === 'EXECUTED')

    if (executionRecord.status === 'EXECUTED') {
      circuitBreaker.recordSuccess()
      balanceService.invalidateAll()
      log.info(
        {
          stage: 'EXECUTE',
          intentId: intent.id,
          pair: pair.id,
          txHash: executionRecord.txHash,
          direction: intent.direction,
        },
        `✅ SWAP EXECUTED: ${intent.direction} on ${pair.id}`
      )
    } else {
      const tripped = circuitBreaker.recordFailure(executionRecord.rejectReason, `execution:${pair.id}`)
      if (tripped) {
        await alertService.notify({
          eventType: 'circuit-breaker-tripped',
          severity: 'fatal',
          title: 'Circuit breaker tripped during execution failures',
          details: {
            pair: pair.id,
            reason: executionRecord.rejectReason,
          },
          dedupeKey: 'circuit-breaker-tripped',
          cooldownMs: 300000,
        })
      }
    }
  } catch (error) {
    log.error(
      { stage: 'SYSTEM', error, pair: pair.id },
      'Unhandled error in pipeline'
    )
    const tripped = circuitBreaker.recordFailure(error, `pipeline:${pair.id}`)
    if (tripped) {
      await alertService.notify({
        eventType: 'circuit-breaker-tripped',
        severity: 'fatal',
        title: 'Circuit breaker tripped due to pipeline failures',
        details: {
          pair: pair.id,
          error: error instanceof Error ? error.message : String(error),
        },
        dedupeKey: 'circuit-breaker-tripped',
        cooldownMs: 300000,
      })
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function deriveNativePrice(
  tokenSymbol: string,
  oraclePriceA: OraclePrice | null,
  oraclePriceB: OraclePrice | null,
  pair: TradingPair,
  whichToken: 'A' | 'B'
): bigint {
  if (tokenSymbol === 'WBNB' || tokenSymbol === 'BNB') {
    return 10n ** 18n
  }

  const bnbIsA = pair.tokenA.symbol === 'WBNB' || pair.tokenA.symbol === 'BNB'
  const bnbOraclePrice = bnbIsA ? oraclePriceA : oraclePriceB
  const tokenOraclePrice = whichToken === 'A' ? oraclePriceA : oraclePriceB

  if (!bnbOraclePrice || !tokenOraclePrice) {
    return 0n
  }

  const tokenUSD = normalizePythPrice(tokenOraclePrice)
  const bnbUSD = normalizePythPrice(bnbOraclePrice)

  if (bnbUSD === 0n) return 0n

  return (tokenUSD * (10n ** 18n)) / bnbUSD
}

function normalizePythPrice(price: OraclePrice): bigint {
  const absExponent = Math.abs(price.exponent)
  if (price.exponent < 0) {
    if (absExponent <= 18) {
      return price.price * 10n ** BigInt(18 - absExponent)
    }
    return price.price / 10n ** BigInt(absExponent - 18)
  }
  return price.price * 10n ** BigInt(18 + price.exponent)
}

// ─── Pre-flight Checks ──────────────────────────────────────────

async function runPreflightChecks(
  client: ReturnType<typeof createPublicClient>,
  addresses: ReturnType<typeof getAddresses>,
  agentAddress: Address,
  chainId: number,
  rpcWssUrl: string,
  executionMode: ExecutionMode
): Promise<void> {
  log.info({ stage: 'INIT' }, 'Running pre-flight checks...')

  if (executionMode !== 'observe') {
    const anvilCheck = spawnSync('anvil', ['--version'], { stdio: 'ignore' })
    if (anvilCheck.status !== 0) {
      log.fatal(
        { stage: 'INIT', executionMode },
        'FATAL: anvil is required in PATH for simulate/canary/active execution modes'
      )
      process.exit(1)
    }
  }

  const liveChainId = await client.getChainId()
  if (liveChainId !== chainId) {
    log.fatal(
      { stage: 'INIT', configuredChainId: chainId, liveChainId },
      'FATAL: RPC endpoint chain ID mismatch'
    )
    process.exit(1)
  }

  const criticalContracts: Array<[string, Address]> = [
    ['Safe', addresses.safe],
    ['EquiliBotModule', addresses.module],
    ['SwapGuard', addresses.guard],
    ['PancakeV3Factory', addresses.pancakeV3Factory],
    ['PancakeSmartRouter', addresses.pancakeSmartRouter],
    ['PancakeQuoterV2', addresses.pancakeQuoterV2],
  ]

  for (const [label, address] of criticalContracts) {
    const bytecode = await client.getBytecode({ address })
    if (!bytecode || bytecode === '0x') {
      log.fatal(
        { stage: 'INIT', label, address },
        `FATAL: ${label} has no bytecode at configured address`
      )
      process.exit(1)
    }
  }

  try {
    const wsChain = chainId === 56 ? bsc : bscTestnet
    const wsClient = createPublicClient({
      chain: wsChain,
      transport: webSocket(rpcWssUrl),
    })
    await wsClient.getBlockNumber()
  } catch (error) {
    log.fatal(
      { stage: 'INIT', error },
      'FATAL: RPC_WSS_URL is not reachable or not serving chain data'
    )
    process.exit(1)
  }

  const configuredAgent = await client.readContract({
    address: addresses.module,
    abi: equiliBotModuleAbi,
    functionName: 'agent',
  })

  if (configuredAgent.toLowerCase() !== agentAddress.toLowerCase()) {
    log.fatal(
      { stage: 'INIT', configuredAgent, ourAgent: agentAddress },
      'FATAL: Agent address mismatch. This wallet is not authorized on EquiliBotModule.'
    )
    process.exit(1)
  }

  const modulePaused = await client.readContract({
    address: addresses.module,
    abi: equiliBotModuleAbi,
    functionName: 'paused',
  })

  if (modulePaused) {
    log.fatal({ stage: 'INIT' }, 'FATAL: EquiliBotModule is paused.')
    process.exit(1)
  }

  const guardPaused = await client.readContract({
    address: addresses.guard,
    abi: swapGuardAbi,
    functionName: 'paused',
  })

  if (guardPaused) {
    log.fatal({ stage: 'INIT' }, 'FATAL: SwapGuard is paused.')
    process.exit(1)
  }

  log.info({ stage: 'INIT' }, '✅ All pre-flight checks passed')
}

async function readPolicyParams(
  client: ReturnType<typeof createPublicClient>,
  guardAddress: Address
) {
  const [maxSlippageBps, maxDeadlineDelay, cooldownSeconds] = await Promise.all([
    client.readContract({
      address: guardAddress,
      abi: swapGuardAbi,
      functionName: 'maxSlippageBps',
    }),
    client.readContract({
      address: guardAddress,
      abi: swapGuardAbi,
      functionName: 'maxDeadlineDelay',
    }),
    client.readContract({
      address: guardAddress,
      abi: swapGuardAbi,
      functionName: 'cooldownSeconds',
    }),
  ])

  log.info(
    {
      stage: 'INIT',
      maxSlippageBps,
      maxDeadlineDelay: maxDeadlineDelay.toString(),
      cooldownSeconds: cooldownSeconds.toString(),
    },
    'On-chain policy parameters loaded'
  )

  return { maxSlippageBps, maxDeadlineDelay, cooldownSeconds }
}

// ─── Entry Point ─────────────────────────────────────────────────

main().catch((err) => {
  log.fatal({ stage: 'SYSTEM', error: err }, 'Fatal error during startup')
  process.exit(1)
})




