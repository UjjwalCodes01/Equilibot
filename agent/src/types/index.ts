/**
 * EquiliBot Agent — Core Type Definitions
 *
 * Every type used across the agent is defined here.
 * No ad-hoc inline types anywhere in the codebase.
 */

import type { Address, Hex } from 'viem'

// ─── Trading Pair Configuration ──────────────────────────────────

export interface TradingPair {
  readonly id: string
  readonly tokenA: TokenConfig
  readonly tokenB: TokenConfig
  readonly feeTier: number
  readonly poolAddress: Address
  readonly pythFeedIdA: Hex | null
  readonly pythFeedIdB: Hex | null
}

export interface TokenConfig {
  readonly address: Address
  readonly symbol: string
  readonly decimals: number
}

// ─── Pool State ──────────────────────────────────────────────────

export interface PoolState {
  readonly poolAddress: Address
  readonly sqrtPriceX96: bigint
  readonly tick: number
  readonly liquidity: bigint
  readonly blockNumber: bigint
  readonly logIndex: number
  readonly updatedAt: number
}

// ─── Oracle State ────────────────────────────────────────────────

export interface OraclePrice {
  readonly price: bigint
  readonly confidence: bigint
  readonly exponent: number
  readonly publishTime: number
  readonly feedId: Hex
}

// ─── Market Snapshot ─────────────────────────────────────────────

export interface MarketSnapshot {
  readonly pair: TradingPair
  readonly pool: PoolState
  readonly oraclePriceA: OraclePrice | null
  readonly oraclePriceB: OraclePrice | null
  readonly gasPrice: bigint
  readonly safeBalanceA: bigint
  readonly safeBalanceB: bigint
  readonly blockNumber: bigint
  readonly timestamp: number
}

// ─── Rebalance Opportunity ───────────────────────────────────────

export interface RebalanceOpportunity {
  readonly pair: TradingPair
  readonly direction: SwapDirection
  readonly deviationBps: number
  readonly dexPrice: bigint
  readonly oraclePrice: bigint
  readonly suggestedAmountIn: bigint
  readonly snapshot: MarketSnapshot
}

export type SwapDirection = 'BUY_A' | 'BUY_B'

// ─── Rebalance Intent ────────────────────────────────────────────

export interface RebalanceIntent {
  readonly id: string
  readonly pair: TradingPair
  readonly direction: SwapDirection
  readonly swapType: SwapType
  readonly router: Address
  readonly tokenIn: Address
  readonly tokenOut: Address
  readonly amountIn: bigint
  readonly expectedAmountIn: bigint
  readonly expectedAmountOut: bigint
  readonly minAmountOut: bigint
  readonly deadline: bigint
  readonly estimatedGasCost: bigint
  readonly estimatedProfit: bigint
  readonly routerCalldata: Hex
  readonly snapshot: MarketSnapshot
  readonly createdAt: number
}

export type SwapType = 0 | 1 // 0 = exact input, 1 = exact output

// ─── Simulation Result ───────────────────────────────────────────

export interface SimulationResult {
  readonly success: boolean
  readonly balanceInDelta: bigint
  readonly balanceOutDelta: bigint
  readonly gasUsed: bigint
  readonly revertReason: string | null
  readonly blockNumber: bigint
}

// ─── Policy Check Result ─────────────────────────────────────────

export interface PolicyCheckResult {
  readonly passed: boolean
  readonly error: string | null
  readonly errorSelector: Hex | null
}

// ─── Execution Record ────────────────────────────────────────────

export type ExecutionStatus =
  | 'PROPOSED'
  | 'SIMULATED'
  | 'POLICY_PASS'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED'

export interface ExecutionRecord {
  readonly intentId: string
  readonly status: ExecutionStatus
  readonly txHash: Hex | null
  readonly rejectReason: string | null
  readonly simulationResult: SimulationResult | null
  readonly policyResult: PolicyCheckResult | null
  readonly timestamp: number
}

// ─── Agent State ─────────────────────────────────────────────────

export type AgentStatus =
  | 'INITIALIZING'
  | 'OBSERVING'
  | 'CALCULATING'
  | 'VERIFYING'
  | 'EXECUTING'
  | 'PAUSED'
  | 'ERROR'

// ─── SwapRequest (mirrors Solidity ISwapGuard.SwapRequest) ───────

export interface SwapRequestStruct {
  readonly swapType: number
  readonly router: Address
  readonly tokenIn: Address
  readonly tokenOut: Address
  readonly amountIn: bigint
  readonly expectedAmountIn: bigint
  readonly minAmountOut: bigint
  readonly expectedAmountOut: bigint
  readonly deadline: bigint
}
