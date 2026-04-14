import type { Hex } from 'viem'

export type AutonomousTaskId =
  | 'delta-neutral-rebalance'
  | 'convex-lp-migration'
  | 'protocol-buyback-burn'
  | 'yield-harvest-reinvest'

export type AutonomousTaskState =
  | 'IDLE'
  | 'RUNNING'
  | 'SKIPPED'
  | 'REJECTED'
  | 'FAILED'
  | 'EXECUTED'

export interface AutonomousTaskProof {
  readonly taskId: AutonomousTaskId
  readonly state: AutonomousTaskState
  readonly trigger: 'SCHEDULED' | 'MANUAL'
  readonly message: string
  readonly timestamp: number
  readonly pairId: string | null
  readonly intentId: string | null
  readonly txHash: Hex | null
  readonly details: Record<string, unknown>
}

export interface AutonomousTaskStatus {
  readonly taskId: AutonomousTaskId
  readonly state: AutonomousTaskState
  readonly lastRunAt: number | null
  readonly nextRunAt: number | null
  readonly lastMessage: string | null
  readonly txHash: Hex | null
}