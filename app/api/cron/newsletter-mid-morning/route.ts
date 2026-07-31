export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/daily-automation'
import {
  advanceNewsletterMidMorningAutomation,
  getMidMorningAutomationWindow,
} from '@/lib/newsletter/mid-morning-automation'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const clock = getNewsletterAutomationClock()
  const window = getMidMorningAutomationWindow(clock)
  const force =
    process.env.NODE_ENV !== 'production' &&
    request.nextUrl.searchParams.get('force') === '1'

  if (!clock.isTradingDay && !force) {
    return NextResponse.json({
      skipped: true,
      reason: clock.holidayName
        ? `US market holiday: ${clock.holidayName}`
        : 'US market weekend',
      clock,
      window,
    })
  }
  if (!window.shouldRun && !force) {
    return NextResponse.json({
      skipped: true,
      reason: window.hasEnded
        ? 'Mid-morning recovery window ended at noon ET'
        : 'Mid-morning automation begins at 10:15 AM ET',
      clock,
      window,
    })
  }
  const result = await advanceNewsletterMidMorningAutomation({
    marketDate: clock.marketDate,
  })
  return NextResponse.json({ skipped: false, clock, window, ...result })
}
