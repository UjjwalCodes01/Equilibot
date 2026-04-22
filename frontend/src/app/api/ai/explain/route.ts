import { NextRequest, NextResponse } from 'next/server'
import { callGemini } from '@/lib/gemini'
import { requireApiToken } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'

export async function POST(req: NextRequest) {
  const authError = requireApiToken(req)
  if (authError) return authError
  const rateLimitError = checkRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const body = await req.json()
    const { entry } = body as {
      entry: {
        stage: string
        pair: string | null
        intentId: string | null
        timestamp: string
        data: Record<string, unknown>
      }
    }

    const prompt = `You are a DeFi portfolio analyst reviewing an autonomous agent's audit trail entry. Write a 3-4 sentence analysis that explains:
1. What the agent detected or attempted
2. Why it made the decision it did (executed, skipped, or rejected)
3. Whether this was a good decision and any risks

Do NOT use markdown. Write clear, professional prose.

Audit Entry:
Stage: ${entry.stage}
Pair: ${entry.pair || 'N/A'}
Intent ID: ${entry.intentId || 'N/A'}
Timestamp: ${entry.timestamp}
Full Data:
${JSON.stringify(entry.data, null, 2)}

Write your analysis now:`

    const explanation = await callGemini(prompt)

    return NextResponse.json({ explanation: explanation.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { explanation: null, error: message },
      { status: 500 }
    )
  }
}
