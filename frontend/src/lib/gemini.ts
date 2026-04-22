/**
 * Shared Gemini AI client for server-side API routes.
 * Uses gemini-2.0-flash for cost efficiency.
 * NEVER import this from client components — it reads process.env server-side only.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL_NAME = 'gemini-3.0-flash'

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
  const model = client.getGenerativeModel({ model: MODEL_NAME })

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
      topP: 0.8,
    },
  })

  const response = result.response
  return response.text()
}
