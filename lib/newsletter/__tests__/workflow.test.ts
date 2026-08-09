import { describe, expect, it } from 'vitest'
import type { NewsletterDraftDocument } from '@/lib/newsletter/types'
import {
  canSetNewsletterDraftStatus,
  getNewsletterDraftReadiness,
  isNewsletterDraftStatus,
  resolveNewsletterDraftSaveStatus,
} from '@/lib/newsletter/workflow'
import {
  buildNewsletterChartProvenance,
  materializeNewsletterChartScene,
} from '@/lib/newsletter/chart-provenance'

function buildDraft(
  overrides: Partial<NewsletterDraftDocument> = {},
): NewsletterDraftDocument {
  const capturedAt = '2026-07-28T12:00:00.000Z'
  const chartSpec = materializeNewsletterChartScene(
    {
      mode: 'price',
      symbol: 'AAPL',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
    },
    capturedAt,
  )
  const chartImageUrl = '/newsletter-charts/aapl.png'
  const chartExportUrl = 'https://charts.example.com/tos/AAPL'
  return {
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: ['AAPL'],
    generatedAt: capturedAt,
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
        chartImageUrl,
        chartAlt: 'Apple price chart',
        chartExportUrl,
        chartSpec,
        chartProvenance: buildNewsletterChartProvenance({
          source: 'chart_editor',
          capturedAt,
          imageUrl: chartImageUrl,
          interactiveUrl: chartExportUrl,
          scene: chartSpec,
        }),
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

  it('blocks long subjects, unsafe links, and weak chart alt text', () => {
    const draft = buildDraft({
      subjectLine: 'A'.repeat(61),
      blocks: [
        {
          ...buildDraft().blocks[0],
          chartAlt: 'Chart',
          chartExportUrl: 'javascript:alert(1)',
          ctaText: 'Read more',
          ctaUrl: 'http://insecure.example.com/story',
        },
      ],
    })

    expect(
      getNewsletterDraftReadiness(draft).issues.map((issue) => issue.id),
    ).toEqual([
      'subject-line-length',
      'block-block-1-chart-provenance',
      'block-block-1-chart-alt',
      'block-block-1-chart-link',
      'block-block-1-cta-link',
    ])
  })

  it('requires a current exact scene for every final chart image', () => {
    const complete = buildDraft()
    const withoutProvenance = buildDraft({
      blocks: complete.blocks.map((block) => ({
        ...block,
        chartProvenance: undefined,
      })),
    })
    const tampered = buildDraft({
      blocks: complete.blocks.map((block) => ({
        ...block,
        chartProvenance: block.chartProvenance
          ? { ...block.chartProvenance, sceneSha256: '0'.repeat(64) }
          : undefined,
      })),
    })

    for (const draft of [withoutProvenance, tampered]) {
      expect(
        getNewsletterDraftReadiness(draft).issues.map((issue) => issue.id),
      ).toContain('block-block-1-chart-provenance')
    }
  })

  it('blocks a daily draft whose source headline belongs to another entity', () => {
    const draft = buildDraft({
      source: {
        type: 'daily_batch',
        dailyBatch: {
          runId: 'run-1',
          itemId: 'item-1',
          itemKey: 'daily:run-1:MTCH',
          sourceWiimRunId: 'wiim-1',
          marketDate: '2026-08-06',
          rank: 1,
          ticker: 'MTCH',
          companyName: 'Match Group, Inc.',
          headline: 'Huya launches Triple Match 3D mobile game worldwide',
          summary: 'A similarly named game launched.',
          keyFact: null,
          reasonType: 'product',
          movePercent: -5,
          confidenceScore: 80,
          relevanceScore: 80,
          qualityBand: 'strong',
          sourceRefs: [],
        },
        attachedChartIds: [],
        automatedAt: '2026-08-06T12:00:00.000Z',
        automationStatus: 'complete',
      },
    })

    expect(getNewsletterDraftReadiness(draft).issues).toContainEqual({
      id: 'source-entity',
      label:
        'Replace the source headline with evidence about Match Group (MTCH).',
    })
  })

  it('uses the stock registry to gate legacy daily sources without a company name', () => {
    const draft = buildDraft({
      source: {
        type: 'daily_batch',
        dailyBatch: {
          runId: 'run-legacy',
          itemId: 'item-legacy',
          itemKey: 'daily:run-legacy:MTCH',
          sourceWiimRunId: 'wiim-legacy',
          marketDate: '2026-08-06',
          rank: 1,
          ticker: 'MTCH',
          headline: 'Huya launches Triple Match 3D mobile game worldwide',
          summary: 'A similarly named game launched.',
          keyFact: null,
          reasonType: 'product',
          movePercent: -5,
          confidenceScore: 80,
          relevanceScore: 80,
          qualityBand: 'strong',
          sourceRefs: [],
        },
        attachedChartIds: [],
        automatedAt: '2026-08-06T12:00:00.000Z',
        automationStatus: 'complete',
      },
    })

    expect(
      getNewsletterDraftReadiness(draft).issues.map((issue) => issue.id),
    ).toContain('source-entity')
  })

  it('blocks mismatched summary prose even when the headline source is valid', () => {
    const draft = buildDraft({
      source: {
        type: 'daily_batch',
        dailyBatch: {
          runId: 'run-2',
          itemId: 'item-2',
          itemKey: 'daily:run-2:MTCH',
          sourceWiimRunId: 'wiim-2',
          marketDate: '2026-08-06',
          rank: 1,
          ticker: 'MTCH',
          companyName: 'Huya Inc.',
          headline: 'Match Group announces second-quarter results',
          summary: 'Huya launched Triple Match 3D worldwide.',
          keyFact: null,
          reasonType: 'product',
          movePercent: -5,
          confidenceScore: 80,
          relevanceScore: 80,
          qualityBand: 'strong',
          sourceRefs: [
            {
              kind: 'news',
              label: 'Match Group announces second-quarter results',
              url: 'https://example.com/mtch',
              publishedAt: '2026-08-04T20:13:06Z',
            },
          ],
        },
        attachedChartIds: [],
        automatedAt: '2026-08-06T12:00:00.000Z',
        automationStatus: 'complete',
      },
    })

    expect(
      getNewsletterDraftReadiness(draft).issues.map((issue) => issue.id),
    ).toContain('source-summary-entity')
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
