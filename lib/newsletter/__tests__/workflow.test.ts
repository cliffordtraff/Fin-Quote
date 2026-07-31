import { describe, expect, it } from 'vitest'
import type { NewsletterDraftDocument } from '@/lib/newsletter/types'
import {
  canSetNewsletterDraftStatus,
  getNewsletterDraftReadiness,
  isNewsletterDraftStatus,
  resolveNewsletterDraftSaveStatus,
} from '@/lib/newsletter/workflow'

function buildDraft(
  overrides: Partial<NewsletterDraftDocument> = {},
): NewsletterDraftDocument {
  return {
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: ['AAPL'],
    generatedAt: '2026-07-28T12:00:00.000Z',
    subjectLine: 'Apple earnings setup',
    introText: 'The key numbers to watch before the report.',
    autoPickedStock: false,
    blocks: [
      {
        id: 'block-1',
        layoutId: 'chart_plus_commentary',
        templateId: 'price_trend_6m',
        selectionReason: 'Price action frames the setup.',
        heading: 'Shares hold above support',
        body: '<p>Apple remains above its post-earnings breakout level.</p>',
        chartImageUrl: '/newsletter-charts/aapl.png',
        chartAlt: 'Apple price chart',
        chartExportUrl: 'https://charts.example.com/tos/AAPL',
        chartSpec: {
          mode: 'price',
          symbol: 'AAPL',
          range: '6m',
          interval: 'D',
          chartType: 'candles',
        },
        chartNeedsRegeneration: false,
      },
    ],
    ...overrides,
  }
}

describe('newsletter publishing workflow', () => {
  it('recognizes every persisted workflow status', () => {
    expect(['draft', 'review', 'ready', 'published'].every(isNewsletterDraftStatus)).toBe(true)
    expect(isNewsletterDraftStatus('captured')).toBe(false)
  })

  it('marks a complete newsletter ready for publishing', () => {
    expect(getNewsletterDraftReadiness(buildDraft())).toEqual({
      ready: true,
      issues: [],
    })
  })

  it('reports actionable content and chart readiness failures', () => {
    const draft = buildDraft({
      subjectLine: 'Untitled newsletter',
      introText: '',
      blocks: [
        {
          ...buildDraft().blocks[0],
          heading: '',
          body: '<p>&nbsp;</p>',
          chartImageUrl: 'data:image/svg+xml,placeholder',
          chartNeedsRegeneration: true,
        },
      ],
    })

    const readiness = getNewsletterDraftReadiness(draft)
    expect(readiness.ready).toBe(false)
    expect(readiness.issues.map((issue) => issue.id)).toEqual([
      'subject-line',
      'intro',
      'block-block-1-heading',
      'block-block-1-body',
      'block-block-1-chart',
    ])
  })

  it('allows draft and review stages while gating ready and published', () => {
    const incomplete = buildDraft({ introText: '' })

    expect(canSetNewsletterDraftStatus(incomplete, 'draft').ready).toBe(true)
    expect(canSetNewsletterDraftStatus(incomplete, 'review').ready).toBe(true)
    expect(canSetNewsletterDraftStatus(incomplete, 'ready').ready).toBe(false)
    expect(canSetNewsletterDraftStatus(incomplete, 'published').ready).toBe(false)
  })

  it('requires a recorded publication URL only for the published stage', () => {
    const complete = buildDraft()
    expect(canSetNewsletterDraftStatus(complete, 'ready').ready).toBe(true)
    expect(canSetNewsletterDraftStatus(complete, 'published')).toMatchObject({
      ready: false,
      issues: [{ id: 'beehiiv-url' }],
    })

    const withPublication = buildDraft({
      publication: {
        beehiivUrl: 'https://theintraday.beehiiv.com/p/apple-earnings',
        publishedAt: '2026-07-28T20:00:00.000Z',
      },
    })
    expect(canSetNewsletterDraftStatus(withPublication, 'published').ready).toBe(
      true,
    )
  })

  it('returns mature drafts to review only after content changes', () => {
    expect(
      resolveNewsletterDraftSaveStatus({
        currentStatus: 'published',
        requestedStatus: 'published',
        hasExplicitStatus: false,
        contentChanged: true,
      }),
    ).toBe('review')
    expect(
      resolveNewsletterDraftSaveStatus({
        currentStatus: 'ready',
        requestedStatus: 'ready',
        hasExplicitStatus: false,
        contentChanged: false,
      }),
    ).toBe('ready')
    expect(
      resolveNewsletterDraftSaveStatus({
        currentStatus: 'review',
        requestedStatus: 'published',
        hasExplicitStatus: true,
        contentChanged: false,
      }),
    ).toBe('published')
  })
})
