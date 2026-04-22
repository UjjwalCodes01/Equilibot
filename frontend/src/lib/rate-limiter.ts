/**
 * EquiliBot Frontend — In-Memory Rate Limiter
 *
 * Token bucket rate limiter keyed by IP address.
 * Applied to AI endpoints to prevent quota abuse.
 *
 * Limits: 10 requests per 60-second window per IP.
 * Returns a NextResponse(429) when the limit is exceeded.
 */

import { NextRequest, NextResponse } from 'next/server'

interface Bucket {
  tokens: number
  lastRefillAt: number
}

const WINDOW_MS = 60_000     // 60 seconds
const MAX_TOKENS = 10        // 10 requests per window
const buckets = new Map<string, Bucket>()

/** Extract the real IP from request headers. */
function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Check the rate limit for this request's IP.
 * Returns null if allowed, or a NextResponse(429) to return immediately.
 *
 * Usage:
 *   const limited = checkRateLimit(req)
 *   if (limited) return limited
 */
export function checkRateLimit(req: NextRequest): NextResponse | null {
  const ip = getIp(req)
  const now = Date.now()

  let bucket = buckets.get(ip)

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefillAt: now }
    buckets.set(ip, bucket)
  }

  // Refill tokens proportionally to time elapsed
  const elapsed = now - bucket.lastRefillAt
  const refill = Math.floor((elapsed / WINDOW_MS) * MAX_TOKENS)

  if (refill > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refill)
    bucket.lastRefillAt = now
  }

  if (bucket.tokens <= 0) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - elapsed) / 1000)
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Max 10 AI requests per 60 seconds per IP.',
        retryAfter: retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(MAX_TOKENS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((now + WINDOW_MS - elapsed) / 1000)),
        },
      }
    )
  }

  bucket.tokens--
  return null
}
