/**
 * EquiliBot Agent — Rebalance Detector Tests
 *
 * Tests the cross-rate derivation, direction logic, and all edge cases.
 */

import { describe, it, expect } from 'vitest'
import { RebalanceDetector } from './rebalance-detector.js'
import type { MarketSnapshot, TradingPair, PoolState, OraclePrice } from '../types/index.js'
import type { Address, Hex } from 'viem'
import { Q96 } from '../utils/math.js'

const mockPair: TradingPair = {
  id: 'WBNB-USDT-500',
  tokenA: {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address,
    symbol: 'WBNB',
    decimals: 18,
  },
  tokenB: {
    address: '0x55d398326f99059fF775485246999027B3197955' as Address,
    symbol: 'USDT',
    decimals: 18,
  },
  feeTier: 500,
  poolAddress: '0x0000000000000000000000000000000000000001' as Address,
  pythFeedIdA: '0x01' as Hex,
  pythFeedIdB: '0x02' as Hex,
}

const mockPoolState: PoolState = {
  poolAddress: mockPair.poolAddress,
  sqrtPriceX96: Q96, // price = 1.0
  tick: 0,
  liquidity: 10n ** 18n,
  blockNumber: 100n,
  logIndex: 0,
  updatedAt: Date.now(),
}

function makeOraclePrice(priceNum: number, expo: number = -8): OraclePrice {
  return {
    price: BigInt(priceNum),
    confidence: BigInt(Math.floor(priceNum * 0.001)), // 0.1% confidence
    exponent: expo,
    publishTime: Math.floor(Date.now() / 1000),
    feedId: '0x01' as Hex,
  }
}

describe('RebalanceDetector', () => {
  const detector = new RebalanceDetector({
    minDeviationBps: 50,
    minTradeAmounts: new Map(),
  })

  it('returns null when both oracle feeds are missing', () => {
    const snapshot: MarketSnapshot = {
      pair: mockPair,
      pool: mockPoolState,
      oraclePriceA: null,
      oraclePriceB: null,
      gasPrice: 3n * 10n ** 9n,
      safeBalanceA: 10n ** 18n,
      safeBalanceB: 10n ** 18n,
      blockNumber: 100n,
      timestamp: Date.now(),
    }
    expect(detector.detect(snapshot)).toBeNull()
  })

  it('returns null when only one oracle feed is available', () => {
    const snapshot: MarketSnapshot = {
      pair: mockPair,
      pool: mockPoolState,
      oraclePriceA: makeOraclePrice(60000000000), // $600
      oraclePriceB: null,
      gasPrice: 3n * 10n ** 9n,
      safeBalanceA: 10n ** 18n,
      safeBalanceB: 10n ** 18n,
      blockNumber: 100n,
      timestamp: Date.now(),
    }
    expect(detector.detect(snapshot)).toBeNull()
  })

  it('returns null when deviation is below threshold', () => {
    // Make DEX and oracle prices nearly identical
    const snapshot: MarketSnapshot = {
      pair: mockPair,
      pool: mockPoolState,
      oraclePriceA: makeOraclePrice(100000000), // $1.00
      oraclePriceB: makeOraclePrice(100000000), // $1.00 (cross-rate = 1.0)
      gasPrice: 3n * 10n ** 9n,
      safeBalanceA: 10n ** 18n,
      safeBalanceB: 10n ** 18n,
      blockNumber: 100n,
      timestamp: Date.now(),
    }
    // DEX price is 1.0 (Q96), oracle cross-rate is 1.0, deviation = 0
    expect(detector.detect(snapshot)).toBeNull()
  })

  it('returns null when balance is insufficient', () => {
    const detectorWithMin = new RebalanceDetector({
      minDeviationBps: 50,
      minTradeAmounts: new Map([
        [mockPair.tokenB.address, 100n * 10n ** 18n], // need 100 USDT
      ]),
    })

    const snapshot: MarketSnapshot = {
      pair: mockPair,
      pool: {
        ...mockPoolState,
        sqrtPriceX96: Q96 * 80n / 100n, // DEX price much lower => deviation
      },
      oraclePriceA: makeOraclePrice(60000000000), // $600
      oraclePriceB: makeOraclePrice(100000000), // $1.00
      gasPrice: 3n * 10n ** 9n,
      safeBalanceA: 10n ** 18n,
      safeBalanceB: 1n * 10n ** 18n, // Only 1 USDT, need 100
      blockNumber: 100n,
      timestamp: Date.now(),
    }

    expect(detectorWithMin.detect(snapshot)).toBeNull()
  })

  it('detects opportunity with significant deviation', () => {
    // Create a big deviation: DEX says price=0.5, oracle says cross-rate=1.0
    const snapshot: MarketSnapshot = {
      pair: mockPair,
      pool: {
        ...mockPoolState,
        sqrtPriceX96: Q96 * 70n / 100n, // sqrt(0.49) ≈ 0.7 → price ≈ 0.49
      },
      oraclePriceA: makeOraclePrice(100000000), // $1.00
      oraclePriceB: makeOraclePrice(100000000), // $1.00 (cross-rate = 1.0)
      gasPrice: 3n * 10n ** 9n,
      safeBalanceA: 10n ** 18n,
      safeBalanceB: 10n ** 18n,
      blockNumber: 100n,
      timestamp: Date.now(),
    }

    const result = detector.detect(snapshot)
    expect(result).not.toBeNull()
    if (result) {
      // token0 (USDT, B) is cheap on DEX (0.49) compared to Oracle (1.0). So we BUY B.
      expect(result.direction).toBe('BUY_B')
      expect(result.deviationBps).toBeGreaterThan(50)
      expect(result.suggestedAmountIn).toBeGreaterThan(0n)
    }
  })
})
