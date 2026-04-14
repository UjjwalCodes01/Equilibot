import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type LogEntry = {
  timestamp: string;
  level: string;
  component?: string;
  stage?: string;
  message: string;
};

function resolveWorkspacePath(...segments: string[]): string {
  return path.resolve(process.cwd(), "..", ...segments);
}

function parseLogLine(line: string): LogEntry | null {
  try {
    const record = JSON.parse(line) as Record<string, unknown>;
    const timestamp = typeof record.time === "string" ? record.time : typeof record.timestamp === "string" ? record.timestamp : null;
    const message = typeof record.msg === "string" ? record.msg : typeof record.message === "string" ? record.message : null;

    if (!timestamp || !message) {
      return null;
    }

    return {
      timestamp,
      level: typeof record.level === "string" ? record.level : "info",
      component: typeof record.component === "string" ? record.component : undefined,
      stage: typeof record.stage === "string" ? record.stage : undefined,
      message,
    };
  } catch {
    return null;
  }
}

async function readLatestSoakLog(): Promise<LogEntry[]> {
  const soakDirectory = resolveWorkspacePath("data", "soak");
  let files: Array<{ name: string; mtimeMs: number }> = [];

  try {
    files = await Promise.all(
      (await fs.readdir(soakDirectory)).filter((file) => file.endsWith(".log")).map(async (name) => {
        const stat = await fs.stat(path.join(soakDirectory, name));
        return { name, mtimeMs: stat.mtimeMs };
      }),
    );
  } catch {
    return [];
  }

  const latestFile = files.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.name;
  if (!latestFile) {
    return [];
  }

  const content = await fs.readFile(path.join(soakDirectory, latestFile), "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseLogLine)
    .filter((entry): entry is LogEntry => Boolean(entry))
    .slice(-120);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") ?? 120)));

  try {
    const entries = await readLatestSoakLog();
    return NextResponse.json({ entries: entries.slice(-limit) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        entries: [],
        error: "log_stream_unavailable",
        message: error instanceof Error ? error.message : "Unable to read the live ElizaOS soak log.",
      },
      { status: 502 },
    );
  }
}