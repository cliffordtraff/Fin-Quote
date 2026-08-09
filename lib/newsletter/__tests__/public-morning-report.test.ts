import { describe, expect, it } from 'vitest'
import type { NewsletterDailyAutomationRun } from '@/lib/newsletter/daily-automation'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from '@/lib/newsletter/daily-types'
import {
  hydratePublicNewsletterMorningAutomation,
  hydratePublicNewsletterMorningReport,
  projectPublicNewsletterMorningAutomation,
  projectPublicNewsletterMorningReport,
} from '@/lib/newsletter/public-morning-report'

const PRIVATE_SENTINELS = [
  'run-primary-key-secret',
  'wiim-run-secret',
  'draft-primary-key-secret',
  'chart-primary-key-secret',
  'delivery-primary-key-secret',
  'beehiiv-post-id-secret',
  'editor-url-secret',
  'preview-url-secret',
  'candidate-metadata-secret',
  'item-provider-error-secret',
  'run-error-secret',
  'run-metadata-secret',
  'automation-primary-key-secret',
  'automation-symbol-secret',
  'automation-wiim-secret',
  'automation-error-secret',
  'notification-error-secret',
  'automation-metadata-secret',
] as const

function deliveryItem(
  overrides: Partial<NewsletterDailyRunItem> = {},
): NewsletterDailyRunItem {
  return {
    id: 'item-primary-key-secret',
    runId: 'run-primary-key-secret',
    rank: 1,
    ticker: 'AAPL',
    status: 'published',
    qualityBand: 'strong',
    relevanceScore: 94,
    confidenceScore: 91,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: 4.2,
    reasonType: 'earnings',
    headline: 'Apple reports a material earnings surprise',
    summaryText: 'A current, sourced editorial summary.',
    keyFact: 'Operator-only key fact',
    sourceRefs: [
      {
        kind: 'news',
        label: 'Public source',
        url: 'https://news.example/story',
        publishedAt: '2026-08-08T11:00:00.000Z',
      },
      {
        kind: 'unsafe',
        label: 'Unsafe source',
        url: 'javascript:alert(1)',
      },
    ],
    candidateMetadata: { secret: 'candidate-metadata-secret' },
    draftId: 'draft-primary-key-secret',
    draftStatus: 'published',
    chartId: 'chart-primary-key-secret',
    chartImageUrl: '/newsletter-charts/chart.png',
    subjectLine: 'Apple earnings changed the tape',
    beehiivDelivery: {
      id: 'delivery-primary-key-secret',
      postId: 'beehiiv-post-id-secret',
      editorUrl: 'https://app.beehiiv.com/editor-url-secret',
      previewUrl: 'https://preview.example/preview-url-secret',
      webUrl: 'https://newsletter.example/apple-earnings',
      lifecycleStatus: 'published',
      beehiivStatus: 'confirmed',
      scheduledAt: '2026-08-08T12:00:00.000Z',
      publishedAt: '2026-08-08T12:30:00.000Z',
      syncedAt: '2026-08-08T12:31:00.000Z',
      lastReconciledAt: '2026-08-08T12:32:00.000Z',
      lastReconcileError: 'provider reconcile secret',
      needsSync: false,
    },
    errorMessage: 'item-provider-error-secret',
    retryCount: 3,
    startedAt: '2026-08-08T11:20:00.000Z',
    completedAt: '2026-08-08T11:40:00.000Z',
    createdAt: '2026-08-08T11:10:00.000Z',
    updatedAt: '2026-08-08T12:32:00.000Z',
    ...overrides,
  }
}

function runFixture(): NewsletterDailyRun {
  return {
    id: 'run-primary-key-secret',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-run-secret',
    sourceGeneratedAt: '2026-08-08T11:15:00.000Z',
    selectedCount: 2,
    generatedCount: 2,
    readyCount: 1,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: 'run-error-secret',
    metadata: {
      sourceCandidateCount: 40,
      currentSummaryCount: 38,
      strongCount: 12,
      secret: 'run-metadata-secret',
    },
    startedAt: '2026-08-08T10:00:00.000Z',
    completedAt: '2026-08-08T12:00:00.000Z',
    createdAt: '2026-08-08T09:59:00.000Z',
    updatedAt: '2026-08-08T12:32:00.000Z',
    items: [
      deliveryItem(),
      deliveryItem({
        id: 'second-item-secret',
        rank: 2,
        ticker: 'MSFT',
        status: 'ready',
        chartImageUrl: 'https://127.0.0.1/private-chart.png',
        sourceRefs: [{
          kind: 'private',
          label: 'Private source label stays visible',
          url: 'https://localhost/private-source',
        }],
        beehiivDelivery: {
          ...deliveryItem().beehiivDelivery!,
          id: 'second-delivery-secret',
          lifecycleStatus: 'scheduled',
          webUrl: 'https://newsletter.example/not-public-yet',
          publishedAt: null,
        },
      }),
    ],
  }
}

function automationFixture(): NewsletterDailyAutomationRun {
  return {
    id: 'automation-primary-key-secret',
    marketDate: '2026-08-08',
    status: 'partial',
    stage: 'completed',
    candidateSymbols: ['automation-symbol-secret'],
    candidateCount: 40,
    finvizCompletedCount: 40,
    finvizFoundCount: 37,
    finvizErrorCount: 3,
    summaryCompletedCount: 40,
    summaryGeneratedCount: 38,
    summaryNoResultCount: 1,
    summaryErrorCount: 1,
    wiimRunId: 'automation-wiim-secret',
    newsletterScopeCount: 1,
    newsletterCompletedScopeCount: 1,
    newsletterSelectedCount: 40,
    newsletterGeneratedCount: 39,
    newsletterReadyCount: 38,
    newsletterAttentionCount: 1,
    newsletterFailedCount: 1,
    invocationCount: 17,
    lastError: 'automation-error-secret',
    notificationAppliedAt: '2026-08-08T12:00:00.000Z',
    notificationAttemptCount: 2,
    notificationLastError: 'notification-error-secret',
    metadata: { secret: 'automation-metadata-secret' },
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T12:00:00.000Z',
    lastHeartbeatAt: '2026-08-08T12:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

describe('public Morning Report projection', () => {
  it('allowlists editorial fields without serializing operator identifiers or errors', () => {
    const report = projectPublicNewsletterMorningReport(runFixture())
    const serialized = JSON.stringify(report)

    expect(Object.keys(report)).toEqual([
      'key',
      'marketDate',
      'edition',
      'status',
      'targetCount',
      'sourceGeneratedAt',
      'selectedCount',
      'generatedCount',
      'readyCount',
      'attentionCount',
      'failedCount',
      'editorialCounts',
      'items',
    ])
    expect(Object.keys(report.items[0])).toEqual([
      'key',
      'rank',
      'ticker',
      'status',
      'qualityBand',
      'relevanceScore',
      'confidenceScore',
      'movePercent',
      'reasonType',
      'headline',
      'summaryText',
      'sourceRefs',
      'chartImageUrl',
      'subjectLine',
      'hasDraft',
      'delivery',
    ])
    expect(report.key).toBe('morning:2026-08-08')
    expect(report.items[0].key).toBe('2026-08-08:1:AAPL')
    expect(report.items[0].sourceRefs[1]).toEqual({
      kind: 'unsafe',
      label: 'Unsafe source',
    })
    expect(report.items[0].chartImageUrl).toBe(
      '/newsletter-charts/chart.png',
    )
    expect(report.items[1].chartImageUrl).toBeNull()
    expect(report.items[1].sourceRefs).toEqual([{
      kind: 'private',
      label: 'Private source label stays visible',
    }])
    expect(report.items[0].delivery).toEqual({
      lifecycleStatus: 'published',
      publishedAt: '2026-08-08T12:30:00.000Z',
      webUrl: 'https://newsletter.example/apple-earnings',
    })
    expect(report.items[1].delivery).toEqual({
      lifecycleStatus: 'scheduled',
      publishedAt: null,
      webUrl: null,
    })
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('projects only public automation aggregates and a generic status message', () => {
    const automation = projectPublicNewsletterMorningAutomation(
      automationFixture(),
    )
    const serialized = JSON.stringify(automation)

    expect(automation).toEqual({
      marketDate: '2026-08-08',
      status: 'partial',
      stage: 'completed',
      candidateCount: 40,
      finvizCompletedCount: 40,
      summaryGeneratedCount: 38,
      newsletterSelectedCount: 40,
      newsletterReadyCount: 38,
      startedAt: '2026-08-08T09:00:00.000Z',
      message: 'Morning production completed with some issues needing review.',
    })
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('keeps only browser-safe public URLs and the newsletter chart path', () => {
    const sourceCases = [
      ['valid', 'https://news.example/story?item=1'],
      ['http', 'http://news.example/story'],
      ['credentials', 'https://user:secret@news.example/story'],
      ['localhost', 'https://localhost/story'],
      ['loopback', 'https://127.0.0.1/story'],
      ['private', 'https://10.0.0.8/story'],
      ['link-local', 'https://169.254.2.3/story'],
      ['private-dns', 'https://feed.internal/story'],
      ['local-dns', 'https://feed.local/story'],
      ['ipv6-loopback', 'https://[::1]/story'],
    ].map(([kind, url]) => ({ kind, label: `${kind} label`, url }))
    const fixture = runFixture()
    fixture.items = [
      deliveryItem({ sourceRefs: sourceCases }),
      deliveryItem({ rank: 2, chartImageUrl: '/newsletter-charts/good.png' }),
      deliveryItem({ rank: 3, chartImageUrl: '/api/private.png' }),
      deliveryItem({
        rank: 4,
        chartImageUrl: '/newsletter-charts/../api/private.png',
      }),
      deliveryItem({
        rank: 5,
        chartImageUrl: 'https://192.168.1.10/private.png',
      }),
      deliveryItem({
        rank: 6,
        chartImageUrl: 'https://charts.example/public.png',
      }),
    ]

    const report = projectPublicNewsletterMorningReport(fixture)

    expect(report.items[0].sourceRefs).toEqual([
      {
        kind: 'valid',
        label: 'valid label',
        url: 'https://news.example/story?item=1',
      },
      ...sourceCases.slice(1).map(({ kind, label }) => ({ kind, label })),
    ])
    expect(report.items.map((item) => item.chartImageUrl)).toEqual([
      '/newsletter-charts/chart.png',
      '/newsletter-charts/good.png',
      null,
      null,
      null,
      'https://charts.example/public.png',
    ])
  })

  it('hydrates display-only client models without restoring private wire data', () => {
    const report = projectPublicNewsletterMorningReport(runFixture())
    const automation = projectPublicNewsletterMorningAutomation(
      automationFixture(),
    )
    const viewRun = hydratePublicNewsletterMorningReport(report)
    const viewAutomation = hydratePublicNewsletterMorningAutomation(automation)
    const serialized = JSON.stringify({ viewRun, viewAutomation })

    expect(viewRun.id).toBe('morning:2026-08-08')
    expect(viewRun.items[0].draftId).toBe('2026-08-08:1:AAPL')
    expect(viewRun.items[0].chartId).toBeNull()
    expect(viewRun.items[0].candidateMetadata).toEqual({})
    expect(viewRun.items[0].beehiivDelivery).toMatchObject({
      editorUrl: '',
      previewUrl: null,
      webUrl: 'https://newsletter.example/apple-earnings',
    })
    expect(viewAutomation?.lastError).toBe(
      'Morning production completed with some issues needing review.',
    )
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })
})
