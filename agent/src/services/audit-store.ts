/**
 * EquiliBot Agent — Audit Store
 *
 * Durably persists every intent, simulation, policy check, and execution
 * result to disk as newline-delimited JSON (NDJSON) AND mirrors each entry
 * to BNB Greenfield decentralised storage for immutable, on-chain-adjacent
 * auditability.
 *
 * This is the "Intent Proof" from the architecture doc:
 * [Market State] + [Reasoning] + [Sim Result] + [Policy Result] + [Execution Result]
 *
 * Files are rotated daily. File size capped at 50MB with timestamped rotation.
 * Each record is fully self-contained.
 * Operators can answer: why was this action executed/rejected?
 */

import { appendFile, mkdir } from 'fs/promises'
import { readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { keccak256 } from 'viem'
import { createLogger } from '../utils/logger.js'
import { type GreenfieldUploader, createGreenfieldUploader } from './greenfield-uploader.js'
import type {
  RebalanceIntent,
  SimulationResult,
  PolicyCheckResult,
  ExecutionRecord,
  MarketSnapshot,
  RebalanceOpportunity,
} from '../types/index.js'

const log = createLogger('audit-store')

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

interface AuditEntry {
  readonly timestamp: string
  readonly intentId: string
  readonly stage: 'OPPORTUNITY' | 'INTENT' | 'POLICY' | 'SIMULATION' | 'EXECUTION' | 'SKIP'
  readonly pair: string
  readonly data: Record<string, unknown>
}

export class AuditStore {
  private readonly dataDir: string
  private readonly greenfield: GreenfieldUploader
  private initialized = false

  constructor(dataDir: string) {
    this.dataDir = dataDir
    // Initialise Greenfield uploader from env vars — gracefully disabled if not configured
    this.greenfield = createGreenfieldUploader()
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    this.initialized = true
    const gfStats = this.greenfield.stats
    log.info(
      {
        stage: 'INIT',
        dataDir: this.dataDir,
        greenfieldEnabled: gfStats.configured,
      },
      gfStats.configured
        ? 'Audit store initialized — dual-write to local NDJSON + BNB Greenfield enabled'
        : 'Audit store initialized — local NDJSON only (set GREENFIELD_* env vars to enable decentralised mirroring)'
    )
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
        routerCalldataHash: keccak256(intent.routerCalldata),
        routerCalldataSelector: intent.routerCalldata.slice(0, 10),
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

  /**
   * Read audit entries synchronously for the telemetry API.
   * Returns parsed JSON entries for a given date.
   */
  readAuditEntriesSync(
    date: string,
    limit: number = 100,
    offset: number = 0
  ): AuditEntry[] {
    const filePath = join(this.dataDir, `audit-${date}.ndjson`)

    if (!existsSync(filePath)) {
      return []
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      return lines
        .slice(offset, offset + limit)
        .map((line) => {
          try {
            return JSON.parse(line) as AuditEntry
          } catch {
            return null
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null)
    } catch (error) {
      log.error({ stage: 'SYSTEM', error, filePath }, 'Failed to read audit entries')
      return []
    }
  }

  private async write(entry: AuditEntry): Promise<void> {
    if (!this.initialized) {
      log.warn({ stage: 'SYSTEM' }, 'Audit store not initialized, skipping write')
      return
    }

    const dateStr = new Date().toISOString().split('T')[0]!
    let filePath = join(this.dataDir, `audit-${dateStr}.ndjson`)

    // File rotation: if file exceeds max size, rotate to timestamped suffix
    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath)
        if (stats.size >= MAX_FILE_SIZE_BYTES) {
          const rotatedPath = join(
            this.dataDir,
            `audit-${dateStr}-${Date.now()}.ndjson`
          )
          log.info(
            { stage: 'SYSTEM', filePath, rotatedPath, size: stats.size },
            'Audit file exceeded max size, rotating'
          )
          filePath = rotatedPath
        }
      }
    } catch {
      // stat failed — continue with original path
    }

    try {
      await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8')
      // Mirror to BNB Greenfield — fire-and-forget, never blocks local write path
      this.greenfield.uploadAsync(entry)
    } catch (error) {
      log.error(
        { stage: 'SYSTEM', error, filePath },
        'Failed to write audit record'
      )
    }
  }
}
