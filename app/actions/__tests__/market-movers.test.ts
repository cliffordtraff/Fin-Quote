import { describe, expect, it } from 'vitest'
import { isPulseTodayChartableCandidate } from '@/lib/pulse-today-utils'

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
