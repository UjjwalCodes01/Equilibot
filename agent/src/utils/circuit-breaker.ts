/**
 * EquiliBot Agent — Circuit Breaker
 *
 * After MAX_CONSECUTIVE_FAILURES consecutive failures, the agent self-pauses.
 * Requires manual restart — no auto-recovery from repeated failures.
 */

import { createLogger } from './logger.js'

const log = createLogger('circuit-breaker')

export class CircuitBreaker {
  private consecutiveFailures = 0
  private readonly maxFailures: number
  private _tripped = false
  private _tripReason: string | null = null
  private _trippedAt: number | null = null

  constructor(maxFailures: number) {
    this.maxFailures = maxFailures
  }

  /** Report a successful operation — resets the failure counter. */
  recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      log.info(
        { stage: 'SYSTEM', previousFailures: this.consecutiveFailures },
        'Circuit breaker: success recorded, failure counter reset'
      )
    }
    this.consecutiveFailures = 0
  }

  /** Report a failed operation. Returns true if the breaker trips. */
  recordFailure(error: unknown, context: string): boolean {
    this.consecutiveFailures++

    log.error(
      {
        stage: 'SYSTEM',
        error,
        context,
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.maxFailures,
      },
      `Circuit breaker: failure ${this.consecutiveFailures}/${this.maxFailures}`
    )

    if (this.consecutiveFailures >= this.maxFailures) {
      this._tripped = true
      this._tripReason = context
      this._trippedAt = Date.now()
      log.fatal(
        {
          stage: 'SYSTEM',
          consecutiveFailures: this.consecutiveFailures,
          threshold: this.maxFailures,
        },
        '🚨 CIRCUIT BREAKER TRIPPED — Agent is self-pausing. Manual restart required.'
      )
      return true
    }

    return false
  }

  /** Whether the circuit breaker has been tripped. */
  get isTripped(): boolean {
    return this._tripped
  }

  /** Reset the circuit breaker (for manual recovery). */
  reset(): void {
    this.consecutiveFailures = 0
    this._tripped = false
    this._tripReason = null
    this._trippedAt = null
    log.info({ stage: 'SYSTEM' }, 'Circuit breaker manually reset')
  }

  /** Get full status for telemetry. */
  getStatus(): {
    tripped: boolean
    consecutiveFailures: number
    tripReason: string | null
    trippedAt: number | null
  } {
    return {
      tripped: this._tripped,
      consecutiveFailures: this.consecutiveFailures,
      tripReason: this._tripReason,
      trippedAt: this._trippedAt,
    }
  }
}
