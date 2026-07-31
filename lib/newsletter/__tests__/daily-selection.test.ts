import { describe, expect, it } from 'vitest'
import {
  isDailySourceFresh,
  selectDailyNewsletterCandidates,
  type DailyGeneratedSummaryRow,
  type DailyWiimCandidateRow,
} from '../daily-selection'

function candidate(
  rank: number,
  overrides: Partial<DailyWiimCandidateRow> = {},
): DailyWiimCandidateRow {
  const ticker = overrides.ticker ?? `T${rank}`
  return {
    id: `candidate-${rank}`,
    wiim_run_id: 'wiim-run',
    rank,
    ticker,
    headline: `${ticker} beats estimates and raises full-year guidance`,
    why_it_matters: `${ticker} is moving +5%. Finviz points to a guidance raise.`,
    confidence_score: 60,
    candidate_type: 'newsletter',
    state_label: 'new',
    signals_json: {
      movePercent: 5,
      moveAbsPercent: 5,
      hasNews: true,
      newsCount: 2,
      hasEarnings: true,
      hasFinvizCatalyst: true,
      finvizFreshnessMinutes: 30,
      wasRecentlyPicked: false,
    },
    source_refs_json: [
      {
        kind: 'earnings',
        label: `${ticker} earnings`,
        publishedAt: '2026-07-29',
      },
      {
        kind: 'finviz',
        label: `${ticker} raises guidance`,
        publishedAt: '2026-07-29T07:00:00Z',
      },
    ],
    metadata_json: {
      name: `${ticker} Company`,
      price: 100 + rank,
      change: 5,
      changesPercentage: 5,
    },
    ...overrides,
  }
}

function summary(symbol: string): DailyGeneratedSummaryRow {
  return {
    symbol,
    summary_text: `${symbol} delivered an earnings beat and raised guidance.`,
    no_summary_reason: null,
    generated_at: '2026-07-29T11:00:00Z',
    model: 'gpt-5-nano',
    run_id: 'fin_quote_daily_2026-07-29',
    winning_event: {
      title: `${symbol} results`,
      publishedDate: '2026-07-29T10:00:00Z',
    },
    metadata: {
      source: 'fin_quote_generated_daily',
      reason_type: 'earnings',
      key_fact: 'Guidance increased.',
    },
  }
}

describe('daily newsletter selection', () => {
  it('recognizes market-date freshness without timezone drift', () => {
    expect(isDailySourceFresh('2026-07-29T23:30:00Z', '2026-07-29', 0)).toBe(true)
    expect(isDailySourceFresh('2026-07-22', '2026-07-29', 7)).toBe(true)
    expect(isDailySourceFresh('2026-07-21', '2026-07-29', 7)).toBe(false)
    expect(isDailySourceFresh('2026-07-30', '2026-07-29', 7)).toBe(false)
  })

  it('selects a requested 30-50 candidate batch and prioritizes strong evidence', () => {
    const rows = Array.from({ length: 45 }, (_, index) => candidate(index + 1))
    rows[0] = candidate(1, {
      ticker: 'OLD',
      signals_json: {
        movePercent: 8,
        moveAbsPercent: 8,
        hasNews: true,
        newsCount: 3,
        hasEarnings: true,
        hasFinvizCatalyst: true,
        wasRecentlyPicked: true,
      },
    })

    const selected = selectDailyNewsletterCandidates({
      candidateRows: rows,
      summaryRows: rows.slice(1).map((row) => summary(row.ticker!)),
      marketDate: '2026-07-29',
      targetCount: 40,
    })

    expect(selected).toHaveLength(40)
    expect(selected.some((item) => item.ticker === 'OLD')).toBe(false)
    expect(selected.every((item) => item.qualityBand === 'strong')).toBe(true)
    expect(selected.map((item) => item.rank)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    )
  })

  it('rejects stale summaries and candidates without current evidence', () => {
    const row = candidate(1, {
      ticker: 'STALE',
      headline: 'STALE is moving +5%',
      source_refs_json: [{ kind: 'market_data', label: 'STALE +5%' }],
      signals_json: {
        movePercent: 5,
        moveAbsPercent: 5,
        hasNews: false,
        newsCount: 0,
        hasEarnings: false,
        hasFinvizCatalyst: false,
        wasRecentlyPicked: false,
      },
    })
    const staleSummary = {
      ...summary('STALE'),
      winning_event: { publishedDate: '2026-06-01' },
    }

    expect(
      selectDailyNewsletterCandidates({
        candidateRows: [row],
        summaryRows: [staleSummary],
        marketDate: '2026-07-29',
        targetCount: 30,
      }),
    ).toEqual([])
  })

  it('rejects generated prose that contradicts the current price direction', () => {
    const row = candidate(1, {
      ticker: 'TYL',
      why_it_matters:
        'TYL is moving +7.2%. Finviz points to stronger public-sector demand..',
      signals_json: {
        movePercent: 7.2,
        moveAbsPercent: 7.2,
        hasNews: true,
        newsCount: 2,
        hasEarnings: false,
        hasFinvizCatalyst: true,
        wasRecentlyPicked: false,
      },
    })
    const contradictory = {
      ...summary('TYL'),
      summary_text:
        'TYL shares plunged after the company lowered full-year guidance.',
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [contradictory],
      marketDate: '2026-07-29',
      targetCount: 30,
    })

    expect(selected).toHaveLength(1)
    expect(selected[0]?.summaryText).toBe(
      'stronger public-sector demand.',
    )
    expect(selected[0]?.summaryText).not.toContain('..')
  })

  it('rejects generated summaries that end mid-thought', () => {
    const row = candidate(1, {
      ticker: 'CVNA',
      why_it_matters:
        'CVNA is moving +3.4%. Finviz points to earnings after the close.',
    })
    const truncated = {
      ...summary('CVNA'),
      summary_text: 'Carvana is expanding its retail footprint and growing rev...',
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [truncated],
      marketDate: '2026-07-29',
      targetCount: 30,
    })

    expect(selected[0]?.summaryText).toBe('earnings after the close.')
  })
})
