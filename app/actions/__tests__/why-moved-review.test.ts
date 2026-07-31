import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WhyMovedCandidate,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  saveReview: vi.fn(),
  getWhyMoving: vi.fn(),
  ensureDraft: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminUser: mocks.requireAdminUser,
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
  }
})

import { saveWhyMovedReviewAction } from '@/app/actions/why-moved-review'

function candidate(): WhyMovedCandidate {
  return {
    reviewKey: '2026-07-29:cash:gainer:GRMN',
    symbol: 'GRMN',
    name: 'Garmin',
    price: 228.15,
    change: 31.4,
    changesPercentage: 15.96,
    direction: 'gainer',
    session: 'cash',
    marketDate: '2026-07-29',
  }
}

function review(
  status: WhyMovedReviewRecord['status'],
): WhyMovedReviewRecord {
  return {
    id: 'review-1',
    reviewKey: candidate().reviewKey,
    symbol: 'GRMN',
    marketDate: '2026-07-29',
    session: 'cash',
    direction: 'gainer',
    status,
    notes: 'Lead with guidance.',
    reviewerId: 'user-1',
    reviewedAt: '2026-07-29T14:00:00.000Z',
    createdAt: '2026-07-29T13:50:00.000Z',
    updatedAt: '2026-07-29T14:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: 'user-1' },
    isAdmin: true,
    adminConfigured: true,
  })
  mocks.getWhyMoving.mockResolvedValue({
    symbol: 'GRMN',
    status: 'found',
    headline: 'Garmin raised guidance',
    summary: 'Quarterly results beat expectations.',
    displayText: 'Garmin raised guidance',
    bulletPoints: [],
    sentiment: 'positive',
    source: 'Finviz',
    sourceTimestamp: null,
    isCatalyst: true,
    sourceUrl: 'https://finviz.com/quote.ashx?t=GRMN&p=d',
    fetchedAt: '2026-07-29T14:00:00.000Z',
    errorMessage: null,
  })
})

describe('why-moved review action', () => {
  it('creates or reuses a newsletter draft as part of approval', async () => {
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
    })

    expect(result).toMatchObject({
      success: true,
      newsletterDraft: {
        id: 'draft-1',
        chartsAttached: 2,
        created: true,
      },
    })
    expect(mocks.ensureDraft).toHaveBeenCalledWith(
      {
        ownerId: 'user-1',
        sessionId: 'admin-user-1',
      },
      {
        candidate: candidate(),
        review: approvedReview,
        whyMoving: expect.objectContaining({ symbol: 'GRMN' }),
      },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/newsletter/editor')
  })

  it('does not create a newsletter issue for non-approved review states', async () => {
    mocks.saveReview.mockResolvedValue(review('needs_work'))

    const result = await saveWhyMovedReviewAction({
      candidate: candidate(),
      status: 'needs_work',
      notes: 'Needs a primary source.',
    })

    expect(result).toMatchObject({
      success: true,
      review: { status: 'needs_work' },
    })
    expect(mocks.ensureDraft).not.toHaveBeenCalled()
  })
})
