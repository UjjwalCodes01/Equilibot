/**
 * EquiliBot Agent — Gas Service
 *
 * Polls gas prices and maintains a rolling average to smooth spikes.
 * Provides a gas-cost estimator for profitability calculations.
 */

import type { PublicClient } from 'viem'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'

const log = createLogger('gas-service')

const ROLLING_WINDOW_SIZE = 20
const POLL_INTERVAL_MS = 10_000

export class GasService {
  private readonly client: PublicClient
  private readonly gasPriceHistory: bigint[] = []
  private currentGasPrice: bigint = 0n
  private rollingAverage: bigint = 0n
  private pollTimer: ReturnType<typeof setInterval> | null = null

  constructor(client: PublicClient) {
    this.client = client
  }

  async start(): Promise<void> {
    // Fetch initial gas price
    await this.poll()

    // Start periodic polling
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        log.error({ stage: 'OBSERVE', error: err }, 'Gas price poll failed')
      })
    }, POLL_INTERVAL_MS)

    log.info(
      { stage: 'INIT', gasPrice: this.currentGasPrice.toString() },
      'Gas service started'
    )
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  /** Get the current gas price in wei. */
  getGasPrice(): bigint {
    return this.currentGasPrice
  }

  /** Get the rolling average gas price in wei. */
  getRollingAverage(): bigint {
    return this.rollingAverage
  }

  /**
   * Estimate the total gas cost for a given number of gas units.
   * Returns cost in wei (native BNB).
   */
  estimateGasCost(gasUnits: bigint): bigint {
    return this.currentGasPrice * gasUnits
  }

  /**
   * Check if current gas price is within acceptable bounds
   * relative to the rolling average.
   */
  isGasPriceAcceptable(maxMultiplier: number): boolean {
    if (this.rollingAverage === 0n) return true
    const threshold = this.rollingAverage * BigInt(Math.round(maxMultiplier * 100)) / 100n
    return this.currentGasPrice <= threshold
  }

  private async poll(): Promise<void> {
    const gasPrice = await withRetry(
      () => this.client.getGasPrice(),
      { label: 'getGasPrice', maxRetries: 2, initialDelayMs: 500 }
    )

    this.currentGasPrice = gasPrice
    this.gasPriceHistory.push(gasPrice)

    // Maintain rolling window
    if (this.gasPriceHistory.length > ROLLING_WINDOW_SIZE) {
      this.gasPriceHistory.shift()
    }

    // Calculate rolling average
    const sum = this.gasPriceHistory.reduce((acc, gp) => acc + gp, 0n)
    this.rollingAverage = sum / BigInt(this.gasPriceHistory.length)
  }
}
