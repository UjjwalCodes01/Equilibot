import { describe, expect, it, vi } from 'vitest'
import type { PublicClient } from 'viem'
import { QuoteService } from './quote-service.js'
import { MOCK_ADDRESSES } from '../test-helpers/fixtures.js'

vi.mock('../utils/retry.js', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

describe('QuoteService', () => {
  it('returns amountOut and gasEstimate on successful quoter simulation', async () => {
    const client = {
      simulateContract: vi.fn().mockResolvedValue({
        result: [123n, 0n, 0n, 456n],
      }),
    } as unknown as PublicClient

    const service = new QuoteService(client, MOCK_ADDRESSES.router)
    const quote = await service.getExactInputSingleQuote(
      MOCK_ADDRESSES.tokenA,
      MOCK_ADDRESSES.tokenB,
      500,
      10n ** 18n
    )

    expect(quote).toEqual({ amountOut: 123n, gasEstimate: 456n })
    expect((client.simulateContract as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('returns null when quoter call fails', async () => {
    const client = {
      simulateContract: vi.fn().mockRejectedValue(new Error('quoter revert')),
    } as unknown as PublicClient

    const service = new QuoteService(client, MOCK_ADDRESSES.router)
    const quote = await service.getExactInputSingleQuote(
      MOCK_ADDRESSES.tokenA,
      MOCK_ADDRESSES.tokenB,
      500,
      10n ** 18n
    )

    expect(quote).toBeNull()
  })
})
