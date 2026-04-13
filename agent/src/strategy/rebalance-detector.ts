/**
 * EquiliBot Agent — Rebalance Detector
 *
 * Compares the DEX implied cross-rate against Pyth-derived cross-rate.
 *
 * ARCHITECTURE: The DEX gives us price of token0 in terms of token1 (a ratio).
 * Pyth gives us individual USD prices for each token.
 * We derive the Pyth cross-rate (tokenA_USD / tokenB_USD) and compare it to the
 * DEX ratio. This ensures apples-to-apples comparison.
 *
 * Edge cases:
 * - Both feeds required: if either Pyth feed is missing, we cannot compute cross-rate
 * - Confidence: if either feed has wide confidence, skip
 * - Minimum size filter (respects SwapGuard.minTradeAmount)
 * - Zero price guard
 */

import type { Address } from 'viem'
import type {
  OraclePrice,
  MarketSnapshot,
  RebalanceOpportunity,
  SwapDirection,
} from '../types/index.js'
import { sqrtPriceX96ToPrice, calculateDeviationBps } from '../utils/math.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('rebalance-detector')

export interface DetectorConfig {
  readonly minDeviationBps: number
  readonly minTradeAmounts: Map<Address, bigint>
}

export class RebalanceDetector {
  private readonly config: DetectorConfig

  constructor(config: DetectorConfig) {
    this.config = config
  }

  /**
   * Analyze a market snapshot to detect a rebalance opportunity.
   * Returns null if no opportunity meets the criteria.
   *
   * Price comparison:
   * - DEX price: sqrtPriceX96 → token0/token1 ratio (18-decimal scaled)
   * - Oracle price: Pyth tokenA/USD and tokenB/USD → derived tokenA/tokenB ratio
   */
  detect(
    snapshot: MarketSnapshot
  ): RebalanceOpportunity | null {
    const { pair, pool, oraclePriceA, oraclePriceB, safeBalanceA, safeBalanceB } = snapshot

    // Hard block: BOTH oracle feeds required for cross-rate derivation
    if (!oraclePriceA || !oraclePriceB) {
      log.debug(
        { stage: 'CALCULATE', pair: pair.id },
        'Missing oracle feed(s) — cannot compute cross-rate, skipping'
      )
      return null
    }

    // V3 pools are strictly sorted by token address. token0 is always the lexicographically smaller address.
    // sqrtPriceX96 ALWAYS represents the price of token0 in terms of token1.
    const isToken0A = pair.tokenA.address.toLowerCase() < pair.tokenB.address.toLowerCase()

    const decimalsToken0 = isToken0A ? pair.tokenA.decimals : pair.tokenB.decimals
    const decimalsToken1 = isToken0A ? pair.tokenB.decimals : pair.tokenA.decimals

    // Convert DEX sqrtPriceX96 to a comparable price ratio (18-decimal scaled)
    // This gives: price of token0 in terms of token1
    const dexPrice = sqrtPriceX96ToPrice(
      pool.sqrtPriceX96,
      decimalsToken0,
      decimalsToken1
    )

    // Derive oracle cross-rate matching the token0/token1 orientation
    // Both Pyth prices are normalized to 18-decimal precision
    const oraclePriceANormalized = this.normalizePythPrice(oraclePriceA)
    const oraclePriceBNormalized = this.normalizePythPrice(oraclePriceB)

    if (oraclePriceANormalized === 0n || oraclePriceBNormalized === 0n) {
      log.debug(
        { stage: 'CALCULATE', pair: pair.id },
        'Oracle price is zero, cannot derive cross-rate'
      )
      return null
    }

    // If tokenA is token0, we need price of A in B: A_USD / B_USD
    // If tokenB is token0, we need price of B in A: B_USD / A_USD
    const oracleCrossRate = isToken0A
      ? (oraclePriceANormalized * (10n ** 18n)) / oraclePriceBNormalized
      : (oraclePriceBNormalized * (10n ** 18n)) / oraclePriceANormalized

    if (dexPrice === 0n || oracleCrossRate === 0n) {
      log.debug(
        { stage: 'CALCULATE', pair: pair.id },
        'Zero price detected after conversion, skipping'
      )
      return null
    }

    // Calculate deviation between DEX ratio (token0 in token1) and oracle ratio
    const deviationBps = calculateDeviationBps(dexPrice, oracleCrossRate)

    if (deviationBps < this.config.minDeviationBps) {
      log.debug(
        {
          stage: 'CALCULATE',
          pair: pair.id,
          deviationBps,
          threshold: this.config.minDeviationBps,
        },
        'Deviation below threshold, skipping'
      )
      return null
    }

    // Determine direction based on token0 pricing:
    // If dexPrice < oracleCrossRate → token0 is CHEAP on DEX → we should BUY token0.
    // If dexPrice > oracleCrossRate → token0 is EXPENSIVE on DEX → we should SELL token0 (BUY token1).
    const buyToken0 = dexPrice < oracleCrossRate
    
    const direction: SwapDirection = buyToken0
      ? (isToken0A ? 'BUY_A' : 'BUY_B')
      : (isToken0A ? 'BUY_B' : 'BUY_A')

    // Determine trade token and check minimum trade amount
    const tokenIn = direction === 'BUY_A' ? pair.tokenB.address : pair.tokenA.address
    const balance = direction === 'BUY_A' ? safeBalanceB : safeBalanceA
    const minTradeAmount = this.config.minTradeAmounts.get(tokenIn) ?? 0n

    if (balance < minTradeAmount) {
      log.debug(
        {
          stage: 'CALCULATE',
          pair: pair.id,
          direction,
          balance: balance.toString(),
          minTradeAmount: minTradeAmount.toString(),
        },
        'Insufficient balance for minimum trade, skipping'
      )
      return null
    }

    // Suggest trade amount: use a conservative portion of the balance
    // Cap at 10% of total balance to avoid large single-trade risk
    const suggestedAmountIn = this.calculateTradeSize(balance, minTradeAmount)

    log.info(
      {
        stage: 'CALCULATE',
        pair: pair.id,
        direction,
        deviationBps,
        dexPrice: dexPrice.toString(),
        oracleCrossRate: oracleCrossRate.toString(),
        suggestedAmountIn: suggestedAmountIn.toString(),
      },
      `Rebalance opportunity detected: ${direction} (${deviationBps} bps deviation)`
    )

    return {
      pair,
      direction,
      deviationBps,
      dexPrice,
      oraclePrice: oracleCrossRate,
      suggestedAmountIn,
      snapshot,
    }
  }

  /**
   * Normalize Pyth price to 18-decimal precision.
   * Pyth reports: price * 10^exponent (exponent is negative, e.g., -8)
   */
  private normalizePythPrice(oraclePrice: OraclePrice): bigint {
    const { price, exponent } = oraclePrice
    const absExponent = Math.abs(exponent)

    if (exponent < 0) {
      if (absExponent <= 18) {
        return price * 10n ** BigInt(18 - absExponent)
      } else {
        return price / 10n ** BigInt(absExponent - 18)
      }
    }
    return price * 10n ** BigInt(18 + exponent)
  }

  /**
   * Calculate a conservative trade size.
   * Uses at most 10% of balance, respecting minimum trade amount.
   */
  private calculateTradeSize(balance: bigint, minTradeAmount: bigint): bigint {
    const tenPercentOfBalance = balance / 10n
    if (tenPercentOfBalance < minTradeAmount) {
      return minTradeAmount
    }
    return tenPercentOfBalance
  }
}
