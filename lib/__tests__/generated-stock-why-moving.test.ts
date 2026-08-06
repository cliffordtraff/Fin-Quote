import { describe, expect, it } from 'vitest'

import {
  __testOnly,
  filterEntityMatchedSummaryNews,
  filterTimelySummaryNews,
  hasRecentEntityMatchedSummaryNews,
  mergeSummaryNews,
  WIIM_SUMMARY_MAX_CHARACTERS,
  WIIM_SUMMARY_NEWS_LOOKBACK_DAYS,
} from '@/lib/generated-stock-why-moving'

function news(publishedDate: string) {
  return {
    title: publishedDate,
    text: '',
    url: `https://example.com/${publishedDate}`,
    image: null,
    publishedDate,
    site: 'Example',
    symbol: 'AAPL',
  }
}

describe('generated stock why moving JSON parsing', () => {
  it('parses clean JSON responses', () => {
    const parsed = __testOnly.parseJsonObject(`{
      "summary": "Shares rose after earnings beat.",
      "key_fact": "EPS beat consensus.",
      "reason_type": "earnings",
      "no_summary_reason": null
    }`)

    expect(parsed.summary).toBe('Shares rose after earnings beat.')
    expect(parsed.reason_type).toBe('earnings')
  })

  it('salvages malformed backslashes from model JSON', () => {
    const parsed = __testOnly.parseJsonObject(String.raw`{
      "summary": "Shares moved after management cited growth in C:\\new\\segment and analyst support.",
      "key_fact": "Expansion in C:\\new\\segment.",
      "reason_type": "other",
      "no_summary_reason": null
    }`)

    expect(parsed.summary).toBe('Shares moved after management cited growth in C:\\new\\segment and analyst support.')
    expect(parsed.key_fact).toBe('Expansion in C:\\new\\segment.')
  })

  it('strips code fences and trailing commas', () => {
    const fencedPayload = [
      '```json',
      '{',
      '  "summary": null,',
      '  "key_fact": null,',
      '  "reason_type": "unclear",',
      '  "no_summary_reason": "quiet_tape",',
      '}',
      '```',
    ].join('\n')
    const parsed = __testOnly.parseJsonObject(fencedPayload)

    expect(parsed.summary).toBeNull()
    expect(parsed.no_summary_reason).toBe('quiet_tape')
  })

  it('truncates long summaries at a complete word', () => {
    const summary = __testOnly.normalizeSummaryText(
      `A ${'complete '.repeat(40)}sentence.`,
    )

    expect(summary?.length).toBeLessThanOrEqual(WIIM_SUMMARY_MAX_CHARACTERS)
    expect(summary).toMatch(/complete\.\.\.$/)
  })

  it('requires generated summaries to identify the selected company', () => {
    const input = {
      symbol: 'MTCH',
      companyName: 'Match Group, Inc.',
      sourceMatchesEntity: true,
    }

    expect(
      __testOnly.resolveEntityAnchoredSummary({
        ...input,
        value: 'Match reported Q2 revenue in line with expectations.',
      }),
    ).toBeNull()
    expect(
      __testOnly.resolveEntityAnchoredSummary({
        ...input,
        value: 'Match Group reported Q2 revenue in line with expectations.',
      }),
    ).toBe('Match Group reported Q2 revenue in line with expectations.')
    expect(
      __testOnly.resolveEntityAnchoredSummary({
        ...input,
        value: 'MTCH reported Q2 revenue in line with expectations.',
      }),
    ).toBe('MTCH reported Q2 revenue in line with expectations.')
    expect(
      __testOnly.resolveEntityAnchoredSummary({
        ...input,
        sourceMatchesEntity: false,
        value: 'Match Group reported Q2 revenue in line with expectations.',
      }),
    ).toBeNull()
  })
})

describe('generated stock why moving news window', () => {
  it('keeps only news from the report date and configured lookback window', () => {
    const filtered = filterTimelySummaryNews([
      news('2026-07-29T12:00:00Z'),
      news('2026-07-22T12:00:00Z'),
      news('2026-07-21T12:00:00Z'),
      news('2026-07-30T12:00:00Z'),
    ], '2026-07-29')

    expect(WIIM_SUMMARY_NEWS_LOOKBACK_DAYS).toBe(7)
    expect(filtered.map((item) => item.publishedDate)).toEqual([
      '2026-07-29T12:00:00Z',
      '2026-07-22T12:00:00Z',
    ])
  })

  it('uses the Eastern calendar date near the UTC day boundary', () => {
    const filtered = filterTimelySummaryNews([
      news('2026-07-30T02:30:00Z'),
      news('2026-07-29 12:00:00'),
      news('not-a-date'),
    ], '2026-07-29')

    expect(filtered.map((item) => item.publishedDate)).toEqual([
      '2026-07-30T02:30:00Z',
      '2026-07-29 12:00:00',
    ])
  })

  it('drops unrelated same-day stories before deciding whether fallback news is needed', () => {
    const primaryNews = [
        {
          ...news('2026-08-06T12:00:00Z'),
          title: 'Huya launches Triple Match 3D mobile game worldwide',
          symbol: 'MTCH',
        },
      ]
    const fallbackNews = [
      {
          ...news('2026-08-04T20:11:00Z'),
          title: 'Match Group Announces Second Quarter Results',
          symbol: 'MTCH',
        },
    ]
    const filtered = filterEntityMatchedSummaryNews(
      [...primaryNews, ...fallbackNews],
      'MTCH',
      'Match Group, Inc.',
    )

    expect(filtered.map((item) => item.title)).toEqual([
      'Match Group Announces Second Quarter Results',
    ])
    expect(
      hasRecentEntityMatchedSummaryNews(
        primaryNews,
        'MTCH',
        'Match Group, Inc.',
        '2026-08-06',
      ),
    ).toBe(false)
    expect(
      hasRecentEntityMatchedSummaryNews(
        fallbackNews,
        'MTCH',
        'Match Group, Inc.',
        '2026-08-06',
      ),
    ).toBe(true)
  })

  it('merges fallback reporting without discarding valid primary news', () => {
    const primary = {
      ...news('2026-08-02T12:00:00Z'),
      title: 'Apple previews a developer event',
      url: 'https://example.com/apple-primary',
    }
    const fallback = {
      ...news('2026-08-06T12:00:00Z'),
      title: 'Apple reports quarterly results',
      url: 'https://example.com/apple-fallback',
    }
    const duplicate = { ...fallback, site: 'Syndicator' }

    expect(
      mergeSummaryNews([primary], [fallback, duplicate]).map(
        (item) => item.url,
      ),
    ).toEqual([
      'https://example.com/apple-fallback',
      'https://example.com/apple-primary',
    ])
  })
})

describe('generated stock why moving SEC fallback', () => {
  it('prefers a results exhibit and extracts a useful primary-source title', () => {
    expect(
      __testOnly.selectSecFilingDocument(
        ['mtch-20260804.htm', 'mtch8-k20260804ex991.htm', 'a1.jpg'],
        'mtch-20260804.htm',
      ),
    ).toBe('mtch8-k20260804ex991.htm')

    const text = __testOnly.decodeSecHtml(
      '<h1>Exhibit 99.1</h1><p>Match Group Announces Second Quarter Results</p><p>Revenue was $853 million &amp; EBITDA improved.</p>',
    )
    expect(text).toContain('Revenue was $853 million & EBITDA improved.')
    expect(__testOnly.secNewsTitle('Match Group, Inc.', '8-K', text)).toBe(
      'Match Group Announces Second Quarter Results',
    )
  })
})
