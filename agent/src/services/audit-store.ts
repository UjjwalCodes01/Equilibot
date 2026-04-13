/**
 * EquiliBot Agent — Audit Store
 *
 * Durably persists every intent, simulation, policy check, and execution
 * result to disk as newline-delimited JSON (NDJSON).
 *
 * This is the "Intent Proof" from the architecture doc:
 * [Market State] + [Reasoning] + [Sim Result] + [Policy Result] + [Execution Result]
 *
 * Files are rotated daily. Each record is fully self-contained.
 * Operators can answer: why was this action executed/rejected?
 */

import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '../utils/logger.js'
import type {
  RebalanceIntent,
  SimulationResult,
  PolicyCheckResult,
  ExecutionRecord,
  MarketSnapshot,
  RebalanceOpportunity,
} from '../types/index.js'

const log = createLogger('audit-store')

interface AuditEntry {
  readonly timestamp: string
  readonly intentId: string
  readonly stage: 'OPPORTUNITY' | 'INTENT' | 'POLICY' | 'SIMULATION' | 'EXECUTION' | 'SKIP'
  readonly pair: string
  readonly data: Record<string, unknown>
}

export class AuditStore {
  private readonly dataDir: string
  private initialized = false

  constructor(dataDir: string) {
    this.dataDir = dataDir
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    this.initialized = true
    log.info({ stage: 'INIT', dataDir: this.dataDir }, 'Audit store initialized')
  }

  /** Record a skipped opportunity with reason */
  async recordSkip(pair: string, reason: string, snapshot?: MarketSnapshot): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId: '',
      stage: 'SKIP',
      pair,
      data: {
        reason,
        gasPrice: snapshot?.gasPrice.toString(),
        blockNumber: snapshot?.blockNumber.toString(),
      },
    })
  }

  /** Record a detected opportunity */
  async recordOpportunity(opportunity: RebalanceOpportunity): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId: '',
      stage: 'OPPORTUNITY',
      pair: opportunity.pair.id,
      data: {
        direction: opportunity.direction,
        deviationBps: opportunity.deviationBps,
        dexPrice: opportunity.dexPrice.toString(),
        oraclePrice: opportunity.oraclePrice.toString(),
        suggestedAmountIn: opportunity.suggestedAmountIn.toString(),
      },
    })
  }

  /** Record a built intent */
  async recordIntent(intent: RebalanceIntent): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId: intent.id,
      stage: 'INTENT',
      pair: intent.pair.id,
      data: {
        direction: intent.direction,
        tokenIn: intent.tokenIn,
        tokenOut: intent.tokenOut,
        amountIn: intent.amountIn.toString(),
        expectedAmountOut: intent.expectedAmountOut.toString(),
        minAmountOut: intent.minAmountOut.toString(),
        deadline: intent.deadline.toString(),
        estimatedGasCost: intent.estimatedGasCost.toString(),
        estimatedProfit: intent.estimatedProfit.toString(),
        routerCalldataHash: intent.routerCalldata.slice(0, 10), // selector only
      },
    })
  }

  /** Record a policy check result */
  async recordPolicyResult(intentId: string, pair: string, result: PolicyCheckResult): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId,
      stage: 'POLICY',
      pair,
      data: {
        passed: result.passed,
        error: result.error,
        errorSelector: result.errorSelector,
      },
    })
  }

  /** Record a simulation result */
  async recordSimulation(intentId: string, pair: string, result: SimulationResult): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId,
      stage: 'SIMULATION',
      pair,
      data: {
        success: result.success,
        balanceInDelta: result.balanceInDelta.toString(),
        balanceOutDelta: result.balanceOutDelta.toString(),
        gasUsed: result.gasUsed.toString(),
        revertReason: result.revertReason,
        blockNumber: result.blockNumber.toString(),
      },
    })
  }

  /** Record an execution result */
  async recordExecution(record: ExecutionRecord, pair: string): Promise<void> {
    await this.write({
      timestamp: new Date().toISOString(),
      intentId: record.intentId,
      stage: 'EXECUTION',
      pair,
      data: {
        status: record.status,
        txHash: record.txHash,
        rejectReason: record.rejectReason,
      },
    })
  }

  private async write(entry: AuditEntry): Promise<void> {
    if (!this.initialized) {
      log.warn({ stage: 'SYSTEM' }, 'Audit store not initialized, skipping write')
      return
    }

    const dateStr = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const filePath = join(this.dataDir, `audit-${dateStr}.ndjson`)

    try {
      await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8')
    } catch (error) {
      // Audit write failure should never crash the agent
      log.error(
        { stage: 'SYSTEM', error, filePath },
        'Failed to write audit record'
      )
    }
  }
}
