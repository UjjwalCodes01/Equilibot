/**
 * Approved trading pairs configuration.
 *
 * Each pair must also be whitelisted in SwapGuard on-chain.
 * The pool addresses are resolved from the V3 Factory at startup.
 */

import type { Address, Hex } from 'viem'
import type { TokenConfig } from '../types/index.js'

// ─── Known Tokens (BSC Testnet, chain 97) ────────────────────────

export const TOKENS_TESTNET: Record<string, TokenConfig> = {
  WBNB: {
    address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' as Address,
    symbol: 'WBNB',
    decimals: 18,
  },
  BUSD: {
    address: '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee' as Address,
    symbol: 'BUSD',
    decimals: 18,
  },
}

// ─── Known Tokens (BSC Mainnet, chain 56) ────────────────────────

export const TOKENS_MAINNET: Record<string, TokenConfig> = {
  WBNB: {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address,
    symbol: 'WBNB',
    decimals: 18,
  },
  USDT: {
    address: '0x55d398326f99059fF775485246999027B3197955' as Address,
    symbol: 'USDT',
    decimals: 18,
  },
  USDC: {
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address,
    symbol: 'USDC',
    decimals: 18,
  },
  BUSD: {
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as Address,
    symbol: 'BUSD',
    decimals: 18,
  },
}

// ─── Pyth Price Feed IDs ─────────────────────────────────────────

export const PYTH_FEED_IDS = {
  'BNB/USD': '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f' as Hex,
  'USDT/USD': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' as Hex,
  'USDC/USD': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' as Hex,
  'BUSD/USD': '0x5bc91f13e412c07599167bae86f07543f076a638962b8d6017ec19dab4a82814' as Hex,
} as const

// ─── Pair Definitions ────────────────────────────────────────────
// poolAddress will be resolved from factory at startup

export interface PairDefinition {
  readonly id: string
  readonly tokenA: TokenConfig
  readonly tokenB: TokenConfig
  readonly feeTier: number
  readonly pythPriceFeedIdA: Hex | null
  readonly pythPriceFeedIdB: Hex | null
}

export function getPairDefinitions(chainId: number): PairDefinition[] {
  if (chainId === 97) {
    return [
      {
        id: 'WBNB-BUSD-500',
        tokenA: TOKENS_TESTNET.WBNB!,
        tokenB: TOKENS_TESTNET.BUSD!,
        feeTier: 500,
        pythPriceFeedIdA: PYTH_FEED_IDS['BNB/USD'],
        // BUSD Pyth feed returns 404 on Hermes — feed is deprecated/dead.
        // Set to null so it does not break the BNB/USD fetch.
        // The pipeline uses the synthetic $1.00 stablecoin fallback instead.
        pythPriceFeedIdB: null,
      },
    ]
  }

  if (chainId === 56) {
    return [
      {
        id: 'WBNB-USDT-500',
        tokenA: TOKENS_MAINNET.WBNB!,
        tokenB: TOKENS_MAINNET.USDT!,
        feeTier: 500,
        pythPriceFeedIdA: PYTH_FEED_IDS['BNB/USD'],
        pythPriceFeedIdB: PYTH_FEED_IDS['USDT/USD'],
      },
      {
        id: 'WBNB-USDT-2500',
        tokenA: TOKENS_MAINNET.WBNB!,
        tokenB: TOKENS_MAINNET.USDT!,
        feeTier: 2500, // 0.25%
        pythPriceFeedIdA: PYTH_FEED_IDS['BNB/USD'],
        pythPriceFeedIdB: PYTH_FEED_IDS['USDT/USD'],
      },
    ]
  }

  throw new Error(`Unsupported chain ID: ${chainId}`)
}
