import { describe, expect, it } from 'vitest'

import {
  buildMidMorningTakeaways,
  classifyMorningFollowThrough,
  parsePercentValue,
} from '@/lib/mid-morning-brief-insights'

describe('mid-morning brief insights', () => {
  it('normalizes sector percentage values', () => {
    expect(parsePercentValue('1.81314%')).toBeCloseTo(1.81314)
    expect(parsePercentValue('-2.99%')).toBeCloseTo(-2.99)
    expect(parsePercentValue('not available')).toBeNull()
  })

  it('classifies morning follow-through by direction and magnitude', () => {
    expect(classifyMorningFollowThrough(2.5, 4.1)).toBe('confirmed')
    expect(classifyMorningFollowThrough(-1.2, 1.4)).toBe('reversed')
    expect(classifyMorningFollowThrough(1.4, 0.2)).toBe('fading')
    expect(classifyMorningFollowThrough(14.1, 2.6)).toBe('fading')
    expect(classifyMorningFollowThrough(null, 1.2)).toBe('developing')
  })

  it('calls out a changed top story and the remaining catalysts', () => {
    const items = buildMidMorningTakeaways({
      sp500ChangePercent: -0.47,
      vixChangePercent: 5.5,
      advancers: 240,
      decliners: 255,
      leadingSector: { name: 'Industrials', changePercent: 1.85 },
      laggingSector: { name: 'Energy', changePercent: -2.99 },
      previousTopCandidate: 'CTSH',
      currentTopCandidate: 'GRMN',
      newlyEntered: ['GRMN', 'GEHC'],
      nextMacroEvent: { name: 'Fed rate decision', timeLabel: '2:00 PM ET' },
      afterCloseEarnings: ['MSFT', 'META'],
    })

    expect(items).toHaveLength(4)
    expect(items[0].text).toContain('240 advancers')
    expect(items[2].text).toContain('GRMN has replaced CTSH')
    expect(items[3].text).toContain('MSFT and META')
  })
})
