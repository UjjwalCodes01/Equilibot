/**
 * EquiliBot Agent — Profitability Engine
 *
 * Core rule: Agent must only swap if Profit > Gas_Cost × MIN_PROFIT_MULTIPLIER
 *
 * Edge cases:
 * - Gas spike protection: blocks if gas > 3x rolling average
 * - Negative profit guard: immediately returns false
 * - All comparisons in native BNB value (wei)
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger('profitability')

// Estimated gas for a single executeSwap through the module
// Includes: validateAndConsume + approve + swap + clearApproval + balanceChecks
export const ESTIMATED_SWAP_GAS_UNITS = 350_000n

export interface ProfitabilityParams {
  /** Expected output in tokenOut raw units */
  readonly expectedAmountOut: bigint
  /** Minimum amount out after slippage in tokenOut raw units */
  readonly minAmountOut: bigint
  /** Amount going in (tokenIn raw units) */
  readonly amountIn: bigint
  /** Current gas price in wei */
  readonly gasPrice: bigint
  /** Rolling average gas price in wei */
  readonly gasRollingAverage: bigint
  /** Token price in native token (BNB) per 1 unit of tokenOut. Scaled by 10^18. */
  readonly tokenOutPriceInNative: bigint
  /** Token price in native token (BNB) per 1 unit of tokenIn. Scaled by 10^18. */
  readonly tokenInPriceInNative: bigint
  /** Decimals of tokenOut */
  readonly tokenOutDecimals: number
  /** Decimals of tokenIn */
  readonly tokenInDecimals: number
}

export interface ProfitabilityResult {
  readonly isProfitable: boolean
  readonly estimatedGasCost: bigint
  readonly estimatedProfitInNative: bigint
  readonly reason: string
}

/**
 * Determine if a swap is profitable after accounting for gas and slippage.
 */
export function checkProfitability(
  params: ProfitabilityParams,
  minProfitMultiplier: number,
  maxGasPriceMultiplier: number
): ProfitabilityResult {
  const {
    expectedAmountOut,
    amountIn,
    gasPrice,
    gasRollingAverage,
    tokenOutPriceInNative,
    tokenInPriceInNative,
    tokenOutDecimals,
    tokenInDecimals,
  } = params

  // Gas spike protection
  if (gasRollingAverage > 0n) {
    const gasThreshold =
      gasRollingAverage * BigInt(Math.round(maxGasPriceMultiplier * 100)) / 100n
    if (gasPrice > gasThreshold) {
      return {
        isProfitable: false,
        estimatedGasCost: gasPrice * ESTIMATED_SWAP_GAS_UNITS,
        estimatedProfitInNative: 0n,
        reason: `Gas price spike: ${gasPrice} > ${gasThreshold} (${maxGasPriceMultiplier}x avg)`,
      }
    }
  }

  // Estimated gas cost in native wei
  const estimatedGasCost = gasPrice * ESTIMATED_SWAP_GAS_UNITS

  // Convert expectedAmountOut value to native BNB value (wei)
  // outputValueNative = expectedAmountOut * tokenOutPriceInNative / 10^tokenOutDecimals
  const outputValueNative =
    (expectedAmountOut * tokenOutPriceInNative) / 10n ** BigInt(tokenOutDecimals)

  // Convert amountIn value to native BNB value (wei)
  const inputValueNative =
    (amountIn * tokenInPriceInNative) / 10n ** BigInt(tokenInDecimals)

  // Gross profit in native value
  const grossProfitNative =
    outputValueNative > inputValueNative
      ? outputValueNative - inputValueNative
      : 0n

  if (grossProfitNative === 0n) {
    return {
      isProfitable: false,
      estimatedGasCost,
      estimatedProfitInNative: 0n,
      reason: 'Negative or zero gross profit',
    }
  }

  // Core rule: Profit > Gas_Cost × multiplier
  // Integer math: grossProfitNative * 100 > estimatedGasCost * (multiplier * 100)
  const multiplierScaled = BigInt(Math.round(minProfitMultiplier * 100))
  const isProfitable = grossProfitNative * 100n > estimatedGasCost * multiplierScaled

  const netProfit = grossProfitNative - estimatedGasCost

  if (!isProfitable) {
    log.debug(
      {
        stage: 'CALCULATE',
        grossProfitNative: grossProfitNative.toString(),
        estimatedGasCost: estimatedGasCost.toString(),
        netProfit: netProfit.toString(),
        multiplier: minProfitMultiplier,
      },
      'Trade not profitable after gas costs'
    )
  }

  return {
    isProfitable,
    estimatedGasCost,
    estimatedProfitInNative: netProfit,
    reason: isProfitable
      ? `Profitable: net ${netProfit} wei after gas`
      : `Unprofitable: profit ${grossProfitNative} < gas ${estimatedGasCost} × ${minProfitMultiplier}`,
  }
}
