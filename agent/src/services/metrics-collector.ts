/**
 * EquiliBot Agent — Metrics Collector
 *
 * In-memory counters for agent pipeline telemetry.
 * Incremented at each stage of the pipeline.
 * Exposed via the TelemetryServer for dashboard consumption.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger('metrics')

export interface AgentMetrics {
  readonly uptime: number
  readonly pipelineRuns: number
  readonly opportunitiesDetected: number
  readonly simulationsRun: number
  readonly simulationsPassed: number
  readonly simulationsFailed: number
  readonly policyChecksPassed: number
  readonly policyChecksFailed: number
  readonly executionsAttempted: number
  readonly executionsSucceeded: number
  readonly executionsFailed: number
  readonly skips: Record<string, number>
  readonly lastPipelineRunAt: number | null
  readonly lastExecutionAt: number | null
}

export class MetricsCollector {
  private readonly startedAt: number = Date.now()
  private _pipelineRuns = 0
  private _opportunitiesDetected = 0
  private _simulationsRun = 0
  private _simulationsPassed = 0
  private _simulationsFailed = 0
  private _policyChecksPassed = 0
  private _policyChecksFailed = 0
  private _executionsAttempted = 0
  private _executionsSucceeded = 0
  private _executionsFailed = 0
  private _skips: Record<string, number> = {}
  private _lastPipelineRunAt: number | null = null
  private _lastExecutionAt: number | null = null

  incrementPipelineRuns(): void {
    this._pipelineRuns++
    this._lastPipelineRunAt = Date.now()
  }

  incrementOpportunities(): void {
    this._opportunitiesDetected++
  }

  incrementSimulations(passed: boolean): void {
    this._simulationsRun++
    if (passed) this._simulationsPassed++
    else this._simulationsFailed++
  }

  incrementPolicyChecks(passed: boolean): void {
    if (passed) this._policyChecksPassed++
    else this._policyChecksFailed++
  }

  incrementExecutions(succeeded: boolean): void {
    this._executionsAttempted++
    if (succeeded) {
      this._executionsSucceeded++
      this._lastExecutionAt = Date.now()
    } else {
      this._executionsFailed++
    }
  }

  incrementSkip(reason: string): void {
    const key = reason.slice(0, 60) // Truncate for grouping
    this._skips[key] = (this._skips[key] ?? 0) + 1
  }

  getMetrics(): AgentMetrics {
    return {
      uptime: Date.now() - this.startedAt,
      pipelineRuns: this._pipelineRuns,
      opportunitiesDetected: this._opportunitiesDetected,
      simulationsRun: this._simulationsRun,
      simulationsPassed: this._simulationsPassed,
      simulationsFailed: this._simulationsFailed,
      policyChecksPassed: this._policyChecksPassed,
      policyChecksFailed: this._policyChecksFailed,
      executionsAttempted: this._executionsAttempted,
      executionsSucceeded: this._executionsSucceeded,
      executionsFailed: this._executionsFailed,
      skips: { ...this._skips },
      lastPipelineRunAt: this._lastPipelineRunAt,
      lastExecutionAt: this._lastExecutionAt,
    }
  }

  /** Reset daily counters (call from a daily timer). */
  resetDaily(): void {
    log.info({ stage: 'SYSTEM' }, 'Resetting daily metrics counters')
    this._pipelineRuns = 0
    this._opportunitiesDetected = 0
    this._simulationsRun = 0
    this._simulationsPassed = 0
    this._simulationsFailed = 0
    this._policyChecksPassed = 0
    this._policyChecksFailed = 0
    this._executionsAttempted = 0
    this._executionsSucceeded = 0
    this._executionsFailed = 0
    this._skips = {}
  }
}
