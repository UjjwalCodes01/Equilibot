/**
 * EquiliBot Agent — BigInt Math Helpers
 *
 * All price math is done in BigInt to avoid floating-point precision loss.
 * sqrtPriceX96 uses Q64.96 fixed-point format from Uniswap V3.
 */

/** 2^96 as BigInt — used for sqrtPriceX96 conversions */
export const Q96 = 2n ** 96n

/** 2^192 as BigInt — used for price = (sqrtPriceX96)^2 / 2^192 */
export const Q192 = 2n ** 192n

/** 10000 BPS = 100% */
export const BPS_DENOMINATOR = 10_000n

/**
 * Convert sqrtPriceX96 to a price ratio scaled by 10^decimals.
 *
 * In Uniswap V3: price = (sqrtPriceX96 / 2^96)^2
 * This gives price of token0 in terms of token1.
 *
 * We scale the result to avoid losing precision in integer division.
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimalsToken0: number,
  decimalsToken1: number
): bigint {
  // price = sqrtPriceX96^2 * 10^decimalsToken0 / (2^192 * 10^decimalsToken1)
  // Rearranged to avoid overflow: multiply before dividing where possible.
  const numerator = sqrtPriceX96 * sqrtPriceX96
  const decimalAdjustment = 10n ** BigInt(decimalsToken0)
  const denominator = Q192 * 10n ** BigInt(decimalsToken1)

  // Scale up to get a high-precision integer price
  // Result: price of 1 unit of token0 denominated in token1 raw units
  // Multiply by 10^18 for 18-decimal precision
  return (numerator * decimalAdjustment * 10n ** 18n) / denominator
}

/**
 * Calculate deviation between two prices in basis points.
 * Returns absolute deviation.
 */
export function calculateDeviationBps(priceA: bigint, priceB: bigint): number {
  if (priceA === 0n || priceB === 0n) return 0

  const diff = priceA > priceB ? priceA - priceB : priceB - priceA
  const bps = (diff * BPS_DENOMINATOR) / priceB

  // Safe to convert to number since BPS will always be < 10000
  return Number(bps)
}

/**
 * Apply slippage tolerance in basis points.
 * Returns the minimum acceptable output amount.
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(slippageBps)
  return (amount * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR
}

/**
 * Calculate slippage between expected and minimum output in basis points.
 */
export function calculateSlippageBps(
  expectedAmountOut: bigint,
  minAmountOut: bigint
): number {
  if (expectedAmountOut === 0n) return 0
  return Number(
    ((expectedAmountOut - minAmountOut) * BPS_DENOMINATOR) / expectedAmountOut
  )
}

/**
 * Scale an amount by decimals.
 * parseUnits equivalent: amount * 10^decimals
 */
export function scaleAmount(amount: number, decimals: number): bigint {
  // Handle decimal amounts by splitting at the decimal point
  const [whole, fraction = ''] = amount.toString().split('.')
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole + paddedFraction)
}

/**
 * Safe absolute value for bigint.
 */
export function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

/**
 * Minimum of two bigints.
 */
export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

/**
 * Maximum of two bigints.
 */
export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}
