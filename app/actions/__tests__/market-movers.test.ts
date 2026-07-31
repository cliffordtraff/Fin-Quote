import { describe, expect, it } from 'vitest'
import {
  buildPulseTodayCockpitSnapshot,
  isPulseTodayChartableCandidate,
} from '@/lib/pulse-today-utils'

describe('isPulseTodayChartableCandidate', () => {
  it('rejects movers with no quote support', () => {
    expect(
      isPulseTodayChartableCandidate({
        quoteExists: false,
        minuteBars: 100,
        streamBars: 100,
        supportsSecondLevel: true,
      }),
    ).toBe(false)
  })

  it('accepts movers with enough minute bars', () => {
    expect(
      isPulseTodayChartableCandidate({
        quoteExists: true,
        minuteBars: 5,
        streamBars: 0,
        supportsSecondLevel: true,
      }),
    ).toBe(true)
  })

  it('accepts thin minute feeds when second-level coverage is strong', () => {
    expect(
      isPulseTodayChartableCandidate({
        quoteExists: true,
        minuteBars: 3,
        streamBars: 30,
        supportsSecondLevel: true,
      }),
    ).toBe(true)
  })

  it('rejects movers with too little minute and stream data', () => {
    expect(
      isPulseTodayChartableCandidate({
        quoteExists: true,
        minuteBars: 3,
        streamBars: 0,
        supportsSecondLevel: true,
      }),
    ).toBe(false)
  })
})

describe('buildPulseTodayCockpitSnapshot', () => {
  const currentSession = 'cash' as const
  const mover = (
    symbol: string,
    changesPercentage: number,
  ) => ({
    symbol,
    name: `${symbol} Inc.`,
    price: 10,
    change: changesPercentage / 10,
    changesPercentage,
  })

  it('selects active-session leaders and a deduplicated review set', () => {
    const snapshot = buildPulseTodayCockpitSnapshot(
      {
        premarket: [mover('PRE', 8)],
        cash: [mover('AAA', 12), mover('SHARED', 7)],
        afterhours: [],
        currentSession,
      },
      {
        premarket: [],
        cash: [mover('BBB', -11), mover('SHARED', -6)],
        afterhours: [],
        currentSession,
      },
    )

    expect(snapshot.session).toBe('cash')
    expect(snapshot.topGainer?.symbol).toBe('AAA')
    expect(snapshot.topLoser?.symbol).toBe('BBB')
    expect(snapshot.reviewSymbols).toEqual(['AAA', 'SHARED', 'BBB'])
  })

  it('uses regular-session snapshots while the market is closed', () => {
    const snapshot = buildPulseTodayCockpitSnapshot({
      premarket: [mover('PRE', 8)],
      cash: [mover('CLOSE', 5)],
      afterhours: [mover('POST', 3)],
      currentSession: 'closed',
    })

    expect(snapshot.gainers[0]?.symbol).toBe('CLOSE')
  })
})
