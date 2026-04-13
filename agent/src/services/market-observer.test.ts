import { describe, expect, it, vi } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { MarketObserver } from './market-observer.js'
import type { PairDefinition } from '../config/pairs.js'
import { MOCK_ADDRESSES } from '../test-helpers/fixtures.js'

vi.mock('../utils/retry.js', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

describe('MarketObserver', () => {
  it('resolvePools skips missing pools and returns resolved pools with feed ids', async () => {
    const observer = new MarketObserver('http://localhost:8545', 'wss://localhost:8546', 97)

    const readContract = vi
      .fn()
      .mockResolvedValueOnce('0x0000000000000000000000000000000000000000')
      .mockResolvedValueOnce(MOCK_ADDRESSES.pool)

    ;(observer as unknown as { httpClient: PublicClient }).httpClient = {
      readContract,
    } as unknown as PublicClient

    const pairs: PairDefinition[] = [
      {
        id: 'missing',
        tokenA: { address: MOCK_ADDRESSES.tokenA, symbol: 'AAA', decimals: 18 },
        tokenB: { address: MOCK_ADDRESSES.tokenB, symbol: 'BBB', decimals: 18 },
        feeTier: 500,
        pythPriceFeedIdA: '0x01' as `0x${string}`,
        pythPriceFeedIdB: '0x02' as `0x${string}`,
      },
      {
        id: 'exists',
        tokenA: { address: MOCK_ADDRESSES.tokenA, symbol: 'AAA', decimals: 18 },
        tokenB: { address: MOCK_ADDRESSES.tokenB, symbol: 'BBB', decimals: 18 },
        feeTier: 500,
        pythPriceFeedIdA: '0x03' as `0x${string}`,
        pythPriceFeedIdB: '0x04' as `0x${string}`,
      },
    ]

    const resolved = await observer.resolvePools(MOCK_ADDRESSES.router, pairs)

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.id).toBe('exists')
    expect(resolved[0]?.poolAddress).toBe(MOCK_ADDRESSES.pool)
    expect(resolved[0]?.pythFeedIdA).toBe('0x03')
    expect(resolved[0]?.pythFeedIdB).toBe('0x04')
  })

  it('stop unsubscribes watchers and clears stale timers', () => {
    const observer = new MarketObserver('http://localhost:8545', 'wss://localhost:8546', 97)

    const unwatch = vi.fn()
    ;(observer as unknown as { unwatchers: Array<() => void> }).unwatchers.push(unwatch)

    const pool = MOCK_ADDRESSES.pool as Address
    const timer = setTimeout(() => undefined, 10_000)
    ;(observer as unknown as { staleTimers: Map<Address, ReturnType<typeof setTimeout>> }).staleTimers.set(pool, timer)
    ;(observer as unknown as { _running: boolean })._running = true

    observer.stop()

    expect(unwatch).toHaveBeenCalledTimes(1)
    expect((observer as unknown as { staleTimers: Map<Address, ReturnType<typeof setTimeout>> }).staleTimers.size).toBe(0)
    expect(observer.isRunning).toBe(false)
  })
})
