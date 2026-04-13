/**
 * EquiliBot Agent — Math Utility Tests
 *
 * Tests all BigInt math helpers for:
 * - sqrtPriceX96 conversion accuracy
 * - Deviation calculation correctness
 * - Slippage application
 * - Edge cases: zero values, overflow, extreme decimals
 */

import { describe, it, expect } from 'vitest'
import {
  sqrtPriceX96ToPrice,
  calculateDeviationBps,
  applySlippage,
  calculateSlippageBps,
  scaleAmount,
  absBigInt,
  minBigInt,
  maxBigInt,
  Q96,
} from './math.js'

describe('sqrtPriceX96ToPrice', () => {
  it('converts 1:1 price correctly for same-decimal tokens', () => {
    // sqrtPriceX96 for price = 1.0 is 2^96
    // price = (2^96)^2 / 2^192 = 1.0
    const sqrtPrice = Q96 // 2^96 = price of 1.0
    const result = sqrtPriceX96ToPrice(sqrtPrice, 18, 18)
    // Should be 10^18 (1.0 scaled to 18 decimals)
    expect(result).toBe(10n ** 18n)
  })

  it('handles different decimals (token0=18, token1=6)', () => {
    // For tokens with 18 and 6 decimals, the raw price needs adjustment
    const sqrtPrice = Q96 // 1.0 price
    const result = sqrtPriceX96ToPrice(sqrtPrice, 18, 6)
    // With 18 decimals for token0 and 6 for token1:
    // result should reflect the decimal difference
    expect(result).toBeGreaterThan(0n)
  })

  it('returns 0 for sqrtPriceX96 = 0', () => {
    const result = sqrtPriceX96ToPrice(0n, 18, 18)
    expect(result).toBe(0n)
  })

  it('handles realistic PancakeSwap sqrtPriceX96 values', () => {
    // A real WBNB/USDT sqrtPriceX96 value (representing ~$600 BNB)
    // sqrtPriceX96 = sqrt(600) * 2^96 ≈ 1.939 * 10^30
    const sqrtPrice = 1939230484542564n * (10n ** 15n) // approximation
    const result = sqrtPriceX96ToPrice(sqrtPrice, 18, 18)
    expect(result).toBeGreaterThan(0n)
  })
})

describe('calculateDeviationBps', () => {
  it('returns 0 for equal prices', () => {
    const result = calculateDeviationBps(1000n, 1000n)
    expect(result).toBe(0)
  })

  it('returns 0 when either price is 0', () => {
    expect(calculateDeviationBps(0n, 1000n)).toBe(0)
    expect(calculateDeviationBps(1000n, 0n)).toBe(0)
  })

  it('calculates 1% deviation correctly', () => {
    const result = calculateDeviationBps(1010n, 1000n)
    expect(result).toBe(100) // 100 bps = 1%
  })

  it('calculates 50 bps deviation', () => {
    const result = calculateDeviationBps(10050n, 10000n)
    expect(result).toBe(50)
  })

  it('returns absolute deviation regardless of direction', () => {
    const resultA = calculateDeviationBps(1050n, 1000n)
    const resultB = calculateDeviationBps(950n, 1000n)
    expect(resultA).toBe(resultB) // both should be 50 bps
  })

  it('handles large values without overflow', () => {
    const a = 10n ** 30n + 10n ** 27n // 1.001 * 10^30
    const b = 10n ** 30n
    const result = calculateDeviationBps(a, b)
    expect(result).toBe(10) // 10 bps = 0.1%
  })
})

describe('applySlippage', () => {
  it('applies 1% slippage correctly', () => {
    const result = applySlippage(10000n, 100) // 100 bps = 1%
    expect(result).toBe(9900n)
  })

  it('applies 0.5% slippage correctly', () => {
    const result = applySlippage(10000n, 50)
    expect(result).toBe(9950n)
  })

  it('applies 0 slippage (no change)', () => {
    const result = applySlippage(10000n, 0)
    expect(result).toBe(10000n)
  })

  it('handles realistic token amounts', () => {
    const amount = 10n ** 18n // 1 token with 18 decimals
    const result = applySlippage(amount, 30) // 0.3%
    expect(result).toBe(amount * 9970n / 10000n)
  })
})

describe('calculateSlippageBps', () => {
  it('returns 0 for zero expected output', () => {
    expect(calculateSlippageBps(0n, 0n)).toBe(0)
  })

  it('calculates 1% slippage', () => {
    expect(calculateSlippageBps(10000n, 9900n)).toBe(100)
  })

  it('calculates 0.5% slippage', () => {
    expect(calculateSlippageBps(10000n, 9950n)).toBe(50)
  })
})

describe('scaleAmount', () => {
  it('scales integer amounts', () => {
    expect(scaleAmount(1, 18)).toBe(10n ** 18n)
  })

  it('scales decimal amounts', () => {
    expect(scaleAmount(1.5, 18)).toBe(15n * 10n ** 17n)
  })

  it('handles 6-decimal tokens', () => {
    expect(scaleAmount(100, 6)).toBe(100_000_000n)
  })
})

describe('absBigInt', () => {
  it('returns positive for positive', () => {
    expect(absBigInt(42n)).toBe(42n)
  })

  it('returns positive for negative', () => {
    expect(absBigInt(-42n)).toBe(42n)
  })

  it('returns 0 for 0', () => {
    expect(absBigInt(0n)).toBe(0n)
  })
})

describe('minBigInt / maxBigInt', () => {
  it('min returns smaller', () => {
    expect(minBigInt(1n, 2n)).toBe(1n)
    expect(minBigInt(2n, 1n)).toBe(1n)
  })

  it('max returns larger', () => {
    expect(maxBigInt(1n, 2n)).toBe(2n)
    expect(maxBigInt(2n, 1n)).toBe(2n)
  })

  it('handles equal values', () => {
    expect(minBigInt(5n, 5n)).toBe(5n)
    expect(maxBigInt(5n, 5n)).toBe(5n)
  })
})
