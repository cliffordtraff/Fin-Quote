import { describe, expect, it } from 'vitest'
import { buildDailyNewsletterDraft } from '../daily-draft'
import type { NewsletterDailyCandidate } from '../daily-types'

const candidate: NewsletterDailyCandidate = {
  sourceCandidateId: 'candidate-1',
  sourceWiimRunId: 'wiim-1',
  rank: 1,
  ticker: 'ACME',
  companyName: 'Acme Holdings',
  headline: 'Acme beats estimates and raises full-year guidance',
  summaryText: 'Acme reported a clean earnings beat with stronger margins.',
  keyFact: 'Full-year EPS guidance increased to $5.20-$5.40.',
  reasonType: 'earnings',
  confidenceScore: 82,
  relevanceScore: 96,
  candidateType: 'newsletter',
  stateLabel: 'new',
  qualityBand: 'strong',
  movePercent: 8.25,
  price: 123.45,
  change: 9.42,
  sourceRefs: [
    {
      kind: 'news',
      label: 'Acme results',
      url: 'https://example.com/acme',
      publishedAt: '2026-07-29',
    },
  ],
  candidateMetadata: {
    name: 'Acme Holdings',
    price: 123.45,
    change: 9.42,
  },
}

describe('daily newsletter draft builder', () => {
  it('builds a complete reviewable issue with provenance and a chart', () => {
    const draft = buildDailyNewsletterDraft({
      runId: 'run-1',
      itemId: 'item-1',
      sourceWiimRunId: 'wiim-1',
      marketDate: '2026-07-29',
      candidate,
      chart: {
        id: 'chart-1',
        ownerId: null,
        sessionId: 'session-1',
        title: 'ACME price',
        symbol: 'ACME',
        chartSpec: {
          mode: 'price',
          symbol: 'ACME',
          range: '1m',
          interval: 'D',
          chartType: 'candles',
        },
        chartImageUrl: '/newsletter-charts/acme.png',
        thumbnailUrl: '/newsletter-charts/acme.png',
        chartExportUrl: 'https://charts.example/acme',
        createdAt: '2026-07-29T11:00:00Z',
        updatedAt: '2026-07-29T11:00:00Z',
      },
    })

    expect(draft.subjectLine).toContain('ACME up 8.3%')
    expect(draft.source?.type).toBe('daily_batch')
    expect(draft.source?.attachedChartIds).toEqual(['chart-1'])
    expect(draft.blocks[0].chartNeedsRegeneration).toBe(false)
    expect(draft.blocks[0].body).toContain('What to watch')
    expect(draft.blocks[0].body).toContain(
      'raises full-year guidance. The stock is +8.25%',
    )
    expect(draft.header?.logoUrl).toBe('')
    expect(draft.header?.logoUrls).toEqual([])
  })

  it('creates a recoverable attention draft when chart capture fails', () => {
    const draft = buildDailyNewsletterDraft({
      runId: 'run-1',
      itemId: 'item-1',
      sourceWiimRunId: 'wiim-1',
      marketDate: '2026-07-29',
      candidate,
      chart: null,
      warning: 'Chart render unavailable.',
    })

    expect(draft.source?.automationStatus).toBe('needs_chart')
    expect(draft.blocks[0].chartNeedsRegeneration).toBe(true)
    expect(draft.blocks[0].chartImageUrl).toMatch(/^data:image\/svg\+xml/)
  })
})
