import { describe, expect, it } from 'vitest'

import { buildMorningBriefTakeaways } from '@/lib/morning-brief-insights'

describe('buildMorningBriefTakeaways', () => {
  it('summarizes the tape, catalysts, earnings, and top WIIM candidate', () => {
    const takeaways = buildMorningBriefTakeaways({
      summaryDate: '2026-07-29',
      futures: [
        { name: 'S&P 500 Futures', changePercent: 0.25 },
        { name: 'Nasdaq 100 Futures', changePercent: -0.1 },
      ],
      semiconductorRead: {
        tone: 'pullback',
        summary: 'Semiconductors are broadly lower before the open.',
      },
      economicEvents: [
        {
          date: '2026-07-29 14:00:00',
          event: 'Fed Interest Rate Decision',
          impact: 'High',
        },
      ],
      earnings: [
        { symbol: 'MSFT', date: '2026-07-29', time: 'amc' },
        { symbol: 'META', date: '2026-07-29', time: 'amc' },
      ],
      topWiimCandidate: {
        ticker: 'F',
        headline: 'Ford raises full-year guidance',
        movePercent: 5.86,
      },
    })

    expect(takeaways).toHaveLength(5)
    expect(takeaways[0]).toMatchObject({
      label: 'Index setup',
      tone: 'neutral',
    })
    expect(takeaways[1]).toMatchObject({
      label: 'Semiconductors',
      tone: 'negative',
    })
    expect(takeaways[2].text).toContain('Fed Interest Rate Decision')
    expect(takeaways[3].text).toContain('2 after the close')
    expect(takeaways[4].text).toContain('F (+5.86%)')
  })

  it('omits unavailable sections without fabricating values', () => {
    const takeaways = buildMorningBriefTakeaways({
      summaryDate: '2026-07-29',
      futures: [],
      semiconductorRead: {
        tone: 'mixed',
        summary: 'Semiconductors are mixed.',
      },
      economicEvents: [],
      earnings: [],
      topWiimCandidate: null,
    })

    expect(takeaways).toEqual([
      {
        label: 'Semiconductors',
        text: 'Semiconductors are mixed.',
        tone: 'neutral',
      },
    ])
  })
})
