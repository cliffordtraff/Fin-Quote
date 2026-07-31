import { describe, expect, it } from 'vitest'
import {
  __testOnly,
  getNewsletterAutomationClock,
  getNewsletterAutomationStageLabel,
  getNewsletterAutomationWindow,
} from '../daily-automation'

describe('daily newsletter automation', () => {
  it('runs from 5:00 through 7:59 AM New York time', () => {
    expect(
      getNewsletterAutomationClock(
        new Date('2026-07-30T09:00:00.000Z'),
      ).isCollectionWindow,
    ).toBe(true)
    expect(
      getNewsletterAutomationClock(
        new Date('2026-07-30T11:59:00.000Z'),
      ).isCollectionWindow,
    ).toBe(true)
    expect(
      getNewsletterAutomationClock(
        new Date('2026-07-30T12:00:00.000Z'),
      ).isCollectionWindow,
    ).toBe(false)
  })

  it('does not run on weekends and keeps the report first until noon', () => {
    const saturday = getNewsletterAutomationClock(
      new Date('2026-08-01T11:00:00.000Z'),
    )
    const weekdayMorning = getNewsletterAutomationClock(
      new Date('2026-07-30T13:30:00.000Z'),
    )
    const weekdayNoon = getNewsletterAutomationClock(
      new Date('2026-07-30T16:00:00.000Z'),
    )

    expect(saturday.isWeekday).toBe(false)
    expect(saturday.isCollectionWindow).toBe(false)
    expect(weekdayMorning.isMorningReportWindow).toBe(true)
    expect(weekdayNoon.isMorningReportWindow).toBe(false)
  })

  it('skips US market holidays', () => {
    const thanksgiving = getNewsletterAutomationClock(
      new Date('2026-11-26T12:00:00.000Z'),
    )
    expect(thanksgiving.isWeekday).toBe(true)
    expect(thanksgiving.isTradingDay).toBe(false)
    expect(thanksgiving.holidayName).toBe('Thanksgiving Day')
  })

  it('treats generation hour as a ready-by deadline with recovery', () => {
    const beforeStart = getNewsletterAutomationClock(
      new Date('2026-07-30T08:59:00.000Z'),
    )
    const onTime = getNewsletterAutomationClock(
      new Date('2026-07-30T09:00:00.000Z'),
    )
    const late = getNewsletterAutomationClock(
      new Date('2026-07-30T12:15:00.000Z'),
    )

    expect(getNewsletterAutomationWindow(beforeStart, [8])).toMatchObject({
      readyByHour: 8,
      startHour: 5,
      shouldRun: false,
      isLate: false,
    })
    expect(getNewsletterAutomationWindow(onTime, [8]).shouldRun).toBe(true)
    expect(getNewsletterAutomationWindow(late, [8])).toMatchObject({
      shouldRun: true,
      isLate: true,
    })
  })

  it('maps pipeline stages to operator-facing labels', () => {
    expect(getNewsletterAutomationStageLabel('finviz')).toBe(
      'Refreshing Finviz catalysts',
    )
    expect(getNewsletterAutomationStageLabel('summaries')).toBe(
      'Writing original summaries',
    )
    expect(getNewsletterAutomationStageLabel('completed')).toBe(
      'Morning report ready',
    )
  })

  it('normalizes persisted retry maps and newsletter run IDs', () => {
    expect(
      __testOnly.stringNumberMap({ AAPL: 2, MSFT: '1', BAD: 'x' }),
    ).toEqual({ AAPL: 2, MSFT: 1 })
    expect(
      __testOnly.newsletterRunIds({
        'owner:1': 'run-1',
        ignored: 3,
      }),
    ).toEqual({ 'owner:1': 'run-1' })
  })

  it('resumes the recorded failed stage and safely falls back to collection', () => {
    expect(__testOnly.retryableStage('summaries')).toBe('summaries')
    expect(__testOnly.retryableStage('finalizing')).toBe('finalizing')
    expect(__testOnly.retryableStage('failed')).toBe('collecting')
    expect(__testOnly.retryableStage(undefined)).toBe('collecting')
  })
})
