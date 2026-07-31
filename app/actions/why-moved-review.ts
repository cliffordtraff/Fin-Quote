'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/auth/admin'
import { getStockWhyMovingData } from '@/lib/stock-why-moving'
import { ensureApprovedCatalystNewsletterDraft } from '@/lib/newsletter/catalyst-workflow'
import {
  buildWhyMovedReviewKey,
  saveWhyMovedReview,
} from '@/lib/why-moved-review'
import type {
  WhyMovedCandidate,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'

const candidateSchema = z.object({
  reviewKey: z.string().trim().min(1).max(180),
  symbol: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,9}$/),
  name: z.string().trim().max(200),
  price: z.number().finite(),
  change: z.number().finite(),
  changesPercentage: z.number().finite(),
  direction: z.enum(['gainer', 'loser']),
  session: z.enum(['premarket', 'cash', 'afterhours', 'closed']),
  marketDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const reviewSchema = z.object({
  candidate: candidateSchema,
  status: z.enum(['pending', 'approved', 'needs_work', 'dismissed']),
  notes: z.string().max(1000),
})

export interface SaveWhyMovedReviewActionResult {
  success: boolean
  review?: WhyMovedReviewRecord
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

export async function saveWhyMovedReviewAction(input: {
  candidate: WhyMovedCandidate
  status: 'pending' | 'approved' | 'needs_work' | 'dismissed'
  notes: string
}): Promise<SaveWhyMovedReviewActionResult> {
  try {
    const parsed = reviewSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid review update',
      }
    }

    const candidate = {
      ...parsed.data.candidate,
      symbol: parsed.data.candidate.symbol.toUpperCase(),
    }
    const expectedReviewKey = buildWhyMovedReviewKey(candidate)
    if (candidate.reviewKey !== expectedReviewKey) {
      return {
        success: false,
        error: 'Catalyst review key does not match the candidate',
      }
    }

    const { user } = await requireAdminUser()
    const review = await saveWhyMovedReview({
      candidate,
      status: parsed.data.status,
      notes: parsed.data.notes,
      reviewerId: user.id,
    })

    revalidatePath('/admin/why-moved')
    if (review.status !== 'approved') {
      return { success: true, review }
    }

    try {
      const whyMoving = await getStockWhyMovingData(candidate.symbol)
      const automated = await ensureApprovedCatalystNewsletterDraft(
        {
          ownerId: user.id,
          sessionId: `admin-${user.id}`,
        },
        {
          candidate,
          review,
          whyMoving,
        },
      )
      revalidatePath('/newsletter/editor')
      revalidatePath(`/newsletter/editor/${automated.draft.id}`)
      return {
        success: true,
        review,
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
        review,
        automationError:
          automationError instanceof Error
            ? automationError.message
            : 'Failed to automate newsletter draft creation',
      }
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to save catalyst review',
    }
  }
}

export async function refreshWhyMovedCatalystAction(symbol: string) {
  try {
    const parsed = candidateSchema.shape.symbol.safeParse(symbol)
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
        error instanceof Error ? error.message : 'Failed to refresh catalyst',
    }
  }
}
