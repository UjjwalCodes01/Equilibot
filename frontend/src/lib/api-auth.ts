/**
 * EquiliBot Frontend — API Route Authentication
 *
 * All internal AI API routes (/api/ai/*) require a Bearer token to prevent
 * unauthorised use and protect Gemini API quota.
 *
 * Set INTERNAL_API_TOKEN in your .env.local (min 32 chars, cryptographically random).
 * Generate one: openssl rand -hex 32
 */

import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.INTERNAL_API_TOKEN

/**
 * Call at the top of every protected API route handler.
 * Returns null if auth passes, or a NextResponse(401) to return immediately.
 *
 * Usage:
 *   const authError = requireApiToken(req)
 *   if (authError) return authError
 */
export function requireApiToken(req: NextRequest): NextResponse | null {
  // If no token is configured at all, block all requests in production.
  // In development (NODE_ENV !== 'production') we allow unauthenticated requests
  // so local testing doesn't require setting up a token.
  if (!TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server misconfiguration: INTERNAL_API_TOKEN is not set.' },
        { status: 503 }
      )
    }
    // Dev mode: pass through with a warning (logged server-side only)
    return null
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Expected: Bearer <token>' },
      { status: 401 }
    )
  }

  const provided = authHeader.slice(7)

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(provided, TOKEN)) {
    return NextResponse.json(
      { error: 'Invalid API token.' },
      { status: 401 }
    )
  }

  return null
}

/** Constant-time string comparison to prevent timing-based token inference. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
