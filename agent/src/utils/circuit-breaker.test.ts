/**
 * EquiliBot Agent — Circuit Breaker Tests
 */

import { describe, it, expect } from 'vitest'
import { CircuitBreaker } from './circuit-breaker.js'

describe('CircuitBreaker', () => {
  it('does not trip below threshold', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure(new Error('fail 1'), 'test')
    cb.recordFailure(new Error('fail 2'), 'test')
    expect(cb.isTripped).toBe(false)
  })

  it('trips at threshold', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure(new Error('fail 1'), 'test')
    cb.recordFailure(new Error('fail 2'), 'test')
    const tripped = cb.recordFailure(new Error('fail 3'), 'test')
    expect(tripped).toBe(true)
    expect(cb.isTripped).toBe(true)
  })

  it('resets on success', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure(new Error('fail 1'), 'test')
    cb.recordFailure(new Error('fail 2'), 'test')
    cb.recordSuccess()
    cb.recordFailure(new Error('fail 1 again'), 'test')
    cb.recordFailure(new Error('fail 2 again'), 'test')
    expect(cb.isTripped).toBe(false)
  })

  it('does not auto-recover after tripping', () => {
    const cb = new CircuitBreaker(2)
    cb.recordFailure(new Error('fail 1'), 'test')
    cb.recordFailure(new Error('fail 2'), 'test')
    expect(cb.isTripped).toBe(true)

    // Success should not un-trip
    cb.recordSuccess()
    expect(cb.isTripped).toBe(true) // stays tripped
  })

  it('manual reset clears tripped state', () => {
    const cb = new CircuitBreaker(1)
    cb.recordFailure(new Error('fail'), 'test')
    expect(cb.isTripped).toBe(true)

    cb.reset()
    expect(cb.isTripped).toBe(false)
  })
})
