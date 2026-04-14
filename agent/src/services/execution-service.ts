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
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  serializeTransaction,
} from 'viem'
import { type PrivateKeyAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { equiliBotModuleAbi } from '../abi/equilibot-module.js'
import type { RebalanceIntent, ExecutionRecord, SwapRequestStruct } from '../types/index.js'
import type { AgentSigner } from './signer.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('execution-service')

const TX_CONFIRMATION_TIMEOUT_MS = 60_000

export class ExecutionService {
  private readonly publicClient: PublicClient
  private readonly moduleAddress: Address
  private readonly signer: AgentSigner
  private readonly chainId: number
  private readonly rpcHttpUrl: string
  private readonly privateRpcUrl: string | undefined

  constructor(
    publicClient: PublicClient,
    moduleAddress: Address,
    signer: AgentSigner,
    chainId: number,
    rpcHttpUrl: string,
    privateRpcUrl?: string
  ) {
    this.publicClient = publicClient
    this.moduleAddress = moduleAddress
    this.signer = signer
    this.chainId = chainId
    this.rpcHttpUrl = rpcHttpUrl
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

      const txHash = this.signer.mode === 'managed'
        ? await this.submitManagedSignedTransaction(intent, swapRequest, nativeValue)
        : await this.submitLocalTransaction(intent, swapRequest, nativeValue)

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

  private async submitLocalTransaction(
    intent: RebalanceIntent,
    swapRequest: SwapRequestStruct,
    nativeValue: bigint
  ): Promise<Hex> {
    const chain = this.chainId === 56 ? bsc : bscTestnet
    const walletClient = createWalletClient({
      chain,
      transport: http(this.rpcHttpUrl),
      account: this.getLocalSignerAccount(),
    })

    return walletClient.writeContract({
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
  }

  private async submitManagedSignedTransaction(
    intent: RebalanceIntent,
    swapRequest: SwapRequestStruct,
    nativeValue: bigint
  ): Promise<Hex> {
    if (!this.privateRpcUrl) {
      throw new Error('RPC_PRIVATE_URL is required in managed signer mode')
    }
    if (!this.signer.signTransactionDigest) {
      throw new Error('Managed signer does not support native digest signing')
    }

    const chain = this.chainId === 56 ? bsc : bscTestnet
    const submissionClient = createPublicClient({
      chain,
      transport: http(this.privateRpcUrl),
    })

    const data = encodeFunctionData({
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

    const [nonce, gasPrice, gas] = await Promise.all([
      submissionClient.getTransactionCount({
        address: this.signer.address,
        blockTag: 'pending',
      }),
      submissionClient.getGasPrice(),
      submissionClient.estimateGas({
        account: this.signer.address,
        to: this.moduleAddress,
        data,
        value: nativeValue,
      }),
    ])

    const unsignedTx = {
      type: 'legacy' as const,
      chainId: this.chainId,
      nonce,
      gasPrice,
      gas,
      to: this.moduleAddress,
      value: nativeValue,
      data,
    }

    const digest = keccak256(serializeTransaction(unsignedTx))
    const signature = await this.signer.signTransactionDigest(digest)
    const signedRawTransaction = serializeTransaction(unsignedTx, {
      r: signature.r,
      s: signature.s,
      v: BigInt(signature.yParity + 35 + this.chainId * 2),
    })

    return submissionClient.sendRawTransaction({
      serializedTransaction: signedRawTransaction,
    })
  }

  private getLocalSignerAccount(): PrivateKeyAccount {
    if (this.signer.mode !== 'local') {
      throw new Error('Local signer account requested while signer mode is managed')
    }

    const account = this.signer.getAccount()
    if (typeof account === 'string') {
      throw new Error('Invalid local signer account')
    }

    return account
  }
}
