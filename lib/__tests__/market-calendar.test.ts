import { describe, expect, it } from 'vitest'
import {
  getUsMarketHolidayName,
  isUsMarketTradingDay,
} from '@/lib/market-calendar'

describe('US market calendar', () => {
  it('recognizes regular weekdays and weekends', () => {
    expect(isUsMarketTradingDay('2026-07-30')).toBe(true)
    expect(isUsMarketTradingDay('2026-08-01')).toBe(false)
  })

  it('recognizes observed fixed-date holidays', () => {
    expect(getUsMarketHolidayName('2026-07-03')).toBe('Independence Day')
    expect(isUsMarketTradingDay('2026-07-03')).toBe(false)
    expect(getUsMarketHolidayName('2027-12-24')).toBe('Christmas Day')
  })

  it('recognizes floating holidays and Good Friday', () => {
    expect(getUsMarketHolidayName('2026-04-03')).toBe('Good Friday')
    expect(getUsMarketHolidayName('2026-11-26')).toBe('Thanksgiving Day')
    expect(isUsMarketTradingDay('2026-11-26')).toBe(false)
  })
})
