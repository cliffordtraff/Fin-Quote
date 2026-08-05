import { describe, expect, it } from 'vitest'
import { parseFmpEasternTimestamp } from '@/lib/providers/fmp'

describe('FMP Eastern timestamp parsing', () => {
  it('uses daylight time for summer intraday candles', () => {
    expect(new Date(parseFmpEasternTimestamp('2026-07-02 09:30:00')).toISOString()).toBe(
      '2026-07-02T13:30:00.000Z',
    )
  })

  it('uses standard time for winter intraday candles', () => {
    expect(new Date(parseFmpEasternTimestamp('2026-01-02 09:30:00')).toISOString()).toBe(
      '2026-01-02T14:30:00.000Z',
    )
  })

  it('rejects malformed provider dates', () => {
    expect(parseFmpEasternTimestamp('not-a-date')).toBeNaN()
  })
})
