import { describe, expect, it } from 'vitest'
import { selectNewsletterRecommendedIssues } from '../shortlist'
import type { NewsletterDailyRunItem } from '../daily-types'

function item(
  rank: number,
  overrides: Partial<NewsletterDailyRunItem> = {},
): NewsletterDailyRunItem {
  return {
    id: `item-${rank}`,
    runId: 'run-1',
    rank,
    ticker: `T${rank}`,
    status: 'ready',
    qualityBand: 'strong',
    relevanceScore: 90 - rank,
    confidenceScore: 80 - rank,
    candidateType: 'newsletter',
    stateLabel: 'new',
    movePercent: rank,
    reasonType: 'earnings',
    headline: `Story ${rank}`,
    summaryText: `Summary ${rank}`,
    keyFact: null,
    sourceRefs: [],
    candidateMetadata: {},
    draftId: `draft-${rank}`,
    draftStatus: 'ready',
    chartId: `chart-${rank}`,
    chartImageUrl: `https://example.com/${rank}.png`,
    subjectLine: `Subject ${rank}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-07-30T10:00:00Z',
    updatedAt: '2026-07-30T10:00:00Z',
    ...overrides,
  }
}

describe('newsletter recommended issues', () => {
  it('selects three to five strong actionable issues in editorial order', () => {
    const result = selectNewsletterRecommendedIssues([
      item(3),
      item(1),
      item(2),
      item(4),
      item(5),
      item(6),
    ])

    expect(result).toHaveLength(5)
    expect(result.map((entry) => entry.ticker)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
    ])
    expect(result[0].reason).toContain('Highest-ranked story')
  })

  it('excludes review-band, failed, and draftless issues', () => {
    const result = selectNewsletterRecommendedIssues([
      item(1, { qualityBand: 'review' }),
      item(2, { status: 'failed' }),
      item(3, { draftId: null }),
      item(4),
      item(5),
      item(6),
    ])

    expect(result.map((entry) => entry.ticker)).toEqual(['T4', 'T5', 'T6'])
  })
})
