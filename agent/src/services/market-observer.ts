/**
 * EquiliBot Agent — Market Observer
 *
 * Watches live PancakeSwap V3 pool state via WebSocket.
 * Maintains an always-current in-memory map of pool states.
 *
 * Edge cases handled:
 * - WebSocket disconnect: auto-reconnect + re-fetch slot0
 * - Event ordering: blockNumber + logIndex dedup
 * - Stale state: heartbeat poll if no events for STALE_TIMEOUT_MS
 */

import {
  type PublicClient,
  type Address,
  type WatchContractEventReturnType,
  createPublicClient,
  webSocket,
  http,
} from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { pancakeV3PoolAbi } from '../abi/pancake-v3-pool.js'
import { pancakeV3FactoryAbi } from '../abi/pancake-v3-factory.js'
import type { PoolState, TradingPair } from '../types/index.js'
import type { PairDefinition } from '../config/pairs.js'
import { createLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'

const log = createLogger('market-observer')
const STALE_TIMEOUT_MS = 60_000

export class MarketObserver {
  private readonly httpClient: PublicClient
  private wsClient: PublicClient | null = null
  private readonly wsUrl: string
  private readonly chainId: number
  private readonly poolStates = new Map<Address, PoolState>()
  private readonly unwatchers: WatchContractEventReturnType[] = []
  private readonly staleTimers = new Map<Address, ReturnType<typeof setTimeout>>()
  private onUpdateCallback: ((poolAddress: Address, state: PoolState) => void) | null = null
  private _running = false

  constructor(httpUrl: string, wssUrl: string, chainId: number) {
    const chain = chainId === 56 ? bsc : bscTestnet
    this.httpClient = createPublicClient({
      chain,
      transport: http(httpUrl),
    }) as PublicClient
    this.wsUrl = wssUrl
    this.chainId = chainId
  }

  /** Register a callback for pool state updates. */
  onUpdate(callback: (poolAddress: Address, state: PoolState) => void): void {
    this.onUpdateCallback = callback
  }

  /** Resolve pool addresses from the V3 Factory. */
  async resolvePools(
    factoryAddress: Address,
    pairs: PairDefinition[]
  ): Promise<TradingPair[]> {
    const resolved: TradingPair[] = []

    for (const pair of pairs) {
      const poolAddress = await withRetry(
        () =>
          this.httpClient.readContract({
            address: factoryAddress,
            abi: pancakeV3FactoryAbi,
            functionName: 'getPool',
            args: [pair.tokenA.address, pair.tokenB.address, pair.feeTier],
          }),
        { label: `getPool(${pair.id})`, maxRetries: 3 }
      )

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        log.warn(
          { stage: 'INIT', pair: pair.id },
          `Pool not found for pair ${pair.id}, skipping`
        )
        continue
      }

      resolved.push({
        id: pair.id,
        tokenA: pair.tokenA,
        tokenB: pair.tokenB,
        feeTier: pair.feeTier,
        poolAddress: poolAddress as Address,
        pythFeedIdA: pair.pythPriceFeedIdA,
        pythFeedIdB: pair.pythPriceFeedIdB,
      })

      log.info(
        { stage: 'INIT', pair: pair.id, poolAddress },
        `Resolved pool address for ${pair.id}`
      )
    }

    return resolved
  }

  /** Start watching all pools. */
  async start(pairs: TradingPair[]): Promise<void> {
    this._running = true

    // Fetch initial slot0 for all pools
    for (const pair of pairs) {
      await this.fetchSlot0(pair.poolAddress)
    }

    // Create WebSocket client
    this.createWsClient()

    // Subscribe to Swap events on each pool
    for (const pair of pairs) {
      this.watchPool(pair.poolAddress)
    }

    log.info(
      { stage: 'OBSERVE', poolCount: pairs.length },
      `Market observer started, watching ${pairs.length} pools`
    )
  }

  /** Stop watching and clean up. */
  stop(): void {
    this._running = false

    for (const unwatch of this.unwatchers) {
      unwatch()
    }
    this.unwatchers.length = 0

    for (const timer of this.staleTimers.values()) {
      clearTimeout(timer)
    }
    this.staleTimers.clear()

    log.info({ stage: 'SYSTEM' }, 'Market observer stopped')
  }

  /** Get the current state of a pool. */
  getPoolState(poolAddress: Address): PoolState | undefined {
    return this.poolStates.get(poolAddress)
  }

  get isRunning(): boolean {
    return this._running
  }

  private createWsClient(): void {
    const chain = this.chainId === 56 ? bsc : bscTestnet
    this.wsClient = createPublicClient({
      chain,
      transport: webSocket(this.wsUrl, {
        retryCount: 10,
        retryDelay: 2000,
      }),
    }) as PublicClient
    log.info({ stage: 'OBSERVE' }, 'WebSocket client created')
  }

  private watchPool(poolAddress: Address): void {
    if (!this.wsClient) return

    const unwatch = this.wsClient.watchContractEvent({
      address: poolAddress,
      abi: pancakeV3PoolAbi,
      eventName: 'Swap',
      onLogs: (logs) => {
        for (const eventLog of logs) {
          const { sqrtPriceX96, liquidity, tick } = eventLog.args
          if (sqrtPriceX96 === undefined || liquidity === undefined || tick === undefined) {
            continue
          }

          const blockNumber = eventLog.blockNumber ?? 0n
          const logIndex = eventLog.logIndex ?? 0

          // Dedup: only process if this is newer than what we have
          const current = this.poolStates.get(poolAddress)
          if (current) {
            if (
              blockNumber < current.blockNumber ||
              (blockNumber === current.blockNumber && logIndex <= current.logIndex)
            ) {
              continue // stale or duplicate event
            }
          }

          const newState: PoolState = {
            poolAddress,
            sqrtPriceX96,
            tick,
            liquidity,
            blockNumber,
            logIndex,
            updatedAt: Date.now(),
          }

          this.poolStates.set(poolAddress, newState)
          this.resetStaleTimer(poolAddress)

          log.debug(
            {
              stage: 'OBSERVE',
              poolAddress,
              tick,
              blockNumber: blockNumber.toString(),
            },
            'Pool state updated via Swap event'
          )

          this.onUpdateCallback?.(poolAddress, newState)
        }
      },
      onError: (error) => {
        log.error(
          { stage: 'OBSERVE', error, poolAddress },
          'Error watching pool events'
        )
      },
    })

    this.unwatchers.push(unwatch)
    this.resetStaleTimer(poolAddress)
  }

  private resetStaleTimer(poolAddress: Address): void {
    const existing = this.staleTimers.get(poolAddress)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      if (!this._running) return
      log.warn(
        { stage: 'OBSERVE', poolAddress },
        'No events received for 60s, performing heartbeat slot0 poll'
      )
      this.fetchSlot0(poolAddress).catch((err) => {
        log.error(
          { stage: 'OBSERVE', error: err, poolAddress },
          'Heartbeat slot0 poll failed'
        )
      })
    }, STALE_TIMEOUT_MS)

    this.staleTimers.set(poolAddress, timer)
  }

  private async fetchSlot0(poolAddress: Address): Promise<void> {
    const [slot0Result, liquidityResult] = await Promise.all([
      withRetry(
        () =>
          this.httpClient.readContract({
            address: poolAddress,
            abi: pancakeV3PoolAbi,
            functionName: 'slot0',
          }),
        { label: `slot0(${poolAddress})` }
      ),
      withRetry(
        () =>
          this.httpClient.readContract({
            address: poolAddress,
            abi: pancakeV3PoolAbi,
            functionName: 'liquidity',
          }),
        { label: `liquidity(${poolAddress})` }
      ),
    ])

    const blockNumber = await this.httpClient.getBlockNumber()

    const state: PoolState = {
      poolAddress,
      sqrtPriceX96: slot0Result[0],
      tick: slot0Result[1],
      liquidity: liquidityResult,
      blockNumber,
      logIndex: 0,
      updatedAt: Date.now(),
    }

    this.poolStates.set(poolAddress, state)
    this.resetStaleTimer(poolAddress)

    log.info(
      {
        stage: 'OBSERVE',
        poolAddress,
        tick: state.tick,
        sqrtPriceX96: state.sqrtPriceX96.toString(),
      },
      'Fetched initial slot0'
    )

    this.onUpdateCallback?.(poolAddress, state)
  }
}
