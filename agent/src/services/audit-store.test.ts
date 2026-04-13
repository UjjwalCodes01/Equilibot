import { mkdtemp, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { AuditStore } from './audit-store.js'
import { MOCK_INTENT, MOCK_OPPORTUNITY } from '../test-helpers/fixtures.js'

describe('AuditStore', () => {
  it('persists records as NDJSON after init', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'equilibot-audit-'))
    const store = new AuditStore(dir)
    await store.init()

    await store.recordOpportunity(MOCK_OPPORTUNITY)
    await store.recordIntent(MOCK_INTENT)

    const date = new Date().toISOString().split('T')[0]
    const filePath = join(dir, `audit-${date}.ndjson`)
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')

    expect(lines.length).toBe(2)

    const first = JSON.parse(lines[0] ?? '{}') as { stage?: string }
    const second = JSON.parse(lines[1] ?? '{}') as { stage?: string; intentId?: string }

    expect(first.stage).toBe('OPPORTUNITY')
    expect(second.stage).toBe('INTENT')
    expect(second.intentId).toBe('intent-1')
  })

  it('does not throw or write files when not initialized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'equilibot-audit-'))
    const store = new AuditStore(dir)

    await expect(store.recordSkip('WBNB-USDT-500', 'not initialized')).resolves.toBeUndefined()

    const files = await readdir(dir)
    expect(files.length).toBe(0)
  })
})
