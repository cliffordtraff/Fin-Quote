import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewsletterMorningReview from '@/components/newsletter/NewsletterMorningReview'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from '@/lib/newsletter/daily-types'
import { projectPublicNewsletterMorningReport } from '@/lib/newsletter/public-morning-report'

vi.mock('@/components/newsletter/NewsletterEditorialShortlist', () => ({
  default: ({ readOnly }: { readOnly: boolean }) =>
    readOnly ? (
      <a href="/auth?redirect=%2Fnewsletter%2Fmorning-review">Review</a>
    ) : null,
}))

function item(index: number): NewsletterDailyRunItem {
  return {
    id: `item-${index}`,
    runId: 'run-1',
    rank: index,
    ticker: `T${index}`,
    status: 'generated',
    qualityBand: 'review',
    relevanceScore: 70,
    confidenceScore: 70,
    candidateType: 'stock',
    stateLabel: null,
    movePercent: index,
    reasonType: 'news',
    headline: `Headline ${index}`,
    summaryText: `Summary ${index}`,
    keyFact: null,
    sourceRefs: [],
    candidateMetadata: {},
    draftId: `draft-${index}`,
    draftStatus: 'draft',
    chartId: `chart-${index}`,
    chartImageUrl: `https://assets.example/chart-${index}.png`,
    subjectLine: `Issue ${index}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: '2026-08-08T12:00:00.000Z',
    createdAt: '2026-08-08T12:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

const items = Array.from({ length: 25 }, (_, index) => item(index + 1))
const run: NewsletterDailyRun = {
  id: 'run-1',
  marketDate: '2026-08-08',
  edition: 'morning',
  status: 'completed',
  targetCount: 40,
  sourceWiimRunId: 'wiim-1',
  sourceGeneratedAt: '2026-08-08T11:30:00.000Z',
  selectedCount: items.length,
  generatedCount: items.length,
  readyCount: 0,
  attentionCount: 0,
  failedCount: 0,
  errorMessage: null,
  metadata: {},
  startedAt: '2026-08-08T11:30:00.000Z',
  completedAt: '2026-08-08T12:00:00.000Z',
  createdAt: '2026-08-08T11:30:00.000Z',
  updatedAt: '2026-08-08T12:00:00.000Z',
  items,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewsletterMorningReview bounded cards', () => {
  it('hydrates public automation independently from a full owner report', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/notifications')) {
        return Promise.resolve(Response.json({ notifications: [] }))
      }
      return Promise.resolve(Response.json({
        run: { ...run, items: [] },
        settings: {
          enabled: true,
          targetCount: 40,
          timezone: 'America/New_York',
          generationHour: 8,
        },
        automation: {
          marketDate: '2026-08-08',
          status: 'partial',
          stage: 'completed',
          candidateCount: 40,
          finvizCompletedCount: 40,
          summaryGeneratedCount: 39,
          newsletterSelectedCount: 40,
          newsletterReadyCount: 39,
          startedAt: '2026-08-08T09:00:00.000Z',
          message: 'Public automation message sentinel',
        },
        reportReadOnly: false,
        automationReadOnly: true,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)

    expect(
      await screen.findByText('Public automation message sentinel'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/sign in to edit drafts/i)).not.toBeInTheDocument()
  })

  it('sends queue creation directly to the split action endpoint', async () => {
    let rootReads = 0
    const completedRun = { ...run, items: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init
      const url = String(input)
      if (url.includes('/notifications')) {
        return Promise.resolve(Response.json({ notifications: [] }))
      }
      if (url === '/api/newsletter/daily-runs/action') {
        return Promise.resolve(Response.json({ run: completedRun }))
      }
      if (url.includes('/process')) {
        return Promise.resolve(Response.json({
          run: completedRun,
          attempted: 0,
        }))
      }
      rootReads += 1
      return Promise.resolve(Response.json({
        run: rootReads === 1 ? null : completedRun,
        settings: {
          enabled: true,
          targetCount: 40,
          timezone: 'America/New_York',
          generationHour: 8,
        },
        automation: null,
        reportReadOnly: false,
        automationReadOnly: false,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)
    fireEvent.click(await screen.findByRole('button', {
      name: 'Generate today\'s queue',
    }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/newsletter/daily-runs/action',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(fetchMock.mock.calls.some(
      ([input, init]) =>
        String(input) === '/api/newsletter/daily-runs' &&
        init?.method === 'POST',
    )).toBe(false)
  })

  it('keeps chart-image DOM/network work to twelve cards until requested', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/notifications')) {
        return Promise.resolve(Response.json({ notifications: [] }))
      }
      return Promise.resolve(Response.json({
        run,
        settings: {
          enabled: true,
          targetCount: 40,
          timezone: 'America/New_York',
          generationHour: 8,
        },
        automation: null,
        reportReadOnly: false,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)

    const chartImages = await screen.findAllByRole('img', {
      name: /newsletter chart/i,
    })
    expect(chartImages).toHaveLength(12)
    expect(chartImages.every((image) => image.getAttribute('loading') === 'lazy')).toBe(true)
    expect(screen.queryByText('Issue 13')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more issues' }))

    expect(await screen.findByText('Issue 13')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /newsletter chart/i })).toHaveLength(24)
    expect(screen.getByText('Showing 24 of 25 issues')).toBeInTheDocument()
  })

  it('keeps public display keys out of read-only links and mutation requests', async () => {
    const publishedItem: NewsletterDailyRunItem = {
      ...item(1),
      ticker: 'AAPL',
      status: 'published',
      qualityBand: 'strong',
      subjectLine: 'Apple earnings changed the tape',
      beehiivDelivery: {
        id: 'delivery-secret',
        postId: 'post-secret',
        editorUrl: 'https://app.beehiiv.com/editor-secret',
        previewUrl: 'https://preview.example/preview-secret',
        webUrl: 'https://newsletter.example/published-issue',
        lifecycleStatus: 'published',
        beehiivStatus: 'published',
        scheduledAt: null,
        publishedAt: '2026-08-08T12:30:00.000Z',
        syncedAt: '2026-08-08T12:31:00.000Z',
        lastReconciledAt: null,
        lastReconcileError: null,
        needsSync: false,
      },
    }
    const publicReport = projectPublicNewsletterMorningReport({
      ...run,
      items: [publishedItem, ...items.slice(1)],
    })
    const requestMethods: string[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requestMethods.push(init?.method ?? 'GET')
      if (String(input).includes('/notifications')) {
        return Promise.resolve(Response.json({ notifications: [] }))
      }
      return Promise.resolve(Response.json({
        run: publicReport,
        settings: {
          enabled: true,
          targetCount: 40,
          timezone: 'America/New_York',
          generationHour: 8,
        },
        automation: null,
        reportReadOnly: true,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)

    expect(
      await screen.findByRole('heading', {
        name: 'Apple earnings changed the tape',
      }),
    ).toBeInTheDocument()
    const publicDisplayKey = '2026-08-08:1:AAPL'
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href')?.includes(publicDisplayKey)))
      .toBe(false)
    expect(
      screen.getAllByRole('link', { name: /sign in to edit/i })[0],
    ).toHaveAttribute(
      'href',
      '/auth?redirect=%2Fnewsletter%2Fmorning-review',
    )
    expect(screen.getByRole('link', { name: /read published issue/i }))
      .toHaveAttribute('href', 'https://newsletter.example/published-issue')
    expect(screen.getByRole('link', { name: 'AAPL catalyst history' }))
      .toHaveAttribute('href', '/stock/AAPL#catalyst-history')
    expect(screen.getByRole('link', { name: /^review$/i })).toHaveAttribute(
      'href',
      '/auth?redirect=%2Fnewsletter%2Fmorning-review',
    )

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled()
      fireEvent.click(checkbox)
    }
    const selectClean = screen.getByRole('button', { name: /select clean/i })
    const markReady = screen.getByRole('button', { name: /mark ready/i })
    expect(selectClean).toBeDisabled()
    expect(markReady).toBeDisabled()
    fireEvent.click(selectClean)
    fireEvent.click(markReady)

    expect(requestMethods.every((method) => method === 'GET')).toBe(true)
  })
})
