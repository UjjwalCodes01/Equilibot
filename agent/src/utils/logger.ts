/**
 * EquiliBot Agent — Structured JSON Logger
 *
 * Every log entry includes timestamp, level, stage, and intentId.
 * This is the "Intent Proof" from the plan — every decision is auditable.
 */

import pino from 'pino'
import type { AgentStatus } from '../types/index.js'

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export type AgentStage = 'INIT' | 'OBSERVE' | 'CALCULATE' | 'VERIFY' | 'EXECUTE' | 'SYSTEM'

interface LogContext {
  stage: AgentStage
  intentId?: string
  pair?: string
  [key: string]: unknown
}

export function createLogger(component: string) {
  const child = logger.child({ component })

  return {
    info(ctx: LogContext, msg: string) {
      child.info(ctx, msg)
    },
    warn(ctx: LogContext, msg: string) {
      child.warn(ctx, msg)
    },
    error(ctx: LogContext & { error?: unknown }, msg: string) {
      const { error, ...rest } = ctx
      if (error instanceof Error) {
        child.error({ ...rest, err: error }, msg)
      } else {
        child.error({ ...rest, err: error }, msg)
      }
    },
    debug(ctx: LogContext, msg: string) {
      child.debug(ctx, msg)
    },
    fatal(ctx: LogContext & { error?: unknown }, msg: string) {
      const { error, ...rest } = ctx
      child.fatal({ ...rest, err: error }, msg)
    },
    status(status: AgentStatus, msg: string) {
      child.info({ stage: 'SYSTEM' as const, agentStatus: status }, msg)
    },
  }
}

export type Logger = ReturnType<typeof createLogger>
