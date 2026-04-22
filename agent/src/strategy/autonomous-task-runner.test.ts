/**
 * EquiliBot Agent — Autonomous Task Runner Tests
 */

import { describe, it, expect, vi, type Mock } from 'vitest'
import { encodeFunctionData, type Address, type Hex } from 'viem'
import { AutonomousTaskRunner } from './autonomous-task-runner.js'
import { pancakeSmartRouterAbi } from '../abi/pancake-smart-router.js'
import type { Config } from '../config/index.js'
import type { TradingPair, PoolState, OraclePrice, MarketSnapshot } from '../types/index.js'
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address
const USDT_ADDR = '0x55d398326f99059fF775485246999027B3197955' as Address
const POOL_ADDR = '0x0000000000000000000000000000000000001234' as Address
const SAFE_ADDRESS = '0x0000000000000000000000000000000000000999' as Address

const mockPair: TradingPair = {
  id: 'WBNB-USDT-500',
  tokenA: { address: WBNB_ADDR, symbol: 'WBNB', decimals: 18 },
  tokenB: { address: USDT_ADDR, symbol: 'USDT', decimals: 18 },
  feeTier: 500,
  poolAddress: POOL_ADDR,
  pythFeedIdA: '0x01' as Hex,
  pythFeedIdB: '0x02' as Hex,
}

const mockPoolState: PoolState = {
  poolAddress: POOL_ADDR,
  sqrtPriceX96: 1n,
  tick: 0,
  liquidity: 1_000_000n,
  blockNumber: 1000n,
  logIndex: 0,
  updatedAt: Date.now(),
}

const wbnbOracle: OraclePrice = {
  price: 60_000_000_000n,
  confidence: 60_000_000n,
  exponent: -8,
  publishTime: Math.floor(Date.now() / 1000) - 5,
  feedId: '0x01' as Hex,
}

const usdtOracle: OraclePrice = {
  price: 100_000_000n,
  confidence: 100_000n,
  exponent: -8,
  publishTime: Math.floor(Date.now() / 1000) - 5,
  feedId: '0x02' as Hex,
}

/**
 * Build a valid RebalanceIntent whose routerCalldata passes validatePreSubmit's
 * calldata integrity check. The re-encoding uses:
 *   tokenIn, tokenOut, feeTier, safeAddress, deadline, amountIn, minAmountOut
 */
function createMockIntent(overrides: {
  tokenIn?: Address
  tokenOut?: Address
  amountIn?: bigint
  minAmountOut?: bigint
} = {}) {
  const tokenIn = overrides.tokenIn ?? USDT_ADDR
  const tokenOut = overrides.tokenOut ?? WBNB_ADDR
  const amountIn = overrides.amountIn ?? 10n ** 17n
  const minAmountOut = overrides.minAmountOut ?? 57n * 10n ** 18n
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)

  // Must match exactly what validatePreSubmit re-encodes
  const routerCalldata = encodeFunctionData({
    abi: pancakeSmartRouterAbi,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn,
      tokenOut,
      fee: mockPair.feeTier,
      recipient: SAFE_ADDRESS,
      deadline,
      amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0n,
    }],
  })

  return {
    id: 'test-intent-001',
    pair: mockPair,
    direction: 'BUY_B' as const,
    swapType: 0,
    router: SAFE_ADDRESS,
    tokenIn,
    tokenOut,
    amountIn,
    expectedAmountIn: 0n,
    expectedAmountOut: 60n * 10n ** 18n,
    minAmountOut,
    deadline,
    estimatedGasCost: 10n ** 14n,
    estimatedProfit: 10n ** 15n,
    routerCalldata,
    snapshot: {} as MarketSnapshot,
    createdAt: Date.now(),
  }
}

const baseConfig: Partial<Config> = {
  ENABLE_AUTONOMOUS_TASKS: true,
  AUTONOMOUS_TASK_TICK_MS: 60_000,
  TASK_REBALANCE_INTERVAL_MS: 300_000,
  TASK_REBALANCE_DRIFT_BPS: 150,
  TASK_REBALANCE_SHARE_BPS: 3000,
  TASK_MIGRATION_INTERVAL_MS: 1_800_000,
  TASK_ROUTE_IMPROVEMENT_BPS: 25,
  TASK_MIGRATION_SHARE_BPS: 1000,
  TASK_BUYBACK_INTERVAL_MS: 2_700_000,
  TASK_BUYBACK_MIN_STABLE_USD: 1000,
  TASK_BUYBACK_SHARE_BPS: 2000,
  TASK_BURN_ADDRESS: '0x000000000000000000000000000000000000dEaD' as Address,
  TASK_HARVEST_INTERVAL_MS: 86_400_000,
  TASK_MIN_HARVEST_UNITS: 10n ** 17n,
  TASK_HARVEST_REINVEST_BPS: 6000,
  TASK_MAX_NOTIONAL_USD: 500_000_000, // large enough not to cap
  SAFE_ADDRESS,
  CANARY_MAX_TRADE_USD: 500_000,
  RUNTIME_MAX_NOTIONAL_USD: 0,
  EXECUTION_MODE: 'active',
}

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeDeps(overrides: {
  executionMode?: 'observe' | 'simulate' | 'canary' | 'active'
  oraclePrices?: Map<Hex, OraclePrice>
  balanceAValues?: bigint[]
  balanceBValues?: bigint[]
  quoteAmountOut?: bigint
  policyPassed?: boolean
  simPassed?: boolean
  execStatus?: 'EXECUTED' | 'FAILED'
}) {
  const {
    executionMode = 'active',
    oraclePrices = new Map<Hex, OraclePrice>([
      ['0x01' as Hex, wbnbOracle],
      ['0x02' as Hex, usdtOracle],
    ]),
    balanceAValues = [10n * 10n ** 18n],
    balanceBValues = [100n * 10n ** 18n],
    quoteAmountOut = 60n * 10n ** 18n,
    policyPassed = true,
    simPassed = true,
    execStatus = 'EXECUTED',
  } = overrides

  const mockIntent = createMockIntent()

  const oracleService = {
    getPrices: vi.fn().mockResolvedValue(oraclePrices),
  } as unknown as OracleService

  const gasService = {
    getGasPrice: vi.fn().mockReturnValue(3_000_000_000n),
  } as unknown as GasService

  // Interleave A/B balance returns. The runner calls getBalance(tokenA) then
  // getBalance(tokenB) for each buildSnapshot call. We interleave the arrays.
  const balanceSequence: bigint[] = []
  const maxLen = Math.max(balanceAValues.length, balanceBValues.length)
  for (let i = 0; i < maxLen; i++) {
    balanceSequence.push(balanceAValues[i] ?? balanceAValues.at(-1)!)
    balanceSequence.push(balanceBValues[i] ?? balanceBValues.at(-1)!)
  }
  // Add a long tail for any extra calls (post-swap re-reads)
  for (let i = 0; i < 10; i++) {
    balanceSequence.push(balanceAValues.at(-1)!)
  }

  const getBalanceMock = vi.fn()
  for (const v of balanceSequence) getBalanceMock.mockResolvedValueOnce(v)
  getBalanceMock.mockResolvedValue(balanceAValues.at(-1)!)

  const balanceService = {
    getBalance: getBalanceMock,
    invalidateAll: vi.fn(),
  } as unknown as BalanceService

  const quoteService = {
    getExactInputSingleQuote: vi.fn().mockResolvedValue({ amountOut: quoteAmountOut }),
  } as unknown as QuoteService

  const intentBuilder = {
    build: vi.fn().mockImplementation(() => createMockIntent()),
    toSwapRequest: vi.fn().mockReturnValue({
      swapType: mockIntent.swapType,
      router: mockIntent.router,
      tokenIn: mockIntent.tokenIn,
      tokenOut: mockIntent.tokenOut,
      amountIn: mockIntent.amountIn,
      expectedAmountIn: mockIntent.expectedAmountIn,
      minAmountOut: mockIntent.minAmountOut,
      expectedAmountOut: mockIntent.expectedAmountOut,
      deadline: mockIntent.deadline,
    }),
  } as unknown as IntentBuilder

  const policyService = {
    validateIntent: vi.fn().mockResolvedValue({
      passed: policyPassed,
      error: policyPassed ? undefined : 'Volume limit exceeded',
    }),
  } as unknown as PolicyService

  const guardOracleService = {
    deriveQuoteTokenUsdFromBaseToken: vi.fn().mockResolvedValue(null),
  } as unknown as GuardOracleService

  const simulationService = {
    simulate: vi.fn().mockResolvedValue({
      success: simPassed,
      balanceInDelta: -(10n ** 17n),
      balanceOutDelta: 60n * 10n ** 18n,
      gasUsed: 200_000n,
      blockNumber: 1001n,
      revertReason: simPassed ? undefined : 'SlippageTooHigh',
    }),
  } as unknown as SimulationService

  const executionService = {
    execute: vi.fn().mockResolvedValue({
      intentId: 'test-intent-001',
      status: execStatus,
      txHash: execStatus === 'EXECUTED' ? '0xdeadbeef01' as Hex : null,
      rejectReason: execStatus === 'EXECUTED' ? null : 'Execution failed',
      simulationResult: null,
      policyResult: null,
      timestamp: Date.now(),
    }),
    executeBurnTransfer: vi.fn().mockResolvedValue({
      status: 'EXECUTED',
      txHash: '0xburnhash01' as Hex,
      rejectReason: null,
    }),
  } as unknown as ExecutionService

  const auditStore = {
    recordSkip: vi.fn().mockResolvedValue(undefined),
    recordOpportunity: vi.fn().mockResolvedValue(undefined),
    recordIntent: vi.fn().mockResolvedValue(undefined),
    recordPolicyResult: vi.fn().mockResolvedValue(undefined),
    recordSimulation: vi.fn().mockResolvedValue(undefined),
    recordExecution: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditStore

  const metrics = {
    incrementPolicyChecks: vi.fn(),
    incrementSimulations: vi.fn(),
    incrementExecutions: vi.fn(),
  } as unknown as MetricsCollector

  const circuitBreaker = {
    isTripped: false,
    recordSuccess: vi.fn(),
    recordFailure: vi.fn().mockReturnValue(false),
  } as unknown as CircuitBreaker

  const alertService = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as AlertService
  const riskMonitor = {
    recordPolicyRejection: vi.fn().mockReturnValue(null),
    recordOracleUnavailable: vi.fn().mockReturnValue(null),
  } as unknown as RiskMonitor

  return {
    config: baseConfig as Config,
    executionMode: executionMode as 'observe' | 'simulate' | 'canary' | 'active',
    pairs: [mockPair],
    getPoolState: (_addr: Address) => mockPoolState,
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
    metrics,
    circuitBreaker,
    alertService,
    riskMonitor,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AutonomousTaskRunner — task state machine', () => {
  describe('observe mode', () => {
    it('skips execution and returns SKIPPED proof', async () => {
      const deps = makeDeps({ executionMode: 'observe' })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      expect(proof.state).toBe('SKIPPED')
      expect(deps.executionService.execute).not.toHaveBeenCalled()
      expect(deps.auditStore.recordSkip).toHaveBeenCalled()
    })
  })

  describe('delta-neutral-rebalance', () => {
    it('skips when treasury is balanced (0 drift)', async () => {
      // 10 WBNB @ $600 = $6000, 6000 USDT @ $1 = $6000 — perfectly balanced
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n],
        balanceBValues: [6000n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      expect(proof.state).toBe('SKIPPED')
    })

    it('executes when treasury drift exceeds threshold', async () => {
      // 10 WBNB @ $600 = $6000 vs 100 USDT @ $1 = $100 → ~98% drift
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [100n * 10n ** 18n, 100n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      expect(proof.state).toBe('EXECUTED')
      expect(deps.executionService.execute).toHaveBeenCalledOnce()
    })

    it('returns REJECTED when policy check fails', async () => {
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [100n * 10n ** 18n, 100n * 10n ** 18n],
        policyPassed: false,
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      expect(proof.state).toBe('REJECTED')
      expect(proof.details.policyError).toBe('Volume limit exceeded')
    })

    it('returns REJECTED when simulation fails', async () => {
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [100n * 10n ** 18n, 100n * 10n ** 18n],
        simPassed: false,
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      expect(proof.state).toBe('REJECTED')
      expect(proof.details.revertReason).toBe('SlippageTooHigh')
    })
  })

  describe('protocol-buyback-burn', () => {
    it('skips when stable reserve is below minimum threshold', async () => {
      // TASK_BUYBACK_MIN_STABLE_USD=1000 in config, stable balance = 0 (nothing)
      const deps = makeDeps({
        balanceAValues: [1n * 10n ** 18n],
        balanceBValues: [0n],
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('protocol-buyback-burn', 'MANUAL')
      expect(proof.state).toBe('SKIPPED')
    })

    it('executes swap AND calls executeBurnTransfer when reserve is sufficient', async () => {
      const deps = makeDeps({
        balanceAValues: [1n * 10n ** 18n, 1n * 10n ** 18n],
        balanceBValues: [5000n * 10n ** 18n, 5000n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('protocol-buyback-burn', 'MANUAL')
      expect(proof.state).toBe('EXECUTED')
      expect(deps.executionService.execute).toHaveBeenCalledOnce()
      expect(deps.executionService.executeBurnTransfer).toHaveBeenCalledOnce()
      expect(proof.details.settlement).toMatchObject({
        status: 'executed',
        burnAddress: '0x000000000000000000000000000000000000dEaD',
      })
    })

    it('records burn-failed when burn transfer fails (swap still EXECUTED)', async () => {
      const deps = makeDeps({
        balanceAValues: [1n * 10n ** 18n, 1n * 10n ** 18n],
        balanceBValues: [5000n * 10n ** 18n, 5000n * 10n ** 18n],
      })
      ;(deps.executionService.executeBurnTransfer as Mock).mockResolvedValueOnce({
        status: 'FAILED',
        txHash: null,
        rejectReason: 'Burn transfer reverted on-chain',
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('protocol-buyback-burn', 'MANUAL')
      expect(proof.state).toBe('EXECUTED')
      expect(proof.details.settlement).toMatchObject({ status: 'burn-failed' })
    })
  })

  describe('yield-harvest-reinvest', () => {
    it('skips on first run (sets baseline, no harvest delta)', async () => {
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n],
        balanceBValues: [500n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)
      const proof = await runner.runTask('yield-harvest-reinvest', 'MANUAL')
      expect(proof.state).toBe('SKIPPED')
    })

    it('executes when stable balance grew since last observation', async () => {
      // buildSnapshot called 3 times total:
      // 1st runTask → buildHarvestPlan (sets baseline=500)
      // 2nd runTask → buildHarvestPlan (detects 600>500) + executePlan
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [500n * 10n ** 18n, 600n * 10n ** 18n, 600n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)

      await runner.runTask('yield-harvest-reinvest', 'MANUAL')  // sets baseline
      const proof = await runner.runTask('yield-harvest-reinvest', 'MANUAL')  // detects harvest

      expect(proof.state).toBe('EXECUTED')
    })
  })

  describe('getTaskStatuses', () => {
    it('returns all 4 tasks in IDLE state on construction', () => {
      const runner = new AutonomousTaskRunner(makeDeps({}))
      const statuses = runner.getTaskStatuses()
      expect(statuses).toHaveLength(4)
      expect(statuses.every((s) => s.state === 'IDLE')).toBe(true)
    })

    it('transitions to EXECUTED state after successful execution', async () => {
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [100n * 10n ** 18n, 100n * 10n ** 18n],
      })
      const runner = new AutonomousTaskRunner(deps)
      await runner.runTask('delta-neutral-rebalance', 'MANUAL')
      const taskStatus = runner.getTaskStatuses().find((s) => s.taskId === 'delta-neutral-rebalance')
      expect(taskStatus?.state).toBe('EXECUTED')
      expect(taskStatus?.txHash).toBe('0xdeadbeef01')
    })
  })

  describe('inFlight guard', () => {
    it('returns SKIPPED immediately if another task is already running', async () => {
      const deps = makeDeps({
        balanceAValues: [10n * 10n ** 18n, 10n * 10n ** 18n],
        balanceBValues: [100n * 10n ** 18n, 100n * 10n ** 18n],
      })
      ;(deps.executionService.execute as Mock).mockImplementation(
        () => new Promise((resolve) =>
          setTimeout(() => resolve({
            intentId: 'test-intent-001',
            status: 'EXECUTED',
            txHash: '0xdeadbeef01' as Hex,
            rejectReason: null,
            simulationResult: null,
            policyResult: null,
            timestamp: Date.now(),
          }), 50)
        )
      )

      const runner = new AutonomousTaskRunner(deps)
      const [first, second] = await Promise.all([
        runner.runTask('delta-neutral-rebalance', 'MANUAL'),
        runner.runTask('protocol-buyback-burn', 'MANUAL'),
      ])
      expect([first.state, second.state]).toContain('SKIPPED')
    })
  })
})
