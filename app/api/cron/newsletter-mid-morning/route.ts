export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/daily-automation'
import { logNewsletterCron } from '@/lib/newsletter/cron-logging'
import {
  markNewsletterCronResponseFailed,
  withNewsletterCronHeartbeat,
} from '@/lib/newsletter/cron-observability'
import { getNewsletterAutomationStageBudget } from '@/lib/newsletter/automation-lease'
import {
  advanceNewsletterMidMorningAutomation,
  ensureNewsletterMidMorningTerminalNotification,
  getMidMorningAutomationWindow,
  getPendingNewsletterMidMorningTerminalNotification,
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

  return withNewsletterCronHeartbeat('mid_morning', () =>
    runAuthorizedNewsletterMidMorning(request, startedAt),
  )
}

async function runAuthorizedNewsletterMidMorning(
  request: NextRequest,
  startedAt: number,
) {
  try {
    const requestDeadlineAt = startedAt + maxDuration * 1_000
    const clock = getNewsletterAutomationClock()
    const window = getMidMorningAutomationWindow(clock)
    const force =
      process.env.NODE_ENV !== 'production' &&
      request.nextUrl.searchParams.get('force') === '1'
    const priorTerminal =
      await getPendingNewsletterMidMorningTerminalNotification(clock.marketDate)
    let priorNotificationPending = false
    if (priorTerminal) {
      try {
        await ensureNewsletterMidMorningTerminalNotification(priorTerminal)
      } catch {
        priorNotificationPending = true
      }
    }

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
      const response = NextResponse.json({
        skipped: true,
        reason,
        clock,
        window,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return priorNotificationPending
        ? markNewsletterCronResponseFailed(response)
        : response
    }

    // Terminal notification delivery remains recoverable after the generation
    // window closes. Read terminal state before applying the noon cutoff.
    const existing = await getNewsletterMidMorningRun(clock.marketDate)
    if (
      existing?.status === 'completed' ||
      existing?.status === 'partial' ||
      existing?.status === 'failed'
    ) {
      let terminalRun = existing
      let notificationPending = false
      try {
        terminalRun =
          await ensureNewsletterMidMorningTerminalNotification(existing)
      } catch {
        notificationPending = true
      }
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
      const response = NextResponse.json({
        skipped: true,
        reason,
        terminal: true,
        clock,
        window,
        run: terminalRun,
        notificationPending,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return existing.status === 'failed' ||
        notificationPending ||
        priorNotificationPending
        ? markNewsletterCronResponseFailed(response)
        : response
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
      const response = NextResponse.json({
        skipped: true,
        reason,
        clock,
        window,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return priorNotificationPending
        ? markNewsletterCronResponseFailed(response)
        : response
    }

    const stageBudgetMs = getNewsletterAutomationStageBudget(requestDeadlineAt)
    if (stageBudgetMs == null) {
      const reason =
        'Insufficient request budget remains to safely start an automation stage'
      logNewsletterCron({
        job: 'mid-morning',
        event: 'run-skipped',
        marketDate: clock.marketDate,
        reason,
        durationMs: Date.now() - startedAt,
      })
      return markNewsletterCronResponseFailed(
        NextResponse.json({
          skipped: true,
          action: 'request-budget-exhausted',
          reason,
          clock,
          window,
          priorNotificationPending,
          priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
        }),
      )
    }
    const result = await advanceNewsletterMidMorningAutomation({
      marketDate: clock.marketDate,
      stageBudgetMs,
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
    const response = NextResponse.json({
      skipped: false,
      clock,
      window,
      ...result,
      priorNotificationPending,
      priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
    })
    return result.run.status === 'failed' ||
      result.action === 'notification-pending' ||
      result.action === 'invocation-budget-exhausted' ||
      priorNotificationPending
      ? markNewsletterCronResponseFailed(response)
      : response
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
