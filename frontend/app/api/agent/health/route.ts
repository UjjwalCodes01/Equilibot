import { NextResponse } from "next/server";

const TELEMETRY_BASE_URL = process.env.AGENT_TELEMETRY_BASE_URL ?? "http://127.0.0.1:9100";

async function fetchJson(path: string) {
  const response = await fetch(new URL(path, `${TELEMETRY_BASE_URL.replace(/\/$/, "")}/`), {
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function GET() {
  try {
    const [health, status] = await Promise.all([fetchJson("health"), fetchJson("api/status")]);

    const circuitBreaker =
      status.ok && status.body && typeof status.body === "object" && "circuitBreaker" in status.body
        ? (status.body as { circuitBreaker?: Record<string, unknown> }).circuitBreaker
        : null;

    return NextResponse.json(
      {
        telemetryBaseUrl: TELEMETRY_BASE_URL,
        health,
        status,
        circuitBreaker,
        summary: {
          online: Number(Boolean(health.ok)) + Number(Boolean(status.ok)),
          total: 2,
        },
      },
      {
        status: health.ok && status.ok ? 200 : 207,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "health_check_unavailable",
        message: error instanceof Error ? error.message : "Unable to reach the agent telemetry server.",
        telemetryBaseUrl: TELEMETRY_BASE_URL,
      },
      { status: 502 },
    );
  }
}
