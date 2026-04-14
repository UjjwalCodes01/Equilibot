import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { ExecutionService } from './execution-service.js'
import type { AgentSigner } from './signer.js'
import {
  MOCK_ADDRESSES,
  MOCK_INTENT,
  MOCK_SWAP_REQUEST,
} from '../test-helpers/fixtures.js'

const { writeContractMock, createPublicClientMock } = vi.hoisted(() => ({
  writeContractMock: vi.fn(),
  createPublicClientMock: vi.fn(),
}))

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createPublicClient: createPublicClientMock,
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

  function createLocalSigner(): AgentSigner {
    return {
      address: MOCK_ADDRESSES.agent,
      mode: 'local',
      getAccount: vi.fn(() => ({ address: MOCK_ADDRESSES.agent })),
      healthCheck: vi.fn().mockResolvedValue(true),
    } as unknown as AgentSigner
  }

  function createManagedSigner(
    overrides?: Partial<AgentSigner>
  ): AgentSigner {
    const signer: AgentSigner = {
      address: MOCK_ADDRESSES.agent,
      mode: 'managed',
      getAccount: vi.fn(() => MOCK_ADDRESSES.agent),
      healthCheck: vi.fn().mockResolvedValue(true),
      signTransactionDigest: vi.fn().mockResolvedValue({
        r: `0x${'11'.repeat(32)}`,
        s: `0x${'22'.repeat(32)}`,
        yParity: 1,
      }),
    }
    return { ...signer, ...overrides }
  }

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
      createLocalSigner(),
      97,
      'https://public-rpc.example'
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
      createLocalSigner(),
      97,
      'https://public-rpc.example'
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
      createLocalSigner(),
      97,
      'https://public-rpc.example'
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

  it('submits raw signed transaction in managed mode', async () => {
    const signer = createManagedSigner()
    const txHash = `0x${'ab'.repeat(32)}` as Hex

    const submissionClient = {
      getTransactionCount: vi.fn().mockResolvedValue(7),
      getGasPrice: vi.fn().mockResolvedValue(2n * 10n ** 9n),
      estimateGas: vi.fn().mockResolvedValue(230000n),
      sendRawTransaction: vi.fn().mockResolvedValue(txHash),
    }
    createPublicClientMock.mockReturnValue(submissionClient)

    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        blockNumber: 201n,
        gasUsed: 190000n,
      }),
    } as unknown as PublicClient

    const service = new ExecutionService(
      publicClient,
      MOCK_ADDRESSES.module,
      signer,
      97,
      'https://public-rpc.example',
      'https://private-rpc.example'
    )

    const record = await service.execute(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(record.status).toBe('EXECUTED')
    expect(record.txHash).toBe(txHash)
    expect(signer.signTransactionDigest).toHaveBeenCalledTimes(1)
    expect(submissionClient.sendRawTransaction).toHaveBeenCalledTimes(1)
  })

  it('fails managed execution when signer cannot produce native digest signatures', async () => {
    const signer: AgentSigner = {
      address: MOCK_ADDRESSES.agent,
      mode: 'managed',
      getAccount: vi.fn(() => MOCK_ADDRESSES.agent),
      healthCheck: vi.fn().mockResolvedValue(true),
    }

    const publicClient = {
      waitForTransactionReceipt: vi.fn(),
    } as unknown as PublicClient

    const service = new ExecutionService(
      publicClient,
      MOCK_ADDRESSES.module,
      signer,
      97,
      'https://public-rpc.example',
      'https://private-rpc.example'
    )

    const record = await service.execute(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(record.status).toBe('FAILED')
    expect(record.rejectReason).toContain('native digest signing')
  })
})
