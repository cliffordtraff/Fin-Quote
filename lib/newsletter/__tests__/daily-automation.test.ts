import { describe, expect, it } from 'vitest'
import {
  __testOnly,
  getNewsletterAutomationClock,
  getNewsletterAutomationStageLabel,
  getNewsletterAutomationWindow,
  NewsletterDailyTerminalReconciliationError,
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

  it('detects repaired terminal child state and derives a clean 40 of 40 completion', () => {
    const parent = {
      status: 'partial',
      newsletterScopeCount: 1,
      newsletterCompletedScopeCount: 0,
      newsletterSelectedCount: 40,
      newsletterGeneratedCount: 40,
      newsletterReadyCount: 39,
      newsletterAttentionCount: 1,
      newsletterFailedCount: 0,
      finvizErrorCount: 0,
      summaryErrorCount: 0,
    } as never
    const items = Array.from({ length: 40 }, () => ({
      run_id: 'child-1',
      status: 'ready',
      retry_count: 0,
    }))
    const aggregate = __testOnly.aggregateNewsletterDailyTerminalState(
      ['child-1'],
      [{
        id: 'child-1',
        status: 'completed',
        selected_count: 40,
        generated_count: 40,
        ready_count: 40,
        attention_count: 0,
        failed_count: 0,
      }],
      items,
      parent,
    )

    expect(aggregate).toMatchObject({
      selectedCount: 40,
      generatedCount: 40,
      readyCount: 40,
      attentionCount: 0,
      failedCount: 0,
      completedScopeCount: 1,
      finalStatus: 'completed',
    })
    expect(__testOnly.hasNewsletterDailyTerminalDrift(parent, aggregate)).toBe(
      true,
    )
  })

  it('leaves matching terminal child state alone', () => {
    const parent = {
      status: 'completed',
      newsletterScopeCount: 1,
      newsletterCompletedScopeCount: 1,
      newsletterSelectedCount: 40,
      newsletterGeneratedCount: 40,
      newsletterReadyCount: 40,
      newsletterAttentionCount: 0,
      newsletterFailedCount: 0,
      finvizErrorCount: 0,
      summaryErrorCount: 0,
    } as never
    const aggregate = __testOnly.aggregateNewsletterDailyTerminalState(
      ['child-1'],
      [{
        id: 'child-1',
        status: 'completed',
        selected_count: 40,
        generated_count: 40,
        ready_count: 40,
        attention_count: 0,
        failed_count: 0,
      }],
      Array.from({ length: 40 }, () => ({
        run_id: 'child-1',
        status: 'ready',
        retry_count: 0,
      })),
      parent,
    )

    expect(__testOnly.hasNewsletterDailyTerminalDrift(parent, aggregate)).toBe(
      false,
    )
  })

  it('uses durable child-run counters even when an item row is missing', () => {
    const parent = {
      status: 'completed',
      newsletterScopeCount: 1,
      newsletterCompletedScopeCount: 1,
      newsletterSelectedCount: 40,
      newsletterGeneratedCount: 40,
      newsletterReadyCount: 40,
      newsletterAttentionCount: 0,
      newsletterFailedCount: 0,
      finvizErrorCount: 0,
      summaryErrorCount: 0,
    } as never
    const aggregate = __testOnly.aggregateNewsletterDailyTerminalState(
      ['child-1'],
      [{
        id: 'child-1',
        status: 'completed',
        selected_count: 40,
        generated_count: 40,
        ready_count: 40,
        attention_count: 0,
        failed_count: 0,
      }],
      Array.from({ length: 39 }, () => ({
        run_id: 'child-1',
        status: 'ready',
        retry_count: 0,
      })),
      parent,
    )

    expect(aggregate.selectedCount).toBe(40)
    expect(aggregate.readyCount).toBe(40)
    expect(__testOnly.hasNewsletterDailyTerminalDrift(parent, aggregate)).toBe(
      false,
    )
  })

  it('fails closed when a metadata-mapped child run is absent', () => {
    expect(() =>
      __testOnly.assertMappedNewsletterDailyRuns(
        ['child-1', 'missing-child'],
        [{
          id: 'child-1',
          status: 'completed',
          selected_count: 40,
          generated_count: 40,
          ready_count: 40,
          attention_count: 0,
          failed_count: 0,
        }],
      ),
    ).toThrow('missing mapped child runs: missing-child')
    expect(() =>
      __testOnly.assertMappedNewsletterDailyRuns(['missing-child'], []),
    ).toThrow(NewsletterDailyTerminalReconciliationError)
  })
})
