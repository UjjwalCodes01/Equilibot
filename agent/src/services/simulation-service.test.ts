import { describe, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'child_process'
import { SimulationService } from './simulation-service.js'
import {
  MOCK_ADDRESSES,
  MOCK_INTENT,
  MOCK_SWAP_REQUEST,
} from '../test-helpers/fixtures.js'

describe('SimulationService', () => {
  it('returns structured failure when spawnAnvil throws', async () => {
    const service = new SimulationService(
      'http://127.0.0.1:8545',
      MOCK_ADDRESSES.agent,
      'local',
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.safe,
      '0x1234',
      100
    )

    vi.spyOn(service as unknown as { spawnAnvil: (port: number) => Promise<ChildProcess> }, 'spawnAnvil')
      .mockRejectedValue(new Error('anvil unavailable'))

    const result = await service.simulate(MOCK_INTENT, MOCK_SWAP_REQUEST)

    expect(result.success).toBe(false)
    expect(result.revertReason).toContain('anvil unavailable')
    expect(result.balanceInDelta).toBe(0n)
  })

  it('getRandomPort returns port in expected range', () => {
    const service = new SimulationService(
      'http://127.0.0.1:8545',
      MOCK_ADDRESSES.agent,
      'local',
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.safe,
      '0x1234',
      100
    )

    const getRandomPort = (service as unknown as { getRandomPort: () => number }).getRandomPort
    const port = getRandomPort.call(service)

    expect(port).toBeGreaterThanOrEqual(40000)
    expect(port).toBeLessThan(60000)
  })

  it('killAnvil calls SIGTERM when process exists', () => {
    const service = new SimulationService(
      'http://127.0.0.1:8545',
      MOCK_ADDRESSES.agent,
      'local',
      MOCK_ADDRESSES.module,
      MOCK_ADDRESSES.safe,
      '0x1234',
      100
    )

    const child = {
      killed: false,
      kill: vi.fn().mockReturnValue(true),
    } as unknown as ChildProcess

    const killAnvil = (service as unknown as { killAnvil: (child: ChildProcess | null) => void }).killAnvil
    killAnvil.call(service, child as ChildProcess)

    expect((child.kill as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('SIGTERM')
  })
})
