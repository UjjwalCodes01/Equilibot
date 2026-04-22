import { NextRequest, NextResponse } from 'next/server'
import { callGemini } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { stage, pair, data } = body as {
      stage: string
      pair: string | null
      data: Record<string, unknown>
    }

    const prompt = `You are the internal reasoning narrator for EquiliBot, an autonomous DeFi treasury management agent running on BNB Smart Chain.

The agent just completed a pipeline step. Your job is to narrate this in 2-3 sentences of clear, professional English that a DAO governance member can understand. Do NOT use markdown formatting. Do NOT explain what DeFi is. Just explain what the agent observed and why it made this specific decision.

Pipeline step: ${stage}
Trading pair: ${pair || 'N/A'}
Raw decision data:
${JSON.stringify(data, null, 2)}

Write your narration now:`

    const narration = await callGemini(prompt)

    return NextResponse.json({ narration: narration.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { narration: null, error: message },
      { status: 500 }
    )
  }
}
