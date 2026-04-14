import { config as loadDotenv } from 'dotenv'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPublicClient, http, type Address } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { equiliBotModuleAbi } from '../src/abi/equilibot-module.js'
import { swapGuardAbi } from '../src/abi/swap-guard.js'
import { AlertService } from '../src/services/alert-service.js'

loadDotenv()

type DrillResult = {
  name: string
  ok: boolean
  detail: string
}

async function checkTelemetry(baseUrl: string, token?: string): Promise<DrillResult[]> {
  const headers: Record<string, string> = {}
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  const results: DrillResult[] = []

  try {
    const health = await fetch(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(5000) })
    results.push({
      name: 'telemetry-health-endpoint',
      ok: health.ok,
      detail: `HTTP ${health.status}`,
    })
  } catch (error) {
    results.push({
      name: 'telemetry-health-endpoint',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const status = await fetch(`${baseUrl}/api/status`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    results.push({
      name: 'telemetry-status-endpoint',
      ok: status.ok,
      detail: `HTTP ${status.status}`,
    })
  } catch (error) {
    results.push({
      name: 'telemetry-status-endpoint',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  return results
}

async function main(): Promise<void> {
  const rpcHttpUrl = process.env.RPC_HTTP_URL
  const chainId = Number(process.env.CHAIN_ID ?? 97)
  const moduleAddress = process.env.MODULE_ADDRESS as Address | undefined
  const guardAddress = process.env.GUARD_ADDRESS as Address | undefined
  const managedSignerAddress = process.env.MANAGED_SIGNER_ADDRESS
  const telemetryPort = Number(process.env.TELEMETRY_PORT ?? 9100)
  const telemetryBind = process.env.TELEMETRY_BIND_ADDRESS ?? '127.0.0.1'
  const telemetryToken = process.env.TELEMETRY_API_TOKEN

  if (!rpcHttpUrl || !moduleAddress || !guardAddress) {
    throw new Error('RPC_HTTP_URL, MODULE_ADDRESS, and GUARD_ADDRESS are required for incident drill')
  }

  const chain = chainId === 56 ? bsc : bscTestnet
  const client = createPublicClient({ chain, transport: http(rpcHttpUrl) })

  const results: DrillResult[] = []

  const [configuredAgent, modulePaused, guardPaused, blockNumber] = await Promise.all([
    client.readContract({
      address: moduleAddress,
      abi: equiliBotModuleAbi,
      functionName: 'agent',
    }),
    client.readContract({
      address: moduleAddress,
      abi: equiliBotModuleAbi,
      functionName: 'paused',
    }),
    client.readContract({
      address: guardAddress,
      abi: swapGuardAbi,
      functionName: 'paused',
    }),
    client.getBlockNumber(),
  ])

  results.push({
    name: 'rpc-liveness',
    ok: blockNumber > 0n,
    detail: `latestBlock=${blockNumber.toString()}`,
  })

  if (managedSignerAddress) {
    results.push({
      name: 'module-agent-binding',
      ok: configuredAgent.toLowerCase() === managedSignerAddress.toLowerCase(),
      detail: `moduleAgent=${configuredAgent}`,
    })
  } else {
    results.push({
      name: 'module-agent-binding',
      ok: true,
      detail: `moduleAgent=${configuredAgent}`,
    })
  }

  results.push({
    name: 'module-not-paused',
    ok: !modulePaused,
    detail: `paused=${String(modulePaused)}`,
  })

  results.push({
    name: 'guard-not-paused',
    ok: !guardPaused,
    detail: `paused=${String(guardPaused)}`,
  })

  const telemetryBaseUrl = `http://${telemetryBind}:${telemetryPort}`
  const telemetryResults = await checkTelemetry(telemetryBaseUrl, telemetryToken)
  results.push(...telemetryResults)

  if (process.env.INCIDENT_DRILL_SEND_ALERT === 'true') {
    const alertService = new AlertService(
      process.env.ALERT_WEBHOOK_URL,
      process.env.ALERT_MIN_SEVERITY === 'info'
        ? 'info'
        : process.env.ALERT_MIN_SEVERITY === 'error'
          ? 'error'
          : process.env.ALERT_MIN_SEVERITY === 'fatal'
            ? 'fatal'
            : 'warn',
      Number(process.env.ALERT_DEDUP_COOLDOWN_MS ?? 300000)
    )

    const sent = await alertService.notify({
      eventType: 'incident-drill',
      severity: 'warn',
      title: 'Incident drill synthetic alert',
      details: {
        chainId,
        drillAt: new Date().toISOString(),
      },
      dedupeKey: `incident-drill-${Date.now()}`,
      cooldownMs: 1000,
    })

    results.push({
      name: 'alert-transport',
      ok: sent,
      detail: sent ? 'Alert path executed' : 'Alert path skipped by severity or dedupe',
    })
  }

  const summary = {
    timestamp: new Date().toISOString(),
    chainId,
    results,
    passed: results.every((result) => result.ok),
  }

  const drillDir = new URL('../../data/drills', import.meta.url).pathname
  await mkdir(drillDir, { recursive: true })
  const fileName = `incident-drill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const outputPath = join(drillDir, fileName)
  await writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf-8')

  console.log(JSON.stringify({ outputPath, passed: summary.passed }, null, 2))

  if (!summary.passed) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
