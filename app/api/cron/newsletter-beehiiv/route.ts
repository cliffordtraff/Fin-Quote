export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { reconcileBeehiivDeliveryQueue } from '@/lib/newsletter/beehiiv-lifecycle'
import {
  markNewsletterCronResponseFailed,
  withNewsletterCronHeartbeat,
} from '@/lib/newsletter/cron-observability'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return withNewsletterCronHeartbeat('beehiiv_reconciliation', async () => {
    // One delivery per worker keeps connect + lifecycle + optional stats work
    // inside the 60-second route budget. The minute cron drains any backlog.
    const result = await reconcileBeehiivDeliveryQueue(4, 4)
    const response = NextResponse.json(result)
    return result.failed.length
      ? markNewsletterCronResponseFailed(response)
      : response
  })
}
