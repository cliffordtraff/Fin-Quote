export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import {
  advanceNewsletterDailyAutomation,
  getNewsletterAutomationClock,
  getNewsletterAutomationWindow,
  getNewsletterDailyAutomationRun,
  notifyNewsletterMorningLate,
} from '@/lib/newsletter/daily-automation'
import { listEnabledNewsletterDailyScopes } from '@/lib/newsletter/daily-runs'

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
    })
  }

  const scopes = await listEnabledNewsletterDailyScopes()
  const window = getNewsletterAutomationWindow(
    clock,
    scopes.map(({ settings }) => settings.generationHour),
  )
  if (!window.shouldRun && !force) {
    return NextResponse.json({
      skipped: true,
      reason: window.hasEnded
        ? 'Morning recovery window ended at noon ET'
        : `Automation begins at ${window.startHour}:00 AM ET`,
      clock,
      window,
    })
  }

  const existing = await getNewsletterDailyAutomationRun(clock.marketDate)
  if (
    window.isLate &&
    existing?.status !== 'completed' &&
    existing?.status !== 'partial' &&
    existing?.status !== 'failed'
  ) {
    await notifyNewsletterMorningLate({
      marketDate: clock.marketDate,
      readyByHour: window.readyByHour,
      run: existing,
    })
  }
  const result = await advanceNewsletterDailyAutomation({
    marketDate: clock.marketDate,
  })
  return NextResponse.json({
    skipped: false,
    clock,
    window,
    ...result,
  })
}
