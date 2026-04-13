import { describe, expect, it, vi } from 'vitest'
import type { PublicClient } from 'viem'
import { PolicyService } from './policy-service.js'
import {
  MOCK_ADDRESSES,
  MOCK_INTENT,
  MOCK_SWAP_REQUEST,
} from '../test-helpers/fixtures.js'

vi.mock('../utils/retry.js', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

describe('PolicyService', () => {
  it('returns passed=true when checkSwap call succeeds', async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue(undefined),
    } as unknown as PublicClient

    const service = new PolicyService(client, MOCK_ADDRESSES.guard, MOCK_ADDRESSES.agent)
    const result = await service.validateIntent(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(result).toEqual({ passed: true, error: null, errorSelector: null })
  })

  it('returns structured rejection when checkSwap reverts with data', async () => {
    const err = Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' as const })

    const client = {
      readContract: vi.fn().mockRejectedValue(err),
    } as unknown as PublicClient

    const service = new PolicyService(client, MOCK_ADDRESSES.guard, MOCK_ADDRESSES.agent)
    const result = await service.validateIntent(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(result.passed).toBe(false)
    expect(result.error).toBe('Unknown policy rejection')
    expect(result.errorSelector).toBe('0xdeadbeef')
  })
})
