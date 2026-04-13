/**
 * EquiliBot Agent — Quote Service
 *
 * Uses PancakeSwap V3 QuoterV2 for pure pricing — NOT the swap function.
 * QuoterV2.quoteExactInputSingle is a read-only pricing primitive that
 * does NOT depend on Safe balances or token approvals.
 *
 * This decouples quoting from execution state entirely.
 */

import { type PublicClient, type Address } from 'viem'
import { pancakeQuoterV2Abi } from '../abi/pancake-quoter-v2.js'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'

const log = createLogger('quote-service')

export class QuoteService {
  private readonly client: PublicClient
  private readonly quoterAddress: Address

  constructor(client: PublicClient, quoterAddress: Address) {
    this.client = client
    this.quoterAddress = quoterAddress
  }

  /**
   * Get a quote for exactInputSingle from the QuoterV2.
   * Uses eth_call (static call) — no gas cost, no state change.
   * Does NOT require the Safe to hold tokens or have approvals.
   *
   * Returns { amountOut, gasEstimate } or null if the quote fails.
   */
  async getExactInputSingleQuote(
    tokenIn: Address,
    tokenOut: Address,
    feeTier: number,
    amountIn: bigint
  ): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
    try {
      // QuoterV2.quoteExactInputSingle is marked nonpayable but is used
      // via eth_call (static simulation). We use simulateContract for this.
      const result = await withRetry(
        () =>
          this.client.simulateContract({
            address: this.quoterAddress,
            abi: pancakeQuoterV2Abi,
            functionName: 'quoteExactInputSingle',
            args: [
              {
                tokenIn,
                tokenOut,
                amountIn,
                fee: feeTier,
                sqrtPriceLimitX96: 0n,
              },
            ],
          }),
        { label: `quote(${tokenIn}->${tokenOut})`, maxRetries: 2, initialDelayMs: 500 }
      )

      const [amountOut, , , gasEstimate] = result.result

      log.debug(
        {
          stage: 'CALCULATE',
          tokenIn,
          tokenOut,
          amountIn: amountIn.toString(),
          amountOut: amountOut.toString(),
          gasEstimate: gasEstimate.toString(),
        },
        'Quote fetched successfully'
      )

      return { amountOut, gasEstimate }
    } catch (error) {
      log.error(
        {
          stage: 'CALCULATE',
          error,
          tokenIn,
          tokenOut,
          amountIn: amountIn.toString(),
        },
        'Quote failed — pool may lack liquidity or fee tier mismatch'
      )
      return null
    }
  }
}
