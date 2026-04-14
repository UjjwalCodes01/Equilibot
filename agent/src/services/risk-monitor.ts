/**
 * EquiliBot Agent — Runtime Risk Monitor
 *
 * Tracks short-window risk signals and emits alert recommendations when
 * thresholds are crossed.
 */

import type { AlertSeverity } from './alert-service.js'

export interface RiskAlert {
  readonly eventType: string
  readonly severity: AlertSeverity
  readonly title: string
  readonly details: Record<string, unknown>
  readonly dedupeKey?: string
  readonly cooldownMs?: number
}

export interface RiskMonitorConfig {
  readonly policyRejectionWindowMs: number
  readonly policyRejectionThreshold: number
  readonly oracleNullWindowMs: number
  readonly oracleNullThreshold: number
  readonly rpcFailureThreshold: number
}

export class RiskMonitor {
  private readonly config: RiskMonitorConfig

  private readonly policyRejectionTimes: number[] = []
  private readonly oracleNullTimes: number[] = []

  private lastPolicyAlertAt = 0
  private lastOracleAlertAt = 0

  private rpcConsecutiveFailures = 0
  private rpcDegraded = false

  constructor(config: RiskMonitorConfig) {
    this.config = config
  }

  recordPolicyRejection(reason: string): RiskAlert | null {
    const now = Date.now()
    this.policyRejectionTimes.push(now)
    this.prune(this.policyRejectionTimes, now, this.config.policyRejectionWindowMs)

    const count = this.policyRejectionTimes.length
    if (count < this.config.policyRejectionThreshold) {
      return null
    }

    if (now - this.lastPolicyAlertAt < this.config.policyRejectionWindowMs) {
      return null
    }

    this.lastPolicyAlertAt = now
    return {
      eventType: 'policy-rejection-spike',
      severity: 'error',
      title: 'Policy rejection spike detected',
      details: {
        count,
        windowMinutes: Math.round(this.config.policyRejectionWindowMs / 60000),
        latestReason: reason,
      },
      dedupeKey: 'policy-rejection-spike',
      cooldownMs: this.config.policyRejectionWindowMs,
    }
  }

  recordOracleUnavailable(pair: string): RiskAlert | null {
    const now = Date.now()
    this.oracleNullTimes.push(now)
    this.prune(this.oracleNullTimes, now, this.config.oracleNullWindowMs)

    const count = this.oracleNullTimes.length
    if (count < this.config.oracleNullThreshold) {
      return null
    }

    if (now - this.lastOracleAlertAt < this.config.oracleNullWindowMs) {
      return null
    }

    this.lastOracleAlertAt = now
    return {
      eventType: 'oracle-unavailable-spike',
      severity: 'error',
      title: 'Oracle availability degradation detected',
      details: {
        pair,
        count,
        windowMinutes: Math.round(this.config.oracleNullWindowMs / 60000),
      },
      dedupeKey: 'oracle-unavailable-spike',
      cooldownMs: this.config.oracleNullWindowMs,
    }
  }

  recordRpcFailure(error: unknown): RiskAlert | null {
    this.rpcConsecutiveFailures++

    if (this.rpcConsecutiveFailures < this.config.rpcFailureThreshold || this.rpcDegraded) {
      return null
    }

    this.rpcDegraded = true

    return {
      eventType: 'rpc-degraded',
      severity: 'fatal',
      title: 'RPC degradation threshold crossed',
      details: {
        consecutiveFailures: this.rpcConsecutiveFailures,
        threshold: this.config.rpcFailureThreshold,
        error: error instanceof Error ? error.message : String(error),
      },
      dedupeKey: 'rpc-degraded',
      cooldownMs: 60000,
    }
  }

  recordRpcSuccess(blockNumber: bigint): RiskAlert | null {
    const wasDegraded = this.rpcDegraded
    this.rpcConsecutiveFailures = 0

    if (!wasDegraded) {
      return null
    }

    this.rpcDegraded = false

    return {
      eventType: 'rpc-recovered',
      severity: 'warn',
      title: 'RPC connectivity recovered',
      details: {
        blockNumber: blockNumber.toString(),
      },
      dedupeKey: 'rpc-recovered',
      cooldownMs: 60000,
    }
  }

  private prune(values: number[], now: number, windowMs: number): void {
    while (values.length > 0 && now - values[0]! > windowMs) {
      values.shift()
    }
  }
}
