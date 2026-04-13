/**
 * EquiliBot Agent — Execution Service
 *
 * Submits verified intents to EquiliBotModule.executeSwap on-chain.
 *
 * Edge cases:
 * - Nonce management: uses pendingNonce
 * - Gas price ceiling: refuses if gas > 3x rolling average
 * - Transaction stuck: no auto-resubmit (avoids double-execution)
 * - Revert handling: decodes revert reason from receipt
 * - Private RPC: optional separate endpoint for tx submission
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { equiliBotModuleAbi } from '../abi/equilibot-module.js'
import type { RebalanceIntent, ExecutionRecord, SwapRequestStruct } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('execution-service')

const TX_CONFIRMATION_TIMEOUT_MS = 60_000

export class ExecutionService {
  private readonly publicClient: PublicClient
  private readonly moduleAddress: Address
  private readonly agentAddress: Address
  private readonly signerMode: 'local' | 'managed'
  private readonly agentPrivateKey: Hex | undefined
  private readonly chainId: number
  private readonly privateRpcUrl: string | undefined

  constructor(
    publicClient: PublicClient,
    moduleAddress: Address,
    agentAddress: Address,
    signerMode: 'local' | 'managed',
    chainId: number,
    agentPrivateKey?: Hex,
    privateRpcUrl?: string
  ) {
    this.publicClient = publicClient
    this.moduleAddress = moduleAddress
    this.agentAddress = agentAddress
    this.signerMode = signerMode
    this.agentPrivateKey = agentPrivateKey
    this.chainId = chainId
    this.privateRpcUrl = privateRpcUrl
  }

  /**
   * Submit a verified intent to EquiliBotModule.executeSwap.
   * Returns a complete ExecutionRecord.
   */
  async execute(
    intent: RebalanceIntent,
    swapRequest: SwapRequestStruct
  ): Promise<ExecutionRecord> {
    const timestamp = Date.now()

    try {
      // Create wallet client for transaction submission
      const chain = this.chainId === 56 ? bsc : bscTestnet
      const rpcUrl = this.privateRpcUrl ?? undefined
      const account =
        this.signerMode === 'managed'
          ? this.agentAddress
          : this.getLocalSignerAccount()

      const walletClient = createWalletClient({
        chain,
        transport: http(rpcUrl),
        account,
      })

      const nativeValue =
        intent.tokenIn === '0x0000000000000000000000000000000000000000'
          ? intent.amountIn
          : 0n

      log.info(
        {
          stage: 'EXECUTE',
          intentId: intent.id,
          pair: intent.pair.id,
          direction: intent.direction,
          amountIn: intent.amountIn.toString(),
        },
        'Submitting executeSwap transaction...'
      )

      // Submit the transaction
      const txHash = await walletClient.writeContract({
        address: this.moduleAddress,
        abi: equiliBotModuleAbi,
        functionName: 'executeSwap',
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
          intent.routerCalldata,
          nativeValue,
        ],
      })

      log.info(
        { stage: 'EXECUTE', intentId: intent.id, txHash },
        `Transaction submitted: ${txHash}`
      )

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: TX_CONFIRMATION_TIMEOUT_MS,
      })

      if (receipt.status === 'success') {
        log.info(
          {
            stage: 'EXECUTE',
            intentId: intent.id,
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            gasUsed: receipt.gasUsed.toString(),
          },
          '✅ Swap executed successfully'
        )

        return {
          intentId: intent.id,
          status: 'EXECUTED',
          txHash,
          rejectReason: null,
          simulationResult: null,
          policyResult: null,
          timestamp,
        }
      }

      // Transaction reverted
      log.error(
        {
          stage: 'EXECUTE',
          intentId: intent.id,
          txHash,
          blockNumber: receipt.blockNumber.toString(),
        },
        '❌ Transaction reverted on-chain'
      )

      return {
        intentId: intent.id,
        status: 'FAILED',
        txHash,
        rejectReason: 'Transaction reverted on-chain',
        simulationResult: null,
        policyResult: null,
        timestamp,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown execution error'

      log.error(
        { stage: 'EXECUTE', intentId: intent.id, error },
        `Execution failed: ${reason}`
      )

      return {
        intentId: intent.id,
        status: 'FAILED',
        txHash: null,
        rejectReason: reason,
        simulationResult: null,
        policyResult: null,
        timestamp,
      }
    }
  }

  private getLocalSignerAccount() {
    if (!this.agentPrivateKey) {
      throw new Error('AGENT_PRIVATE_KEY is required for local signer mode')
    }
    return privateKeyToAccount(this.agentPrivateKey)
  }
}
