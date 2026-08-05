export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Leave enough time for the web-search-backed summary while still completing
// before the next scheduled recovery attempt.
export const maxDuration = 240

import { NextRequest, NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/daily-automation'
import { refreshDashboardCommentary } from '@/lib/refresh-dashboard-commentary'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clock = getNewsletterAutomationClock()
  const force =
    process.env.NODE_ENV !== 'production' &&
    request.nextUrl.searchParams.get('force') === '1'
  const isRefreshWindow =
    clock.hour === 10 && clock.minute >= 15 && clock.minute < 30

  if (!clock.isTradingDay && !force) {
    return NextResponse.json({
      skipped: true,
      reason: clock.holidayName
        ? `US market holiday: ${clock.holidayName}`
        : 'US market weekend',
      clock,
    })
  }

  if (!isRefreshWindow && !force) {
    return NextResponse.json({
      skipped: true,
      reason: 'Dashboard commentary refreshes between 10:15 and 10:29 AM ET',
      clock,
    })
  }

  const result = await refreshDashboardCommentary({
    marketDate: clock.marketDate,
  })
  const skipped = result.attempted.length === 0
  return NextResponse.json({
    skipped,
    reason: skipped
      ? `Dashboard commentary is already complete for ${clock.marketDate}`
      : undefined,
    clock,
    ...result,
  })
}
