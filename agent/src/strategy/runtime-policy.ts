/**
 * EquiliBot Agent — Runtime Policy
 *
 * Pre-submit validation layer that runs AFTER simulation, BEFORE execution.
 * This is the last line of defense before a real transaction hits the chain.
 *
 * Checks:
 * 1. Calldata integrity: re-encode and verify the router calldata matches the intent
 * 2. Deadline freshness: reject if deadline is about to expire
 * 3. Min-out sanity: reject if minAmountOut is zero
 * 4. Notional ceiling: reject if amountIn exceeds USD-denominated runtime cap
 * 5. Oracle recency: reject if oracle data used is stale relative to pipeline start
 * 6. Canary limit: reject if notional exceeds canary-mode cap
 */

import { encodeFunctionData, type Address } from 'viem'
import { pancakeSmartRouterAbi } from '../abi/pancake-smart-router.js'
import type { RebalanceIntent, OraclePrice } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('runtime-policy')

const DEADLINE_BUFFER_SECONDS = 30n
const MAX_ORACLE_AGE_SECONDS = 60

export type ExecutionMode = 'observe' | 'simulate' | 'canary' | 'active'

export interface RuntimePolicyConfig {
  readonly executionMode: ExecutionMode
  readonly canaryMaxTradeUsd: number
  readonly runtimeMaxNotionalUsd: number // 0 = disabled
  readonly safeAddress: Address
}

export interface RuntimePolicyResult {
  readonly passed: boolean
  readonly reason: string
}

/**
 * Validate an intent against runtime policy before execution submission.
 * This runs AFTER simulation success, BEFORE on-chain write.
 */
export function validatePreSubmit(
  intent: RebalanceIntent,
  config: RuntimePolicyConfig,
  oraclePriceTokenIn: OraclePrice | null,
  pipelineStartTime: number
): RuntimePolicyResult {
  // 1. Execution mode gate
  if (config.executionMode === 'observe') {
    return fail('Execution mode is observe-only')
  }
  if (config.executionMode === 'simulate') {
    return fail('Execution mode is simulate-only — no live execution')
  }

  // 2. Min-out sanity
  if (intent.minAmountOut === 0n) {
    return fail('minAmountOut is zero — would accept any output amount')
  }

  // 3. Deadline freshness
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  if (intent.deadline < nowSeconds + DEADLINE_BUFFER_SECONDS) {
    return fail(
      `Deadline too close or expired: deadline=${intent.deadline}, now=${nowSeconds}, buffer=${DEADLINE_BUFFER_SECONDS}s`
    )
  }

  // 4. Calldata integrity
  const reEncodedCalldata = encodeFunctionData({
    abi: pancakeSmartRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: intent.tokenIn,
        tokenOut: intent.tokenOut,
        fee: intent.pair.feeTier,
        recipient: config.safeAddress,
        deadline: intent.deadline,
        amountIn: intent.amountIn,
        amountOutMinimum: intent.minAmountOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  if (intent.routerCalldata.toLowerCase() !== reEncodedCalldata.toLowerCase()) {
    return fail(
      'Calldata mismatch: encoded payload differs from intent bounds'
    )
  }

  // 5. Oracle recency: reject if oracle data is stale since pipeline started
  if (oraclePriceTokenIn) {
    const oracleAge = Math.floor(pipelineStartTime / 1000) - oraclePriceTokenIn.publishTime
    if (oracleAge > MAX_ORACLE_AGE_SECONDS) {
      return fail(
        `Oracle data too stale for execution: age=${oracleAge}s, max=${MAX_ORACLE_AGE_SECONDS}s`
      )
    }
  }

  // 6. Risk caps require token-in oracle valuation.
  if ((config.runtimeMaxNotionalUsd > 0 || config.executionMode === 'canary') && !oraclePriceTokenIn) {
    return fail('Missing token-in oracle price required for runtime notional checks')
  }

  // 7. Notional ceiling (runtime cap, independent of SwapGuard)
  if (config.runtimeMaxNotionalUsd > 0 && oraclePriceTokenIn) {
    const notionalUsdE8 = estimateNotionalUsdE8(
      intent.amountIn,
      oraclePriceTokenIn,
      intent.pair.tokenA.address === intent.tokenIn
        ? intent.pair.tokenA.decimals
        : intent.pair.tokenB.decimals
    )
    const runtimeCapUsdE8 = usdToE8(config.runtimeMaxNotionalUsd)
    if (notionalUsdE8 > runtimeCapUsdE8) {
      return fail(
        `Trade notional $${formatUsdE8(notionalUsdE8)} exceeds runtime cap $${formatUsdE8(runtimeCapUsdE8)}`
      )
    }
  }

  // 8. Canary-mode limit
  if (config.executionMode === 'canary' && oraclePriceTokenIn) {
    const notionalUsdE8 = estimateNotionalUsdE8(
      intent.amountIn,
      oraclePriceTokenIn,
      intent.pair.tokenA.address === intent.tokenIn
        ? intent.pair.tokenA.decimals
        : intent.pair.tokenB.decimals
    )
    const canaryCapUsdE8 = usdToE8(config.canaryMaxTradeUsd)
    if (notionalUsdE8 > canaryCapUsdE8) {
      return fail(
        `Canary mode: trade notional $${formatUsdE8(notionalUsdE8)} exceeds canary cap $${formatUsdE8(canaryCapUsdE8)}`
      )
    }
  }

  log.info(
    { stage: 'VERIFY', intentId: intent.id },
    'Runtime policy: all pre-submit checks passed'
  )

  return { passed: true, reason: 'All pre-submit checks passed' }
}

/**
 * Convert a token amount to approximate USD using Pyth oracle in 1e8 scale.
 */
function estimateNotionalUsdE8(
  amount: bigint,
  oraclePrice: OraclePrice,
  tokenDecimals: number
): bigint {
  if (oraclePrice.price <= 0n) {
    return 0n
  }

  // notionalUsdE8 = amount * price * 10^(expo + 8 - tokenDecimals)
  const exponentAdjustment = oraclePrice.exponent + 8 - tokenDecimals
  const base = amount * oraclePrice.price

  if (exponentAdjustment >= 0) {
    return base * (10n ** BigInt(exponentAdjustment))
  }

  return base / (10n ** BigInt(-exponentAdjustment))
}

function usdToE8(value: number): bigint {
  return BigInt(Math.round(value * 1e8))
}

function formatUsdE8(value: bigint): string {
  const whole = value / 100000000n
  const fractional = ((value % 100000000n) * 100n) / 100000000n
  return `${whole.toString()}.${fractional.toString().padStart(2, '0')}`
}

function fail(reason: string): RuntimePolicyResult {
  log.warn({ stage: 'VERIFY', reason }, `Runtime policy REJECTED: ${reason}`)
  return { passed: false, reason }
}
