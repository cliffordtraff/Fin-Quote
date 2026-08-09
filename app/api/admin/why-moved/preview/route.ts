export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import {
  authorizeAdminCommand,
  commandErrorResponse,
  invalidCommandResponse,
  parseCommandJson,
  previewSchema,
  privateJson,
} from '@/app/api/admin/why-moved/_shared'
import { getStockWhyMovingData } from '@/lib/stock-why-moving'

/** Returns current evidence without changing the discovery-time snapshot. */
export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeAdminCommand(request)
    if (authorization.response) return authorization.response
    const parsed = previewSchema.safeParse(await parseCommandJson(request))
    if (!parsed.success) return invalidCommandResponse('Invalid symbol')
    const whyMoving = await getStockWhyMovingData(
      parsed.data.symbol.toUpperCase(),
      { forceRefresh: true, signal: request.signal },
    )
    return privateJson({ success: true, whyMoving })
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    return commandErrorResponse(error, 'Failed to preview current catalyst')
  }
}
