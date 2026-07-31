export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { reconcileBeehiivDeliveryQueue } from '@/lib/newsletter/beehiiv-lifecycle'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await reconcileBeehiivDeliveryQueue(4)
  return NextResponse.json(result)
}
