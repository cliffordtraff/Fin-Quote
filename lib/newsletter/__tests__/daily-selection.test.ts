import { describe, expect, it } from 'vitest'
import {
  isDailySummaryDirectionCompatible,
  isDailySourceFresh,
  selectDailyNewsletterCandidates,
  type DailyGeneratedSummaryRow,
  type DailyWiimCandidateRow,
} from '../daily-selection'
import { getSP500Constituent, SP500_SYMBOLS } from '@/lib/sp500'

const testSymbols = [...SP500_SYMBOLS].slice(0, 60)

function candidate(
  rank: number,
  overrides: Partial<DailyWiimCandidateRow> = {},
): DailyWiimCandidateRow {
  const ticker = overrides.ticker ?? testSymbols[(rank - 1) % testSymbols.length]
  const companyName = getSP500Constituent(ticker)?.name ?? ticker
  return {
    id: `candidate-${rank}`,
    wiim_run_id: 'wiim-run',
    rank,
    ticker,
    headline: `${companyName} beats estimates and raises full-year guidance`,
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
        label: `${companyName} reports quarterly earnings`,
        publishedAt: '2026-07-29',
      },
      {
        kind: 'finviz',
        label: `${companyName} raises full-year guidance`,
        publishedAt: '2026-07-29T07:00:00Z',
      },
    ],
    metadata_json: {
      name: companyName,
      price: 100 + rank,
      change: 5,
      changesPercentage: 5,
    },
    ...overrides,
  }
}

function summary(symbol: string): DailyGeneratedSummaryRow {
  const companyName = getSP500Constituent(symbol)?.name ?? symbol
  return {
    symbol,
    summary_text: `${companyName} delivered an earnings beat and raised guidance.`,
    no_summary_reason: null,
    generated_at: '2026-07-29T11:00:00Z',
    model: 'gpt-5-nano',
    run_id: 'fin_quote_daily_2026-07-29',
    winning_event: {
      title: `${companyName} reports quarterly results`,
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
    expect(
      isDailySourceFresh('2026-07-30T02:30:00Z', '2026-07-29', 0),
    ).toBe(true)
    expect(
      isDailySourceFresh('2026-07-29T02:30:00Z', '2026-07-29', 0),
    ).toBe(false)
    expect(
      isDailySourceFresh('2026-07-29T02:30:00Z', '2026-07-29', 1),
    ).toBe(true)
  })

  it('selects a requested 30-50 candidate batch and prioritizes strong evidence', () => {
    const rows = Array.from({ length: 45 }, (_, index) => candidate(index + 1))
    rows[0] = candidate(1, {
      ticker: testSymbols[0],
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
    expect(selected.some((item) => item.ticker === testSymbols[0])).toBe(false)
    expect(selected.every((item) => item.qualityBand === 'strong')).toBe(true)
    expect(selected.map((item) => item.rank)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    )
  })

  it('rejects stale summaries and candidates without current evidence', () => {
    const row = candidate(1, {
      ticker: 'AAPL',
      headline: 'Apple is moving +5%',
      source_refs_json: [{ kind: 'market_data', label: 'Apple +5%' }],
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
      ...summary('AAPL'),
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
      'Tyler Technologies beats estimates and raises full-year guidance',
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

    expect(selected[0]?.summaryText).toBe(
      'Carvana Co. beats estimates and raises full-year guidance',
    )
  })

  it('replaces the MTCH / Triple Match 3D collision with validated summary evidence', () => {
    const row = candidate(1, {
      ticker: 'MTCH',
      headline: 'Huya launches Triple Match 3D mobile game worldwide',
      source_refs_json: [
        {
          kind: 'news',
          label: 'Huya launches Triple Match 3D mobile game worldwide',
          url: 'https://example.com/huya',
          publishedAt: '2026-07-29T09:00:00Z',
        },
      ],
      metadata_json: {
        name: 'Match Group, Inc.',
        price: 34,
        change: -2,
        changesPercentage: -5.5,
      },
    })
    const mtchSummary = {
      ...summary('MTCH'),
      summary_text:
        'Match Group cut its outlook after weaker Tinder performance.',
      winning_event: {
        title: 'Match Group cuts outlook after second-quarter results',
        url: 'https://example.com/mtch-results',
        publishedDate: '2026-07-29T10:00:00Z',
      },
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [mtchSummary],
      marketDate: '2026-07-29',
      targetCount: 30,
    })

    expect(selected[0]?.headline).toBe(
      'Match Group cuts outlook after second-quarter results',
    )
    expect(selected[0]?.sourceRefs[0]?.url).toBe(
      'https://example.com/mtch-results',
    )
    expect(selected[0]?.sourceRefs.map((source) => source.url)).not.toContain(
      'https://example.com/huya',
    )
  })

  it('rejects a generated summary whose selected event belongs to another entity', () => {
    const row = candidate(1, {
      ticker: 'MTCH',
      headline: 'Huya launches Triple Match 3D mobile game worldwide',
      source_refs_json: [
        {
          kind: 'news',
          label: 'Huya launches Triple Match 3D mobile game worldwide',
          url: 'https://example.com/huya',
          publishedAt: '2026-07-29T09:00:00Z',
        },
      ],
      metadata_json: {
        name: 'Match Group, Inc.',
        price: 34,
        change: -2,
        changesPercentage: -5.5,
      },
    })
    const mismatchedSummary = {
      ...summary('MTCH'),
      summary_text: 'Match Group fell after a mobile-game launch.',
      winning_event: {
        title: 'Huya launches Triple Match 3D mobile game worldwide',
        url: 'https://example.com/huya',
        publishedDate: '2026-07-29T10:00:00Z',
      },
    }

    expect(
      selectDailyNewsletterCandidates({
        candidateRows: [row],
        summaryRows: [mismatchedSummary],
        marketDate: '2026-07-29',
        targetCount: 30,
      }),
    ).toEqual([])
  })

  it('falls back from a newer mismatched summary to valid ticker evidence', () => {
    const row = candidate(1, {
      ticker: 'MTCH',
      headline: 'Match Group announces second-quarter results',
      source_refs_json: [],
      metadata_json: {
        name: 'Match Group, Inc.',
        price: 34,
        change: -2,
        changesPercentage: -5.5,
      },
    })
    const contaminated = {
      ...summary('MTCH'),
      generated_at: '2026-08-06T14:00:00Z',
      run_id: 'fin_quote_daily_2026-08-06',
      summary_text: 'Huya launched a new mobile game.',
      winning_event: {
        title: 'Huya launches Triple Match 3D mobile game worldwide',
        url: 'https://example.com/huya',
        publishedDate: '2026-08-06T13:00:00Z',
      },
    }
    const valid = {
      ...summary('MTCH'),
      generated_at: '2026-08-05T14:00:00Z',
      run_id: 'fin_quote_daily_2026-08-05',
      summary_text:
        'Match Group reported second-quarter results and updated its outlook.',
      winning_event: {
        title: 'Match Group announces second-quarter results',
        url: 'https://example.com/mtch-results',
        publishedDate: '2026-08-04T20:11:00Z',
      },
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [contaminated, valid],
      marketDate: '2026-08-06',
      targetCount: 30,
    })

    expect(selected[0]?.headline).toBe(
      'Match Group announces second-quarter results',
    )
    expect(selected[0]?.summaryText).toContain('Match Group reported')
    expect(selected[0]?.sourceRefs.map((source) => source.url)).toEqual([
      'https://example.com/mtch-results',
    ])
  })

  it('does not borrow a fresh date from an unrelated candidate-pool event', () => {
    const row = candidate(1, {
      ticker: 'AAPL',
      headline: 'Apple reports quarterly results and updates guidance',
      source_refs_json: [
        {
          kind: 'news',
          label: 'Apple reports quarterly results and updates guidance',
          url: 'https://example.com/apple-current',
          publishedAt: '2026-08-06T12:00:00Z',
        },
      ],
    })
    const laundered = {
      ...summary('AAPL'),
      summary_text: 'Apple completed an old stock split.',
      winning_event: {
        title: 'Apple completes four-for-one stock split',
        url: 'https://example.com/apple-old',
      },
      metadata: {
        source: 'fin_quote_generated_daily',
        candidate_pool: [
          {
            title: 'Microsoft announces new cloud region',
            url: 'https://example.com/msft-current',
            publishedDate: '2026-08-06T12:00:00Z',
          },
          {
            title: 'Apple completes four-for-one stock split',
            url: 'https://example.com/apple-old',
            publishedDate: '2020-08-31T12:00:00Z',
          },
        ],
      },
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [laundered],
      marketDate: '2026-08-06',
      targetCount: 30,
    })

    expect(selected[0]?.summaryText).toBe(
      'Apple reports quarterly results and updates guidance',
    )
    expect(selected[0]?.summaryText).not.toContain('stock split')
  })

  it('never reuses unvalidated why-it-matters prose as fallback copy', () => {
    const row = candidate(1, {
      ticker: 'MTCH',
      headline: 'Match Group announces second-quarter results',
      why_it_matters:
        'MTCH is moving -5%. Huya launched Triple Match 3D worldwide.',
      source_refs_json: [
        {
          kind: 'news',
          label: 'Match Group announces second-quarter results',
          url: 'https://example.com/mtch-results',
          publishedAt: '2026-08-04T20:13:06Z',
        },
      ],
    })

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [],
      marketDate: '2026-08-06',
      targetCount: 30,
    })

    expect(selected[0]?.summaryText).toBe(
      'Match Group announces second-quarter results',
    )
    expect(selected[0]?.summaryText).not.toMatch(/Huya|Triple Match/i)
  })

  it('uses the emitted move for direction validation and the first price verb', () => {
    const row = candidate(1, {
      ticker: 'AAPL',
      metadata_json: {
        name: 'Wrong persisted identity',
        changesPercentage: -5,
      },
      signals_json: {
        movePercent: null,
        moveAbsPercent: 5,
        hasNews: true,
        newsCount: 1,
        hasEarnings: true,
        hasFinvizCatalyst: false,
        wasRecentlyPicked: false,
      },
    })
    const rising = {
      ...summary('AAPL'),
      summary_text: 'Apple shares rose after reporting quarterly results.',
    }

    const selected = selectDailyNewsletterCandidates({
      candidateRows: [row],
      summaryRows: [rising],
      marketDate: '2026-07-29',
      targetCount: 30,
    })

    expect(selected[0]?.movePercent).toBe(-5)
    expect(selected[0]?.summaryText).not.toContain('shares rose')
    expect(
      isDailySummaryDirectionCompatible(
        'Shares fell but EPS rose year over year.',
        'AAPL',
        -5,
        'Apple Inc.',
      ),
    ).toBe(true)
  })

  it('rejects a non-S&P identity even when its prose looks valid', () => {
    expect(
      selectDailyNewsletterCandidates({
        candidateRows: [candidate(1, { ticker: 'ACME' })],
        summaryRows: [],
        marketDate: '2026-07-29',
        targetCount: 30,
      }),
    ).toEqual([])
  })
})
