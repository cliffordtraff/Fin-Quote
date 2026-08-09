import { randomUUID } from 'crypto'
import { rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bulkTransitionWhyMovedReviews,
  ingestWhyMovedEditorialCandidates,
  listWhyMovedEditorialInbox,
  saveWhyMovedReview,
  WhyMovedReviewConflictError,
  WhyMovedReviewValidationError,
} from '@/lib/why-moved-review'
import type {
  WhyMovedBulkReviewTransitionInput,
  WhyMovedCandidate,
  WhyMovedEditorialDiscovery,
} from '@/lib/why-moved-types'

const localReviewDir = resolve(
  tmpdir(),
  `fin-quote-editorial-inbox-${randomUUID()}`,
)
const localReviewPath = resolve(localReviewDir, 'reviews.json')
const reviewerId = '11111111-1111-4111-8111-111111111111'
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  rmSync(localReviewDir, { recursive: true, force: true })
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
  }
  if (originalServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
  }
})

function discovery(input: {
  symbol: string
  marketDate: string
  direction?: 'gainer' | 'loser'
  session?: 'premarket' | 'cash' | 'afterhours' | 'closed'
  price?: number
  headline?: string
  fetchedAt?: string
}): WhyMovedEditorialDiscovery {
  const direction = input.direction ?? 'gainer'
  const session = input.session ?? 'cash'
  const symbol = input.symbol.toUpperCase()
  const candidate: WhyMovedCandidate = {
    reviewKey: `${input.marketDate}:${session}:${direction}:${symbol}`,
    symbol,
    name: `${symbol} Inc.`,
    price: input.price ?? 25,
    change: direction === 'gainer' ? 2 : -2,
    changesPercentage: direction === 'gainer' ? 8 : -8,
    direction,
    session,
    marketDate: input.marketDate,
  }
  return {
    candidate,
    catalyst: {
      symbol,
      status: 'found',
      displayText: input.headline ?? `${symbol} announced an update`,
      headline: input.headline ?? `${symbol} announced an update`,
      summary: 'Discovery-time evidence.',
      bulletPoints: ['The announcement was released before the move.'],
      sentiment: direction === 'gainer' ? 'positive' : 'negative',
      source: 'Company release',
      sourceTimestamp: null,
      isCatalyst: true,
      sourceUrl: `https://example.com/${symbol}`,
      fetchedAt: input.fetchedAt ?? '2026-08-01T13:00:00.000Z',
      errorMessage: null,
    },
  }
}

async function ingestMany(
  discoveries: WhyMovedEditorialDiscovery[],
  sourceRunId = 'automation-run-1',
  seenAt = '2026-08-01T13:05:00.000Z',
) {
  return ingestWhyMovedEditorialCandidates(
    { sourceRunId, seenAt, discoveries },
    { localStoragePath: localReviewPath },
  )
}

describe('durable why-moved editorial inbox', () => {
  it('preserves first-discovery evidence and the review CAS on rediscovery', async () => {
    const first = discovery({
      symbol: 'AAA',
      marketDate: '2026-08-01',
      price: 25,
      headline: 'Original catalyst',
    })
    const [created] = await ingestMany([first])
    const rediscovery = discovery({
      symbol: 'AAA',
      marketDate: '2026-08-01',
      price: 999,
      headline: 'A later, unrelated headline',
      fetchedAt: '2026-08-02T14:00:00.000Z',
    })

    const [rediscovered] = await ingestMany(
      [rediscovery],
      'automation-run-2',
      '2026-08-02T14:05:00.000Z',
    )

    expect(rediscovered).toMatchObject({
      id: created.id,
      discoveryRunId: 'automation-run-1',
      firstSeenAt: '2026-08-01T13:05:00.000Z',
      lastSeenAt: '2026-08-02T14:05:00.000Z',
      updatedAt: created.updatedAt,
      candidateSnapshot: { price: 25 },
      catalystSnapshot: { headline: 'Original catalyst' },
    })
  })

  it('rejects symbol-only catalyst mismatches before persistence', async () => {
    const mismatched = discovery({ symbol: 'AAA', marketDate: '2026-08-01' })
    mismatched.catalyst.symbol = 'BBB'

    await expect(ingestMany([mismatched])).rejects.toThrow(
      WhyMovedReviewValidationError,
    )
    expect(
      await listWhyMovedEditorialInbox(
        {},
        { localStoragePath: localReviewPath },
      ),
    ).toMatchObject({ items: [], total: 0 })
  })

  it('pages old unresolved rows before current resolved rows and supports history filters', async () => {
    const oldPending = discovery({ symbol: 'AAA', marketDate: '2026-07-29' })
    const oldNeedsWork = discovery({ symbol: 'BBB', marketDate: '2026-07-30' })
    const oldDismissed = discovery({ symbol: 'CCC', marketDate: '2026-07-31' })
    const currentApproved = discovery({ symbol: 'DDD', marketDate: '2026-08-01' })
    const records = await ingestMany([
      oldPending,
      oldNeedsWork,
      oldDismissed,
      currentApproved,
    ])
    const recordsByKey = new Map(records.map((record) => [record.reviewKey, record]))

    await saveWhyMovedReview(
      {
        candidate: oldNeedsWork.candidate,
        status: 'needs_work',
        notes: 'Needs a primary source.',
        reviewerId,
        expectedUpdatedAt: recordsByKey.get(oldNeedsWork.candidate.reviewKey)!
          .updatedAt,
      },
      { localStoragePath: localReviewPath },
    )
    await saveWhyMovedReview(
      {
        candidate: oldDismissed.candidate,
        status: 'dismissed',
        notes: 'Not material.',
        reviewerId,
        expectedUpdatedAt: recordsByKey.get(oldDismissed.candidate.reviewKey)!
          .updatedAt,
      },
      { localStoragePath: localReviewPath },
    )
    await saveWhyMovedReview(
      {
        candidate: currentApproved.candidate,
        status: 'approved',
        notes: 'Verified.',
        reviewerId,
        expectedUpdatedAt: recordsByKey.get(currentApproved.candidate.reviewKey)!
          .updatedAt,
      },
      { localStoragePath: localReviewPath },
    )

    const firstPage = await listWhyMovedEditorialInbox(
      {
        currentReviewKeys: [currentApproved.candidate.reviewKey],
        pageSize: 2,
      },
      { localStoragePath: localReviewPath },
    )
    expect(firstPage.items.map((item) => item.review.reviewKey)).toEqual([
      oldPending.candidate.reviewKey,
      oldNeedsWork.candidate.reviewKey,
    ])
    expect(firstPage).toMatchObject({
      total: 3,
      statusCounts: {
        pending: 1,
        needs_work: 1,
        approved: 1,
        dismissed: 0,
      },
      hasMore: true,
    })

    const secondPage = await listWhyMovedEditorialInbox(
      {
        currentReviewKeys: [currentApproved.candidate.reviewKey],
        pageSize: 2,
        cursor: firstPage.nextCursor!,
      },
      { localStoragePath: localReviewPath },
    )
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]).toMatchObject({
      current: true,
      review: { reviewKey: currentApproved.candidate.reviewKey },
    })

    const dismissedHistory = await listWhyMovedEditorialInbox(
      {
        status: 'dismissed',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      },
      { localStoragePath: localReviewPath },
    )
    expect(dismissedHistory.items.map((item) => item.review.reviewKey)).toEqual([
      oldDismissed.candidate.reviewKey,
    ])
    expect(dismissedHistory.total).toBe(1)
    expect(dismissedHistory.statusCounts).toEqual({
      pending: 1,
      needs_work: 1,
      approved: 0,
      dismissed: 1,
    })
  })

  it('applies local bulk transitions atomically and replays durable receipts', async () => {
    const discoveries = [
      discovery({ symbol: 'AAA', marketDate: '2026-08-01' }),
      discovery({ symbol: 'BBB', marketDate: '2026-08-01' }),
    ]
    const records = await ingestMany(discoveries)
    const staleRequest: WhyMovedBulkReviewTransitionInput = {
      targetStatus: 'needs_work',
      reviewerId,
      idempotencyKey: 'bulk_stale_001',
      items: [
        { id: records[0].id, expectedUpdatedAt: records[0].updatedAt },
        { id: records[1].id, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    }

    await expect(
      bulkTransitionWhyMovedReviews(staleRequest, {
        localStoragePath: localReviewPath,
      }),
    ).rejects.toThrow(WhyMovedReviewConflictError)
    const afterConflict = await listWhyMovedEditorialInbox(
      {},
      { localStoragePath: localReviewPath },
    )
    expect(afterConflict.items.map((item) => item.review.status)).toEqual([
      'pending',
      'pending',
    ])

    const request: WhyMovedBulkReviewTransitionInput = {
      ...staleRequest,
      idempotencyKey: 'bulk_success_001',
      items: records.map((record) => ({
        id: record.id,
        expectedUpdatedAt: record.updatedAt,
      })),
    }
    const changed = await bulkTransitionWhyMovedReviews(request, {
      localStoragePath: localReviewPath,
    })
    expect(changed).toHaveLength(2)
    expect(changed.every((result) => result.changed)).toBe(true)

    const replayed = await bulkTransitionWhyMovedReviews(request, {
      localStoragePath: localReviewPath,
    })
    expect(replayed).toEqual(
      changed.map((result) => ({ ...result, changed: false })),
    )
    await expect(
      bulkTransitionWhyMovedReviews(
        { ...request, targetStatus: 'dismissed' },
        { localStoragePath: localReviewPath },
      ),
    ).rejects.toThrow(WhyMovedReviewConflictError)
  })

  it('keeps approval individual and rejects stale individual review writes', async () => {
    const item = discovery({ symbol: 'AAA', marketDate: '2026-08-01' })
    const [record] = await ingestMany([item])
    const approved = await saveWhyMovedReview(
      {
        candidate: item.candidate,
        status: 'approved',
        notes: 'Verified.',
        reviewerId,
        expectedUpdatedAt: record.updatedAt,
      },
      { localStoragePath: localReviewPath },
    )
    expect(approved.status).toBe('approved')

    await expect(
      saveWhyMovedReview(
        {
          candidate: item.candidate,
          status: 'needs_work',
          notes: 'Stale edit.',
          reviewerId,
          expectedUpdatedAt: record.updatedAt,
        },
        { localStoragePath: localReviewPath },
      ),
    ).rejects.toThrow(WhyMovedReviewConflictError)

    await expect(
      bulkTransitionWhyMovedReviews(
        {
          targetStatus: 'dismissed',
          reviewerId,
          idempotencyKey: ['bulk', 'approved', '001'].join('_'),
          items: [{ id: approved.id, expectedUpdatedAt: approved.updatedAt }],
        },
        { localStoragePath: localReviewPath },
      ),
    ).rejects.toThrow(WhyMovedReviewConflictError)

    const invalidApproval = {
      targetStatus: 'approved',
      reviewerId,
      idempotencyKey: 'bulk_approval_001',
      items: [{ id: approved.id, expectedUpdatedAt: approved.updatedAt }],
    } as unknown as WhyMovedBulkReviewTransitionInput
    await expect(
      bulkTransitionWhyMovedReviews(invalidApproval, {
        localStoragePath: localReviewPath,
      }),
    ).rejects.toThrow(WhyMovedReviewValidationError)
  })

  it('enforces the 100-item bulk bound before touching storage', async () => {
    const oversized = {
      targetStatus: 'dismissed',
      reviewerId,
      idempotencyKey: 'bulk_oversized_001',
      items: Array.from({ length: 101 }, () => ({
        id: randomUUID(),
        expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      })),
    } satisfies WhyMovedBulkReviewTransitionInput

    await expect(
      bulkTransitionWhyMovedReviews(oversized, {
        localStoragePath: localReviewPath,
      }),
    ).rejects.toThrow(WhyMovedReviewValidationError)
  })
})
