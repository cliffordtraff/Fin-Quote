import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WhyMovedCandidate,
  WhyMovedEditorialReviewRecord,
} from '@/lib/why-moved-types'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const REVIEW_ID = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-08-08T14:00:00.000Z'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  saveReview: vi.fn(),
  bulkTransition: vi.fn(),
  ingestCandidates: vi.fn(),
  selectCandidates: vi.fn(),
  getWhyMoving: vi.fn(),
  getAllSessionMovers: vi.fn(),
  ensureDraft: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminUser: mocks.requireAdminUser,
}))

vi.mock('@/app/actions/market-movers', () => ({
  getAllSessionMovers: mocks.getAllSessionMovers,
}))

vi.mock('@/lib/market-hours', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/market-hours')>()),
  getTradingDate: () => '2026-08-08',
}))

vi.mock('@/lib/stock-why-moving', () => ({
  getStockWhyMovingData: mocks.getWhyMoving,
}))

vi.mock('@/lib/newsletter/catalyst-workflow', () => ({
  ensureApprovedCatalystNewsletterDraft: mocks.ensureDraft,
}))

vi.mock('@/lib/why-moved-review', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/why-moved-review')>()
  return {
    ...actual,
    saveWhyMovedReview: mocks.saveReview,
    bulkTransitionWhyMovedReviews: mocks.bulkTransition,
    ingestWhyMovedEditorialCandidates: mocks.ingestCandidates,
    selectWhyMovedCandidates: mocks.selectCandidates,
  }
})

import {
  bulkTransitionWhyMovedReviewsAction,
  captureCurrentWhyMovedCandidatesAction,
  refreshWhyMovedCatalystAction,
  saveWhyMovedReviewAction,
} from '@/app/actions/why-moved-review'
import { WhyMovedReviewConflictError } from '@/lib/why-moved-review'

function candidate(): WhyMovedCandidate {
  return {
    reviewKey: '2026-08-08:cash:gainer:GRMN',
    symbol: 'GRMN',
    name: 'Garmin',
    price: 228.15,
    change: 31.4,
    changesPercentage: 15.96,
    direction: 'gainer',
    session: 'cash',
    marketDate: '2026-08-08',
  }
}

function catalyst() {
  return {
    symbol: 'GRMN',
    status: 'found' as const,
    headline: 'Garmin raised guidance',
    summary: 'Quarterly results beat expectations.',
    displayText: 'Garmin raised guidance',
    bulletPoints: ['Management raised its full-year outlook.'],
    sentiment: 'positive',
    source: 'Company release',
    sourceTimestamp: null,
    isCatalyst: true,
    sourceUrl: 'https://example.test/garmin-release',
    fetchedAt: '2026-08-08T13:50:00.000Z',
    errorMessage: null,
  }
}

function review(
  status: WhyMovedEditorialReviewRecord['status'],
): WhyMovedEditorialReviewRecord {
  return {
    id: REVIEW_ID,
    reviewKey: candidate().reviewKey,
    symbol: 'GRMN',
    marketDate: '2026-08-08',
    session: 'cash',
    direction: 'gainer',
    status,
    notes: 'Lead with guidance.',
    reviewerId: USER_ID,
    reviewedAt: '2026-08-08T14:00:00.000Z',
    candidateSnapshot: candidate(),
    catalystSnapshot: catalyst(),
    snapshotState: 'captured',
    discoveryRunId: 'automation-run-1',
    firstSeenAt: '2026-08-08T13:45:00.000Z',
    lastSeenAt: '2026-08-08T13:45:00.000Z',
    createdAt: '2026-08-08T13:45:00.000Z',
    updatedAt: UPDATED_AT,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: USER_ID },
    isAdmin: true,
    adminConfigured: true,
  })
  mocks.getWhyMoving.mockResolvedValue(catalyst())
  mocks.getAllSessionMovers.mockResolvedValue({
    premarket: [],
    cash: [],
    afterhours: [],
    currentSession: 'cash',
  })
  mocks.selectCandidates.mockReturnValue([candidate()])
})

describe('durable why-moved review actions', () => {
  it('CAS-saves an approval and builds its draft from immutable evidence', async () => {
    const approvedReview = review('approved')
    mocks.saveReview.mockResolvedValue(approvedReview)
    mocks.ensureDraft.mockResolvedValue({
      created: true,
      chartsAttached: 2,
      generatedChart: false,
      warning: null,
      draft: {
        id: 'draft-1',
        status: 'draft',
        subjectLine: 'GRMN: Garmin raised guidance',
        beehiivUrl: null,
      },
    })

    const result = await saveWhyMovedReviewAction({
      candidate: candidate(),
      status: 'approved',
      notes: 'Lead with guidance.',
      expectedUpdatedAt: UPDATED_AT,
    })

    expect(result).toMatchObject({
      success: true,
      newsletterDraft: {
        id: 'draft-1',
        chartsAttached: 2,
        created: true,
      },
    })
    expect(mocks.saveReview).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: UPDATED_AT,
        reviewerId: USER_ID,
      }),
    )
    expect(mocks.ensureDraft).toHaveBeenCalledWith(
      {
        ownerId: USER_ID,
        sessionId: `admin-${USER_ID}`,
      },
      {
        candidate: approvedReview.candidateSnapshot,
        review: approvedReview,
        whyMoving: approvedReview.catalystSnapshot,
      },
    )
    expect(mocks.getWhyMoving).not.toHaveBeenCalled()
  })

  it('reports an edit conflict and does not run approval automation', async () => {
    mocks.saveReview.mockRejectedValue(
      new WhyMovedReviewConflictError('The review changed'),
    )

    const result = await saveWhyMovedReviewAction({
      candidate: candidate(),
      status: 'approved',
      notes: 'Stale notes.',
      expectedUpdatedAt: UPDATED_AT,
    })

    expect(result).toEqual({
      success: false,
      conflict: true,
      error: 'The review changed',
    })
    expect(mocks.ensureDraft).not.toHaveBeenCalled()
  })

  it('does not create a newsletter issue for non-approved review states', async () => {
    mocks.saveReview.mockResolvedValue(review('needs_work'))

    const result = await saveWhyMovedReviewAction({
      candidate: candidate(),
      status: 'needs_work',
      notes: 'Needs a primary source.',
      expectedUpdatedAt: UPDATED_AT,
    })

    expect(result).toMatchObject({
      success: true,
      review: { status: 'needs_work' },
    })
    expect(mocks.ensureDraft).not.toHaveBeenCalled()
  })

  it('never replaces missing legacy evidence with a current symbol lookup', async () => {
    mocks.saveReview.mockResolvedValue({
      ...review('approved'),
      snapshotState: 'legacy_missing',
    })

    const result = await saveWhyMovedReviewAction({
      candidate: candidate(),
      status: 'approved',
      notes: 'Legacy approval.',
      expectedUpdatedAt: UPDATED_AT,
    })

    expect(result).toMatchObject({
      success: true,
      automationError: expect.stringContaining(
        'no discovery-time catalyst snapshot',
      ),
    })
    expect(mocks.getWhyMoving).not.toHaveBeenCalled()
    expect(mocks.ensureDraft).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and derives the bulk reviewer server-side', async () => {
    mocks.bulkTransition.mockResolvedValue([
      {
        id: REVIEW_ID,
        status: 'dismissed',
        reviewedAt: '2026-08-08T14:05:00.000Z',
        updatedAt: '2026-08-08T14:05:00.000Z',
        changed: true,
      },
    ])

    const result = await bulkTransitionWhyMovedReviewsAction({
      targetStatus: 'dismissed',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      idempotencyKey: 'why_moved_bulk_001',
      confirmed: true,
    })

    expect(result.success).toBe(true)
    expect(mocks.bulkTransition).toHaveBeenCalledWith({
      targetStatus: 'dismissed',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      reviewerId: USER_ID,
      idempotencyKey: 'why_moved_bulk_001',
    })
  })

  it('rejects bulk approval before calling the persistence layer', async () => {
    const invalidInput = {
      targetStatus: 'approved',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      idempotencyKey: 'why_moved_bulk_002',
      confirmed: true,
    } as unknown as Parameters<
      typeof bulkTransitionWhyMovedReviewsAction
    >[0]

    const result = await bulkTransitionWhyMovedReviewsAction(invalidInput)

    expect(result.success).toBe(false)
    expect(mocks.bulkTransition).not.toHaveBeenCalled()
  })

  it('captures candidate and catalyst snapshots only in the explicit capture action', async () => {
    mocks.ingestCandidates.mockResolvedValue([review('pending')])

    const result = await captureCurrentWhyMovedCandidatesAction()

    expect(result).toMatchObject({
      success: true,
      captured: 1,
      marketDate: '2026-08-08',
      reviewKeys: [candidate().reviewKey],
    })
    expect(mocks.ingestCandidates).toHaveBeenCalledWith({
      sourceRunId: expect.stringMatching(
        /^admin-capture:2026-08-08:[0-9a-f-]+$/,
      ),
      seenAt: expect.any(String),
      discoveries: [{ candidate: candidate(), catalyst: catalyst() }],
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/why-moved')
  })

  it('keeps current catalyst preview separate from durable ingestion', async () => {
    const result = await refreshWhyMovedCatalystAction('grmn')

    expect(result).toMatchObject({ success: true, whyMoving: catalyst() })
    expect(mocks.getWhyMoving).toHaveBeenCalledWith('GRMN', {
      forceRefresh: true,
    })
    expect(mocks.ingestCandidates).not.toHaveBeenCalled()
    expect(mocks.saveReview).not.toHaveBeenCalled()
  })
})
