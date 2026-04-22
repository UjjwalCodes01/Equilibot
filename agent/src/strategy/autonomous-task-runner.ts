import type { Address, Hex } from 'viem'
import type { Config } from '../config/index.js'
import type { TradingPair, MarketSnapshot, PoolState, OraclePrice, RebalanceOpportunity } from '../types/index.js'
import type { AutonomousTaskId, AutonomousTaskProof, AutonomousTaskStatus, AutonomousTaskState } from '../types/tasks.js'
import type { OracleService } from '../services/oracle-service.js'
import type { GasService } from '../services/gas-service.js'
import type { BalanceService } from '../services/balance-service.js'
import type { QuoteService } from '../services/quote-service.js'
import type { IntentBuilder } from './intent-builder.js'
import type { PolicyService } from '../services/policy-service.js'
import type { GuardOracleService } from '../services/guard-oracle-service.js'
import type { SimulationService } from '../services/simulation-service.js'
import type { ExecutionService } from '../services/execution-service.js'
import type { AuditStore } from '../services/audit-store.js'
import type { MetricsCollector } from '../services/metrics-collector.js'
import type { CircuitBreaker } from '../utils/circuit-breaker.js'
import type { AlertService } from '../services/alert-service.js'
import type { RiskMonitor } from '../services/risk-monitor.js'
import type { ExecutionMode } from './runtime-policy.js'
import { validatePreSubmit } from './runtime-policy.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('autonomous-task-runner')

const TASK_IDS: AutonomousTaskId[] = [
  'delta-neutral-rebalance',
  'convex-lp-migration',
  'protocol-buyback-burn',
  'yield-harvest-reinvest',
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

interface RunnerDeps {
  readonly config: Config
  readonly executionMode: ExecutionMode
  readonly pairs: TradingPair[]
  readonly getPoolState: (poolAddress: Address) => PoolState | undefined
  readonly oracleService: OracleService
  readonly gasService: GasService
  readonly balanceService: BalanceService
  readonly quoteService: QuoteService
  readonly intentBuilder: IntentBuilder
  readonly policyService: PolicyService
  readonly guardOracleService: GuardOracleService
  readonly simulationService: SimulationService
  readonly executionService: ExecutionService
  readonly auditStore: AuditStore
  readonly metrics: MetricsCollector
  readonly circuitBreaker: CircuitBreaker
  readonly alertService: AlertService
  readonly riskMonitor: RiskMonitor
}

interface TaskCadence {
  readonly intervalMs: number
  readonly jitterMs: number
}

interface TaskSwapPlan {
  readonly pair: TradingPair
  readonly direction: 'BUY_A' | 'BUY_B'
  readonly amountIn: bigint
  readonly signalBps: number
  readonly message: string
  readonly metadata: Record<string, unknown>
}

interface RunnerTaskState {
  state: AutonomousTaskState
  lastRunAt: number | null
  nextRunAt: number | null
  lastMessage: string | null
  txHash: Hex | null
}

export class AutonomousTaskRunner {
  private readonly deps: RunnerDeps
  private readonly taskState = new Map<AutonomousTaskId, RunnerTaskState>()
  private readonly latestProofs = new Map<AutonomousTaskId, AutonomousTaskProof>()
  private readonly lastStableSnapshot = new Map<string, bigint>()
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight = false

  constructor(deps: RunnerDeps) {
    this.deps = deps

    const now = Date.now()
    for (const taskId of TASK_IDS) {
      this.taskState.set(taskId, {
        state: 'IDLE',
        lastRunAt: null,
        nextRunAt: now + this.getCadence(taskId).intervalMs,
        lastMessage: null,
        txHash: null,
      })
    }
  }

  start(): void {
    if (!this.deps.config.ENABLE_AUTONOMOUS_TASKS) {
      log.warn({ stage: 'INIT' }, 'Autonomous task runner disabled by config')
      return
    }

    if (this.timer) {
      return
    }

    const tickMs = this.deps.config.AUTONOMOUS_TASK_TICK_MS
    this.timer = setInterval(() => {
      void this.runDueTasks()
    }, tickMs)

    log.info(
      {
        stage: 'INIT',
        tickMs,
      },
      'Autonomous task runner started'
    )
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  async runTask(taskId: AutonomousTaskId, trigger: 'SCHEDULED' | 'MANUAL'): Promise<AutonomousTaskProof> {
    if (this.inFlight) {
      const proof = this.createProof(taskId, 'SKIPPED', trigger, 'Task runner busy with another task', null, null, {})
      this.recordProof(proof)
      return proof
    }

    this.inFlight = true
    this.updateTaskState(taskId, {
      state: 'RUNNING',
      lastMessage: 'Running task pipeline',
      lastRunAt: Date.now(),
      txHash: null,
    })

    try {
      const plan = await this.buildTaskPlan(taskId)
      if (!plan) {
        const proof = this.createProof(taskId, 'SKIPPED', trigger, 'No actionable opportunity for task', null, null, {})
        this.recordProof(proof)
        return proof
      }

      const proof = await this.executePlan(taskId, trigger, plan)
      this.recordProof(proof)
      return proof
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown task runner failure'
      const proof = this.createProof(taskId, 'FAILED', trigger, message, null, null, {})
      this.recordProof(proof)
      return proof
    } finally {
      this.inFlight = false
      this.scheduleNextRun(taskId)
    }
  }

  getTaskStatuses(): AutonomousTaskStatus[] {
    return TASK_IDS.map((taskId) => {
      const state = this.taskState.get(taskId)
      return {
        taskId,
        state: state?.state ?? 'IDLE',
        lastRunAt: state?.lastRunAt ?? null,
        nextRunAt: state?.nextRunAt ?? null,
        lastMessage: state?.lastMessage ?? null,
        txHash: state?.txHash ?? null,
      }
    })
  }

  getLatestProof(taskId?: AutonomousTaskId): AutonomousTaskProof | null {
    if (taskId) {
      return this.latestProofs.get(taskId) ?? null
    }

    const all = Array.from(this.latestProofs.values())
    if (all.length === 0) {
      return null
    }

    all.sort((a, b) => b.timestamp - a.timestamp)
    return all[0] ?? null
  }

  private async runDueTasks(): Promise<void> {
    if (this.inFlight || this.deps.circuitBreaker.isTripped) {
      return
    }

    const now = Date.now()
    for (const taskId of TASK_IDS) {
      const state = this.taskState.get(taskId)
      if (!state?.nextRunAt || state.nextRunAt > now) {
        continue
      }

      await this.runTask(taskId, 'SCHEDULED')
      return
    }
  }

  private async buildTaskPlan(taskId: AutonomousTaskId): Promise<TaskSwapPlan | null> {
    switch (taskId) {
      case 'delta-neutral-rebalance':
        return this.buildDeltaNeutralPlan()
      case 'convex-lp-migration':
        return this.buildLpMigrationPlan()
      case 'protocol-buyback-burn':
        return this.buildBuybackPlan()
      case 'yield-harvest-reinvest':
        return this.buildHarvestPlan()
      default:
        return null
    }
  }

  private async buildDeltaNeutralPlan(): Promise<TaskSwapPlan | null> {
    const pair = this.getPrimaryPair()
    const snapshot = await this.buildSnapshot(pair)
    if (!snapshot.oraclePriceA || !snapshot.oraclePriceB) {
      return null
    }

    const valueA = this.toUsdValue(snapshot.safeBalanceA, pair.tokenA.decimals, snapshot.oraclePriceA)
    const valueB = this.toUsdValue(snapshot.safeBalanceB, pair.tokenB.decimals, snapshot.oraclePriceB)
    const total = valueA + valueB
    if (total === 0n) {
      return null
    }

    const diff = valueA > valueB ? valueA - valueB : valueB - valueA
    const driftBps = Number((diff * 10_000n) / total)
    if (driftBps < this.deps.config.TASK_REBALANCE_DRIFT_BPS) {
      return null
    }

    const rebalanceUsd = (diff * BigInt(this.deps.config.TASK_REBALANCE_SHARE_BPS)) / 10_000n
    const maxUsd = BigInt(this.deps.config.TASK_MAX_NOTIONAL_USD)
    const notionalUsd = rebalanceUsd > maxUsd ? maxUsd : rebalanceUsd
    if (notionalUsd <= 0n) {
      return null
    }

    const sellToken = valueA >= valueB ? pair.tokenA : pair.tokenB
    const sellOracle = valueA >= valueB ? snapshot.oraclePriceA : snapshot.oraclePriceB
    if (!sellOracle) {
      return null
    }

    const amountIn = this.fromUsdValue(notionalUsd, sellToken.decimals, sellOracle)
    if (amountIn <= 0n) {
      return null
    }

    return {
      pair,
      direction: valueA >= valueB ? 'BUY_B' : 'BUY_A',
      amountIn,
      signalBps: driftBps,
      message: `Treasury drift ${driftBps}bps exceeded target; executing delta-neutral rebalance`,
      metadata: {
        valueAUsd: valueA.toString(),
        valueBUsd: valueB.toString(),
        rebalanceUsd: notionalUsd.toString(),
      },
    }
  }

  private async buildLpMigrationPlan(): Promise<TaskSwapPlan | null> {
    const grouped = this.groupPairsByTokens()
    const candidateGroup = grouped.find((entry) => entry.pairs.length >= 2)
    if (!candidateGroup) {
      return null
    }

    const stableToBaseDirection: 'BUY_A' | 'BUY_B' = candidateGroup.baseIsA ? 'BUY_A' : 'BUY_B'
    const tokenIn = candidateGroup.baseIsA ? candidateGroup.quoteToken.address : candidateGroup.baseToken.address
    const tokenInDecimals = candidateGroup.baseIsA ? candidateGroup.quoteToken.decimals : candidateGroup.baseToken.decimals
    const amountIn = 10n ** BigInt(tokenInDecimals - 1)

    const quotes = await Promise.all(candidateGroup.pairs.map(async (pair) => {
      const result = await this.deps.quoteService.getExactInputSingleQuote(
        tokenIn,
        stableToBaseDirection === 'BUY_A' ? pair.tokenA.address : pair.tokenB.address,
        pair.feeTier,
        amountIn
      )
      return {
        pair,
        amountOut: result?.amountOut ?? 0n,
      }
    }))

    const ranked = quotes.filter((q) => q.amountOut > 0n).sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1))
    if (ranked.length < 2) {
      return null
    }

    const best = ranked[0]
    const second = ranked[1]
    if (!best || !second) {
      return null
    }

    const improvementBps = Number(((best.amountOut - second.amountOut) * 10_000n) / second.amountOut)
    if (improvementBps < this.deps.config.TASK_ROUTE_IMPROVEMENT_BPS) {
      return null
    }

    const snapshot = await this.buildSnapshot(best.pair)
    const sourceBalance = stableToBaseDirection === 'BUY_A' ? snapshot.safeBalanceB : snapshot.safeBalanceA
    const tradeShare = (sourceBalance * BigInt(this.deps.config.TASK_MIGRATION_SHARE_BPS)) / 10_000n
    if (tradeShare <= 0n) {
      return null
    }

    return {
      pair: best.pair,
      direction: stableToBaseDirection,
      amountIn: tradeShare,
      signalBps: improvementBps,
      message: `Route quality improved by ${improvementBps}bps on fee tier ${best.pair.feeTier}; migrating active flow`,
      metadata: {
        selectedFeeTier: best.pair.feeTier,
        fallbackFeeTier: second.pair.feeTier,
        sampleAmountIn: amountIn.toString(),
        executionPlan: {
          composer: 'safe-module-batch-v1',
          steps: [
            'withdraw-liquidity-position',
            'rebalance-swap',
            'deposit-liquidity-position',
          ],
        },
      },
    }
  }

  private async buildBuybackPlan(): Promise<TaskSwapPlan | null> {
    const pair = this.getPrimaryPair()
    const snapshot = await this.buildSnapshot(pair)
    const stableBalance = snapshot.safeBalanceB
    const oracleStable = snapshot.oraclePriceB
    if (!oracleStable) {
      return null
    }

    const stableUsd = this.toUsdValue(stableBalance, pair.tokenB.decimals, oracleStable)
    const minTrigger = BigInt(this.deps.config.TASK_BUYBACK_MIN_STABLE_USD)
    if (stableUsd < minTrigger) {
      return null
    }

    const amountIn = (stableBalance * BigInt(this.deps.config.TASK_BUYBACK_SHARE_BPS)) / 10_000n
    if (amountIn <= 0n) {
      return null
    }

    return {
      pair,
      direction: 'BUY_A',
      amountIn,
      signalBps: 0,
      message: 'Stable reserves exceeded buyback threshold; executing buyback leg before burn settlement',
      metadata: {
        stableUsd: stableUsd.toString(),
        minTriggerUsd: minTrigger.toString(),
        burnAddress: this.deps.config.TASK_BURN_ADDRESS,
        settlementPlan: {
          type: 'burn-transfer',
          source: 'safe-treasury',
          destination: this.deps.config.TASK_BURN_ADDRESS,
          mode: 'post-buyback',
        },
      },
    }
  }

  private async buildHarvestPlan(): Promise<TaskSwapPlan | null> {
    const pair = this.getPrimaryPair()
    const snapshot = await this.buildSnapshot(pair)
    const key = `${pair.id}:stable`
    const previous = this.lastStableSnapshot.get(key) ?? snapshot.safeBalanceB
    this.lastStableSnapshot.set(key, snapshot.safeBalanceB)

    if (snapshot.safeBalanceB <= previous) {
      return null
    }

    const harvested = snapshot.safeBalanceB - previous
    const minHarvestUnits = BigInt(this.deps.config.TASK_MIN_HARVEST_UNITS)
    if (harvested < minHarvestUnits) {
      return null
    }

    const amountIn = (harvested * BigInt(this.deps.config.TASK_HARVEST_REINVEST_BPS)) / 10_000n
    if (amountIn <= 0n) {
      return null
    }

    return {
      pair,
      direction: 'BUY_A',
      amountIn,
      signalBps: 0,
      message: 'Detected harvested stable rewards; reinvesting into base asset allocation',
      metadata: {
        harvestedAmount: harvested.toString(),
        reinvestAmount: amountIn.toString(),
      },
    }
  }

  private async executePlan(
    taskId: AutonomousTaskId,
    trigger: 'SCHEDULED' | 'MANUAL',
    plan: TaskSwapPlan
  ): Promise<AutonomousTaskProof> {
    const snapshot = await this.buildSnapshot(plan.pair)
    const transparencyDetails: Record<string, unknown> = {
      imbalanceDetected: this.describeImbalance(taskId, plan),
      simulationResults: 'Simulation not run yet',
      guardrailCheck: 'Pending',
      action: plan.message,
      executionPath: taskId === 'convex-lp-migration'
        ? 'Withdraw -> Rebalance Swap -> Deposit (composed Safe batch plan)'
        : 'Single guarded swap via EquiliBotModule.executeSwap',
    }

    if (this.deps.executionMode === 'observe') {
      await this.deps.auditStore.recordSkip(plan.pair.id, `${taskId}: observe-only mode`, snapshot)
      return this.createProof(taskId, 'SKIPPED', trigger, 'Execution mode is observe', plan.pair.id, null, {
        ...plan.metadata,
        ...transparencyDetails,
        guardrailCheck: 'Skipped: executionMode=observe',
      })
    }

    const tokenIn = plan.direction === 'BUY_A' ? plan.pair.tokenB : plan.pair.tokenA
    const tokenOut = plan.direction === 'BUY_A' ? plan.pair.tokenA : plan.pair.tokenB

    const quote = await this.deps.quoteService.getExactInputSingleQuote(
      tokenIn.address,
      tokenOut.address,
      plan.pair.feeTier,
      plan.amountIn
    )

    if (!quote || quote.amountOut <= 0n) {
      await this.deps.auditStore.recordSkip(plan.pair.id, `${taskId}: quote unavailable`, snapshot)
      return this.createProof(taskId, 'SKIPPED', trigger, 'Quote unavailable for strategy execution', plan.pair.id, null, {
        ...plan.metadata,
        ...transparencyDetails,
        simulationResults: 'Quote step failed: no executable output from quoter',
        guardrailCheck: 'Skipped before policy checks',
      })
    }

    const opportunity: RebalanceOpportunity = {
      pair: plan.pair,
      direction: plan.direction,
      deviationBps: plan.signalBps,
      dexPrice: snapshot.pool.sqrtPriceX96,
      oraclePrice: this.pickOraclePrice(snapshot, plan.direction)?.price ?? 0n,
      suggestedAmountIn: plan.amountIn,
      snapshot,
    }

    const estimatedGasCost = this.deps.gasService.getGasPrice() * 300_000n
    const intent = this.deps.intentBuilder.build(
      opportunity,
      quote.amountOut,
      estimatedGasCost,
      0n,
      BigInt(Math.floor(Date.now() / 1000))
    )
    const swapRequest = this.deps.intentBuilder.toSwapRequest(intent)
    await this.deps.auditStore.recordIntent(intent)

    const policyResult = await this.deps.policyService.validateIntent(intent, swapRequest)
    await this.deps.auditStore.recordPolicyResult(intent.id, plan.pair.id, policyResult)
    this.deps.metrics.incrementPolicyChecks(policyResult.passed)

    if (!policyResult.passed) {
      const policyAlert = this.deps.riskMonitor.recordPolicyRejection(policyResult.error ?? 'Unknown policy rejection')
      if (policyAlert) {
        await this.deps.alertService.notify(policyAlert)
      }

      return this.createProof(taskId, 'REJECTED', trigger, policyResult.error ?? 'Policy rejected', plan.pair.id, intent.id, {
        ...plan.metadata,
        ...transparencyDetails,
        policyError: policyResult.error,
        simulationResults: 'Not executed: rejected at policy pre-check stage',
        guardrailCheck: `FAILED: ${policyResult.error ?? 'Policy rejected'}`,
      })
    }

    const simResult = await this.deps.simulationService.simulate(intent, swapRequest)
    await this.deps.auditStore.recordSimulation(intent.id, plan.pair.id, simResult)
    this.deps.metrics.incrementSimulations(simResult.success)

    if (!simResult.success) {
      return this.createProof(taskId, 'REJECTED', trigger, simResult.revertReason ?? 'Simulation rejected', plan.pair.id, intent.id, {
        ...plan.metadata,
        ...transparencyDetails,
        revertReason: simResult.revertReason,
        simulationResults: `FAILED: ${simResult.revertReason ?? 'Unknown simulation failure'}`,
        guardrailCheck: 'FAILED: simulation revert',
      })
    }

    if (this.deps.executionMode === 'simulate') {
      return this.createProof(taskId, 'SKIPPED', trigger, 'Simulation-only mode; execution skipped', plan.pair.id, intent.id, {
        ...plan.metadata,
        ...transparencyDetails,
        simulationResults: `PASSED: gas=${simResult.gasUsed.toString()} balanceOutDelta=${simResult.balanceOutDelta.toString()}`,
        guardrailCheck: 'PASSED (simulate-only mode)',
      })
    }

    const runtimeResult = validatePreSubmit(
      intent,
      {
        executionMode: this.deps.executionMode,
        canaryMaxTradeUsd: this.deps.config.CANARY_MAX_TRADE_USD,
        runtimeMaxNotionalUsd: this.deps.config.RUNTIME_MAX_NOTIONAL_USD,
        safeAddress: this.deps.config.SAFE_ADDRESS,
      },
      this.pickOraclePrice(snapshot, plan.direction),
      Date.now()
    )

    if (!runtimeResult.passed) {
      return this.createProof(taskId, 'REJECTED', trigger, runtimeResult.reason, plan.pair.id, intent.id, {
        ...plan.metadata,
        ...transparencyDetails,
        simulationResults: `PASSED: gas=${simResult.gasUsed.toString()} balanceOutDelta=${simResult.balanceOutDelta.toString()}`,
        guardrailCheck: `FAILED: ${runtimeResult.reason}`,
      })
    }

    const execution = await this.deps.executionService.execute(intent, swapRequest)
    await this.deps.auditStore.recordExecution(execution, plan.pair.id)
    this.deps.metrics.incrementExecutions(execution.status === 'EXECUTED')

    if (execution.status === 'EXECUTED') {
      this.deps.balanceService.invalidateAll()
      this.deps.circuitBreaker.recordSuccess()

      const settlement = taskId === 'protocol-buyback-burn'
        ? {
            requested: true,
            status: 'queued',
            note: 'Burn settlement transfer is encoded in settlementPlan and requires Safe module transfer support to execute atomically on-chain.',
          }
        : null

      return this.createProof(taskId, 'EXECUTED', trigger, plan.message, plan.pair.id, intent.id, {
        ...plan.metadata,
        ...transparencyDetails,
        txHash: execution.txHash,
        simulationResults: `PASSED: gas=${simResult.gasUsed.toString()} deltaOut=${simResult.balanceOutDelta.toString()} deltaIn=${simResult.balanceInDelta.toString()}`,
        guardrailCheck: 'PASSED',
        settlement,
      }, execution.txHash)
    }

    const tripped = this.deps.circuitBreaker.recordFailure(execution.rejectReason, `task:${taskId}`)
    if (tripped) {
      await this.deps.alertService.notify({
        eventType: 'circuit-breaker-tripped',
        severity: 'fatal',
        title: 'Circuit breaker tripped during autonomous task execution',
        details: {
          taskId,
          reason: execution.rejectReason,
        },
        dedupeKey: 'circuit-breaker-tripped',
        cooldownMs: 300000,
      })
    }

    return this.createProof(
      taskId,
      'FAILED',
      trigger,
      execution.rejectReason ?? 'Execution failed',
      plan.pair.id,
      intent.id,
      {
        ...plan.metadata,
        ...transparencyDetails,
        simulationResults: `PASSED: gas=${simResult.gasUsed.toString()} balanceOutDelta=${simResult.balanceOutDelta.toString()}`,
        guardrailCheck: `FAILED: ${execution.rejectReason ?? 'Execution failed'}`,
      },
      execution.txHash
    )
  }

  private describeImbalance(taskId: AutonomousTaskId, plan: TaskSwapPlan): string {
    if (taskId === 'convex-lp-migration') {
      return `Detected route quality spread ${plan.signalBps}bps across fee tiers for ${plan.pair.id}`
    }

    if (taskId === 'delta-neutral-rebalance') {
      return `Treasury drift ${plan.signalBps}bps on ${plan.pair.id} exceeded configured neutral band`
    }

    if (taskId === 'protocol-buyback-burn') {
      return 'Support-zone trigger reached with stable reserves above buyback threshold'
    }

    return 'Harvestable rewards exceeded gas-efficiency threshold'
  }

  private getPrimaryPair(): TradingPair {
    const preferred = this.deps.pairs.find((pair) => pair.feeTier === 500)
    return preferred ?? this.deps.pairs[0]!
  }

  private groupPairsByTokens(): Array<{
    key: string
    pairs: TradingPair[]
    baseIsA: boolean
    baseToken: TradingPair['tokenA']
    quoteToken: TradingPair['tokenB']
  }> {
    const groups = new Map<string, TradingPair[]>()
    for (const pair of this.deps.pairs) {
      const key = `${pair.tokenA.address.toLowerCase()}:${pair.tokenB.address.toLowerCase()}`
      const current = groups.get(key) ?? []
      current.push(pair)
      groups.set(key, current)
    }

    return Array.from(groups.entries()).map(([key, pairs]) => ({
      key,
      pairs,
      baseIsA: pairs[0]!.tokenA.symbol === 'WBNB' || pairs[0]!.tokenA.symbol === 'BNB',
      baseToken: pairs[0]!.tokenA,
      quoteToken: pairs[0]!.tokenB,
    }))
  }

  private async buildSnapshot(pair: TradingPair): Promise<MarketSnapshot> {
    const poolState = this.deps.getPoolState(pair.poolAddress)
    if (!poolState) {
      throw new Error(`Pool state unavailable for ${pair.id}`)
    }

    const feedIds: Hex[] = []
    if (pair.pythFeedIdA) feedIds.push(pair.pythFeedIdA)
    if (pair.pythFeedIdB) feedIds.push(pair.pythFeedIdB)

    const oraclePrices = await this.deps.oracleService.getPrices(feedIds)
    let oraclePriceA: OraclePrice | null = pair.pythFeedIdA
      ? oraclePrices.get(pair.pythFeedIdA) ?? null
      : null
    let oraclePriceB: OraclePrice | null = pair.pythFeedIdB
      ? oraclePrices.get(pair.pythFeedIdB) ?? null
      : null

    if (!oraclePriceB && oraclePriceA) {
      oraclePriceB = await this.deps.guardOracleService.deriveQuoteTokenUsdFromBaseToken(
        pair.tokenA,
        pair.tokenB,
        oraclePriceA
      )
    }

    if (!oraclePriceA && oraclePriceB) {
      oraclePriceA = await this.deps.guardOracleService.deriveQuoteTokenUsdFromBaseToken(
        pair.tokenB,
        pair.tokenA,
        oraclePriceB
      )
    }

    // ── Stablecoin synthetic price fallback ──────────────────────────────
    // BUSD, USDT, USDC are always pegged to $1.00.
    // If both Pyth and the on-chain guard oracle are stale (e.g. BUSD is deprecated),
    // synthesize a $1.00 price so the pipeline can still run.
    // exponent=-8 means price is in units of 1e-8 USD → 1.00 USD = 100_000_000
    const KNOWN_STABLECOINS = new Set(['BUSD', 'USDT', 'USDC', 'DAI'])
    const SYNTHETIC_STABLE_PRICE: OraclePrice = {
      price: 100_000_000n, // $1.00 in Pyth exponent=-8 format
      confidence: 500_000n, // 0.005 USD confidence (~0.5%)
      exponent: -8,
      publishTime: Math.floor(Date.now() / 1000),
      feedId: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
    }

    if (!oraclePriceB && KNOWN_STABLECOINS.has(pair.tokenB.symbol)) {
      log.warn(
        { stage: 'OBSERVE', token: pair.tokenB.symbol },
        'Using synthetic $1.00 price for stablecoin (Pyth + guard oracle unavailable)'
      )
      oraclePriceB = SYNTHETIC_STABLE_PRICE
    }

    if (!oraclePriceA && KNOWN_STABLECOINS.has(pair.tokenA.symbol)) {
      log.warn(
        { stage: 'OBSERVE', token: pair.tokenA.symbol },
        'Using synthetic $1.00 price for stablecoin (Pyth + guard oracle unavailable)'
      )
      oraclePriceA = SYNTHETIC_STABLE_PRICE
    }

    if (!oraclePriceA || !oraclePriceB) {
      const oracleAlert = this.deps.riskMonitor.recordOracleUnavailable(pair.id)
      if (oracleAlert) {
        await this.deps.alertService.notify(oracleAlert)
      }
    }

    const [safeBalanceA, safeBalanceB] = await Promise.all([
      this.deps.balanceService.getBalance(pair.tokenA.address, poolState.blockNumber),
      this.deps.balanceService.getBalance(pair.tokenB.address, poolState.blockNumber),
    ])

    return {
      pair,
      pool: poolState,
      oraclePriceA,
      oraclePriceB,
      gasPrice: this.deps.gasService.getGasPrice(),
      safeBalanceA,
      safeBalanceB,
      blockNumber: poolState.blockNumber,
      timestamp: Date.now(),
    }
  }

  private pickOraclePrice(snapshot: MarketSnapshot, direction: 'BUY_A' | 'BUY_B'): OraclePrice | null {
    return direction === 'BUY_A' ? snapshot.oraclePriceB : snapshot.oraclePriceA
  }

  private toUsdValue(amount: bigint, decimals: number, oraclePrice: OraclePrice): bigint {
    const normalized = normalizePythPrice(oraclePrice)
    if (normalized <= 0n) {
      return 0n
    }
    return (amount * normalized) / (10n ** BigInt(decimals))
  }

  private fromUsdValue(usdValue: bigint, decimals: number, oraclePrice: OraclePrice): bigint {
    const normalized = normalizePythPrice(oraclePrice)
    if (normalized <= 0n) {
      return 0n
    }
    return (usdValue * (10n ** BigInt(decimals))) / normalized
  }

  private getCadence(taskId: AutonomousTaskId): TaskCadence {
    const hour = 60 * 60 * 1000
    switch (taskId) {
      case 'delta-neutral-rebalance':
        return {
          intervalMs: this.deps.config.TASK_REBALANCE_INTERVAL_MS,
          jitterMs: 5 * 60 * 1000,
        }
      case 'convex-lp-migration':
        return {
          intervalMs: this.deps.config.TASK_MIGRATION_INTERVAL_MS,
          jitterMs: 10 * 60 * 1000,
        }
      case 'protocol-buyback-burn':
        return {
          intervalMs: this.deps.config.TASK_BUYBACK_INTERVAL_MS,
          jitterMs: 10 * 60 * 1000,
        }
      case 'yield-harvest-reinvest':
        return {
          intervalMs: this.deps.config.TASK_HARVEST_INTERVAL_MS,
          jitterMs: hour,
        }
      default:
        return { intervalMs: hour, jitterMs: 0 }
    }
  }

  private scheduleNextRun(taskId: AutonomousTaskId): void {
    const cadence = this.getCadence(taskId)
    const jitter = cadence.jitterMs > 0
      ? Math.floor(Math.random() * cadence.jitterMs)
      : 0
    const nextRunAt = Date.now() + cadence.intervalMs + jitter

    this.updateTaskState(taskId, { nextRunAt })
  }

  private updateTaskState(taskId: AutonomousTaskId, patch: Partial<RunnerTaskState>): void {
    const current = this.taskState.get(taskId)
    if (!current) {
      return
    }

    this.taskState.set(taskId, {
      ...current,
      ...patch,
    })
  }

  private createProof(
    taskId: AutonomousTaskId,
    state: AutonomousTaskState,
    trigger: 'SCHEDULED' | 'MANUAL',
    message: string,
    pairId: string | null,
    intentId: string | null,
    details: Record<string, unknown>,
    txHash: Hex | null = null
  ): AutonomousTaskProof {
    return {
      taskId,
      state,
      trigger,
      message,
      timestamp: Date.now(),
      pairId,
      intentId,
      txHash,
      details,
    }
  }

  private recordProof(proof: AutonomousTaskProof): void {
    this.latestProofs.set(proof.taskId, proof)
    this.updateTaskState(proof.taskId, {
      state: proof.state,
      lastMessage: proof.message,
      lastRunAt: proof.timestamp,
      txHash: proof.txHash,
    })

    log.info(
      {
        stage: 'EXECUTE',
        taskId: proof.taskId,
        state: proof.state,
        pairId: proof.pairId,
        txHash: proof.txHash,
      },
      proof.message
    )
  }
}

function normalizePythPrice(price: OraclePrice): bigint {
  const raw = price.price
  const exponent = price.exponent

  if (raw <= 0n) {
    return 0n
  }

  if (exponent >= 0) {
    return raw * 10n ** BigInt(exponent)
  }

  const absExponent = BigInt(Math.abs(exponent))
  const scale = 10n ** absExponent
  return (raw * 10n ** 18n) / scale
}

export function getAutonomousTaskIds(): readonly AutonomousTaskId[] {
  return TASK_IDS
}

export function isAutonomousTaskId(value: string): value is AutonomousTaskId {
  return TASK_IDS.includes(value as AutonomousTaskId)
}

export function getZeroAddress(): Address {
  return ZERO_ADDRESS
}