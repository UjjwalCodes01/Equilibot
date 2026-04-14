import { config as loadDotenv } from 'dotenv'
import process from 'node:process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

loadDotenv()

type AuditEntry = {
  timestamp: string
  stage: string
  data?: {
    reason?: string
    passed?: boolean
    error?: string
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function buildIfNeeded(autoBuild: boolean): Promise<void> {
  if (!autoBuild) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      stdio: 'inherit',
      cwd: new URL('..', import.meta.url).pathname,
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Build failed with exit code ${String(code)}`))
      }
    })
  })
}

async function collectAuditEntries(startMs: number, endMs: number): Promise<AuditEntry[]> {
  const auditDir = new URL('../../data/audit', import.meta.url).pathname
  const files = await readdir(auditDir)
  const entries: AuditEntry[] = []

  for (const file of files) {
    if (!file.startsWith('audit-') || !file.endsWith('.ndjson')) {
      continue
    }

    const content = await readFile(join(auditDir, file), 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AuditEntry
        const ts = Date.parse(parsed.timestamp)
        if (Number.isNaN(ts)) {
          continue
        }
        if (ts >= startMs && ts <= endMs) {
          entries.push(parsed)
        }
      } catch {
        // Ignore malformed lines.
      }
    }
  }

  return entries
}

function summarize(entries: AuditEntry[]) {
  const stageCounts: Record<string, number> = {}
  const skipReasons: Record<string, number> = {}
  const policyRejections: Record<string, number> = {}
  let policyApproved = 0
  let policyRejected = 0

  for (const entry of entries) {
    stageCounts[entry.stage] = (stageCounts[entry.stage] ?? 0) + 1

    if (entry.stage === 'SKIP') {
      const reason = entry.data?.reason ?? 'Unknown'
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
    }

    if (entry.stage === 'POLICY') {
      if (entry.data?.passed) {
        policyApproved++
      } else {
        policyRejected++
        const error = entry.data?.error ?? 'Unknown policy rejection'
        policyRejections[error.slice(0, 120)] = (policyRejections[error.slice(0, 120)] ?? 0) + 1
      }
    }
  }

  return {
    totalEntries: entries.length,
    stageCounts,
    skipReasons,
    policy: {
      approved: policyApproved,
      rejected: policyRejected,
      rejectionReasons: policyRejections,
    },
  }
}

async function main(): Promise<void> {
  const soakHours = Number(process.env.SOAK_HOURS ?? '72')
  const executionMode = process.env.SOAK_MODE ?? 'canary'
  const autoBuild = process.env.SOAK_AUTO_BUILD !== 'false'
  const telemetryToken = process.env.TELEMETRY_API_TOKEN
  const telemetryPort = Number(process.env.TELEMETRY_PORT ?? 9100)
  const telemetryHost = process.env.TELEMETRY_BIND_ADDRESS ?? '127.0.0.1'

  if (!['simulate', 'canary', 'active'].includes(executionMode)) {
    throw new Error('SOAK_MODE must be simulate, canary, or active')
  }

  await buildIfNeeded(autoBuild)

  const soakDir = new URL('../../data/soak', import.meta.url).pathname
  await mkdir(soakDir, { recursive: true })

  const startedAt = new Date()
  const startMs = startedAt.getTime()
  const plannedEndMs = startMs + Math.floor(soakHours * 3600 * 1000)

  const logFile = join(
    soakDir,
    `soak-${startedAt.toISOString().replace(/[:.]/g, '-')}.log`
  )
  const reportFile = join(
    soakDir,
    `soak-report-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`
  )

  const logStream = createWriteStream(logFile, { flags: 'a' })

  const child = spawn('node', ['dist/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      EXECUTION_MODE: executionMode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)

  let exited = false
  let exitCode: number | null = null
  let exitSignal: NodeJS.Signals | null = null

  child.on('exit', (code, signal) => {
    exited = true
    exitCode = code
    exitSignal = signal
  })

  const telemetrySamples: Array<{ timestamp: string; ok: boolean; detail: string }> = []

  while (!exited && Date.now() < plannedEndMs) {
    try {
      const headers: Record<string, string> = {}
      if (telemetryToken) {
        headers.authorization = `Bearer ${telemetryToken}`
      }

      const response = await fetch(`http://${telemetryHost}:${telemetryPort}/api/status`, {
        headers,
        signal: AbortSignal.timeout(4000),
      })

      telemetrySamples.push({
        timestamp: new Date().toISOString(),
        ok: response.ok,
        detail: `HTTP ${response.status}`,
      })
    } catch (error) {
      telemetrySamples.push({
        timestamp: new Date().toISOString(),
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }

    await sleep(60_000)
  }

  if (!exited) {
    child.kill('SIGINT')
    await sleep(3_000)
    if (!exited) {
      child.kill('SIGTERM')
    }
  }

  logStream.end()

  const endedAt = new Date()
  const endMs = endedAt.getTime()
  const entries = await collectAuditEntries(startMs, endMs)

  const report = {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    plannedHours: soakHours,
    actualDurationSeconds: Math.round((endMs - startMs) / 1000),
    executionMode,
    exitCode,
    exitSignal,
    logFile,
    telemetrySamples,
    auditSummary: summarize(entries),
  }

  await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf-8')

  console.log(JSON.stringify({ reportFile, logFile, exitCode, exitSignal }, null, 2))

  if (exitCode !== null && exitCode !== 0 && exitCode !== 130) {
    process.exit(exitCode)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
