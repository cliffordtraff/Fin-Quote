import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterDraftRecord } from '@/lib/newsletter/types'

const mocks = vi.hoisted(() => ({
  recordPublication: vi.fn(),
  resolveScope: vi.fn(),
  attachCookie: vi.fn(
    (response: Response) => response,
  ),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  resolveNewsletterDraftScope: mocks.resolveScope,
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
}))

vi.mock('@/lib/newsletter/publication', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/publication')>()
  return {
    ...actual,
    recordNewsletterPublication: mocks.recordPublication,
  }
})

import { PATCH } from '@/app/api/newsletter/drafts/[id]/publication/route'
import {
  NewsletterManagedPublicationBusyError,
  NewsletterManagedPublicationVersionError,
  NewsletterPublicationReadinessError,
} from '@/lib/newsletter/publication'
import { NewsletterDraftConflictError } from '@/lib/newsletter/drafts'

function buildRequest(
  beehiivUrl: string,
  options: { includeExpectedUpdatedAt?: boolean } = {},
): NextRequest {
  const includeExpectedUpdatedAt = options.includeExpectedUpdatedAt ?? true
  return new NextRequest(
    'https://finquote.example/api/newsletter/drafts/draft-1/publication',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beehiivUrl,
        ...(includeExpectedUpdatedAt
          ? { expectedUpdatedAt: '2026-07-29T20:00:00.000Z' }
          : {}),
      }),
    },
  )
}

function fakeDraft(): NewsletterDraftRecord {
  return {
    id: 'draft-1',
    ownerId: 'user-1',
    ticker: 'GRMN',
    status: 'published',
    sourceType: 'catalyst',
    sourceReviewKey: '2026-07-29:cash:gainer:GRMN',
    beehiivUrl: 'https://theintraday.beehiiv.com/p/grmn',
    publishedAt: '2026-07-29T20:00:00.000Z',
    archivedAt: null,
    attachedChartCount: 1,
    subjectLine: 'GRMN update',
    previewHtml: '<html></html>',
    draft: {
      ticker: 'GRMN',
      format: 'single_stock',
      featuredTickers: ['GRMN'],
      generatedAt: '2026-07-29T14:00:00.000Z',
      subjectLine: 'GRMN update',
      introText: 'Garmin moved after earnings.',
      autoPickedStock: false,
      blocks: [],
    },
    history: [],
    createdAt: '2026-07-29T14:00:00.000Z',
    updatedAt: '2026-07-29T20:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
})

describe('newsletter publication API', () => {
  it('records a Beehiiv URL against the resolved draft scope', async () => {
    mocks.recordPublication.mockResolvedValue(fakeDraft())

    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.recordPublication).toHaveBeenCalledWith(
      { ownerId: 'user-1', sessionId: 'session-1' },
      'draft-1',
      'https://theintraday.beehiiv.com/p/grmn',
      expect.any(Date),
      '2026-07-29T20:00:00.000Z',
    )
    await expect(response.json()).resolves.toMatchObject({
      draft: {
        id: 'draft-1',
        status: 'published',
        beehiivUrl: 'https://theintraday.beehiiv.com/p/grmn',
      },
    })
  })

  it('returns actionable readiness issues', async () => {
    mocks.recordPublication.mockRejectedValue(
      new NewsletterPublicationReadinessError({
        ready: false,
        issues: [{ id: 'block-chart', label: 'Capture the final chart.' }],
      }),
    )

    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      issues: [{ label: 'Capture the final chart.' }],
    })
  })

  it('requires the caller to provide the draft version being published', async () => {
    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn', {
        includeExpectedUpdatedAt: false,
      }),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.recordPublication).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'expectedUpdatedAt is required',
    })
  })

  it('returns a conflict instead of overwriting a newer draft version', async () => {
    mocks.recordPublication.mockRejectedValue(
      new NewsletterDraftConflictError('draft-1'),
    )

    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(409)
  })

  it('returns an actionable conflict for a stale managed Beehiiv delivery', async () => {
    mocks.recordPublication.mockRejectedValue(
      new NewsletterManagedPublicationVersionError(),
    )

    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'beehiiv_source_mismatch',
      error: expect.stringContaining('older saved version'),
    })
  })

  it('returns a conflict while a managed Beehiiv create needs completion', async () => {
    mocks.recordPublication.mockRejectedValue(
      new NewsletterManagedPublicationBusyError(),
    )

    const response = await PATCH(
      buildRequest('https://theintraday.beehiiv.com/p/grmn'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'beehiiv_sync_in_progress',
    })
  })

  it('returns a client error for invalid publication URLs', async () => {
    mocks.recordPublication.mockRejectedValue(
      new Error('Beehiiv publication URL must be a valid web address'),
    )

    const response = await PATCH(buildRequest('not-a-url'), {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(400)
  })
})
