import { NextResponse } from "next/server";

const TELEMETRY_BASE_URL = process.env.AGENT_TELEMETRY_BASE_URL ?? "http://127.0.0.1:9100";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetUrl = new URL(path.join("/"), `${TELEMETRY_BASE_URL.replace(/\/$/, "")}/`);
  targetUrl.search = new URL(request.url).search;

  try {
    const response = await fetch(targetUrl, { cache: "no-store" });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "telemetry_proxy_unavailable",
        message: error instanceof Error ? error.message : "Unable to reach the agent telemetry server.",
        baseUrl: TELEMETRY_BASE_URL,
      },
      { status: 502 },
    );
  }
}