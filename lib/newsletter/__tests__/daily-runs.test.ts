import { describe, expect, it } from 'vitest'
import { resolveExistingRunTarget } from '../daily-target'

describe('daily newsletter run targets', () => {
  it('preserves an existing larger batch when the next-day default is lowered', () => {
    expect(resolveExistingRunTarget(30, 40)).toBe(40)
  })

  it('allows a batch to expand and still enforces the supported range', () => {
    expect(resolveExistingRunTarget(50, 40)).toBe(50)
    expect(resolveExistingRunTarget(10, 0)).toBe(30)
    expect(resolveExistingRunTarget(75, 0)).toBe(50)
  })
})
