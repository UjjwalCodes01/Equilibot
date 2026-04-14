/**
 * EquiliBot Agent — Signer Abstraction
 *
 * Provides a unified interface for transaction signing.
 * Supports two modes:
 * - local: uses a private key directly (testnet only)
 * - managed: native AWS KMS secp256k1 signing (production)
 *
 * The agent code never touches raw private keys — it only
 * interacts with this interface.
 */

import {
  type Address,
  type Hex,
  createPublicClient,
  getAddress,
  hexToBytes,
  http,
  keccak256,
  recoverAddress,
  toHex,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import {
  DescribeKeyCommand,
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from '@aws-sdk/client-kms'
import { createLogger } from '../utils/logger.js'

const log = createLogger('signer')
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_HALF_N = SECP256K1_N / 2n

export interface ManagedDigestSignature {
  readonly r: Hex
  readonly s: Hex
  readonly yParity: 0 | 1
}

export interface AgentSigner {
  /** The address this signer controls */
  readonly address: Address
  /** The signer mode */
  readonly mode: 'local' | 'managed'
  /**
   * Get the viem-compatible account object.
   * For local: returns a PrivateKeyAccount
   * For managed: returns the address (for auto-impersonate)
   */
  getAccount(): PrivateKeyAccount | Address
  /**
   * Sign an EIP-155 transaction digest.
   * Only implemented by managed signers.
   */
  signTransactionDigest?(digest: Hex): Promise<ManagedDigestSignature>
  /** Health check — returns true if signer is accessible */
  healthCheck(): Promise<boolean>
}

/**
 * Local signer — wraps a raw private key.
 * Only allowed on testnet (enforced by config validation).
 */
export class LocalSigner implements AgentSigner {
  readonly address: Address
  readonly mode = 'local' as const
  private readonly account: PrivateKeyAccount

  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey)
    this.address = this.account.address
    log.info(
      { stage: 'INIT', address: this.address, mode: 'local' },
      'Local signer initialized'
    )
  }

  getAccount(): PrivateKeyAccount {
    return this.account
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}

/**
 * Managed signer — native AWS KMS secp256k1 signing.
 */
export class ManagedSigner implements AgentSigner {
  readonly address: Address
  readonly mode = 'managed' as const
  private readonly rpcPrivateUrl: string
  private readonly provider: 'aws-kms'
  private readonly awsKmsKeyId: string | undefined
  private readonly kmsClient: KMSClient | null
  private resolvedKmsAddress: Address | null = null

  constructor(
    address: Address,
    rpcPrivateUrl: string,
    provider: 'aws-kms',
    awsRegion?: string,
    awsKmsKeyId?: string
  ) {
    this.address = address
    this.rpcPrivateUrl = rpcPrivateUrl
    this.provider = provider
    this.awsKmsKeyId = awsKmsKeyId
    this.kmsClient = awsRegion ? new KMSClient({ region: awsRegion }) : null

    log.info(
      { stage: 'INIT', address, mode: 'managed', provider },
      'Managed signer initialized (native KMS signing enabled)'
    )
  }

  getAccount(): Address {
    return this.address
  }

  async signTransactionDigest(digest: Hex): Promise<ManagedDigestSignature> {
    const { kmsClient, keyId } = this.getAwsKmsContext()

    const signatureResponse = await kmsClient.send(
      new SignCommand({
        KeyId: keyId,
        Message: hexToBytes(digest),
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    )

    if (!signatureResponse.Signature) {
      throw new Error('AWS KMS returned empty signature')
    }

    const derSignature = Uint8Array.from(signatureResponse.Signature)
    const { r, s } = parseDerEcdsaSignature(derSignature)
    const { canonicalR, canonicalS } = canonicalizeSignature(r, s)
    const signatureR = toHex(canonicalR, { size: 32 }) as Hex
    const signatureS = toHex(canonicalS, { size: 32 }) as Hex

    for (const yParity of [0, 1] as const) {
      const recovered = await recoverAddress({
        hash: digest,
        signature: {
          r: signatureR,
          s: signatureS,
          yParity,
        },
      })

      if (recovered.toLowerCase() === this.address.toLowerCase()) {
        return {
          r: signatureR,
          s: signatureS,
          yParity,
        }
      }
    }

    throw new Error('Unable to derive valid recovery parity for managed signer signature')
  }

  async healthCheck(): Promise<boolean> {
    try {
      const rpcClient = createPublicClient({ transport: http(this.rpcPrivateUrl) })
      await rpcClient.getTransactionCount({ address: this.address, blockTag: 'pending' })

      if (this.provider === 'aws-kms') {
        const { kmsClient, keyId } = this.getAwsKmsContext()

        const keyDescription = await kmsClient.send(
          new DescribeKeyCommand({ KeyId: keyId })
        )

        const keyMetadata = keyDescription.KeyMetadata
        const keyEnabled = keyMetadata?.Enabled === true
        const keySpecOk = keyMetadata?.KeySpec === 'ECC_SECG_P256K1'

        if (!keyEnabled || !keySpecOk) {
          log.error(
            {
              stage: 'SYSTEM',
              mode: 'managed',
              provider: this.provider,
              keyId,
              enabled: keyMetadata?.Enabled,
              keySpec: keyMetadata?.KeySpec,
            },
            'Managed signer health check failed: AWS KMS key is not enabled secp256k1'
          )
          return false
        }

        const kmsAddress = await this.getKmsAddress()
        if (kmsAddress.toLowerCase() !== this.address.toLowerCase()) {
          log.error(
            {
              stage: 'SYSTEM',
              mode: 'managed',
              provider: this.provider,
              configuredAddress: this.address,
              kmsAddress,
            },
            'Managed signer health check failed: KMS key address does not match MANAGED_SIGNER_ADDRESS'
          )
          return false
        }

        // End-to-end signer validation: KMS must sign and recover to configured address.
        const healthDigest = keccak256(
          toHex(Buffer.from(`equilibot-kms-healthcheck:${Date.now()}`))
        )
        await this.signTransactionDigest(healthDigest)
      }

      return true
    } catch (error) {
      log.error(
        { stage: 'SYSTEM', mode: 'managed', provider: this.provider, error },
        'Managed signer health check failed'
      )
      return false
    }
  }

  private getAwsKmsContext(): { kmsClient: KMSClient; keyId: string } {
    if (!this.kmsClient || !this.awsKmsKeyId) {
      throw new Error('AWS KMS configuration is incomplete')
    }

    return {
      kmsClient: this.kmsClient,
      keyId: this.awsKmsKeyId,
    }
  }

  private async getKmsAddress(): Promise<Address> {
    if (this.resolvedKmsAddress) {
      return this.resolvedKmsAddress
    }

    const { kmsClient, keyId } = this.getAwsKmsContext()
    const publicKeyResponse = await kmsClient.send(
      new GetPublicKeyCommand({ KeyId: keyId })
    )

    if (!publicKeyResponse.PublicKey) {
      throw new Error('AWS KMS returned empty public key')
    }

    const publicKeyDer = Uint8Array.from(publicKeyResponse.PublicKey)
    const uncompressedKey = extractUncompressedPublicKey(publicKeyDer)
    const publicKeyWithoutPrefix = uncompressedKey.slice(1)
    const keyHash = keccak256(toHex(publicKeyWithoutPrefix))
    const derivedAddress = getAddress(`0x${keyHash.slice(-40)}`) as Address

    this.resolvedKmsAddress = derivedAddress
    return derivedAddress
  }
}

function extractUncompressedPublicKey(spkiDer: Uint8Array): Uint8Array {
  for (let i = 0; i <= spkiDer.length - 68; i++) {
    if (
      spkiDer[i] === 0x03
      && spkiDer[i + 1] === 0x42
      && spkiDer[i + 2] === 0x00
      && spkiDer[i + 3] === 0x04
    ) {
      return spkiDer.slice(i + 3, i + 68)
    }
  }

  throw new Error('Unable to extract secp256k1 public key from KMS SPKI blob')
}

function parseDerEcdsaSignature(der: Uint8Array): { r: bigint; s: bigint } {
  let offset = 0

  if (der[offset] !== 0x30) {
    throw new Error('Invalid DER signature: expected sequence tag')
  }
  offset += 1

  const sequenceLengthInfo = readDerLength(der, offset)
  offset = sequenceLengthInfo.nextOffset
  const sequenceEnd = offset + sequenceLengthInfo.length

  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: missing r integer tag')
  }
  offset += 1
  const rLengthInfo = readDerLength(der, offset)
  offset = rLengthInfo.nextOffset
  const rBytes = der.slice(offset, offset + rLengthInfo.length)
  offset += rLengthInfo.length

  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: missing s integer tag')
  }
  offset += 1
  const sLengthInfo = readDerLength(der, offset)
  offset = sLengthInfo.nextOffset
  const sBytes = der.slice(offset, offset + sLengthInfo.length)
  offset += sLengthInfo.length

  if (offset !== sequenceEnd) {
    throw new Error('Invalid DER signature: trailing bytes present')
  }

  return {
    r: bytesToBigInt(rBytes),
    s: bytesToBigInt(sBytes),
  }
}

function readDerLength(
  der: Uint8Array,
  offset: number
): { length: number; nextOffset: number } {
  const first = der[offset]
  if (first === undefined) {
    throw new Error('Invalid DER signature: missing length byte')
  }

  if ((first & 0x80) === 0) {
    return {
      length: first,
      nextOffset: offset + 1,
    }
  }

  const byteCount = first & 0x7f
  if (byteCount === 0 || byteCount > 4) {
    throw new Error('Invalid DER signature: unsupported length encoding')
  }

  let length = 0
  for (let i = 0; i < byteCount; i++) {
    const byte = der[offset + 1 + i]
    if (byte === undefined) {
      throw new Error('Invalid DER signature: truncated length')
    }
    length = (length << 8) | byte
  }

  return {
    length,
    nextOffset: offset + 1 + byteCount,
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte)
  }
  return value
}

function canonicalizeSignature(
  r: bigint,
  s: bigint
): { canonicalR: bigint; canonicalS: bigint } {
  if (r <= 0n || r >= SECP256K1_N) {
    throw new Error('Invalid ECDSA signature r value')
  }

  if (s <= 0n || s >= SECP256K1_N) {
    throw new Error('Invalid ECDSA signature s value')
  }

  return {
    canonicalR: r,
    canonicalS: s > SECP256K1_HALF_N ? SECP256K1_N - s : s,
  }
}

/**
 * Factory: create the right signer based on config.
 */
export function createSigner(
  mode: 'local' | 'managed',
  privateKey?: Hex,
  managedAddress?: Address,
  managedSignerProvider?: 'aws-kms',
  rpcPrivateUrl?: string,
  awsRegion?: string,
  awsKmsKeyId?: string
): AgentSigner {
  if (mode === 'local') {
    if (!privateKey) {
      throw new Error('AGENT_PRIVATE_KEY is required for local signer mode')
    }
    return new LocalSigner(privateKey)
  }

  if (!managedAddress) {
    throw new Error('MANAGED_SIGNER_ADDRESS is required for managed signer mode')
  }
  if (!managedSignerProvider) {
    throw new Error('MANAGED_SIGNER_PROVIDER is required for managed signer mode')
  }
  if (!rpcPrivateUrl) {
    throw new Error('RPC_PRIVATE_URL is required for managed signer mode')
  }

  return new ManagedSigner(
    managedAddress,
    rpcPrivateUrl,
    managedSignerProvider,
    awsRegion,
    awsKmsKeyId
  )
}
