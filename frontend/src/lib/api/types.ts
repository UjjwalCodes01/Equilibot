/**
 * EquiliBot — Telemetry API Type Definitions
 *
 * Mirrors the agent's telemetry server response shapes.
 * These types are consumed by the React Query hooks.
 */

export interface AgentStatusResponse {
  executionMode: 'observe' | 'simulate' | 'canary' | 'active'
  chainId: number
  pairsWatched: number
  uptime: number
  circuitBreaker: {
    tripped: boolean
    consecutiveFailures: number
    tripReason: string | null
    trippedAt: number | null
  }
}

export interface AgentMetricsResponse {
  uptime: number
  pipelineRuns: number
  opportunitiesDetected: number
  simulationsRun: number
  simulationsPassed: number
  simulationsFailed: number
  policyChecksPassed: number
  policyChecksFailed: number
  executionsAttempted: number
  executionsSucceeded: number
  executionsFailed: number
  skips: Record<string, number>
  lastPipelineRunAt: number | null
  lastExecutionAt: number | null
}

export type AuditStage = 'OPPORTUNITY' | 'INTENT' | 'POLICY' | 'SIMULATION' | 'EXECUTION' | 'SKIP'

export interface AuditEntry {
  timestamp: string
  intentId: string
  stage: AuditStage
  pair: string
  data: Record<string, unknown>
}

export interface AuditResponse {
  date: string
  limit: number
  offset: number
  count: number
  entries: AuditEntry[]
}

export interface PolicyResponse {
  paused?: boolean
  maxSlippageBps?: number
  cooldownSeconds?: number
  maxDeadlineDelay?: number
  defaultMaxDailyVolume?: string
  allowedRouters?: string[]
  allowedTokens?: string[]
  cachedAt: number
  [key: string]: unknown
}

export type AutonomousTaskId =
  | 'delta-neutral-rebalance'
  | 'convex-lp-migration'
  | 'protocol-buyback-burn'
  | 'yield-harvest-reinvest'

export type AutonomousTaskState = 'IDLE' | 'RUNNING' | 'SKIPPED' | 'REJECTED' | 'FAILED' | 'EXECUTED'

export interface TaskStatus {
  taskId: AutonomousTaskId
  state: AutonomousTaskState
  lastRunAt: number | null
  nextRunAt: number | null
  lastMessage: string | null
  txHash: string | null
}

export interface TaskStatusResponse {
  enabled: boolean
  tasks: TaskStatus[]
}

export interface TaskProof {
  taskId: AutonomousTaskId
  state: AutonomousTaskState
  trigger: 'SCHEDULED' | 'MANUAL'
  message: string
  timestamp: number
  pairId: string | null
  intentId: string | null
  txHash: string | null
  details: Record<string, unknown>
}

export interface TaskProofResponse {
  enabled: boolean
  proof: TaskProof | null
}

export interface TaskRunResponse {
  status: string
  taskId: AutonomousTaskId
  state: AutonomousTaskState
  message: string
  proof: TaskProof
}
