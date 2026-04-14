/**
 * EquiliBot Agent — Runtime Policy Tests
 */

import { describe, it, expect } from 'vitest'
import { encodeFunctionData } from 'viem'
import { validatePreSubmit, type RuntimePolicyConfig } from './runtime-policy.js'
import { pancakeSmartRouterAbi } from '../abi/pancake-smart-router.js'
import type { RebalanceIntent, OraclePrice, TradingPair, MarketSnapshot } from '../types/index.js'
import type { Address, Hex } from 'viem'

const SAFE_RECIPIENT = '0x0000000000000000000000000000000000001234' as Address

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

const mockSnapshot: MarketSnapshot = {
  pair: mockPair,
  pool: {
    poolAddress: mockPair.poolAddress,
    sqrtPriceX96: 0n,
    tick: 0,
    liquidity: 0n,
    blockNumber: 100n,
    logIndex: 0,
    updatedAt: Date.now(),
  },
  oraclePriceA: null,
  oraclePriceB: null,
  gasPrice: 3n * 10n ** 9n,
  safeBalanceA: 10n ** 18n,
  safeBalanceB: 10n ** 18n,
  blockNumber: 100n,
  timestamp: Date.now(),
}

function makeIntent(overrides: Partial<RebalanceIntent> = {}): RebalanceIntent {
  const futureDeadline = BigInt(Math.floor(Date.now() / 1000) + 300)
  const tokenIn = mockPair.tokenB.address
  const tokenOut = mockPair.tokenA.address
  const amountIn = overrides.amountIn ?? 10n ** 18n
  const minAmountOut = overrides.minAmountOut ?? 19n * 10n ** 17n

  const routerCalldata = encodeFunctionData({
    abi: pancakeSmartRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        fee: mockPair.feeTier,
        recipient: SAFE_RECIPIENT,
        deadline: futureDeadline,
        amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  return {
    id: 'test-intent',
    pair: mockPair,
    direction: 'BUY_A',
    swapType: 0,
    router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4' as Address,
    tokenIn,
    tokenOut,
    amountIn,
    expectedAmountIn: 0n,
    expectedAmountOut: 2n * 10n ** 18n,
    minAmountOut,
    deadline: futureDeadline,
    estimatedGasCost: 10n ** 15n,
    estimatedProfit: 10n ** 16n,
    routerCalldata,
    snapshot: mockSnapshot,
    createdAt: Date.now(),
    ...overrides,
  }
}

const activeConfig: RuntimePolicyConfig = {
  executionMode: 'active',
  canaryMaxTradeUsd: 50,
  runtimeMaxNotionalUsd: 0,
  safeAddress: SAFE_RECIPIENT,
}

const canaryConfig: RuntimePolicyConfig = {
  executionMode: 'canary',
  canaryMaxTradeUsd: 50,
  runtimeMaxNotionalUsd: 0,
  safeAddress: SAFE_RECIPIENT,
}

const mockOracle: OraclePrice = {
  price: 60000000000n, // $600
  confidence: 60000000n,
  exponent: -8,
  publishTime: Math.floor(Date.now() / 1000) - 5, // 5 seconds ago
  feedId: '0x01' as Hex,
}

describe('validatePreSubmit', () => {
  it('rejects in observe mode', () => {
    const result = validatePreSubmit(
      makeIntent(),
      { ...activeConfig, executionMode: 'observe' },
      mockOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('observe-only')
  })

  it('rejects in simulate mode', () => {
    const result = validatePreSubmit(
      makeIntent(),
      { ...activeConfig, executionMode: 'simulate' },
      mockOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('simulate-only')
  })

  it('rejects zero minAmountOut', () => {
    const result = validatePreSubmit(
      makeIntent({ minAmountOut: 0n }),
      activeConfig,
      mockOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('minAmountOut is zero')
  })

  it('rejects expired deadline', () => {
    const pastDeadline = BigInt(Math.floor(Date.now() / 1000) - 100)
    const result = validatePreSubmit(
      makeIntent({ deadline: pastDeadline }),
      activeConfig,
      mockOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('Deadline')
  })

  it('rejects stale oracle data', () => {
    const staleOracle: OraclePrice = {
      ...mockOracle,
      publishTime: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago
    }
    const result = validatePreSubmit(
      makeIntent(),
      activeConfig,
      staleOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('stale')
  })

  it('passes in active mode with valid intent', () => {
    const result = validatePreSubmit(
      makeIntent(),
      activeConfig,
      mockOracle,
      Date.now()
    )
    expect(result.passed).toBe(true)
  })

  it('rejects canary mode if notional exceeds cap', () => {
    // 1000 USDT at $1 = $1000 > $50 canary cap
    const bigAmountIntent = makeIntent({
      amountIn: 1000n * 10n ** 18n,
    })

    const usdtOracle: OraclePrice = {
      price: 100000000n, // $1.00
      confidence: 100000n,
      exponent: -8,
      publishTime: Math.floor(Date.now() / 1000) - 5,
      feedId: '0x02' as Hex,
    }

    const result = validatePreSubmit(
      bigAmountIntent,
      canaryConfig,
      usdtOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('Canary mode')
  })

  it('passes canary mode if notional is within cap', () => {
    // 10 USDT at $1 = $10 < $50 canary cap
    const smallAmountIntent = makeIntent({
      amountIn: 10n * 10n ** 18n,
    })

    const usdtOracle: OraclePrice = {
      price: 100000000n,
      confidence: 100000n,
      exponent: -8,
      publishTime: Math.floor(Date.now() / 1000) - 5,
      feedId: '0x02' as Hex,
    }

    const result = validatePreSubmit(
      smallAmountIntent,
      canaryConfig,
      usdtOracle,
      Date.now()
    )
    expect(result.passed).toBe(true)
  })

  it('rejects runtime notional ceiling when set', () => {
    const configWithCeiling: RuntimePolicyConfig = {
      ...activeConfig,
      runtimeMaxNotionalUsd: 100,
    }

    const bigAmountIntent = makeIntent({
      amountIn: 1000n * 10n ** 18n,
    })

    const usdtOracle: OraclePrice = {
      price: 100000000n,
      confidence: 100000n,
      exponent: -8,
      publishTime: Math.floor(Date.now() / 1000) - 5,
      feedId: '0x02' as Hex,
    }

    const result = validatePreSubmit(
      bigAmountIntent,
      configWithCeiling,
      usdtOracle,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('runtime cap')
  })

  it('fails closed in canary mode when token-in oracle is missing', () => {
    const result = validatePreSubmit(
      makeIntent(),
      canaryConfig,
      null,
      Date.now()
    )
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('Missing token-in oracle price')
  })
})
