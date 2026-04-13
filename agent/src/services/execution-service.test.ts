import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { ExecutionService } from './execution-service.js'
import {
  MOCK_ADDRESSES,
  MOCK_INTENT,
  MOCK_SWAP_REQUEST,
} from '../test-helpers/fixtures.js'

const writeContractMock = vi.fn()

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: writeContractMock,
    })),
    http: vi.fn(() => ({})),
  }
})

vi.mock('viem/accounts', async () => {
  const actual = await vi.importActual<typeof import('viem/accounts')>('viem/accounts')
  return {
    ...actual,
    privateKeyToAccount: vi.fn(() => ({ address: MOCK_ADDRESSES.agent })),
  }
})

describe('ExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns EXECUTED when tx is confirmed successfully', async () => {
    writeContractMock.mockResolvedValue('0xabc' as Hex)

    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        blockNumber: 101n,
        gasUsed: 210000n,
      }),
    } as unknown as PublicClient

    const service = new ExecutionService(
      publicClient,
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.agent,
      'local',
      97,
      '0x1234' as Hex
    )

    const record = await service.execute(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(record.status).toBe('EXECUTED')
    expect(record.txHash).toBe('0xabc')
    expect((publicClient.waitForTransactionReceipt as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })

  it('returns FAILED when receipt status is reverted', async () => {
    writeContractMock.mockResolvedValue('0xdef' as Hex)

    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'reverted',
        blockNumber: 102n,
        gasUsed: 190000n,
      }),
    } as unknown as PublicClient

    const service = new ExecutionService(
      publicClient,
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.agent,
      'local',
      97,
      '0x1234' as Hex
    )

    const record = await service.execute(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(record.status).toBe('FAILED')
    expect(record.rejectReason).toContain('reverted')
  })

  it('passes native value for native-input swaps', async () => {
    writeContractMock.mockResolvedValue('0xaaa' as Hex)

    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        blockNumber: 103n,
        gasUsed: 220000n,
      }),
    } as unknown as PublicClient

    const service = new ExecutionService(
      publicClient,
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.agent,
      'local',
      97,
      '0x1234' as Hex
    )

    const nativeIntent = {
      ...MOCK_INTENT,
      tokenIn: zeroAddress,
      amountIn: 5n * 10n ** 17n,
    }

    await service.execute(nativeIntent, {
      ...MOCK_SWAP_REQUEST,
      tokenIn: zeroAddress,
      amountIn: 5n * 10n ** 17n,
    })

    const callArg = writeContractMock.mock.calls[0]?.[0] as {
      args: [unknown, unknown, bigint]
    }
    expect(callArg.args[2]).toBe(5n * 10n ** 17n)
  })
})
