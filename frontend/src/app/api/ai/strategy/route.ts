import { NextRequest, NextResponse } from 'next/server'
import { callGemini } from '@/lib/gemini'

const PALETTE_CONTEXT = `Available block types and labels:
TRIGGERS (type: "trigger"):
- "Price Deviation > X bps" (config: { threshold: string })
- "Balance Drift > X%" (config: { threshold: string })
- "Time Interval" (config: { intervalMs: string })

CONDITIONS (type: "condition"):
- "Oracle Price Fresh" (config: {})
- "Circuit Breaker OK" (config: {})
- "Gas Below Threshold" (config: { maxGwei: string })

ACTIONS (type: "action"):
- "Swap X% to Token" (config: { percent: string, token: string })
- "Add Liquidity" (config: { percent: string })
- "Harvest Rewards" (config: {})

GUARDS (type: "guard"):
- "Max Slippage Guard" (config: { maxBps: string })
- "Min Output Guard" (config: { minAmount: string })
- "Daily Limit Check" (config: { maxUsd: string })`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt } = body as { prompt: string }

    if (!prompt || prompt.trim().length < 5) {
      return NextResponse.json(
        { blocks: null, error: 'Prompt is too short' },
        { status: 400 }
      )
    }

    const aiPrompt = `You are a DeFi strategy architect for EquiliBot. Convert the user's natural language strategy description into an array of strategy blocks.

${PALETTE_CONTEXT}

RULES:
1. Each block must have: id (unique string like "ai-1", "ai-2"), type, label (must be EXACTLY one of the labels above), and config (object with relevant key-value pairs as strings).
2. A good strategy has at least one trigger, one condition or guard, and one action.
3. Order matters: triggers first, then conditions, then actions, then guards.
4. Return ONLY a valid JSON array of blocks. No markdown, no explanation, no code fences.

User's strategy: "${prompt}"

JSON array:`

    const result = await callGemini(aiPrompt)

    // Strip any markdown code fences the model might add
    const cleaned = result
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const blocks = JSON.parse(cleaned)

    if (!Array.isArray(blocks)) {
      return NextResponse.json(
        { blocks: null, error: 'AI did not return an array' },
        { status: 422 }
      )
    }

    // Validate each block has the required fields
    const validated = blocks
      .filter(
        (b: Record<string, unknown>) =>
          typeof b.type === 'string' &&
          typeof b.label === 'string' &&
          typeof b.config === 'object'
      )
      .map((b: Record<string, unknown>, i: number) => ({
        id: typeof b.id === 'string' ? b.id : `ai-${Date.now()}-${i}`,
        type: b.type as string,
        label: b.label as string,
        config: b.config as Record<string, string>,
      }))

    if (validated.length === 0) {
      return NextResponse.json(
        { blocks: null, error: 'AI returned no valid blocks' },
        { status: 422 }
      )
    }

    return NextResponse.json({ blocks: validated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { blocks: null, error: message },
      { status: 500 }
    )
  }
}
