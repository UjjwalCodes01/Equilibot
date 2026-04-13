/**
 * EquiliBot Agent — Profitability Engine Tests
 *
 * Tests the core Profit > Gas × 1.5 rule and all edge cases.
 */

import { describe, it, expect } from 'vitest'
import { checkProfitability, ESTIMATED_SWAP_GAS_UNITS } from './profitability.js'

describe('checkProfitability', () => {
  const baseParams = {
    expectedAmountOut: 1050n * 10n ** 18n, // 1050 tokens
    minAmountOut: 1000n * 10n ** 18n,
    amountIn: 1000n * 10n ** 18n, // 1000 tokens
    gasPrice: 3n * 10n ** 9n, // 3 gwei
    gasRollingAverage: 3n * 10n ** 9n,
    tokenOutPriceInNative: 10n ** 18n, // 1:1 with BNB
    tokenInPriceInNative: 10n ** 18n, // 1:1 with BNB
    tokenOutDecimals: 18,
    tokenInDecimals: 18,
  }

  it('profitable when gross profit exceeds gas × 1.5', () => {
    const result = checkProfitability(baseParams, 1.5, 3.0)
    expect(result.isProfitable).toBe(true)
    expect(result.estimatedGasCost).toBeGreaterThan(0n)
    expect(result.estimatedProfitInNative).toBeGreaterThan(0n)
  })

  it('unprofitable when output equals input', () => {
    const result = checkProfitability(
      { ...baseParams, expectedAmountOut: baseParams.amountIn },
      1.5, 3.0
    )
    expect(result.isProfitable).toBe(false)
    expect(result.reason).toContain('zero gross profit')
  })

  it('unprofitable when output is less than input', () => {
    const result = checkProfitability(
      { ...baseParams, expectedAmountOut: 900n * 10n ** 18n },
      1.5, 3.0
    )
    expect(result.isProfitable).toBe(false)
  })

  it('blocks on gas price spike', () => {
    const result = checkProfitability(
      {
        ...baseParams,
        gasPrice: 10n * 10n ** 9n, // 10 gwei (>3x the 3 gwei average)
        gasRollingAverage: 3n * 10n ** 9n,
      },
      1.5, 3.0
    )
    expect(result.isProfitable).toBe(false)
    expect(result.reason).toContain('Gas price spike')
  })

  it('allows when gas rolling average is zero (initial state)', () => {
    const result = checkProfitability(
      { ...baseParams, gasRollingAverage: 0n },
      1.5, 3.0
    )
    // Should not block on gas spike check when avg is 0
    expect(result.reason).not.toContain('Gas price spike')
  })

  it('respects different multipliers', () => {
    // Create a scenario where profit is exactly at the boundary
    const gasCost = baseParams.gasPrice * ESTIMATED_SWAP_GAS_UNITS
    // Make output such that profit is exactly 2x gas (passes at 1.5x, fails at 2.5x)
    const tinyProfit = gasCost * 2n
    const adjustedOutput = baseParams.amountIn + tinyProfit

    const result15 = checkProfitability(
      { ...baseParams, expectedAmountOut: adjustedOutput },
      1.5, 3.0
    )
    expect(result15.isProfitable).toBe(true)

    const result25 = checkProfitability(
      { ...baseParams, expectedAmountOut: adjustedOutput },
      2.5, 3.0
    )
    expect(result25.isProfitable).toBe(false)
  })

  it('handles different token decimals correctly', () => {
    const result = checkProfitability(
      {
        ...baseParams,
        expectedAmountOut: 1050n * 10n ** 6n,
        amountIn: 1000n * 10n ** 6n,
        tokenOutDecimals: 6,
        tokenInDecimals: 6,
      },
      1.5, 3.0
    )
    // 50 tokens profit at 6 decimals, should be equivalent
    expect(result.estimatedProfitInNative).toBeGreaterThan(0n)
  })
})
