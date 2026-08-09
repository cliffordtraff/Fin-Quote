export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { revalidatePath } from 'next/cache'
import { NextRequest } from 'next/server'
import {
  authorizeAdminCommand,
  bulkReviewSchema,
  commandErrorResponse,
  invalidCommandResponse,
  parseCommandJson,
  privateJson,
} from '@/app/api/admin/why-moved/_shared'
import { bulkTransitionWhyMovedReviews } from '@/lib/why-moved-review'

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeAdminCommand(request)
    if (authorization.response) return authorization.response
    const parsed = bulkReviewSchema.safeParse(await parseCommandJson(request))
    if (!parsed.success) {
      return invalidCommandResponse(
        parsed.error.issues[0]?.message ?? 'Invalid bulk review update',
      )
    }
    const results = await bulkTransitionWhyMovedReviews({
      targetStatus: parsed.data.targetStatus,
      items: parsed.data.items,
      reviewerId: authorization.user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    })
    revalidatePath('/admin/why-moved')
    return privateJson({ success: true, results })
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    return commandErrorResponse(error, 'Failed to update catalyst reviews')
  }
}
