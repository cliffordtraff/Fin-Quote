import { describe, expect, it } from 'vitest'
import { getMarketStatus, getTradingDate } from '@/lib/market-hours'
import { getCurrentMarketSession } from '@/lib/market-utils'

describe('market session calendar integration', () => {
  it('rolls a 2026 holiday back to the previous trading date', () => {
    expect(getTradingDate(new Date('2026-07-03T16:00:00Z'))).toBe('2026-07-02')
  })

  it('closes all sessions on an observed market holiday', () => {
    const holiday = new Date('2026-07-03T16:00:00Z')

    expect(getMarketStatus(holiday).session).toBe('closed')
    expect(getCurrentMarketSession(holiday)).toBe('closed')
  })

  it('keeps July 2, 2026 open through the normal 4pm close', () => {
    expect(getMarketStatus(new Date('2026-07-02T16:30:00Z')).session).toBe('cash')
    expect(getMarketStatus(new Date('2026-07-02T17:30:00Z')).session).toBe('cash')
    expect(getCurrentMarketSession(new Date('2026-07-02T16:30:00Z'))).toBe('regular')
    expect(getCurrentMarketSession(new Date('2026-07-02T17:30:00Z'))).toBe('regular')
  })

  it('moves into after-hours at 1pm on an actual NYSE early close', () => {
    expect(getMarketStatus(new Date('2026-11-27T17:30:00Z')).session).toBe('cash')
    expect(getMarketStatus(new Date('2026-11-27T18:30:00Z')).session).toBe('afterhours')
    expect(getCurrentMarketSession(new Date('2026-11-27T17:30:00Z'))).toBe('regular')
    expect(getCurrentMarketSession(new Date('2026-11-27T18:30:00Z'))).toBe('afterhours')
  })
})
