import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhyMovedEditorialReviewRecord } from '@/lib/why-moved-types'

const REVIEW_ID = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-08-08T14:00:00.000Z'

const mocks = vi.hoisted(() => {
  class AdminAccessError extends Error {
    constructor(message = 'You do not have access to this admin feature.') {
      super(message)
      this.name = 'AdminAccessError'
    }
  }
  return {
    AdminAccessError,
    automateDraft: vi.fn(),
    bulkTransition: vi.fn(),
    getMovers: vi.fn(),
    getTradingDate: vi.fn(),
    ingest: vi.fn(),
    preview: vi.fn(),
    requireAdmin: vi.fn(),
    revalidatePath: vi.fn(),
    saveReview: vi.fn(),
    selectCandidates: vi.fn(),
  }
})

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth/admin', () => ({
  AdminAccessError: mocks.AdminAccessError,
  requireAdminUser: mocks.requireAdmin,
}))
vi.mock('@/lib/why-moved-review', () => ({
  buildWhyMovedReviewKey: (input: {
    marketDate: string
    session: string
    direction: string
    symbol: string
  }) =>
    [input.marketDate, input.session, input.direction, input.symbol.toUpperCase()].join(
      ':',
    ),
  bulkTransitionWhyMovedReviews: mocks.bulkTransition,
  ingestWhyMovedEditorialCandidates: mocks.ingest,
  saveWhyMovedReview: mocks.saveReview,
  selectWhyMovedCandidates: mocks.selectCandidates,
}))
vi.mock('@/lib/newsletter/catalyst-workflow', () => ({
  ensureApprovedCatalystNewsletterDraft: mocks.automateDraft,
}))
vi.mock('@/lib/stock-why-moving', () => ({
  getStockWhyMovingData: mocks.preview,
}))
vi.mock('@/app/actions/market-movers', () => ({
  getAllSessionMovers: mocks.getMovers,
}))
vi.mock('@/lib/market-hours', () => ({
  getTradingDate: mocks.getTradingDate,
}))

import { POST as capturePost } from '@/app/api/admin/why-moved/capture/route'
import { POST as previewPost } from '@/app/api/admin/why-moved/preview/route'
import { POST as approvalPost } from '@/app/api/admin/why-moved/reviews/approve/route'
import { POST as bulkPost } from '@/app/api/admin/why-moved/reviews/bulk/route'
import { PATCH as reviewPatch } from '@/app/api/admin/why-moved/reviews/route'

function review(
  status: WhyMovedEditorialReviewRecord['status'] = 'pending',
): WhyMovedEditorialReviewRecord {
  return {
    id: REVIEW_ID,
    reviewKey: '2026-08-08:cash:gainer:GRMN',
    symbol: 'GRMN',
    marketDate: '2026-08-08',
    session: 'cash',
    direction: 'gainer',
    status,
    notes: 'Check the company release.',
    reviewerId: 'admin-1',
    reviewedAt: status === 'pending' ? null : '2026-08-08T14:30:00.000Z',
    candidateSnapshot: {
      reviewKey: '2026-08-08:cash:gainer:GRMN',
      symbol: 'GRMN',
      name: 'Garmin',
      price: 228.15,
      change: 31.4,
      changesPercentage: 15.96,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-08-08',
    },
    catalystSnapshot: {
      symbol: 'GRMN',
      status: 'found',
      headline: 'Captured guidance increase',
      summary: 'The company raised its full-year outlook.',
      displayText: 'Captured guidance increase',
      bulletPoints: ['Guidance increased before the market opened.'],
      sentiment: 'positive',
      source: 'Company release',
      sourceTimestamp: null,
      isCatalyst: true,
      sourceUrl: 'https://example.test/captured',
      fetchedAt: '2026-08-08T13:50:00.000Z',
      errorMessage: null,
    },
    snapshotState: 'captured',
    discoveryRunId: 'automation-run-1',
    firstSeenAt: '2026-08-08T13:45:00.000Z',
    lastSeenAt: '2026-08-08T13:45:00.000Z',
    createdAt: '2026-08-08T13:45:00.000Z',
    updatedAt: '2026-08-08T14:30:00.000Z',
  }
}

function reviewBody(status: WhyMovedEditorialReviewRecord['status'] = 'needs_work') {
  return {
    candidate: review().candidateSnapshot,
    status,
    notes: 'Use the primary filing.',
    expectedUpdatedAt: UPDATED_AT,
  }
}

function request(
  path: string,
  options: {
    body?: unknown
    method?: 'PATCH' | 'POST'
    headers?: Record<string, string>
  } = {},
) {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new NextRequest(`https://theintraday.com${path}`, {
    method: options.method ?? 'POST',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body,
  })
}

function conflict(message = 'The review changed before this update was saved') {
  return Object.assign(new Error(message), { code: 'edit_conflict' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
  mocks.saveReview.mockResolvedValue(review('needs_work'))
  mocks.bulkTransition.mockResolvedValue([
    {
      id: REVIEW_ID,
      status: 'needs_work',
      reviewedAt: '2026-08-08T15:00:00.000Z',
      updatedAt: '2026-08-08T15:00:00.000Z',
      changed: true,
    },
  ])
  mocks.getTradingDate.mockReturnValue('2026-08-08')
  mocks.getMovers.mockImplementation(async (kind: string) => ({ kind }))
  mocks.selectCandidates.mockReturnValue([
    {
      reviewKey: '2026-08-08:cash:gainer:GRMN',
      symbol: 'GRMN',
      name: 'Garmin',
      price: 228.15,
      change: 31.4,
      changesPercentage: 15.96,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-08-08',
    },
  ])
  mocks.preview.mockResolvedValue(review().catalystSnapshot)
  mocks.ingest.mockResolvedValue([review()])
  mocks.automateDraft.mockResolvedValue({
    draft: {
      id: 'draft-1',
      status: 'review',
      subjectLine: 'Garmin raises guidance',
      beehiivUrl: null,
    },
    chartsAttached: 1,
    created: true,
    warning: null,
  })
})

describe('Why Moved authenticated command routes', () => {
  it('requires a signed-in admin before parsing or mutating review input', async () => {
    mocks.requireAdmin.mockRejectedValue(
      new mocks.AdminAccessError(
        'You must be signed in to access this admin feature.',
      ),
    )
    const response = await reviewPatch(
      request('/api/admin/why-moved/reviews', {
        method: 'PATCH',
        body: reviewBody(),
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.saveReview).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ success: false })
  })

  it('rejects cross-site cookie-authenticated commands before auth lookup', async () => {
    const response = await reviewPatch(
      request('/api/admin/why-moved/reviews', {
        method: 'PATCH',
        body: reviewBody(),
        headers: { Origin: 'https://attacker.example' },
      }),
    )

    expect(response.status).toBe(403)
    expect(mocks.requireAdmin).not.toHaveBeenCalled()
    expect(mocks.saveReview).not.toHaveBeenCalled()
  })

  it('saves a non-approval review with the loaded CAS token on the light route', async () => {
    const commandRequest = request('/api/admin/why-moved/reviews', {
      method: 'PATCH',
      body: reviewBody(),
    })
    const response = await reviewPatch(commandRequest)

    expect(response.status).toBe(200)
    expect(mocks.saveReview).toHaveBeenCalledWith({
      candidate: {
        reviewKey: '2026-08-08:cash:gainer:GRMN',
        symbol: 'GRMN',
        name: 'Garmin',
        price: 228.15,
        change: 31.4,
        changesPercentage: 15.96,
        direction: 'gainer',
        session: 'cash',
        marketDate: '2026-08-08',
      },
      status: 'needs_work',
      notes: 'Use the primary filing.',
      reviewerId: 'admin-1',
      expectedUpdatedAt: UPDATED_AT,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/why-moved')
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      review: { status: 'needs_work' },
    })
  })

  it('keeps approval out of the ordinary save route and maps CAS conflicts to 409', async () => {
    const approvalOnLightRoute = await reviewPatch(
      request('/api/admin/why-moved/reviews', {
        method: 'PATCH',
        body: reviewBody('approved'),
      }),
    )
    expect(approvalOnLightRoute.status).toBe(400)
    expect(mocks.saveReview).not.toHaveBeenCalled()

    mocks.saveReview.mockRejectedValue(conflict())
    const conflictResponse = await reviewPatch(
      request('/api/admin/why-moved/reviews', {
        method: 'PATCH',
        body: reviewBody(),
      }),
    )
    expect(conflictResponse.status).toBe(409)
    await expect(conflictResponse.json()).resolves.toEqual({
      success: false,
      conflict: true,
      error: 'The review changed before this update was saved',
    })
  })

  it('runs draft automation only on the isolated approval route', async () => {
    const approvedReview = review('approved')
    mocks.saveReview.mockResolvedValue(approvedReview)
    const response = await approvalPost(
      request('/api/admin/why-moved/reviews/approve', {
        body: reviewBody('approved'),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.saveReview).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        reviewerId: 'admin-1',
        expectedUpdatedAt: UPDATED_AT,
      }),
    )
    expect(mocks.automateDraft).toHaveBeenCalledWith(
      { ownerId: 'admin-1', sessionId: 'admin-admin-1' },
      {
        candidate: {
          reviewKey: '2026-08-08:cash:gainer:GRMN',
          symbol: 'GRMN',
          name: 'Garmin',
          price: 228.15,
          change: 31.4,
          changesPercentage: 15.96,
          direction: 'gainer',
          session: 'cash',
          marketDate: '2026-08-08',
        },
        review: approvedReview,
        whyMoving: approvedReview.catalystSnapshot,
      },
    )
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newsletterDraft: { id: 'draft-1', chartsAttached: 1, created: true },
    })
  })

  it('keeps approval durable when downstream draft automation needs attention', async () => {
    mocks.saveReview.mockResolvedValue(review('approved'))
    mocks.automateDraft.mockRejectedValue(new Error('Chart capture timed out'))

    const response = await approvalPost(
      request('/api/admin/why-moved/reviews/approve', {
        body: reviewBody('approved'),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      review: { status: 'approved' },
      automationError: 'Chart capture timed out',
    })
  })

  it('preserves bounded bulk idempotency and CAS inputs', async () => {
    const body = {
      targetStatus: 'needs_work',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      idempotencyKey: 'why_moved_bulk_001',
      confirmed: true,
    }
    const response = await bulkPost(
      request('/api/admin/why-moved/reviews/bulk', { body }),
    )

    expect(response.status).toBe(200)
    expect(mocks.bulkTransition).toHaveBeenCalledWith({
      targetStatus: 'needs_work',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      reviewerId: 'admin-1',
      idempotencyKey: 'why_moved_bulk_001',
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      results: [{ id: REVIEW_ID, changed: true }],
    })
  })

  it('previews fresh evidence without mutating the durable review', async () => {
    const commandRequest = request('/api/admin/why-moved/preview', {
      body: { symbol: 'grmn' },
    })
    const response = await previewPost(commandRequest)

    expect(response.status).toBe(200)
    expect(mocks.preview).toHaveBeenCalledWith('GRMN', {
      forceRefresh: true,
      signal: commandRequest.signal,
    })
    expect(mocks.saveReview).not.toHaveBeenCalled()
    expect(mocks.ingest).not.toHaveBeenCalled()
  })

  it('captures market evidence only on the isolated heavy command', async () => {
    const commandRequest = request('/api/admin/why-moved/capture')
    const response = await capturePost(commandRequest)

    expect(response.status).toBe(200)
    expect(mocks.getMovers.mock.calls.map(([kind]) => kind)).toEqual([
      'gainers',
      'losers',
    ])
    expect(mocks.selectCandidates).toHaveBeenCalledWith(
      { kind: 'gainers' },
      { kind: 'losers' },
      '2026-08-08',
    )
    expect(mocks.preview).toHaveBeenCalledWith('GRMN', {
      signal: commandRequest.signal,
    })
    expect(mocks.ingest).toHaveBeenCalledWith({
      sourceRunId: expect.stringMatching(
        /^admin-capture:2026-08-08:[0-9a-f-]+$/,
      ),
      seenAt: expect.any(String),
      discoveries: [
        {
          candidate: expect.objectContaining({ symbol: 'GRMN' }),
          catalyst: review().catalystSnapshot,
        },
      ],
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      captured: 1,
      marketDate: '2026-08-08',
    })
  })
})
