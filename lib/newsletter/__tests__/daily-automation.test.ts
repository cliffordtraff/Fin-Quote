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

  it('turns the persisted WIIM snapshot into a durable two-sided editorial inbox', () => {
    const rankedCandidates = [
      ['AAA', 12, 'Alpha', 'found'],
      ['BBB', -9, 'Beta', 'found'],
      ['CCC', 7, 'Gamma', 'missing'],
      ['DDD', -5, 'Delta', 'found'],
      ['FLAT', 0, 'Flat', 'found'],
    ].map(([symbol, move, name, catalyst], index) => ({
      rank: index + 1,
      ticker: symbol,
      metadata: {
        symbol,
        name,
        price: 100 + index,
        change: Number(move),
        changesPercentage: Number(move),
        topNews: [],
        whyMoving:
          catalyst === 'found'
            ? {
                symbol,
                status: 'found',
                displayText: `${symbol} catalyst`,
                headline: `${symbol} moved`,
                summary: null,
                bulletPoints: [],
                sentiment: null,
                source: 'finviz',
                sourceTimestamp: null,
                isCatalyst: true,
                sourceUrl: 'https://example.com',
                fetchedAt: '2026-08-07T14:30:00.000Z',
                errorMessage: null,
              }
            : null,
      },
    }))

    const discoveries = __testOnly.buildWhyMovedDiscoveriesFromWiim({
      rankedCandidates: rankedCandidates as never,
      marketDate: '2026-08-07',
      session: 'cash',
      generatedAt: '2026-08-07T14:30:00.000Z',
      limitPerDirection: 2,
    })

    expect(discoveries.map(({ candidate }) => candidate.symbol)).toEqual([
      'AAA',
      'CCC',
      'BBB',
      'DDD',
    ])
    expect(discoveries[0].candidate.reviewKey).toBe(
      '2026-08-07:cash:gainer:AAA',
    )
    expect(discoveries[2].candidate.direction).toBe('loser')
    expect(discoveries[1].catalyst).toMatchObject({
      symbol: 'CCC',
      status: 'not_found',
      fetchedAt: '2026-08-07T14:30:00.000Z',
    })
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

  it('treats a thin candidate universe as an editorial exception, not a retryable stage error', () => {
    // Retrying cannot manufacture stories the market did not produce, so this
    // must not burn the stage-error budget and strand the run in `failed`
    // (which pins the health endpoint at 503 for the rest of the day).
    expect(
      __testOnly.isNewsletterQualityGateShortfall(
        'newsletters',
        'Only 16 candidates passed the current-news quality gate; 40 are required for this run.',
      ),
    ).toBe(true)
  })

  it('keeps genuine stage failures on the retry path', () => {
    expect(
      __testOnly.isNewsletterQualityGateShortfall(
        'newsletters',
        'Could not load WIIM candidates: connection reset',
      ),
    ).toBe(false)
    // Same message from a different stage is not the editorial shortfall.
    expect(
      __testOnly.isNewsletterQualityGateShortfall(
        'summaries',
        'Only 16 candidates passed the current-news quality gate; 40 are required for this run.',
      ),
    ).toBe(false)
  })
})
