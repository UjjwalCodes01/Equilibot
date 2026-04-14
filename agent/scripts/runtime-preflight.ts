import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { config as loadDotenv } from 'dotenv'

loadDotenv()

type CheckResult = {
  ok: boolean
  detail: string
}

function hasCommand(command: string): boolean {
  if (command === 'pm2') {
    // Allow project-local PM2 installations so preflight works in isolated CI/dev hosts.
    const localPm2 = resolve(process.cwd(), 'node_modules', '.bin', 'pm2')
    if (existsSync(localPm2)) return true
  }

  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  })
  return result.status === 0
}

function run(command: string, args: string[]): CheckResult {
  const result = spawnSync(command, args, { encoding: 'utf-8' })
  if (result.status === 0) {
    return { ok: true, detail: (result.stdout || result.stderr || '').trim() }
  }

  return {
    ok: false,
    detail: (result.stderr || result.stdout || '').trim() || `${command} failed`,
  }
}

async function checkRpcHealth(rpcHttpUrl: string): Promise<CheckResult> {
  try {
    const res = await fetch(rpcHttpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    })

    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` }
    }

    const data = (await res.json()) as { result?: string }
    if (!data.result) {
      return { ok: false, detail: 'No eth_chainId result returned' }
    }

    return { ok: true, detail: `eth_chainId=${data.result}` }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown RPC error',
    }
  }
}

async function checkRpcBurst(rpcHttpUrl: string): Promise<CheckResult> {
  const calls = Array.from({ length: 20 }, (_, i) =>
    fetch(rpcHttpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    })
      .then((r) => r.ok)
      .catch(() => false)
  )

  const results = await Promise.all(calls)
  const success = results.filter(Boolean).length
  const failed = results.length - success

  if (failed > 0) {
    return {
      ok: false,
      detail: `${failed}/${results.length} burst calls failed (possible provider rate-limit pressure)`,
    }
  }

  return { ok: true, detail: `${success}/${results.length} burst calls succeeded` }
}

async function checkHermesFeeds(
  hermesUrl: string,
  chainId: number
): Promise<CheckResult> {
  const feedIdsByChain: Record<number, string[]> = {
    97: ['0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f'],
    56: [
      '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
      '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
    ],
  }

  const feedIds = feedIdsByChain[chainId]
  if (!feedIds || feedIds.length === 0) {
    return { ok: false, detail: `No feed IDs configured for chain ${chainId}` }
  }

  const query = feedIds
    .map((id) => `ids[]=${encodeURIComponent(id)}`)
    .join('&')

  try {
    const response = await fetch(`${hermesUrl}/v2/updates/price/latest?${query}`)
    if (!response.ok) {
      return { ok: false, detail: `Hermes HTTP ${response.status}` }
    }

    const payload = (await response.json()) as {
      parsed?: Array<{ id?: string; price?: { publish_time?: number } }>
    }
    const updates = payload.parsed ?? []

    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: false, detail: 'Hermes returned no feed updates' }
    }

    const now = Math.floor(Date.now() / 1000)
    const ages = updates
      .map((u) => (typeof u.price?.publish_time === 'number' ? now - u.price.publish_time : null))
      .filter((v): v is number => v !== null)

    const oldestAge = ages.length > 0 ? Math.max(...ages) : null
    const ageText = oldestAge === null ? 'unknown age' : `oldestAge=${oldestAge}s`

    if (oldestAge !== null && oldestAge > 86400) {
      return {
        ok: false,
        detail: `Hermes feeds returned but stale for >24h (${ageText})`,
      }
    }

    return { ok: true, detail: `Feeds OK (${updates.length} updates, ${ageText})` }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown Hermes error',
    }
  }
}

function printHeader(title: string): void {
  console.log(`\n== ${title} ==`)
}

function printCheck(name: string, result: CheckResult): void {
  const tag = result.ok ? 'OK' : 'FAIL'
  console.log(`[${tag}] ${name}: ${result.detail}`)
}

async function main(): Promise<void> {
  const chainId = Number(process.env.CHAIN_ID ?? 97)
  const rpcHttpUrl = process.env.RPC_HTTP_URL
  const hermesUrl = process.env.PYTH_HERMES_URL ?? 'https://hermes.pyth.network'

  printHeader('Runtime Tooling')
  const hasDocker = hasCommand('docker')
  const hasPm2 = hasCommand('pm2')

  const hasDockerComposePlugin = hasDocker && run('docker', ['compose', 'version']).ok
  const hasDockerComposeBinary = hasCommand('docker-compose')

  const dockerReady = hasDockerComposePlugin || hasDockerComposeBinary

  printCheck('Docker', {
    ok: dockerReady,
    detail: hasDockerComposePlugin
      ? 'docker compose plugin available'
      : hasDockerComposeBinary
        ? 'docker-compose binary available'
        : 'docker compose not available',
  })

  printCheck('PM2', {
    ok: hasPm2,
    detail: hasPm2 ? run('pm2', ['--version']).detail.split('\n')[0] || 'installed' : 'pm2 not found',
  })

  printHeader('Simulation Dependency')
  const anvilResult = run('anvil', ['--version'])
  printCheck('Anvil in PATH', anvilResult)

  printHeader('Network Health')
  if (!rpcHttpUrl) {
    printCheck('RPC_HTTP_URL', { ok: false, detail: 'missing in environment' })
    process.exit(1)
  }

  const rpcHealth = await checkRpcHealth(rpcHttpUrl)
  const rpcBurst = await checkRpcBurst(rpcHttpUrl)
  const hermesHealth = await checkHermesFeeds(hermesUrl, chainId)

  printCheck('RPC basic connectivity', rpcHealth)
  printCheck('RPC burst tolerance', rpcBurst)
  printCheck('Pyth Hermes feeds', hermesHealth)

  printHeader('Recommended Startup Command For This Host')
  if (dockerReady) {
    const composeCommand = hasDockerComposePlugin
      ? 'docker compose up -d --build'
      : 'docker-compose up -d --build'
    console.log(composeCommand)
  } else if (hasPm2) {
    console.log('npm run build && pm2 start ecosystem.config.cjs')
  } else {
    console.log('npm run start')
    console.log('Install one persistent runner first: Docker Compose or PM2')
  }

  const hasHardFailures = [anvilResult, rpcHealth, hermesHealth].some((r) => !r.ok)
  const persistentRunnerMissing = !dockerReady && !hasPm2
  if (hasHardFailures) {
    process.exit(1)
  }

  if (persistentRunnerMissing) {
    console.error('\nNo persistent runtime manager found (Docker Compose or PM2 required for daemonized runs).')
    process.exit(1)
  }

  if (!rpcBurst.ok) {
    console.warn('\nWarning: RPC burst test showed failures. Use a private endpoint for longer soak/canary runs.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
