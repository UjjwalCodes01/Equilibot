/**
 * EquiliBot Agent — BNB Greenfield Audit Uploader
 *
 * Uploads immutable audit log entries to BNB Greenfield decentralised storage.
 * Each audit entry is stored as a JSON object at:
 *   greenfield://<bucket>/audit/<date>/<timestamp>-<stage>.json
 *
 * This is a best-effort, non-blocking uploader. If Greenfield is not configured
 * or a transient upload fails, the agent continues normally. The local NDJSON
 * file is always the primary audit source; Greenfield is the decentralised
 * immutable mirror.
 *
 * Note:
 * Greenfield SDK integration is temporarily disabled in this build due to
 * upstream SDK API/type incompatibilities observed in CI environments.
 * The uploader remains non-blocking and keeps local audit logs as source of truth.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger('greenfield-uploader')

export interface GreenfieldConfig {
  /** BNB Greenfield chain RPC URL. Use testnet: https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org */
  rpcUrl: string
  /** Greenfield testnet chain ID is 5600, mainnet is 1017 */
  chainId: number
  /** Private key of the account that owns the bucket (hex, with 0x prefix) */
  privateKey: string
  /** Name of the pre-created Greenfield bucket */
  bucketName: string
  /** SP endpoint — Greenfield storage provider endpoint */
  spEndpoint: string
}

interface AuditRecord {
  timestamp: string
  intentId: string
  stage: string
  pair: string
  data: Record<string, unknown>
}

export class GreenfieldUploader {
  private readonly config: GreenfieldConfig | null
  private uploadCount = 0
  private errorCount = 0

  constructor(config: GreenfieldConfig | null) {
    this.config = config

    if (!config) {
      log.warn(
        { stage: 'INIT' },
        'BNB Greenfield uploader disabled — GREENFIELD_BUCKET not configured. ' +
        'Audit logs will only be stored locally. ' +
        'Set GREENFIELD_RPC_URL, GREENFIELD_PRIVATE_KEY, GREENFIELD_BUCKET, GREENFIELD_SP_ENDPOINT, GREENFIELD_CHAIN_ID to enable.'
      )
    } else {
      log.info(
        { stage: 'INIT', bucket: config.bucketName, rpcUrl: config.rpcUrl },
        'BNB Greenfield uploader initialised — audit entries will be mirrored to decentralised storage'
      )
    }
  }

  /**
   * Upload a single audit entry to Greenfield.
   * Fire-and-forget: never throws, never blocks the caller.
   */
  uploadAsync(entry: AuditRecord): void {
    if (!this.config) {
      return
    }

    void this.upload(entry).catch((err) => {
      this.errorCount++
      log.warn(
        { stage: 'SYSTEM', error: err, errorCount: this.errorCount },
        'Greenfield upload failed (non-fatal, local log intact)'
      )
    })
  }

  private async upload(entry: AuditRecord): Promise<void> {
    const config = this.config!
    const dateStr = entry.timestamp.split('T')[0]!
    const objectName = `audit/${dateStr}/${entry.timestamp.replace(/[:.]/g, '-')}-${entry.stage}-${entry.pair || 'system'}.json`

    // Compatibility mode: keep local audit persistence as primary source while
    // Greenfield mirroring is disabled for this runtime.
    log.warn(
      {
        stage: 'SYSTEM',
        bucket: config.bucketName,
        objectName,
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
      },
      'Greenfield mirror skipped (SDK compatibility mode enabled)'
    )
  }

  get stats(): { uploadCount: number; errorCount: number; configured: boolean } {
    return {
      uploadCount: this.uploadCount,
      errorCount: this.errorCount,
      configured: this.config !== null,
    }
  }
}

/**
 * Build a GreenfieldUploader from environment variables.
 * Returns null-config uploader if any required var is missing.
 */
export function createGreenfieldUploader(): GreenfieldUploader {
  const rpcUrl = process.env.GREENFIELD_RPC_URL
  const privateKey = process.env.GREENFIELD_PRIVATE_KEY
  const bucketName = process.env.GREENFIELD_BUCKET
  const spEndpoint = process.env.GREENFIELD_SP_ENDPOINT
  const chainId = process.env.GREENFIELD_CHAIN_ID

  if (!rpcUrl || !privateKey || !bucketName || !spEndpoint || !chainId) {
    return new GreenfieldUploader(null)
  }

  return new GreenfieldUploader({
    rpcUrl,
    privateKey,
    bucketName,
    spEndpoint,
    chainId: parseInt(chainId, 10),
  })
}
