/**
 * EquiliBot Agent — Telemetry Server
 *
 * Lightweight HTTP API for dashboard consumption using Node built-in http.
 * No Express dependency. Runs on a configurable port (default 9100).
 *
 * Endpoints:
 *   GET /api/status   — agent status, execution mode, circuit breaker, uptime
 *   GET /api/metrics  — rolling counters from MetricsCollector
 *   GET /api/audit    — paginated NDJSON audit entries (?date=YYYY-MM-DD&limit=100&offset=0)
 *   GET /api/policy   — cached on-chain policy params
 *   GET /health       — simple liveness check
 */

import http from 'http'
import { createLogger } from '../utils/logger.js'
import type { MetricsCollector } from './metrics-collector.js'
import type { AuditStore } from './audit-store.js'
import type { CircuitBreaker } from '../utils/circuit-breaker.js'
import type { ExecutionMode } from '../strategy/runtime-policy.js'

const log = createLogger('telemetry')

export interface TelemetryDeps {
  readonly metrics: MetricsCollector
  readonly auditStore: AuditStore
  readonly circuitBreaker: CircuitBreaker
  readonly executionMode: ExecutionMode
  readonly pairsWatched: number
  readonly chainId: number
}

export class TelemetryServer {
  private server: http.Server | null = null
  private readonly port: number
  private readonly bindAddress: string
  private readonly allowedOrigin: string
  private readonly apiToken: string | undefined
  private deps: TelemetryDeps | null = null
  private policyCache: Record<string, unknown> | null = null
  private policyCacheUpdatedAt = 0
  private readonly startedAt = Date.now()

  constructor(port: number, bindAddress: string, allowedOrigin: string, apiToken?: string) {
    this.port = port
    this.bindAddress = bindAddress
    this.allowedOrigin = allowedOrigin
    this.apiToken = apiToken
  }

  setDeps(deps: TelemetryDeps): void {
    this.deps = deps
  }

  setPolicyCache(policy: Record<string, unknown>): void {
    this.policyCache = policy
    this.policyCacheUpdatedAt = Date.now()
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.on('error', (err) => {
        log.error({ stage: 'SYSTEM', error: err }, 'Telemetry server error')
        reject(err)
      })

      this.server.listen(this.port, this.bindAddress, () => {
        log.info(
          { stage: 'INIT', port: this.port, bindAddress: this.bindAddress },
          `Telemetry server listening on ${this.bindAddress}:${this.port}`
        )
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        log.info({ stage: 'SYSTEM' }, 'Telemetry server stopped')
        resolve()
      })
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers for dashboard
    res.setHeader('Access-Control-Allow-Origin', this.allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method !== 'GET') {
      this.json(res, 405, { error: 'Method not allowed' })
      return
    }

    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`)
    const path = url.pathname

    if (this.apiToken && path.startsWith('/api/')) {
      const authHeader = req.headers.authorization
      if (authHeader !== `Bearer ${this.apiToken}`) {
        this.json(res, 401, { error: 'Unauthorized' })
        return
      }
    }

    try {
      switch (path) {
        case '/health':
          this.json(res, 200, { status: 'ok', uptime: Date.now() - this.startedAt })
          break
        case '/api/status':
          this.handleStatus(res)
          break
        case '/api/metrics':
          this.handleMetrics(res)
          break
        case '/api/audit':
          this.handleAudit(res, url)
          break
        case '/api/policy':
          this.handlePolicy(res)
          break
        default:
          this.json(res, 404, { error: 'Not found' })
      }
    } catch (error) {
      log.error({ stage: 'SYSTEM', error, path }, 'Telemetry request error')
      this.json(res, 500, { error: 'Internal server error' })
    }
  }

  private handleStatus(res: http.ServerResponse): void {
    if (!this.deps) {
      this.json(res, 503, { error: 'Agent not yet initialized' })
      return
    }

    const cbStatus = this.deps.circuitBreaker.getStatus()

    this.json(res, 200, {
      executionMode: this.deps.executionMode,
      chainId: this.deps.chainId,
      pairsWatched: this.deps.pairsWatched,
      uptime: Date.now() - this.startedAt,
      circuitBreaker: {
        tripped: cbStatus.tripped,
        consecutiveFailures: cbStatus.consecutiveFailures,
        tripReason: cbStatus.tripReason,
        trippedAt: cbStatus.trippedAt,
      },
    })
  }

  private handleMetrics(res: http.ServerResponse): void {
    if (!this.deps) {
      this.json(res, 503, { error: 'Agent not yet initialized' })
      return
    }
    this.json(res, 200, this.deps.metrics.getMetrics())
  }

  private handleAudit(res: http.ServerResponse, url: URL): void {
    if (!this.deps) {
      this.json(res, 503, { error: 'Agent not yet initialized' })
      return
    }

    const date = url.searchParams.get('date') ?? new Date().toISOString().split('T')[0]
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    // Read entries synchronously from audit store
    const entries = this.deps.auditStore.readAuditEntriesSync(date!, limit, offset)
    this.json(res, 200, { date, limit, offset, count: entries.length, entries })
  }

  private handlePolicy(res: http.ServerResponse): void {
    if (!this.policyCache) {
      this.json(res, 503, { error: 'Policy not yet loaded' })
      return
    }
    this.json(res, 200, {
      ...this.policyCache,
      cachedAt: this.policyCacheUpdatedAt,
    })
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status)
    res.end(JSON.stringify(body))
  }
}
