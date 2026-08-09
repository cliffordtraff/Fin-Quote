export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/automation-clock'
import {
  getConfiguredNewsletterAutomationScope,
  getLatestNewsletterDailyRun,
  getNewsletterDailyAutomationRun,
  getNewsletterDailySettings,
  type NewsletterDailyReadScope,
} from '@/lib/newsletter/daily-runs-read'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  projectPublicNewsletterMorningAutomation,
  projectPublicNewsletterMorningReport,
  projectPublicNewsletterMorningSettings,
} from '@/lib/newsletter/public-morning-report'

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

function marketDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }
  return value
}

function isSamePersistedScope(
  left: NewsletterDailyReadScope,
  right: NewsletterDailyReadScope,
): boolean {
  if (left.ownerId || right.ownerId) {
    return Boolean(left.ownerId && left.ownerId === right.ownerId)
  }
  return left.sessionId === right.sessionId
}

function canReadFullReport(
  requestScope: NewsletterDailyReadScope,
  servedScope: NewsletterDailyReadScope,
): boolean {
  if (requestScope.ownerId) {
    return requestScope.ownerId === servedScope.ownerId
  }

  return (
    process.env.NODE_ENV !== 'production' &&
    !servedScope.ownerId &&
    requestScope.sessionId === servedScope.sessionId
  )
}

function canReadFullAutomation(
  requestScope: NewsletterDailyReadScope,
  configuredScope: NewsletterDailyReadScope | null,
): boolean {
  return Boolean(
    requestScope.ownerId &&
    configuredScope?.ownerId &&
    requestScope.ownerId === configuredScope.ownerId,
  )
}

function publicGetErrorResponse(error: unknown): NextResponse {
  console.error('[newsletter/daily-runs] GET failed', error)
  return NextResponse.json(
    { error: 'Unable to load the daily newsletter report.' },
    { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
  )
}

export async function GET(request: NextRequest) {
  try {
    request.signal.throwIfAborted()
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    request.signal.throwIfAborted()
    const requestedDate = marketDate(
      request.nextUrl.searchParams.get('marketDate'),
    )
    const resolvedDate =
      requestedDate ?? getNewsletterAutomationClock().marketDate
    const [initialRun, initialSettings, automation] = await Promise.all([
      getLatestNewsletterDailyRun(scope, requestedDate, request.signal),
      getNewsletterDailySettings(scope, request.signal),
      getNewsletterDailyAutomationRun(resolvedDate, request.signal),
    ])
    let run = initialRun
    let settings = initialSettings
    let servedScope = scope
    const configuredScope = getConfiguredNewsletterAutomationScope()
    if (
      !run &&
      automation &&
      configuredScope &&
      !isSamePersistedScope(configuredScope, scope)
    ) {
      servedScope = configuredScope
      run = await getLatestNewsletterDailyRun(
        configuredScope,
        resolvedDate,
        request.signal,
      )
      if (run) {
        settings = await getNewsletterDailySettings(
          configuredScope,
          request.signal,
        )
      }
    }

    const reportReadOnly = !canReadFullReport(scope, servedScope)
    const automationReadOnly = !canReadFullAutomation(scope, configuredScope)
    const response = NextResponse.json(
      {
        run:
          reportReadOnly && run
            ? projectPublicNewsletterMorningReport(run)
            : run,
        settings: reportReadOnly
          ? projectPublicNewsletterMorningSettings(settings)
          : settings,
        automation: automationReadOnly
          ? projectPublicNewsletterMorningAutomation(automation)
          : automation,
        reportReadOnly,
        automationReadOnly,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    )
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error
    }
    return publicGetErrorResponse(error)
  }
}

/**
 * Compatibility boundary for callers that still POST to the read URL. A 307
 * keeps the request method, body, credentials, and same-origin cookie policy.
 */
export async function POST(request: NextRequest) {
  const actionUrl = request.nextUrl.clone()
  actionUrl.pathname = '/api/newsletter/daily-runs/action'
  return NextResponse.redirect(actionUrl, 307)
}
