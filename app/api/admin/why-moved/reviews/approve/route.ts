export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { revalidatePath } from 'next/cache'
import { NextRequest } from 'next/server'
import {
  authorizeAdminCommand,
  commandErrorResponse,
  invalidCommandResponse,
  isEditorialReview,
  mutableCandidate,
  parseCommandJson,
  privateJson,
  reviewUpdateSchema,
} from '@/app/api/admin/why-moved/_shared'
import { ensureApprovedCatalystNewsletterDraft } from '@/lib/newsletter/catalyst-workflow'
import {
  buildWhyMovedReviewKey,
  saveWhyMovedReview,
} from '@/lib/why-moved-review'

/** Approval is isolated because it can create a newsletter draft and charts. */
export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeAdminCommand(request)
    if (authorization.response) return authorization.response
    const parsed = reviewUpdateSchema.safeParse(await parseCommandJson(request))
    if (!parsed.success) {
      return invalidCommandResponse(
        parsed.error.issues[0]?.message ?? 'Invalid review approval',
      )
    }
    if (parsed.data.status !== 'approved') {
      return invalidCommandResponse(
        'The approval command only accepts approved reviews.',
      )
    }

    const candidateSnapshot = {
      ...parsed.data.candidate,
      symbol: parsed.data.candidate.symbol.toUpperCase(),
    }
    const candidate = mutableCandidate(candidateSnapshot)
    if (candidate.reviewKey !== buildWhyMovedReviewKey(candidate)) {
      return invalidCommandResponse(
        'Catalyst review key does not match the candidate',
      )
    }
    const review = await saveWhyMovedReview({
      candidate,
      status: 'approved',
      notes: parsed.data.notes,
      reviewerId: authorization.user.id,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    })
    if (!isEditorialReview(review)) {
      return privateJson(
        {
          success: false,
          error: 'The durable catalyst snapshot is unavailable. Reload and retry.',
        },
        { status: 409 },
      )
    }

    revalidatePath('/admin/why-moved')
    if (review.snapshotState !== 'captured') {
      return privateJson({
        success: true,
        review,
        automationError:
          'Approved, but no discovery-time catalyst snapshot exists for draft automation.',
      })
    }

    try {
      const automated = await ensureApprovedCatalystNewsletterDraft(
        {
          ownerId: authorization.user.id,
          sessionId: `admin-${authorization.user.id}`,
        },
        {
          candidate: mutableCandidate(review.candidateSnapshot),
          review,
          whyMoving: review.catalystSnapshot,
        },
      )
      revalidatePath('/newsletter/editor')
      revalidatePath(`/newsletter/editor/${automated.draft.id}`)
      return privateJson({
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
      })
    } catch (automationError) {
      return privateJson({
        success: true,
        review,
        automationError:
          automationError instanceof Error
            ? automationError.message
            : 'Failed to automate newsletter draft creation',
      })
    }
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    return commandErrorResponse(error, 'Failed to approve catalyst review')
  }
}
