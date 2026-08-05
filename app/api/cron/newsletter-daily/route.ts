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
import { logNewsletterCron } from '@/lib/newsletter/cron-logging'
import { listEnabledNewsletterDailyScopes } from '@/lib/newsletter/daily-runs'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  if (!isAuthorized(request)) {
    logNewsletterCron({
      job: 'daily',
      event: 'request-rejected',
      reason: 'unauthorized',
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const clock = getNewsletterAutomationClock()
    const force =
      process.env.NODE_ENV !== 'production' &&
      request.nextUrl.searchParams.get('force') === '1'

    if (!clock.isTradingDay && !force) {
      const reason = clock.holidayName
        ? `US market holiday: ${clock.holidayName}`
        : 'US market weekend'
      logNewsletterCron({
        job: 'daily',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ skipped: true, reason, clock })
    }

    // Read terminal state before settings or lease acquisition. The scheduler
    // polls every few minutes, so claiming a finished row here would otherwise
    // rewrite its heartbeat and inflate invocation_count all morning.
    const existing = await getNewsletterDailyAutomationRun(clock.marketDate)
    if (
      existing?.status === 'completed' ||
      existing?.status === 'partial' ||
      existing?.status === 'failed'
    ) {
      const reason =
        existing.status === 'failed'
          ? 'Morning newsletter automation is in a terminal failed state'
          : 'Morning newsletter report is already complete'
      logNewsletterCron({
        job: 'daily',
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
        run: existing,
      })
    }

    const scopes = await listEnabledNewsletterDailyScopes()
    const window = getNewsletterAutomationWindow(
      clock,
      scopes.map(({ settings }) => settings.generationHour),
    )
    if (!window.shouldRun && !force) {
      const reason = window.hasEnded
        ? 'Morning recovery window ended at noon ET'
        : `Automation begins at ${window.startHour}:00 AM ET`
      logNewsletterCron({
        job: 'daily',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ skipped: true, reason, clock, window })
    }

    if (window.isLate) {
      await notifyNewsletterMorningLate({
        marketDate: clock.marketDate,
        readyByHour: window.readyByHour,
        run: existing,
      })
    }
    const result = await advanceNewsletterDailyAutomation({
      marketDate: clock.marketDate,
    })
    logNewsletterCron({
      job: 'daily',
      event: 'run-advanced',
      marketDate: clock.marketDate,
      action: result.action,
      claimed: result.claimed,
      status: result.run.status,
      stage: result.run.stage,
      invocationCount: result.run.invocationCount,
      candidateCount: result.run.candidateCount,
      summaryCompletedCount: result.run.summaryCompletedCount,
      newsletterSelectedCount: result.run.newsletterSelectedCount,
      newsletterReadyCount: result.run.newsletterReadyCount,
      newsletterAttentionCount: result.run.newsletterAttentionCount,
      newsletterFailedCount: result.run.newsletterFailedCount,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({
      skipped: false,
      clock,
      window,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logNewsletterCron({
      job: 'daily',
      event: 'run-error',
      level: 'error',
      error: message,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { error: 'Newsletter daily automation failed' },
      { status: 500 },
    )
  }
}
