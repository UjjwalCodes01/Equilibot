/**
 * EquiliBot Agent — Main Orchestrator
 *
 * The Observe → Calculate → Verify → Execute loop.
 *
 * 1. Load and validate config
 * 2. Initialize all services
 * 3. Resolve pool addresses from V3 Factory
 * 4. Verify agent is authorized on EquiliBotModule
 * 5. Verify SwapGuard is not paused
 * 6. Start WebSocket market observer
 * 7. On each pool state change: full pipeline
 * 8. Circuit breaker: self-pause after consecutive failures
 */

import { createPublicClient, http, webSocket, type Address, type Hex } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
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
import { AuditStore } from './services/audit-store.js'
import { RebalanceDetector } from './strategy/rebalance-detector.js'
import { IntentBuilder } from './strategy/intent-builder.js'
import { checkProfitability } from './strategy/profitability.js'
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
  const agentAddress =
    config.SIGNER_MODE === 'managed'
      ? (config.MANAGED_SIGNER_ADDRESS as Address)
      : privateKeyToAccount(config.AGENT_PRIVATE_KEY as Hex).address

  log.info(
    {
      stage: 'INIT',
      chainId: config.CHAIN_ID,
      agent: agentAddress,
      signerMode: config.SIGNER_MODE,
      module: addresses.module,
      guard: addresses.guard,
      safe: addresses.safe,
    },
    'Configuration loaded'
  )

  // 2. Initialize HTTP client
  const chain = config.CHAIN_ID === 56 ? bsc : bscTestnet
  const httpClient = createPublicClient({
    chain,
    transport: http(config.RPC_HTTP_URL),
  })

  // 3. Pre-flight checks
  await runPreflightChecks(
    httpClient,
    addresses,
    agentAddress,
    config.CHAIN_ID,
    config.RPC_WSS_URL
  )

  // 4. Read on-chain policy parameters
  const policyParams = await readPolicyParams(httpClient, addresses.guard)

  // 5. Initialize all services
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
    agentAddress
  )

  const simulationService = new SimulationService(
    config.RPC_HTTP_URL,
    agentAddress,
    config.SIGNER_MODE,
    addresses.module,
    addresses.safe,
    config.AGENT_PRIVATE_KEY as Hex | undefined,
    config.SIMULATION_TIMEOUT_MS
  )

  const executionService = new ExecutionService(
    httpClient,
    addresses.module,
    agentAddress,
    config.SIGNER_MODE,
    config.CHAIN_ID,
    config.AGENT_PRIVATE_KEY as Hex | undefined,
    config.RPC_PRIVATE_URL
  )

  const auditStore = new AuditStore(
    new URL('../../data/audit', import.meta.url).pathname
  )
  await auditStore.init()

  // Read min trade amounts from SwapGuard for each token
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

  const circuitBreaker = new CircuitBreaker(config.MAX_CONSECUTIVE_FAILURES)

  // 6. Resolve pool addresses from V3 Factory
  pairs = await observer.resolvePools(addresses.pancakeV3Factory, pairDefinitions)

  if (pairs.length === 0) {
    log.fatal({ stage: 'INIT' }, 'No pools resolved — nothing to watch. Exiting.')
    process.exit(1)
  }

  for (const pair of pairs) {
    poolToPair.set(pair.poolAddress, pair)
  }

  // 7. Start services
  await gasService.start()

  // 8. Register the pipeline as the observer callback
  observer.onUpdate(async (poolAddress: Address, poolState: PoolState) => {
    if (circuitBreaker.isTripped) {
      log.warn({ stage: 'SYSTEM' }, 'Circuit breaker tripped — ignoring update')
      return
    }

    if (isProcessing) {
      log.debug({ stage: 'OBSERVE', poolAddress }, 'Pipeline busy, skipping update')
      return
    }

    // Debounce: skip if already processed this block for this pool
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
        oracleService,
        gasService,
        balanceService,
        quoteService,
        detector,
        intentBuilder,
        policyService,
        simulationService,
        executionService,
        auditStore,
        circuitBreaker
      )
      lastProcessedBlock.set(poolAddress, poolState.blockNumber)
    } finally {
      isProcessing = false
    }
  })

  // 9. Start the observer
  await observer.start(pairs)
  log.status('OBSERVING', `EquiliBot Agent is live — watching ${pairs.length} pools`)

  // Graceful shutdown
  const shutdown = () => {
    log.status('PAUSED', 'Shutting down...')
    observer.stop()
    gasService.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ─── Pipeline ────────────────────────────────────────────────────

async function runPipeline(
  pair: TradingPair,
  poolState: PoolState,
  config: ReturnType<typeof getConfig>,
  oracleService: OracleService,
  gasService: GasService,
  balanceService: BalanceService,
  quoteService: QuoteService,
  detector: RebalanceDetector,
  intentBuilder: IntentBuilder,
  policyService: PolicyService,
  simulationService: SimulationService,
  executionService: ExecutionService,
  auditStore: AuditStore,
  circuitBreaker: CircuitBreaker
): Promise<void> {

  try {
    // ── OBSERVE: Build market snapshot ──────────────────────────

    // Fetch BOTH oracle feeds for cross-rate derivation
    const feedIds: Hex[] = []
    if (pair.pythFeedIdA) feedIds.push(pair.pythFeedIdA)
    if (pair.pythFeedIdB) feedIds.push(pair.pythFeedIdB)

    const oraclePrices = await oracleService.getPrices(feedIds)
    const oraclePriceA: OraclePrice | null = pair.pythFeedIdA
      ? oraclePrices.get(pair.pythFeedIdA) ?? null
      : null
    const oraclePriceB: OraclePrice | null = pair.pythFeedIdB
      ? oraclePrices.get(pair.pythFeedIdB) ?? null
      : null

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

    await auditStore.recordOpportunity(opportunity)

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
      await auditStore.recordSkip(pair.id, 'Quote failed or zero output', snapshot)
      return
    }

    // ── CALCULATE: Check profitability ─────────────────────────
    const tokenIn = opportunity.direction === 'BUY_A' ? pair.tokenB : pair.tokenA
    const tokenOut = opportunity.direction === 'BUY_A' ? pair.tokenA : pair.tokenB

    // Derive per-token native (BNB) prices from Pyth USD feeds
    // tokenA price in BNB = tokenA_USD / BNB_USD
    // We need both the specific token USD price and BNB USD price
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
        {
          stage: 'CALCULATE',
          pair: pair.id,
          reason: profitResult.reason,
        },
        'SKIP: not profitable'
      )
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

    if (!policyResult.passed) {
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
      circuitBreaker.recordFailure(simResult.revertReason, `simulation:${pair.id}`)
      return
    }

    // ── EXECUTE: Submit on-chain ───────────────────────────────
    const executionRecord = await executionService.execute(intent, swapRequest)
    await auditStore.recordExecution(executionRecord, pair.id)

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
      circuitBreaker.recordFailure(executionRecord.rejectReason, `execution:${pair.id}`)
    }
  } catch (error) {
    log.error(
      { stage: 'SYSTEM', error, pair: pair.id },
      'Unhandled error in pipeline'
    )
    circuitBreaker.recordFailure(error, `pipeline:${pair.id}`)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Derive a token's price in native BNB.
 * For WBNB: 1:1 (10^18).
 * For others: tokenUSD / bnbUSD, using the available oracle data.
 */
function deriveNativePrice(
  tokenSymbol: string,
  oraclePriceA: OraclePrice | null,
  oraclePriceB: OraclePrice | null,
  pair: TradingPair,
  whichToken: 'A' | 'B'
): bigint {
  // If this IS BNB, 1 BNB = 10^18 wei (1:1 scaling)
  if (tokenSymbol === 'WBNB' || tokenSymbol === 'BNB') {
    return 10n ** 18n
  }

  // Find BNB's USD price and the token's USD price
  const bnbIsA = pair.tokenA.symbol === 'WBNB' || pair.tokenA.symbol === 'BNB'
  const bnbOraclePrice = bnbIsA ? oraclePriceA : oraclePriceB
  const tokenOraclePrice = whichToken === 'A' ? oraclePriceA : oraclePriceB

  if (!bnbOraclePrice || !tokenOraclePrice) {
    // Do not guess price ratios; force pipeline to skip.
    return 0n
  }

  // tokenPrice_in_bnb = tokenUSD / bnbUSD
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
  rpcWssUrl: string
): Promise<void> {
  log.info({ stage: 'INIT' }, 'Running pre-flight checks...')

  // Ensure RPC endpoint is pointing at the expected chain.
  const liveChainId = await client.getChainId()
  if (liveChainId !== chainId) {
    log.fatal(
      {
        stage: 'INIT',
        configuredChainId: chainId,
        liveChainId,
      },
      'FATAL: RPC endpoint chain ID mismatch'
    )
    process.exit(1)
  }

  // Ensure all critical addresses are deployed contracts.
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

  // Ensure WebSocket endpoint is live and readable.
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
