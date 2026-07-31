import { describe, expect, it } from 'vitest'

import {
  __testOnly,
  filterTimelySummaryNews,
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
})
