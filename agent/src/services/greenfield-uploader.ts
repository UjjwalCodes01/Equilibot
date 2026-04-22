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
 * Dependencies: @bnb-chain/greenfield-js-sdk
 * Install: npm install @bnb-chain/greenfield-js-sdk
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

    // Dynamic import so the SDK is only loaded if Greenfield is configured.
    // This keeps agent startup fast for operators who haven't set up Greenfield yet.
    const { Client } = await import('@bnb-chain/greenfield-js-sdk')

    const client = Client.create(config.rpcUrl, String(config.chainId))

    const dateStr = entry.timestamp.split('T')[0]!
    const objectName = `audit/${dateStr}/${entry.timestamp.replace(/[:.]/g, '-')}-${entry.stage}-${entry.pair || 'system'}.json`
    const content = JSON.stringify(entry, null, 2)
    const bytes = new TextEncoder().encode(content)

    // Get the primary storage provider info from the bucket
    const { storageProviders } = await client.sp.getStorageProviders()
    const targetSp = storageProviders.find(
      (sp) => sp.endpoint === config.spEndpoint
    ) ?? storageProviders[0]

    if (!targetSp) {
      throw new Error('No storage providers available on Greenfield')
    }

    // Create the object (putObject requires an auth mechanism)
    // We use offchain-auth with a private key for testnet simplicity
    const account = await client.account.getAccount(
      // Derive address from private key
      this.deriveAddress(config.privateKey)
    )

    const { objectInfo, res: createRes } = await client.object.createObject({
      bucketName: config.bucketName,
      objectName,
      creator: account.account!.address,
      visibility: 'VISIBILITY_TYPE_PUBLIC_READ',
      contentType: 'application/json',
      redundancyType: 'REDUNDANCY_EC_TYPE',
      payloadSize: BigInt(bytes.length),
      expectChecksums: [],
      primarySpAddress: targetSp.operatorAddress,
    })

    if (!objectInfo) {
      throw new Error(`Failed to create Greenfield object: ${createRes?.statusText ?? 'unknown error'}`)
    }

    // Put the actual object bytes
    const { res: putRes } = await client.object.putObject(
      {
        bucketName: config.bucketName,
        objectName,
        body: new Blob([bytes], { type: 'application/json' }),
        txnHash: createRes?.headers?.get('x-gnfd-txn-hash') ?? '',
      },
      { type: 'ECDSA', privateKey: config.privateKey }
    )

    if (!putRes?.ok) {
      throw new Error(`Greenfield putObject failed: ${putRes?.statusText ?? 'unknown'}`)
    }

    this.uploadCount++
    log.debug(
      {
        stage: 'SYSTEM',
        objectName,
        bucket: config.bucketName,
        uploadCount: this.uploadCount,
        bytes: bytes.length,
      },
      'Audit entry mirrored to BNB Greenfield'
    )
  }

  /**
   * Minimal secp256k1 address derivation — avoids importing ethers just for this.
   * Uses viem's publicKeyToAddress since viem is already a dependency.
   */
  private deriveAddress(privateKey: string): string {
    // This is a lazy import — viem is always in scope for the agent
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { privateKeyToAccount } = require('viem/accounts')
      const account = privateKeyToAccount(privateKey as `0x${string}`)
      return account.address
    } catch {
      throw new Error('Failed to derive address from GREENFIELD_PRIVATE_KEY — ensure it is a valid 32-byte hex key with 0x prefix')
    }
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
