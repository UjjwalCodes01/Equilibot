import { NextResponse } from "next/server";

const TELEMETRY_BASE_URL = process.env.AGENT_TELEMETRY_BASE_URL ?? "http://127.0.0.1:9100";
const TELEMETRY_API_TOKEN = process.env.AGENT_TELEMETRY_API_TOKEN;

export async function GET() {
  const target = new URL("api/tasks/status", `${TELEMETRY_BASE_URL.replace(/\/$/, "")}/`);

  try {
    const headers: Record<string, string> = {};
    if (TELEMETRY_API_TOKEN) {
      headers.authorization = `Bearer ${TELEMETRY_API_TOKEN}`;
    }

    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      headers,
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        enabled: false,
        tasks: [],
        error: "task_status_proxy_unavailable",
        message: error instanceof Error ? error.message : "Unable to reach telemetry service.",
      },
      { status: 502 },
    );
  }
}
