import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterDraftRecord } from '@/lib/newsletter/types'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  getDraft: vi.fn(),
  regenerateChart: vi.fn(),
  regenerateNewsletter: vi.fn(),
  resolveScope: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return {
    ...actual,
    getNewsletterDraft: mocks.getDraft,
    regenerateNewsletterDraft: mocks.regenerateNewsletter,
    regenerateNewsletterDraftChart: mocks.regenerateChart,
  }
})

vi.mock('@/lib/newsletter/charting-platform-export', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/newsletter/charting-platform-export')
    >()
  return {
    ...actual,
    getDefaultChartingBaseUrlForHost: vi.fn(
      () => 'https://app.theintraday.com',
    ),
    getDefaultPublicChartingBaseUrlForHost: vi.fn(
      () => 'https://charts.theintraday.com',
    ),
  }
})

import { POST as regenerateChart } from '@/app/api/newsletter/drafts/[id]/regenerate-chart/route'
import { POST as regenerateNewsletter } from '@/app/api/newsletter/drafts/[id]/regenerate-newsletter/route'
import { NewsletterDraftConflictError } from '@/lib/newsletter/drafts'
import { NewsletterCapturePathError } from '@/lib/newsletter/capture-output-path'

const draft = {
  ticker: 'AAPL',
  format: 'single_stock' as const,
  featuredTickers: ['AAPL'],
  generatedAt: '2026-08-07T11:00:00.000Z',
  subjectLine: 'Apple update',
  introText: 'Apple moved today.',
  autoPickedStock: false,
  blocks: [],
}

const published = {
  id: 'draft-1',
  ownerId: 'user-1',
  ticker: 'AAPL',
  status: 'published',
  sourceType: 'manual',
  sourceReviewKey: null,
  beehiivUrl: 'https://theintraday.example/p/apple',
  publishedAt: '2026-08-07T12:30:00.000Z',
  archivedAt: null,
  attachedChartCount: 0,
  subjectLine: draft.subjectLine,
  previewHtml: '<html></html>',
  draft,
  history: [],
  createdAt: '2026-08-07T11:00:00.000Z',
  updatedAt: '2026-08-07T12:30:00.000Z',
} satisfies NewsletterDraftRecord

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.getDraft.mockResolvedValue(published)
})

describe('newsletter regeneration conflict responses', () => {
  it('returns the published winner when whole-newsletter regeneration loses its CAS', async () => {
    mocks.regenerateNewsletter.mockRejectedValue(
      new NewsletterDraftConflictError('draft-1'),
    )
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1/regenerate-newsletter',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: '2026-08-07T12:00:00.000Z',
        }),
      },
    )

    const response = await regenerateNewsletter(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'draft_conflict',
      latest: { id: 'draft-1', status: 'published' },
    })
  })

  it('returns the published winner when chart regeneration loses its CAS', async () => {
    mocks.regenerateChart.mockRejectedValue(
      new NewsletterDraftConflictError('draft-1'),
    )
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1/regenerate-chart',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId: 'block-1',
          draft,
          expectedUpdatedAt: '2026-08-07T12:00:00.000Z',
        }),
      },
    )

    const response = await regenerateChart(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'draft_conflict',
      latest: { id: 'draft-1', status: 'published' },
    })
  })

  it('returns a validation error for an unsafe chart capture path', async () => {
    mocks.regenerateChart.mockRejectedValue(
      new NewsletterCapturePathError(
        'Chart symbol may contain only letters, numbers, dots, and hyphens',
      ),
    )
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1/regenerate-chart',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId: 'block-1',
          draft: { ...draft, ticker: '../0' },
          expectedUpdatedAt: '2026-08-07T12:00:00.000Z',
        }),
      },
    )

    const response = await regenerateChart(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('letters, numbers, dots, and hyphens'),
    })
  })
})
