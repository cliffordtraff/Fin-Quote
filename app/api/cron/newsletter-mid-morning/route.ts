export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/daily-automation'
import { logNewsletterCron } from '@/lib/newsletter/cron-logging'
import {
  advanceNewsletterMidMorningAutomation,
  getMidMorningAutomationWindow,
  getNewsletterMidMorningRun,
} from '@/lib/newsletter/mid-morning-automation'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  if (!isAuthorized(request)) {
    logNewsletterCron({
      job: 'mid-morning',
      event: 'request-rejected',
      reason: 'unauthorized',
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const clock = getNewsletterAutomationClock()
    const window = getMidMorningAutomationWindow(clock)
    const force =
      process.env.NODE_ENV !== 'production' &&
      request.nextUrl.searchParams.get('force') === '1'

    if (!clock.isTradingDay && !force) {
      const reason = clock.holidayName
        ? `US market holiday: ${clock.holidayName}`
        : 'US market weekend'
      logNewsletterCron({
        job: 'mid-morning',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ skipped: true, reason, clock, window })
    }
    if (!window.shouldRun && !force) {
      const reason = window.hasEnded
        ? 'Mid-morning recovery window ended at noon ET'
        : 'Mid-morning automation begins at 10:15 AM ET'
      logNewsletterCron({
        job: 'mid-morning',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ skipped: true, reason, clock, window })
    }

    // A completed/partial/failed row is immutable during ordinary cron polls.
    // This read prevents the lease function from touching terminal rows every
    // time Supabase invokes the route.
    const existing = await getNewsletterMidMorningRun(clock.marketDate)
    if (
      existing?.status === 'completed' ||
      existing?.status === 'partial' ||
      existing?.status === 'failed'
    ) {
      const reason =
        existing.status === 'failed'
          ? 'Mid-morning automation is in a terminal failed state'
          : 'Mid-morning report is already complete'
      logNewsletterCron({
        job: 'mid-morning',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        terminal: true,
        status: existing.status,
        stage: existing.stage,
        invocationCount: existing.invocationCount,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({
        skipped: true,
        reason,
        terminal: true,
        clock,
        window,
        run: existing,
      })
    }

    const result = await advanceNewsletterMidMorningAutomation({
      marketDate: clock.marketDate,
    })
    logNewsletterCron({
      job: 'mid-morning',
      event: 'run-advanced',
      marketDate: clock.marketDate,
      action: result.action,
      claimed: result.claimed,
      status: result.run.status,
      stage: result.run.stage,
      invocationCount: result.run.invocationCount,
      candidateCount: result.run.candidateCount,
      summaryCompletedCount: result.run.summaryCompletedCount,
      summaryGeneratedCount: result.run.summaryGeneratedCount,
      summaryErrorCount: result.run.summaryErrorCount,
      meaningfulChange: result.run.meaningfulChange,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ skipped: false, clock, window, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logNewsletterCron({
      job: 'mid-morning',
      event: 'run-error',
      level: 'error',
      error: message,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { error: 'Newsletter mid-morning automation failed' },
      { status: 500 },
    )
  }
}
