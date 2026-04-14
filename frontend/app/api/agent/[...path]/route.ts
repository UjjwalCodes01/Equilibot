import { NextResponse } from "next/server";

const TELEMETRY_BASE_URL = process.env.AGENT_TELEMETRY_BASE_URL ?? "http://127.0.0.1:9100";
const TELEMETRY_API_TOKEN = process.env.AGENT_TELEMETRY_API_TOKEN;

type AgentProxyContext = { params: Promise<{ path: string[] }> };

async function proxyToAgent(request: Request, context: AgentProxyContext, method: "GET" | "POST") {
  const { path } = await context.params;
  const targetUrl = new URL(path.join("/"), `${TELEMETRY_BASE_URL.replace(/\/$/, "")}/`);
  targetUrl.search = new URL(request.url).search;

  try {
    const headers: Record<string, string> = {
      "content-type": request.headers.get("content-type") ?? "application/json; charset=utf-8",
    };
    if (TELEMETRY_API_TOKEN) {
      headers.authorization = `Bearer ${TELEMETRY_API_TOKEN}`;
    }

    const response = await fetch(targetUrl, {
      method,
      cache: "no-store",
      headers,
      body: method === "POST" ? await request.text() : undefined,
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": response.headers.get("cache-control") ?? "no-store",
        "x-accel-buffering": "no",
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

export async function GET(request: Request, context: AgentProxyContext) {
  return proxyToAgent(request, context, "GET");
}

export async function POST(request: Request, context: AgentProxyContext) {
  return proxyToAgent(request, context, "POST");
}