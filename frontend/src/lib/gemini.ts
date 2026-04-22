/**
 * Shared Gemini AI client for server-side API routes.
 * Uses gemini-2.5-flash — the current stable GA model (verified 2026-04-22).
 * NEVER import this from client components — it reads process.env server-side only.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const FALLBACK_MODEL = 'gemini-2.5-flash'
const MODEL_NAME = process.env.GEMINI_MODEL?.trim() || FALLBACK_MODEL

let _genAI: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (_genAI) return _genAI

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables')
  }

  _genAI = new GoogleGenerativeAI(apiKey)
  return _genAI
}

export async function callGemini(prompt: string): Promise<string> {
  const client = getClient()

  try {
    return await generateWithModel(client, MODEL_NAME, prompt)
  } catch (error) {
    // If a custom model is configured but unavailable, fall back to a known-good model.
    if (MODEL_NAME !== FALLBACK_MODEL && isModelNotFoundError(error)) {
      return generateWithModel(client, FALLBACK_MODEL, prompt)
    }
    throw error
  }
}

async function generateWithModel(
  client: GoogleGenerativeAI,
  modelName: string,
  prompt: string
): Promise<string> {
  const model = client.getGenerativeModel({ model: modelName })

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
      topP: 0.8,
    },
  })

  return result.response.text()
}

function isModelNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /404|not found|models\//i.test(error.message)
}
