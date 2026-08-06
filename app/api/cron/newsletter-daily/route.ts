export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import {
  advanceNewsletterDailyAutomation,
  getNewsletterAutomationClock,
  getNewsletterAutomationWindow,
  getNewsletterDailyAutomationRun,
  getNewsletterDailyTerminalReconciliation,
  getPendingNewsletterDailyTerminalNotification,
  ensureNewsletterDailyTerminalNotification,
  notifyNewsletterMorningLate,
} from '@/lib/newsletter/daily-automation'
import { logNewsletterCron } from '@/lib/newsletter/cron-logging'
import {
  markNewsletterCronResponseFailed,
  withNewsletterCronHeartbeat,
} from '@/lib/newsletter/cron-observability'
import { getNewsletterAutomationStageBudget } from '@/lib/newsletter/automation-lease'
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

  return withNewsletterCronHeartbeat('daily', () =>
    runAuthorizedNewsletterDaily(request, startedAt),
  )
}

async function runAuthorizedNewsletterDaily(
  request: NextRequest,
  startedAt: number,
) {
  try {
    const requestDeadlineAt = startedAt + maxDuration * 1_000
    const clock = getNewsletterAutomationClock()
    const force =
      process.env.NODE_ENV !== 'production' &&
      request.nextUrl.searchParams.get('force') === '1'
    const priorTerminal =
      await getPendingNewsletterDailyTerminalNotification(clock.marketDate)
    let priorNotificationPending = false
    if (priorTerminal) {
      try {
        await ensureNewsletterDailyTerminalNotification(priorTerminal)
      } catch {
        priorNotificationPending = true
      }
    }

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
      const response = NextResponse.json({
        skipped: true,
        reason,
        clock,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return priorNotificationPending
        ? markNewsletterCronResponseFailed(response)
        : response
    }

    // Read terminal state before settings or lease acquisition. The scheduler
    // polls every few minutes, so claiming a finished row here would otherwise
    // rewrite its heartbeat and inflate invocation_count all morning.
    const existing = await getNewsletterDailyAutomationRun(clock.marketDate)
    if (
      existing?.status === 'completed' ||
      existing?.status === 'partial'
    ) {
      const reconciliation = await getNewsletterDailyTerminalReconciliation(
        existing,
        request.signal,
      )
      if (reconciliation.hasDrift) {
        const stageBudgetMs = getNewsletterAutomationStageBudget(requestDeadlineAt)
        if (stageBudgetMs == null) {
          const reason =
            'Insufficient request budget remains to safely reconcile terminal newsletter state'
          logNewsletterCron({
            job: 'daily',
            event: 'run-skipped',
            marketDate: clock.marketDate,
            reason,
            terminal: true,
            status: existing.status,
            stage: existing.stage,
            durationMs: Date.now() - startedAt,
          })
          return markNewsletterCronResponseFailed(
            NextResponse.json({
              skipped: true,
              action: 'request-budget-exhausted',
              reason,
              terminal: true,
              clock,
              run: existing,
              priorNotificationPending,
              priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
            }),
          )
        }
        const result = await advanceNewsletterDailyAutomation({
          marketDate: clock.marketDate,
          retryCompleted: true,
          stageBudgetMs,
        })
        logNewsletterCron({
          job: 'daily',
          event: 'run-advanced',
          marketDate: clock.marketDate,
          action: result.action,
          claimed: result.claimed,
          reconciled: true,
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
        const response = NextResponse.json({
          skipped: false,
          reconciled: true,
          clock,
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
      }
      let terminalRun = existing
      let notificationPending = false
      try {
        terminalRun = await ensureNewsletterDailyTerminalNotification(existing)
      } catch {
        notificationPending = true
      }
      const reason = 'Morning newsletter report is already complete'
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
      const response = NextResponse.json({
        skipped: true,
        reason,
        terminal: true,
        clock,
        run: terminalRun,
        notificationPending,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return notificationPending ||
        priorNotificationPending
        ? markNewsletterCronResponseFailed(response)
        : response
    }

    if (existing?.status === 'failed') {
      let terminalRun = existing
      let notificationPending = false
      try {
        terminalRun = await ensureNewsletterDailyTerminalNotification(existing)
      } catch {
        notificationPending = true
      }
      const reason = 'Morning newsletter automation is in a terminal failed state'
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
      const response = NextResponse.json({
        skipped: true,
        reason,
        terminal: true,
        clock,
        run: terminalRun,
        notificationPending,
        priorNotificationPending,
        priorNotificationMarketDate: priorTerminal?.marketDate ?? null,
      })
      return markNewsletterCronResponseFailed(response)
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

    if (window.isLate) {
      await notifyNewsletterMorningLate({
        marketDate: clock.marketDate,
        readyByHour: window.readyByHour,
        run: existing,
      })
    }
    const stageBudgetMs = getNewsletterAutomationStageBudget(requestDeadlineAt)
    if (stageBudgetMs == null) {
      const reason =
        'Insufficient request budget remains to safely start an automation stage'
      logNewsletterCron({
        job: 'daily',
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
    const result = await advanceNewsletterDailyAutomation({
      marketDate: clock.marketDate,
      stageBudgetMs,
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
