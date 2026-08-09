'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import { requireAdminUser } from '@/lib/auth/admin'
import { getTradingDate } from '@/lib/market-hours'
import { ensureApprovedCatalystNewsletterDraft } from '@/lib/newsletter/catalyst-workflow'
import {
  getStockWhyMovingData,
  type StockWhyMovingResult,
} from '@/lib/stock-why-moving'
import {
  buildWhyMovedReviewKey,
  bulkTransitionWhyMovedReviews,
  ingestWhyMovedEditorialCandidates,
  saveWhyMovedReview,
  selectWhyMovedCandidates,
  WhyMovedReviewConflictError,
} from '@/lib/why-moved-review'
import type {
  WhyMovedBulkReviewStatus,
  WhyMovedBulkReviewTransitionResult,
  WhyMovedCandidate,
  WhyMovedCandidateSnapshot,
  WhyMovedEditorialReviewRecord,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'

const symbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,9}$/)
const timestampSchema = z.string().datetime({ offset: true })
const candidateSnapshotSchema = z.object({
  reviewKey: z.string().trim().min(1).max(180),
  symbol: symbolSchema,
  name: z.string().max(200).nullable(),
  price: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changesPercentage: z.number().finite().nullable(),
  direction: z.enum(['gainer', 'loser']),
  session: z.enum(['premarket', 'cash', 'afterhours', 'closed']),
  marketDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
const reviewSchema = z.object({
  candidate: candidateSnapshotSchema,
  status: z.enum(['pending', 'approved', 'needs_work', 'dismissed']),
  notes: z.string().max(1000),
  expectedUpdatedAt: timestampSchema,
})
const bulkReviewSchema = z.object({
  targetStatus: z.enum(['pending', 'needs_work', 'dismissed']),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        expectedUpdatedAt: timestampSchema,
      }),
    )
    .min(1)
    .max(100),
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/),
  confirmed: z.literal(true),
})

export interface SaveWhyMovedReviewActionResult {
  success: boolean
  conflict?: boolean
  review?: WhyMovedEditorialReviewRecord
  newsletterDraft?: {
    id: string
    status: string
    subjectLine: string
    chartsAttached: number
    created: boolean
    warning: string | null
    beehiivUrl: string | null
  }
  automationError?: string
  error?: string
}

export interface BulkWhyMovedReviewActionResult {
  success: boolean
  conflict?: boolean
  results?: WhyMovedBulkReviewTransitionResult[]
  error?: string
}

export interface CaptureCurrentWhyMovedActionResult {
  success: boolean
  captured?: number
  marketDate?: string
  reviewKeys?: string[]
  error?: string
}

function mutableCandidate(
  snapshot: WhyMovedCandidateSnapshot,
): WhyMovedCandidate {
  return {
    reviewKey: snapshot.reviewKey,
    symbol: snapshot.symbol.toUpperCase(),
    name: snapshot.name ?? snapshot.symbol.toUpperCase(),
    price: snapshot.price ?? 0,
    change: snapshot.change ?? 0,
    changesPercentage: snapshot.changesPercentage ?? 0,
    direction: snapshot.direction,
    session: snapshot.session,
    marketDate: snapshot.marketDate,
  }
}

function isEditorialReview(
  review: WhyMovedReviewRecord,
): review is WhyMovedEditorialReviewRecord {
  const candidateSnapshot = (
    review as Partial<WhyMovedEditorialReviewRecord>
  ).candidateSnapshot
  const catalystSnapshot = (
    review as Partial<WhyMovedEditorialReviewRecord>
  ).catalystSnapshot
  return Boolean(
    candidateSnapshot &&
      catalystSnapshot &&
      typeof (
        review as Partial<WhyMovedEditorialReviewRecord>
      ).firstSeenAt === 'string',
  )
}

function captureErrorCatalyst(
  symbol: string,
  error: unknown,
): StockWhyMovingResult {
  return {
    symbol,
    status: 'error',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt: new Date().toISOString(),
    errorMessage:
      error instanceof Error ? error.message : 'Catalyst capture failed',
  }
}

export async function saveWhyMovedReviewAction(input: {
  candidate: WhyMovedCandidateSnapshot
  status: 'pending' | 'approved' | 'needs_work' | 'dismissed'
  notes: string
  expectedUpdatedAt: string
}): Promise<SaveWhyMovedReviewActionResult> {
  try {
    const parsed = reviewSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid review update',
      }
    }

    const candidateSnapshot = {
      ...parsed.data.candidate,
      symbol: parsed.data.candidate.symbol.toUpperCase(),
    }
    const candidate = mutableCandidate(candidateSnapshot)
    if (candidate.reviewKey !== buildWhyMovedReviewKey(candidate)) {
      return {
        success: false,
        error: 'Catalyst review key does not match the candidate',
      }
    }

    const { user } = await requireAdminUser()
    const savedReview = await saveWhyMovedReview({
      candidate,
      status: parsed.data.status,
      notes: parsed.data.notes,
      reviewerId: user.id,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    })
    if (!isEditorialReview(savedReview)) {
      return {
        success: false,
        error: 'The durable catalyst snapshot is unavailable. Reload and retry.',
      }
    }

    revalidatePath('/admin/why-moved')
    if (savedReview.status !== 'approved') {
      return { success: true, review: savedReview }
    }
    if (savedReview.snapshotState !== 'captured') {
      return {
        success: true,
        review: savedReview,
        automationError:
          'Approved, but no discovery-time catalyst snapshot exists for draft automation.',
      }
    }

    try {
      const automated = await ensureApprovedCatalystNewsletterDraft(
        {
          ownerId: user.id,
          sessionId: `admin-${user.id}`,
        },
        {
          candidate: mutableCandidate(savedReview.candidateSnapshot),
          review: savedReview,
          whyMoving: savedReview.catalystSnapshot,
        },
      )
      revalidatePath('/newsletter/editor')
      revalidatePath(`/newsletter/editor/${automated.draft.id}`)
      return {
        success: true,
        review: savedReview,
        newsletterDraft: {
          id: automated.draft.id,
          status: automated.draft.status,
          subjectLine: automated.draft.subjectLine,
          chartsAttached: automated.chartsAttached,
          created: automated.created,
          warning: automated.warning,
          beehiivUrl: automated.draft.beehiivUrl,
        },
      }
    } catch (automationError) {
      return {
        success: true,
        review: savedReview,
        automationError:
          automationError instanceof Error
            ? automationError.message
            : 'Failed to automate newsletter draft creation',
      }
    }
  } catch (error) {
    return {
      success: false,
      conflict: error instanceof WhyMovedReviewConflictError,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to save catalyst review',
    }
  }
}

export async function bulkTransitionWhyMovedReviewsAction(input: {
  targetStatus: WhyMovedBulkReviewStatus
  items: Array<{ id: string; expectedUpdatedAt: string }>
  idempotencyKey: string
  confirmed: true
}): Promise<BulkWhyMovedReviewActionResult> {
  try {
    const parsed = bulkReviewSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid bulk review update',
      }
    }
    const { user } = await requireAdminUser()
    const results = await bulkTransitionWhyMovedReviews({
      targetStatus: parsed.data.targetStatus,
      items: parsed.data.items,
      reviewerId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    })
    revalidatePath('/admin/why-moved')
    return { success: true, results }
  } catch (error) {
    return {
      success: false,
      conflict: error instanceof WhyMovedReviewConflictError,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update catalyst reviews',
    }
  }
}

export async function captureCurrentWhyMovedCandidatesAction(): Promise<CaptureCurrentWhyMovedActionResult> {
  try {
    await requireAdminUser()
    const marketDate = getTradingDate()
    const [gainers, losers] = await Promise.all([
      getAllSessionMovers('gainers'),
      getAllSessionMovers('losers'),
    ])
    const candidates = selectWhyMovedCandidates(gainers, losers, marketDate)
    if (candidates.length === 0) {
      return { success: true, captured: 0, marketDate, reviewKeys: [] }
    }

    const catalysts = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await getStockWhyMovingData(candidate.symbol)
        } catch (error) {
          return captureErrorCatalyst(candidate.symbol, error)
        }
      }),
    )
    const records = await ingestWhyMovedEditorialCandidates({
      sourceRunId: `admin-capture:${marketDate}:${crypto.randomUUID()}`,
      seenAt: new Date().toISOString(),
      discoveries: candidates.map((candidate, index) => ({
        candidate,
        catalyst: catalysts[index],
      })),
    })
    revalidatePath('/admin/why-moved')
    return {
      success: true,
      captured: records.length,
      marketDate,
      reviewKeys: records.map((record) => record.reviewKey),
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to capture current market catalysts',
    }
  }
}

/** Returns a current preview without changing the durable discovery snapshot. */
export async function refreshWhyMovedCatalystAction(symbol: string) {
  try {
    const parsed = symbolSchema.safeParse(symbol)
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid symbol' }
    }
    await requireAdminUser()
    const whyMoving = await getStockWhyMovingData(
      parsed.data.toUpperCase(),
      { forceRefresh: true },
    )
    return { success: true as const, whyMoving }
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to preview current catalyst',
    }
  }
}
