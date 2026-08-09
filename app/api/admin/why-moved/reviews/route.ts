export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
import {
  buildWhyMovedReviewKey,
  saveWhyMovedReview,
} from '@/lib/why-moved-review'

/** Saves ordinary review decisions without loading newsletter automation. */
export async function PATCH(request: NextRequest) {
  try {
    const authorization = await authorizeAdminCommand(request)
    if (authorization.response) return authorization.response
    const parsed = reviewUpdateSchema.safeParse(await parseCommandJson(request))
    if (!parsed.success) {
      return invalidCommandResponse(
        parsed.error.issues[0]?.message ?? 'Invalid review update',
      )
    }
    if (parsed.data.status === 'approved') {
      return invalidCommandResponse(
        'Approval must use the approval command so draft automation stays explicit.',
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
      status: parsed.data.status,
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
    return privateJson({ success: true, review })
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    return commandErrorResponse(error, 'Failed to save catalyst review')
  }
}
