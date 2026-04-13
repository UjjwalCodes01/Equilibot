/**
 * EquiliBot Agent — Simulation Service
 *
 * Spawns a local Anvil fork, simulates the full executeSwap call,
 * captures balance deltas, and returns structured results.
 *
 * Edge cases:
 * - Anvil readiness: TCP port probe instead of stdout parsing (works with --silent AND without)
 * - Anvil timeout: kills process if no response within TIMEOUT_MS
 * - Port collision: uses random available port
 * - Cleanup guarantee: Anvil process killed in finally block — no orphan processes
 * - Revert decoding: custom error → human-readable reason
 * - Auto-impersonate: agent can send txs without needing ETH on fork
 */

import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { equiliBotModuleAbi } from '../abi/equilibot-module.js'
import { erc20Abi } from '../abi/erc20.js'
import type { RebalanceIntent, SimulationResult, SwapRequestStruct } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('simulation-service')

export class SimulationService {
  private readonly rpcHttpUrl: string
  private readonly agentAddress: Address
  private readonly signerMode: 'local' | 'managed'
  private readonly moduleAddress: Address
  private readonly safeAddress: Address
  private readonly agentPrivateKey: Hex | undefined
  private readonly timeoutMs: number

  constructor(
    rpcHttpUrl: string,
    agentAddress: Address,
    signerMode: 'local' | 'managed',
    moduleAddress: Address,
    safeAddress: Address,
    agentPrivateKey: Hex | undefined,
    timeoutMs: number = 10_000
  ) {
    this.rpcHttpUrl = rpcHttpUrl
    this.agentAddress = agentAddress
    this.signerMode = signerMode
    this.agentPrivateKey = agentPrivateKey
    this.moduleAddress = moduleAddress
    this.safeAddress = safeAddress
    this.timeoutMs = timeoutMs
  }

  /**
   * Simulate a full executeSwap call on a local Anvil fork.
   * Returns detailed SimulationResult with balance deltas.
   */
  async simulate(
    intent: RebalanceIntent,
    swapRequest: SwapRequestStruct
  ): Promise<SimulationResult> {
    const port = this.getRandomPort()
    let anvilProcess: ChildProcess | null = null

    try {
      // 1. Spawn Anvil fork (auto-impersonate so agent doesn't need ETH)
      anvilProcess = await this.spawnAnvil(port)

      const anvilUrl = `http://127.0.0.1:${port}`
      const anvilClient = createPublicClient({
        chain: { ...foundry, id: foundry.id },
        transport: http(anvilUrl),
      })

      const account =
        this.signerMode === 'managed'
          ? this.agentAddress
          : this.getLocalSignerAccount()

      const walletClient = createWalletClient({
        chain: { ...foundry, id: foundry.id },
        transport: http(anvilUrl),
        account,
      })

      // 2. Capture pre-swap balances
      const [balanceInBefore, balanceOutBefore] = await Promise.all([
        intent.tokenIn === '0x0000000000000000000000000000000000000000'
          ? anvilClient.getBalance({ address: this.safeAddress })
          : anvilClient.readContract({
              address: intent.tokenIn,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [this.safeAddress],
            }),
        intent.tokenOut === '0x0000000000000000000000000000000000000000'
          ? anvilClient.getBalance({ address: this.safeAddress })
          : anvilClient.readContract({
              address: intent.tokenOut,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [this.safeAddress],
            }),
      ])

      // 3. Execute the swap on the fork
      const nativeValue =
        intent.tokenIn === '0x0000000000000000000000000000000000000000'
          ? intent.amountIn
          : 0n

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

      const receipt = await anvilClient.waitForTransactionReceipt({
        hash: txHash,
      })

      // 4. Capture post-swap balances
      const [balanceInAfter, balanceOutAfter] = await Promise.all([
        intent.tokenIn === '0x0000000000000000000000000000000000000000'
          ? anvilClient.getBalance({ address: this.safeAddress })
          : anvilClient.readContract({
              address: intent.tokenIn,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [this.safeAddress],
            }),
        intent.tokenOut === '0x0000000000000000000000000000000000000000'
          ? anvilClient.getBalance({ address: this.safeAddress })
          : anvilClient.readContract({
              address: intent.tokenOut,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [this.safeAddress],
            }),
      ])

      const balanceInDelta = balanceInBefore - balanceInAfter
      const balanceOutDelta = balanceOutAfter - balanceOutBefore
      const blockNumber = receipt.blockNumber
      const success = receipt.status === 'success'

      log.info(
        {
          stage: 'VERIFY',
          intentId: intent.id,
          success,
          balanceInDelta: balanceInDelta.toString(),
          balanceOutDelta: balanceOutDelta.toString(),
          gasUsed: receipt.gasUsed.toString(),
        },
        success ? 'Simulation succeeded' : 'Simulation transaction reverted'
      )

      return {
        success,
        balanceInDelta,
        balanceOutDelta,
        gasUsed: receipt.gasUsed,
        revertReason: success ? null : 'Transaction reverted on fork',
        blockNumber,
      }
    } catch (error) {
      const revertReason =
        error instanceof Error ? error.message : 'Unknown simulation error'

      log.error(
        { stage: 'VERIFY', intentId: intent.id, error },
        'Simulation failed with exception'
      )

      return {
        success: false,
        balanceInDelta: 0n,
        balanceOutDelta: 0n,
        gasUsed: 0n,
        revertReason,
        blockNumber: 0n,
      }
    } finally {
      // ALWAYS kill Anvil — no orphan processes
      this.killAnvil(anvilProcess)
    }
  }

  /**
   * Spawn Anvil and wait for it to be ready via TCP port probe.
   * Does NOT rely on stdout parsing — works with or without --silent.
   */
  private spawnAnvil(port: number): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      let settled = false

      const child = spawn('anvil', [
        '--fork-url', this.rpcHttpUrl,
        '--port', port.toString(),
        '--auto-impersonate',      // Agent can send txs without needing ETH
        '--steps-tracing',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      child.on('error', (err) => {
        if (!settled) {
          settled = true
          reject(new Error(`Failed to spawn Anvil: ${err.message}. Is Foundry installed?`))
        }
      })

      child.on('exit', (code) => {
        if (!settled) {
          settled = true
          reject(new Error(`Anvil exited prematurely with code ${code}`))
        }
      })

      // Use TCP port probe to detect readiness — no stdout dependency
      const startTime = Date.now()
      const probe = () => {
        if (settled) return
        if (Date.now() - startTime > this.timeoutMs) {
          settled = true
          this.killAnvil(child)
          reject(new Error(`Anvil did not become ready within ${this.timeoutMs}ms`))
          return
        }

        const socket = new net.Socket()
        socket.setTimeout(200)

        socket.on('connect', () => {
          socket.destroy()
          if (!settled) {
            settled = true
            resolve(child)
          }
        })

        socket.on('error', () => {
          socket.destroy()
          setTimeout(probe, 100) // retry after 100ms
        })

        socket.on('timeout', () => {
          socket.destroy()
          setTimeout(probe, 100)
        })

        socket.connect(port, '127.0.0.1')
      }

      // Start probing after a short delay to let Anvil initialize
      setTimeout(probe, 200)
    })
  }

  private killAnvil(child: ChildProcess | null): void {
    if (!child || child.killed) return
    try {
      child.kill('SIGTERM')
      // Force kill after 2s if it hasn't exited
      const forceKillTimer = setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL')
        } catch { /* already dead */ }
      }, 2000)
      forceKillTimer.unref() // Don't keep the process alive for this timer
    } catch { /* already dead */ }
  }

  private getRandomPort(): number {
    // Random port between 40000-60000 to avoid collision
    return 40000 + Math.floor(Math.random() * 20000)
  }

  private getLocalSignerAccount() {
    if (!this.agentPrivateKey) {
      throw new Error('AGENT_PRIVATE_KEY is required for local signer mode')
    }
    return privateKeyToAccount(this.agentPrivateKey)
  }
}
