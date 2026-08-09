import { describe, expect, it } from 'vitest'
import { buildDailyNewsletterDraft } from '../daily-draft'
import type { NewsletterDailyCandidate } from '../daily-types'
import { hashNewsletterChartScene } from '../chart-provenance'

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
    const chartSpec = {
      mode: 'price' as const,
      symbol: 'ACME',
      range: '1m' as const,
      interval: 'D' as const,
      chartType: 'candles' as const,
      chartExportSpec: {
        symbol: 'ACME',
        range: '1m' as const,
        interval: 'D' as const,
        chartType: 'candles' as const,
        viewportTimeRange: { startTime: 1, endTime: 2 },
        dataTimeRange: { startTime: 1, endTime: 2 },
      },
    }
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
        chartSpec,
        chartImageUrl: '/newsletter-charts/acme.png',
        thumbnailUrl: '/newsletter-charts/acme.png',
        chartExportUrl: 'https://charts.example/acme',
        capturedAt: '2026-07-29T11:00:00Z',
        rendererContract: 'the-intraday-newsletter-chart/v1',
        sceneHash: hashNewsletterChartScene(chartSpec),
        imageSha256: 'b'.repeat(64),
        createdAt: '2026-07-29T11:00:00Z',
        updatedAt: '2026-07-29T11:00:00Z',
      },
    })

    expect(draft.subjectLine).toContain('ACME up 8.3%')
    expect(draft.subjectLine.length).toBeLessThanOrEqual(60)
    expect(draft.subjectLine).not.toMatch(/(?:\.{3}|…)$/)
    expect(draft.source?.type).toBe('daily_batch')
    expect(draft.source?.attachedChartIds).toEqual(['chart-1'])
    expect(draft.blocks[0].chartNeedsRegeneration).toBe(false)
    expect(draft.blocks[0].body).toContain('What to watch')
    expect(draft.blocks[0].body).toContain(
      'raises full-year guidance. The stock is +8.25%',
    )
    expect(draft.blocks[0].ctaText).toBe('View cited source')
    expect(draft.header?.logoUrl).toBe('')
    expect(draft.header?.logoUrls).toEqual([])
  })

  it('marks a same-day legacy chart for recapture instead of claiming completion', () => {
    const chartSpec = {
      mode: 'price' as const,
      symbol: 'ACME',
      range: '1m' as const,
      interval: 'D' as const,
      chartType: 'candles' as const,
    }
    const draft = buildDailyNewsletterDraft({
      runId: 'run-1',
      itemId: 'item-1',
      sourceWiimRunId: 'wiim-1',
      marketDate: '2026-07-29',
      candidate,
      chart: {
        id: 'legacy-chart',
        ownerId: null,
        sessionId: 'session-1',
        title: 'Legacy ACME price',
        symbol: 'ACME',
        chartSpec,
        chartImageUrl: 'https://assets.example/legacy-acme.png',
        thumbnailUrl: 'https://assets.example/legacy-acme.png',
        chartExportUrl: 'https://charts.example/legacy-acme',
        capturedAt: '2026-07-29T11:00:00Z',
        rendererContract: 'legacy-reconstructed-v0',
        sceneHash: hashNewsletterChartScene(chartSpec),
        imageSha256: null,
        createdAt: '2026-07-29T11:00:00Z',
        updatedAt: '2026-07-29T11:00:00Z',
      },
    })

    expect(draft.source).toMatchObject({
      automationStatus: 'needs_chart',
      attachedChartIds: [],
    })
    expect(draft.blocks[0].chartNeedsRegeneration).toBe(true)
    expect(draft.blocks[0].chartProvenance).toBeUndefined()
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
