/**
 * EquiliBot Agent — Metrics Collector Tests
 */

import { describe, it, expect } from 'vitest'
import { MetricsCollector } from './metrics-collector.js'

describe('MetricsCollector', () => {
  it('starts with zero counters', () => {
    const mc = new MetricsCollector()
    const m = mc.getMetrics()
    expect(m.pipelineRuns).toBe(0)
    expect(m.opportunitiesDetected).toBe(0)
    expect(m.simulationsRun).toBe(0)
    expect(m.executionsAttempted).toBe(0)
    expect(m.lastPipelineRunAt).toBeNull()
    expect(m.lastExecutionAt).toBeNull()
    expect(m.uptime).toBeGreaterThanOrEqual(0)
  })

  it('increments pipeline runs', () => {
    const mc = new MetricsCollector()
    mc.incrementPipelineRuns()
    mc.incrementPipelineRuns()
    expect(mc.getMetrics().pipelineRuns).toBe(2)
    expect(mc.getMetrics().lastPipelineRunAt).not.toBeNull()
  })

  it('tracks simulation pass/fail separately', () => {
    const mc = new MetricsCollector()
    mc.incrementSimulations(true)
    mc.incrementSimulations(true)
    mc.incrementSimulations(false)
    const m = mc.getMetrics()
    expect(m.simulationsRun).toBe(3)
    expect(m.simulationsPassed).toBe(2)
    expect(m.simulationsFailed).toBe(1)
  })

  it('tracks execution success/fail', () => {
    const mc = new MetricsCollector()
    mc.incrementExecutions(true)
    mc.incrementExecutions(false)
    const m = mc.getMetrics()
    expect(m.executionsAttempted).toBe(2)
    expect(m.executionsSucceeded).toBe(1)
    expect(m.executionsFailed).toBe(1)
    expect(m.lastExecutionAt).not.toBeNull()
  })

  it('tracks skip reasons with counts', () => {
    const mc = new MetricsCollector()
    mc.incrementSkip('Gas price spike')
    mc.incrementSkip('Gas price spike')
    mc.incrementSkip('Quote failed')
    const m = mc.getMetrics()
    expect(m.skips['Gas price spike']).toBe(2)
    expect(m.skips['Quote failed']).toBe(1)
  })

  it('resets daily counters but preserves uptime', () => {
    const mc = new MetricsCollector()
    mc.incrementPipelineRuns()
    mc.incrementOpportunities()
    mc.incrementSimulations(true)
    mc.incrementExecutions(true)
    mc.incrementSkip('test')

    mc.resetDaily()

    const m = mc.getMetrics()
    expect(m.pipelineRuns).toBe(0)
    expect(m.opportunitiesDetected).toBe(0)
    expect(m.simulationsRun).toBe(0)
    expect(m.executionsAttempted).toBe(0)
    expect(Object.keys(m.skips)).toHaveLength(0)
    expect(m.uptime).toBeGreaterThan(0)
  })

  it('returns a snapshot (not a reference)', () => {
    const mc = new MetricsCollector()
    mc.incrementSkip('test')
    const m1 = mc.getMetrics()
    mc.incrementSkip('other')
    const m2 = mc.getMetrics()
    // m1 should not have been mutated
    expect(Object.keys(m1.skips)).toHaveLength(1)
    expect(Object.keys(m2.skips)).toHaveLength(2)
  })
})
