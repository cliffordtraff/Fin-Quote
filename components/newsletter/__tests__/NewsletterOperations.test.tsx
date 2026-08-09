import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterOperationsSnapshot } from '@/lib/newsletter/operations'
import NewsletterOperations from '../NewsletterOperations'

const snapshot = {
  generatedAt: '2026-08-06T13:00:00.000Z',
  marketDate: '2026-08-06',
  clock: {
    marketDate: '2026-08-06',
    isTradingDay: true,
    holidayName: null,
  },
  windows: {},
  settings: { targetCount: 40 },
  webhookConfigured: true,
  webhook: {
    configured: true,
    configurationError: null,
    missing: [],
    pending: 1,
    delivering: 0,
    delivered: 5,
    errors: 0,
    oldestDueAt: '2026-08-06T12:55:00.000Z',
    lastError: null,
    lastErrorAt: null,
    queryError: null,
  },
  morning: null,
  midMorning: null,
  dailyRun: null,
  notifications: [],
  beehiiv: {
    integration: {
      connected: true,
      publication: {
        id: 'pub_1',
        name: "Ford's Hiiv",
        description: null,
        url: null,
      },
      connectedAt: '2026-08-06T12:00:00.000Z',
      lastVerifiedAt: '2026-08-06T12:00:00.000Z',
    },
    marketDateCounts: {
      draft: 0,
      scheduled: 0,
      published: 1,
      archived: 0,
      unknown: 0,
    },
    overallCounts: {
      draft: 2,
      scheduled: 1,
      published: 4,
      archived: 0,
      unknown: 0,
    },
    overallTotal: 7,
    reconcileErrors: 0,
    staleCount: 0,
    lifecycle: {
      latestReconciledAt: '2026-08-06T12:59:00.000Z',
      freshnessMs: 60_000,
      oldestActiveCheckAt: null,
      averagePublishLatencyMs: 5 * 60_000,
    },
    stats: {
      sent: 10,
      delivered: 9,
      opens: 5,
      uniqueOpens: 4,
      openRate: 4 / 9,
      clicks: 2,
      uniqueClicks: 1,
      clickRate: 1 / 9,
      bounces: 1,
      unsubscribes: 0,
      spamReports: 0,
      webViews: 3,
      webClicks: 1,
    },
    deliveries: [
      {
        id: 'delivery-1',
        draftId: 'draft-1',
        title: 'PODD morning setup',
        editorUrl: 'https://app.beehiiv.com/posts/post-1',
        webUrl: 'https://example.com/p/podd',
        lifecycleStatus: 'published',
        beehiivStatus: 'published',
        scheduledAt: null,
        publishedAt: '2026-08-06T12:42:00.000Z',
        syncedAt: '2026-08-06T12:35:00.000Z',
        lastReconciledAt: '2026-08-06T12:59:00.000Z',
        lastReconcileError: null,
        statsLastFetchedAt: '2026-08-06T12:59:00.000Z',
        statsLastError: null,
        stats: {
          sent: 10,
          delivered: 9,
          opens: 5,
          uniqueOpens: 4,
          openRate: 4 / 9,
          clicks: 2,
          uniqueClicks: 1,
          clickRate: 1 / 9,
          bounces: 1,
          unsubscribes: 0,
          spamReports: 0,
          webViews: 3,
          webClicks: 1,
        },
      },
    ],
  },
  history: [],
} as unknown as NewsletterOperationsSnapshot

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewsletterOperations', () => {
  it('shows scoped delivery/outbox health and reports manual reconciliation', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json({
            result: { attempted: 4, updated: 4, failed: [] },
          })
        }
        return Response.json(snapshot)
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterOperations />)

    expect(await screen.findByText('Beehiiv delivery')).toBeInTheDocument()
    expect(screen.getByText(/1 this market date/)).toHaveTextContent(
      '1 this market date · 7 overall',
    )
    expect(screen.getByText('Webhook outbox')).toBeInTheDocument()
    expect(screen.getByText('Unique opens')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Reconcile now' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          'Beehiiv reconciliation complete: 4 attempted, 4 updated, 0 failed.',
        ),
      ).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/newsletter/operations/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'reconcile_beehiiv' }),
      }),
    )
  })
})
