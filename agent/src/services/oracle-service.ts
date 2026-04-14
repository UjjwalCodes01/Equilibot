/**
 * EquiliBot Agent — Pyth Oracle Service (Off-Chain)
 *
 * Fetches price updates from Pyth Hermes API.
 * Used as independent price reference, NOT as sole truth.
 *
 * Edge cases:
 * - Stale prices: rejected if older than MAX_STALENESS_SECONDS
 * - Confidence: rejected if confidence/price > MAX_CONFIDENCE_RATIO
 * - Network failure: returns null, strategy engine treats as hard block
 */

import type { Hex } from 'viem'
import type { OraclePrice } from '../types/index.js'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'

const log = createLogger('oracle-service')
const MAX_STALENESS_SECONDS = 30
const MAX_CONFIDENCE_RATIO_BPS = 200 // 2%

interface HermesPriceUpdate {
  id: string
  price: {
    price: string
    conf: string
    expo: number
    publish_time: number
  }
}

export class OracleService {
  private readonly hermesUrl: string

  constructor(hermesUrl: string) {
    this.hermesUrl = hermesUrl
  }

  /**
   * Fetch the latest price for a set of Pyth feed IDs.
   * Returns null for any feed that is stale, unreliable, or unavailable.
   */
  async getPrices(feedIds: Hex[]): Promise<Map<Hex, OraclePrice | null>> {
    const results = new Map<Hex, OraclePrice | null>()

    if (feedIds.length === 0) return results

    try {
      const updates = await withRetry(
        () => this.fetchHermesPrices(feedIds),
        { label: 'pyth-hermes-fetch', maxRetries: 2 }
      )

      const now = Math.floor(Date.now() / 1000)

      for (const update of updates) {
        const feedId = ('0x' + update.id) as Hex

        const price = BigInt(update.price.price)
        const confidence = BigInt(update.price.conf)
        const exponent = update.price.expo
        const publishTime = update.price.publish_time

        // Check staleness
        if (now - publishTime > MAX_STALENESS_SECONDS) {
          log.warn(
            {
              stage: 'OBSERVE',
              feedId,
              publishTime,
              staleness: now - publishTime,
            },
            `Pyth price stale (${now - publishTime}s old), rejecting`
          )
          results.set(feedId, null)
          continue
        }

        // Check confidence interval: if confidence > 2% of price, unreliable
        const absPrice = price < 0n ? -price : price
        if (absPrice > 0n) {
          const confidenceRatio = (confidence * 10_000n) / absPrice
          if (confidenceRatio > BigInt(MAX_CONFIDENCE_RATIO_BPS)) {
            log.warn(
              {
                stage: 'OBSERVE',
                feedId,
                confidenceRatioBps: Number(confidenceRatio),
              },
              'Pyth price confidence too wide, rejecting'
            )
            results.set(feedId, null)
            continue
          }
        }

        results.set(feedId, {
          price,
          confidence,
          exponent,
          publishTime,
          feedId,
        })
      }

      // Mark any requested feeds that weren't in the response
      for (const feedId of feedIds) {
        if (!results.has(feedId)) {
          results.set(feedId, null)
        }
      }
    } catch (error) {
      log.error(
        { stage: 'OBSERVE', error },
        'Failed to fetch Pyth prices, all feeds unavailable'
      )
      for (const feedId of feedIds) {
        results.set(feedId, null)
      }
    }

    return results
  }

  private async fetchHermesPrices(feedIds: Hex[]): Promise<HermesPriceUpdate[]> {
    const params = feedIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&')
    const url = `${this.hermesUrl}/v2/updates/price/latest?${params}`

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      throw new Error(`Pyth Hermes API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { parsed: HermesPriceUpdate[] }
    return data.parsed
  }
}
