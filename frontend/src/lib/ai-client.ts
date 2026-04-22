/**
 * Frontend helper for calling protected internal AI routes.
 *
 * In production, /api/ai/* requires Authorization: Bearer <token>.
 * The token is provided via NEXT_PUBLIC_INTERNAL_API_TOKEN.
 */

const AI_TOKEN = process.env.NEXT_PUBLIC_INTERNAL_API_TOKEN || ''

export function getAiRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (AI_TOKEN) {
    headers.Authorization = `Bearer ${AI_TOKEN}`
  }
  return headers
}
