/**
 * EquiliBot Agent — Alert Service
 *
 * Dispatches production alerts to a webhook endpoint with severity filtering
 * and dedupe cooldown to prevent alert storms.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger('alert-service')

export type AlertSeverity = 'info' | 'warn' | 'error' | 'fatal'

export interface AlertMessage {
  readonly eventType: string
  readonly severity: AlertSeverity
  readonly title: string
  readonly details?: Record<string, unknown>
  readonly dedupeKey?: string
  readonly cooldownMs?: number
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 10,
  warn: 20,
  error: 30,
  fatal: 40,
}

export class AlertService {
  private readonly webhookUrl: string | undefined
  private readonly minSeverity: AlertSeverity
  private readonly defaultCooldownMs: number
  private readonly lastSentAt = new Map<string, number>()

  constructor(
    webhookUrl: string | undefined,
    minSeverity: AlertSeverity,
    dedupeCooldownMs: number
  ) {
    this.webhookUrl = webhookUrl
    this.minSeverity = minSeverity
    this.defaultCooldownMs = dedupeCooldownMs
  }

  async notify(message: AlertMessage): Promise<boolean> {
    if (SEVERITY_RANK[message.severity] < SEVERITY_RANK[this.minSeverity]) {
      return false
    }

    const now = Date.now()
    const dedupeKey = message.dedupeKey ?? message.eventType
    const cooldownMs = message.cooldownMs ?? this.defaultCooldownMs
    const lastSent = this.lastSentAt.get(dedupeKey)

    if (lastSent && now - lastSent < cooldownMs) {
      return false
    }

    this.lastSentAt.set(dedupeKey, now)

    if (!this.webhookUrl) {
      log.warn(
        {
          stage: 'SYSTEM',
          eventType: message.eventType,
          severity: message.severity,
          title: message.title,
        },
        'Alert generated but ALERT_WEBHOOK_URL is not configured'
      )
      return true
    }

    const payload = {
      source: 'equilibot-agent',
      timestamp: new Date(now).toISOString(),
      eventType: message.eventType,
      severity: message.severity,
      title: message.title,
      details: message.details ?? {},
      text: `[${message.severity.toUpperCase()}] ${message.title}`,
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      })

      if (!response.ok) {
        throw new Error(`Alert webhook HTTP ${response.status}`)
      }

      log.info(
        {
          stage: 'SYSTEM',
          eventType: message.eventType,
          severity: message.severity,
          title: message.title,
        },
        'Alert dispatched'
      )
      return true
    } catch (error) {
      log.error(
        {
          stage: 'SYSTEM',
          error,
          eventType: message.eventType,
          severity: message.severity,
          title: message.title,
        },
        'Failed to dispatch alert'
      )
      return false
    }
  }
}
