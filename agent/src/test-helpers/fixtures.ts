import type {
  MarketSnapshot,
  OraclePrice,
  PoolState,
  RebalanceIntent,
  RebalanceOpportunity,
  SwapRequestStruct,
  TradingPair,
} from '../types/index.js'
import type { Address, Hex } from 'viem'

export const MOCK_ADDRESSES = {
  safe: '0x1111111111111111111111111111111111111111' as Address,
  module: '0x2222222222222222222222222222222222222222' as Address,
  guard: '0x3333333333333333333333333333333333333333' as Address,
  router: '0x4444444444444444444444444444444444444444' as Address,
  tokenA: '0x5555555555555555555555555555555555555555' as Address,
  tokenB: '0x6666666666666666666666666666666666666666' as Address,
  pool: '0x7777777777777777777777777777777777777777' as Address,
  agent: '0x8888888888888888888888888888888888888888' as Address,
} as const

export const MOCK_PAIR: TradingPair = {
  id: 'WBNB-USDT-500',
  tokenA: {
    address: MOCK_ADDRESSES.tokenA,
    symbol: 'WBNB',
    decimals: 18,
  },
  tokenB: {
    address: MOCK_ADDRESSES.tokenB,
    symbol: 'USDT',
    decimals: 18,
  },
  feeTier: 500,
  poolAddress: MOCK_ADDRESSES.pool,
  pythFeedIdA: '0x01' as Hex,
  pythFeedIdB: '0x02' as Hex,
}

export const MOCK_POOL_STATE: PoolState = {
  poolAddress: MOCK_ADDRESSES.pool,
  sqrtPriceX96: 2n ** 96n,
  tick: 0,
  liquidity: 10n ** 18n,
  blockNumber: 100n,
  logIndex: 0,
  updatedAt: Date.now(),
}

export const MOCK_ORACLE_A: OraclePrice = {
  price: 60000000000n,
  confidence: 10000000n,
  exponent: -8,
  publishTime: Math.floor(Date.now() / 1000),
  feedId: '0x01' as Hex,
}

export const MOCK_ORACLE_B: OraclePrice = {
  price: 100000000n,
  confidence: 100000n,
  exponent: -8,
  publishTime: Math.floor(Date.now() / 1000),
  feedId: '0x02' as Hex,
}

export const MOCK_SNAPSHOT: MarketSnapshot = {
  pair: MOCK_PAIR,
  pool: MOCK_POOL_STATE,
  oraclePriceA: MOCK_ORACLE_A,
  oraclePriceB: MOCK_ORACLE_B,
  gasPrice: 3n * 10n ** 9n,
  safeBalanceA: 10n ** 18n,
  safeBalanceB: 10n ** 18n,
  blockNumber: 100n,
  timestamp: Date.now(),
}

export const MOCK_OPPORTUNITY: RebalanceOpportunity = {
  pair: MOCK_PAIR,
  direction: 'BUY_A',
  deviationBps: 250,
  dexPrice: 9n * 10n ** 17n,
  oraclePrice: 10n ** 18n,
  suggestedAmountIn: 10n ** 17n,
  snapshot: MOCK_SNAPSHOT,
}

export const MOCK_INTENT: RebalanceIntent = {
  id: 'intent-1',
  pair: MOCK_PAIR,
  direction: 'BUY_A',
  swapType: 0,
  router: MOCK_ADDRESSES.router,
  tokenIn: MOCK_ADDRESSES.tokenB,
  tokenOut: MOCK_ADDRESSES.tokenA,
  amountIn: 10n ** 17n,
  expectedAmountIn: 0n,
  expectedAmountOut: 9n * 10n ** 16n,
  minAmountOut: 85n * 10n ** 15n,
  deadline: 1_900_000_000n,
  estimatedGasCost: 2n * 10n ** 15n,
  estimatedProfit: 5n * 10n ** 15n,
  routerCalldata: '0x414bf389' as Hex,
  snapshot: MOCK_SNAPSHOT,
  createdAt: Date.now(),
}

export const MOCK_SWAP_REQUEST: SwapRequestStruct = {
  swapType: 0,
  router: MOCK_ADDRESSES.router,
  tokenIn: MOCK_ADDRESSES.tokenB,
  tokenOut: MOCK_ADDRESSES.tokenA,
  amountIn: 10n ** 17n,
  expectedAmountIn: 0n,
  minAmountOut: 85n * 10n ** 15n,
  expectedAmountOut: 9n * 10n ** 16n,
  deadline: 1_900_000_000n,
}