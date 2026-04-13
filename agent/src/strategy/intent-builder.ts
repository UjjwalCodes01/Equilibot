/**
 * EquiliBot Agent — Intent Builder
 *
 * Constructs a complete RebalanceIntent from a detected opportunity.
 * Encodes exactInputSingle routerCalldata with recipient = safeAddress.
 *
 * Edge cases:
 * - Hard enforces recipient = safeAddress (no fund redirection)
 * - Canonical calldata encoding matches EquiliBotModule._validateRouterCalldata
 * - Slippage tolerance capped at SwapGuard.maxSlippageBps
 */

import { type Address, encodeFunctionData } from 'viem'
import { v4 as uuidv4 } from 'uuid'
import type { RebalanceOpportunity, RebalanceIntent, SwapRequestStruct } from '../types/index.js'
import { pancakeSmartRouterAbi } from '../abi/pancake-smart-router.js'
import { applySlippage } from '../utils/math.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('intent-builder')

export interface IntentBuilderConfig {
  readonly safeAddress: Address
  readonly routerAddress: Address
  readonly maxSlippageBps: number
  readonly maxDeadlineDelaySeconds: number
}

export class IntentBuilder {
  private readonly config: IntentBuilderConfig

  constructor(config: IntentBuilderConfig) {
    this.config = config
  }

  /**
   * Build a complete RebalanceIntent from an opportunity.
   *
   * @param opportunity - The detected rebalance opportunity
   * @param expectedAmountOut - Quote from on-chain router (real, not estimated)
   * @param estimatedGasCost - Gas cost estimate in native wei
   * @param estimatedProfit - Net profit estimate in native wei
   * @param currentTimestamp - Current block timestamp
   */
  build(
    opportunity: RebalanceOpportunity,
    expectedAmountOut: bigint,
    estimatedGasCost: bigint,
    estimatedProfit: bigint,
    currentTimestamp: bigint
  ): RebalanceIntent {
    const { pair, direction, suggestedAmountIn } = opportunity

    // Determine tokenIn/tokenOut based on direction
    const tokenIn = direction === 'BUY_A' ? pair.tokenB.address : pair.tokenA.address
    const tokenOut = direction === 'BUY_A' ? pair.tokenA.address : pair.tokenB.address

    // Apply slippage to get minAmountOut
    const minAmountOut = applySlippage(expectedAmountOut, this.config.maxSlippageBps)

    // Set deadline
    const deadline = currentTimestamp + BigInt(this.config.maxDeadlineDelaySeconds)

    // Encode exactInputSingle calldata
    // CRITICAL: recipient MUST be safeAddress — enforced by EquiliBotModule
    const routerCalldata = encodeFunctionData({
      abi: pancakeSmartRouterAbi,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          fee: pair.feeTier,
          recipient: this.config.safeAddress,
          deadline,
          amountIn: suggestedAmountIn,
          amountOutMinimum: minAmountOut,
          sqrtPriceLimitX96: 0n, // no price limit — slippage handled by minAmountOut
        },
      ],
    })

    const intentId = uuidv4()

    const intent: RebalanceIntent = {
      id: intentId,
      pair,
      direction,
      swapType: 0, // exact input
      router: this.config.routerAddress,
      tokenIn,
      tokenOut,
      amountIn: suggestedAmountIn,
      expectedAmountIn: 0n, // not used for exact input
      expectedAmountOut,
      minAmountOut,
      deadline,
      estimatedGasCost,
      estimatedProfit,
      routerCalldata,
      snapshot: opportunity.snapshot,
      createdAt: Date.now(),
    }

    log.info(
      {
        stage: 'CALCULATE',
        intentId,
        pair: pair.id,
        direction,
        tokenIn,
        tokenOut,
        amountIn: suggestedAmountIn.toString(),
        expectedAmountOut: expectedAmountOut.toString(),
        minAmountOut: minAmountOut.toString(),
        deadline: deadline.toString(),
      },
      `Intent built: ${direction} on ${pair.id}`
    )

    return intent
  }

  /**
   * Convert a RebalanceIntent to the SwapRequest struct
   * that matches ISwapGuard.SwapRequest exactly.
   */
  toSwapRequest(intent: RebalanceIntent): SwapRequestStruct {
    return {
      swapType: intent.swapType,
      router: intent.router,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn: intent.amountIn,
      expectedAmountIn: intent.expectedAmountIn,
      minAmountOut: intent.minAmountOut,
      expectedAmountOut: intent.expectedAmountOut,
      deadline: intent.deadline,
    }
  }
}
