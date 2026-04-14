import type { Address, PublicClient } from 'viem'
import type { OraclePrice, TokenConfig } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('guard-oracle-service')

const guardAbi = [
  {
    name: 'oracle',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'maxOracleStaleness',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint64' }],
  },
] as const

const priceOracleAbi = [
  {
    name: 'getQuote',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
    ],
  },
] as const

const DERIVED_GUARD_ORACLE_FEED_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as const

export class GuardOracleService {
  private readonly client: PublicClient
  private readonly guardAddress: Address
  private oracleAddress: Address | null = null
  private maxOracleStalenessSeconds: bigint | null = null

  constructor(client: PublicClient, guardAddress: Address) {
    this.client = client
    this.guardAddress = guardAddress
  }

  async deriveQuoteTokenUsdFromBaseToken(
    baseToken: TokenConfig,
    quoteToken: TokenConfig,
    baseTokenUsdPrice: OraclePrice
  ): Promise<OraclePrice | null> {
    try {
      await this.ensureGuardOracleConfigLoaded()

      const oracleAddress = this.oracleAddress
      const maxOracleStalenessSeconds = this.maxOracleStalenessSeconds
      if (!oracleAddress || maxOracleStalenessSeconds === null) {
        return null
      }

      const oneBaseToken = 10n ** BigInt(baseToken.decimals)
      const [quoteAmountOut, updatedAt] = await this.client.readContract({
        address: oracleAddress,
        abi: priceOracleAbi,
        functionName: 'getQuote',
        args: [baseToken.address, quoteToken.address, oneBaseToken],
      })

      if (quoteAmountOut === 0n) {
        log.warn(
          {
            stage: 'OBSERVE',
            baseToken: baseToken.symbol,
            quoteToken: quoteToken.symbol,
          },
          'Guard oracle returned zero quote amount'
        )
        return null
      }

      const now = BigInt(Math.floor(Date.now() / 1000))
      const quoteAge = now > updatedAt ? now - updatedAt : 0n
      if (quoteAge > maxOracleStalenessSeconds) {
        log.warn(
          {
            stage: 'OBSERVE',
            baseToken: baseToken.symbol,
            quoteToken: quoteToken.symbol,
            quoteAge: quoteAge.toString(),
            maxOracleStalenessSeconds: maxOracleStalenessSeconds.toString(),
          },
          'Guard oracle quote is stale for derived USD pricing'
        )
        return null
      }

      const quoteDecimalsScale = 10n ** BigInt(quoteToken.decimals)
      const derivedPrice = (baseTokenUsdPrice.price * quoteDecimalsScale) / quoteAmountOut
      const derivedConfidence =
        (baseTokenUsdPrice.confidence * quoteDecimalsScale) / quoteAmountOut

      if (derivedPrice <= 0n) {
        return null
      }

      return {
        price: derivedPrice,
        confidence: derivedConfidence,
        exponent: baseTokenUsdPrice.exponent,
        publishTime: Number(updatedAt),
        feedId: DERIVED_GUARD_ORACLE_FEED_ID,
      }
    } catch (error) {
      log.warn(
        {
          stage: 'OBSERVE',
          baseToken: baseToken.symbol,
          quoteToken: quoteToken.symbol,
          error,
        },
        'Failed to derive quote token USD price from guard oracle'
      )
      return null
    }
  }

  private async ensureGuardOracleConfigLoaded(): Promise<void> {
    if (this.oracleAddress && this.maxOracleStalenessSeconds !== null) {
      return
    }

    const [oracleAddress, maxOracleStaleness] = await Promise.all([
      this.client.readContract({
        address: this.guardAddress,
        abi: guardAbi,
        functionName: 'oracle',
      }),
      this.client.readContract({
        address: this.guardAddress,
        abi: guardAbi,
        functionName: 'maxOracleStaleness',
      }),
    ])

    this.oracleAddress = oracleAddress
    this.maxOracleStalenessSeconds = maxOracleStaleness
  }
}
