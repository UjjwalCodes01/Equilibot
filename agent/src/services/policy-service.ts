/**
 * EquiliBot Agent — Policy Service
 *
 * Pre-validates intents against SwapGuard before simulation.
 * Reads on-chain policy state and calls checkSwap as static eth_call.
 *
 * Edge cases:
 * - Oracle staleness race: detects early to avoid wasting simulation
 * - Volume tracking: reads actual consumed volume from contract
 * - Custom error decoding: maps Solidity error selectors to human reasons
 */

import { type PublicClient, type Address, decodeErrorResult, type Hex } from 'viem'
import { swapGuardAbi } from '../abi/swap-guard.js'
import type { RebalanceIntent, PolicyCheckResult, SwapRequestStruct } from '../types/index.js'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'

const log = createLogger('policy-service')

// SwapGuard error selectors mapped to human-readable reasons
const ERROR_REASONS: Record<string, string> = {
  'GuardPaused()': 'SwapGuard is paused',
  'RouterNotAllowed()': 'Router is not whitelisted',
  'TokenNotAllowed()': 'Token is not whitelisted',
  'SameToken()': 'Cannot swap token to itself',
  'DustSwap()': 'Trade amount below minimum',
  'InvalidQuote()': 'Invalid quote parameters',
  'InvalidSwapType()': 'Unsupported swap type',
  'ExactOutputMismatch()': 'Exact output fields mismatch',
  'SlippageTooHigh()': 'Slippage exceeds maximum allowed',
  'OracleNotConfigured()': 'Oracle not configured on SwapGuard',
  'OracleStale()': 'On-chain oracle price is stale',
  'OracleQuoteInvalid()': 'Oracle returned invalid quote',
  'OracleDeviationTooHigh()': 'Price deviates too much from oracle',
  'ExactOutputInputInvalid()': 'Exact output input validation failed',
  'ExactOutputInputBufferTooHigh()': 'Exact output input buffer exceeded',
  'ExpiredDeadline()': 'Deadline has already passed',
  'DeadlineTooFar()': 'Deadline too far in the future',
  'CooldownActive()': 'Cooldown period not elapsed',
  'DailyLimitExceeded()': 'Daily volume limit exceeded',
  'DailyLimitNotConfigured()': 'Daily limit not configured for token',
  'TradeAmountExceeded()': 'Trade amount exceeds per-trade maximum',
  'InvalidTokenDecimals()': 'Token decimals out of supported range',
}

const ERROR_SELECTOR_REASONS: Record<Hex, string> = {
  // SwapGuard OracleDeviationTooHigh()
  '0x16c0be26': 'Price deviates too much from oracle',
}

export class PolicyService {
  private readonly client: PublicClient
  private readonly guardAddress: Address
  private readonly agentAddress: Address

  constructor(client: PublicClient, guardAddress: Address, agentAddress: Address) {
    this.client = client
    this.guardAddress = guardAddress
    this.agentAddress = agentAddress
  }

  /**
   * Pre-validate an intent against SwapGuard policy.
   * Uses checkSwap as a static call — no gas, no state change.
   */
  async validateIntent(
    intent: RebalanceIntent,
    swapRequest: SwapRequestStruct
  ): Promise<PolicyCheckResult> {
    try {
      await withRetry(
        () =>
          this.client.readContract({
            address: this.guardAddress,
            abi: swapGuardAbi,
            functionName: 'checkSwap',
            args: [
              {
                swapType: swapRequest.swapType,
                router: swapRequest.router,
                tokenIn: swapRequest.tokenIn,
                tokenOut: swapRequest.tokenOut,
                amountIn: swapRequest.amountIn,
                expectedAmountIn: swapRequest.expectedAmountIn,
                minAmountOut: swapRequest.minAmountOut,
                expectedAmountOut: swapRequest.expectedAmountOut,
                deadline: swapRequest.deadline,
              },
              this.agentAddress,
            ],
          }),
        { label: `checkSwap(${intent.id})`, maxRetries: 1 }
      )

      log.info(
        { stage: 'VERIFY', intentId: intent.id, pair: intent.pair.id },
        'Policy check passed'
      )

      return { passed: true, error: null, errorSelector: null }
    } catch (error: unknown) {
      return this.decodeError(error, intent.id)
    }
  }

  /**
   * Read key policy parameters from SwapGuard.
   */
  async readPolicyParams(): Promise<{
    paused: boolean
    maxSlippageBps: number
    maxDeadlineDelay: bigint
    cooldownSeconds: bigint
  }> {
    const [paused, maxSlippageBps, maxDeadlineDelay, cooldownSeconds] =
      await Promise.all([
        this.client.readContract({
          address: this.guardAddress,
          abi: swapGuardAbi,
          functionName: 'paused',
        }),
        this.client.readContract({
          address: this.guardAddress,
          abi: swapGuardAbi,
          functionName: 'maxSlippageBps',
        }),
        this.client.readContract({
          address: this.guardAddress,
          abi: swapGuardAbi,
          functionName: 'maxDeadlineDelay',
        }),
        this.client.readContract({
          address: this.guardAddress,
          abi: swapGuardAbi,
          functionName: 'cooldownSeconds',
        }),
      ])

    return {
      paused,
      maxSlippageBps,
      maxDeadlineDelay,
      cooldownSeconds,
    }
  }

  /**
   * Check if a specific token is allowed in SwapGuard.
   */
  async isTokenAllowed(token: Address): Promise<boolean> {
    return this.client.readContract({
      address: this.guardAddress,
      abi: swapGuardAbi,
      functionName: 'allowedTokens',
      args: [token],
    })
  }

  /**
   * Check if a specific router is allowed in SwapGuard.
   */
  async isRouterAllowed(router: Address): Promise<boolean> {
    return this.client.readContract({
      address: this.guardAddress,
      abi: swapGuardAbi,
      functionName: 'allowedRouters',
      args: [router],
    })
  }

  private decodeError(error: unknown, intentId: string): PolicyCheckResult {
    let errorMessage = 'Unknown policy rejection'
    const errorSelector = this.extractSelector(error)

    if (errorSelector && ERROR_SELECTOR_REASONS[errorSelector]) {
      errorMessage = ERROR_SELECTOR_REASONS[errorSelector]
    }

    // Try to decode custom Solidity errors
    if (error instanceof Error && 'data' in error) {
      const errData = (error as { data?: Hex }).data
      if (errData) {
        try {
          const decoded = decodeErrorResult({
            abi: swapGuardAbi,
            data: errData,
          })
          const sig = `${decoded.errorName}()`
          errorMessage = ERROR_REASONS[sig] ?? sig
        } catch {
          if (errorSelector && ERROR_SELECTOR_REASONS[errorSelector]) {
            errorMessage = ERROR_SELECTOR_REASONS[errorSelector]
          }
        }
      }
    } else if (error instanceof Error && !errorSelector) {
      errorMessage = error.message
    }

    log.warn(
      {
        stage: 'VERIFY',
        intentId,
        errorSelector,
        errorMessage,
      },
      `Policy check failed: ${errorMessage}`
    )

    return {
      passed: false,
      error: errorMessage,
      errorSelector,
    }
  }

  private extractSelector(error: unknown): Hex | null {
    if (error instanceof Error && 'data' in error) {
      const errData = (error as { data?: Hex }).data
      if (errData && errData.startsWith('0x') && errData.length >= 10) {
        return errData.slice(0, 10) as Hex
      }
    }

    if (error instanceof Error) {
      const match = error.message.match(/0x[a-fA-F0-9]{8}/)
      if (match) {
        return match[0] as Hex
      }
    }

    return null
  }
}
