import { describe, expect, it } from 'vitest'
import {
  getUsMarketHolidayName,
  isUsMarketEarlyClose,
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

  it('does not invent a Friday observance for a Saturday New Year', () => {
    expect(getUsMarketHolidayName('2027-12-31')).toBeNull()
    expect(isUsMarketTradingDay('2027-12-31')).toBe(true)
  })

  it('recognizes floating holidays and Good Friday', () => {
    expect(getUsMarketHolidayName('2026-04-03')).toBe('Good Friday')
    expect(getUsMarketHolidayName('2026-11-26')).toBe('Thanksgiving Day')
    expect(isUsMarketTradingDay('2026-11-26')).toBe(false)
  })

  it('matches the published NYSE early closes', () => {
    // July 3 is the observed holiday in 2026, so NYSE does not roll the short
    // session back to July 2. The official 2026 calendar only shortens the
    // Friday after Thanksgiving and Christmas Eve.
    expect(isUsMarketEarlyClose('2026-07-02')).toBe(false)
    expect(isUsMarketEarlyClose('2026-11-27')).toBe(true)
    expect(isUsMarketEarlyClose('2026-12-24')).toBe(true)
    expect(isUsMarketEarlyClose('2026-07-01')).toBe(false)

    // July 3 is an open Monday in 2028 and is therefore a 1pm close.
    expect(isUsMarketEarlyClose('2028-07-03')).toBe(true)
    expect(isUsMarketEarlyClose('2027-11-26')).toBe(true)
  })
})
