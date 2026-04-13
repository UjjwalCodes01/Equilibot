/**
 * EquiliBot Agent — Exponential Backoff Retry
 *
 * Used ONLY for read operations (RPC calls, oracle fetches).
 * NEVER for write operations — execution is never retried automatically.
 */

import { createLogger } from './logger.js'

const log = createLogger('retry')

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number
  /** Initial delay in ms (default: 1000) */
  readonly initialDelayMs?: number
  /** Maximum delay in ms (default: 30000) */
  readonly maxDelayMs?: number
  /** Label for logging */
  readonly label?: string
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30_000,
    label = 'operation',
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries) {
        log.error(
          { stage: 'SYSTEM', error, label, attempt, maxRetries },
          `${label} failed after ${maxRetries + 1} attempts`
        )
        break
      }

      const delay = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs)
      // Add jitter: ±25% randomness to avoid thundering herd
      const jitter = delay * (0.75 + Math.random() * 0.5)

      log.warn(
        { stage: 'SYSTEM', label, attempt, nextRetryMs: Math.round(jitter) },
        `${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`
      )

      await sleep(jitter)
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
