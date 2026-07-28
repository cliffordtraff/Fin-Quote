import { describe, expect, it } from 'vitest'
import {
  getEasternCalendarDate,
  getEasternCalendarDateRange,
  shiftIsoCalendarDate,
} from '@/lib/calendar-date'

describe('Eastern calendar dates', () => {
  it('does not roll into tomorrow at midnight UTC during daylight saving time', () => {
    expect(getEasternCalendarDate(new Date('2026-07-28T00:30:00Z'))).toBe('2026-07-27')
    expect(getEasternCalendarDate(new Date('2026-07-28T03:59:59Z'))).toBe('2026-07-27')
    expect(getEasternCalendarDate(new Date('2026-07-28T04:00:00Z'))).toBe('2026-07-28')
  })

  it('uses the correct winter UTC boundary', () => {
    expect(getEasternCalendarDate(new Date('2026-01-15T04:59:59Z'))).toBe('2026-01-14')
    expect(getEasternCalendarDate(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15')
  })

  it('preserves inclusive lookback semantics across month and leap-day boundaries', () => {
    expect(getEasternCalendarDateRange(7, new Date('2026-07-28T00:30:00Z'))).toEqual({
      fromDate: '2026-07-20',
      toDate: '2026-07-27',
    })
    expect(shiftIsoCalendarDate('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftIsoCalendarDate('2026-01-01', -1)).toBe('2025-12-31')
  })
})
