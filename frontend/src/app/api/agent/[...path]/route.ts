/**
 * EquiliBot — Telemetry API Proxy
 *
 * Proxies requests to the agent telemetry server, adding the Bearer
 * token from server-side env so it never reaches the browser.
 */

import { NextRequest, NextResponse } from 'next/server'

const IS_PROD = process.env.NODE_ENV === 'production'
const AGENT_BASE_URL = process.env.AGENT_TELEMETRY_BASE_URL ?? (IS_PROD ? null : 'http://127.0.0.1:9100')
const API_TOKEN = process.env.AGENT_TELEMETRY_API_TOKEN || ''

function configError() {
  return NextResponse.json(
    {
      error: 'Agent telemetry is not configured',
      details: 'Set AGENT_TELEMETRY_BASE_URL (and optionally AGENT_TELEMETRY_API_TOKEN) in the server environment.',
    },
    { status: 500 }
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!AGENT_BASE_URL) return configError()

  const { path } = await params
  const agentPath = `/api/${path.join('/')}`
  const url = new URL(agentPath, AGENT_BASE_URL)

  // Forward query params
  req.nextUrl.searchParams.forEach((val, key) => {
    url.searchParams.set(key, val)
  })

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (API_TOKEN) {
      headers['Authorization'] = `Bearer ${API_TOKEN}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url.toString(), { headers, cache: 'no-store', signal: controller.signal })
    clearTimeout(timeout)
    const body = await res.text()

    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Agent telemetry unavailable', details: 'Could not reach the agent service' },
      { status: 503 }
    )
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!AGENT_BASE_URL) return configError()

  const { path } = await params
  const agentPath = `/api/${path.join('/')}`
  const url = new URL(agentPath, AGENT_BASE_URL)

  try {
    const body = await req.text()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (API_TOKEN) {
      headers['Authorization'] = `Bearer ${API_TOKEN}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const responseBody = await res.text()

    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Agent telemetry unavailable' },
      { status: 503 }
    )
  }
}
