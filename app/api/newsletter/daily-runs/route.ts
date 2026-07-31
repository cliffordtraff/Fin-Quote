export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  ensureNewsletterDailyRun,
  getConfiguredNewsletterAutomationScope,
  getLatestNewsletterDailyRun,
  getNewsletterDailySettings,
  NewsletterDailySourceError,
  saveNewsletterDailySettings,
} from '@/lib/newsletter/daily-runs'
import {
  getNewsletterAutomationClock,
  getNewsletterDailyAutomationRun,
} from '@/lib/newsletter/daily-automation'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

function productionAccessError(ownerId: string | null): NextResponse | null {
  if (process.env.NODE_ENV !== 'production' || ownerId) return null
  return NextResponse.json(
    { error: 'Sign in before running the daily newsletter generator.' },
    { status: 401 },
  )
}

function targetCount(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function marketDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }
  return value
}

function errorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Daily newsletter request failed'
  return NextResponse.json(
    { error: message },
    { status: error instanceof NewsletterDailySourceError ? 409 : 500 },
  )
}

export async function GET(request: NextRequest) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const requestedDate = marketDate(
      request.nextUrl.searchParams.get('marketDate'),
    )
    const resolvedDate =
      requestedDate ?? getNewsletterAutomationClock().marketDate
    let [run, settings, automation] = await Promise.all([
      getLatestNewsletterDailyRun(scope, requestedDate),
      getNewsletterDailySettings(scope),
      getNewsletterDailyAutomationRun(resolvedDate),
    ])
    let reportReadOnly = false
    const configuredScope = getConfiguredNewsletterAutomationScope()
    if (
      !run &&
      automation &&
      configuredScope &&
      (configuredScope.ownerId !== scope.ownerId ||
        configuredScope.sessionId !== scope.sessionId)
    ) {
      run = await getLatestNewsletterDailyRun(configuredScope, resolvedDate)
      if (run) {
        settings = await getNewsletterDailySettings(configuredScope)
        reportReadOnly = true
      }
    }
    const response = NextResponse.json({
      run,
      settings,
      automation,
      reportReadOnly,
    })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const accessError = productionAccessError(scope.ownerId)
    if (accessError) return accessError

    const body = await request.json().catch(() => ({}))
    const requestedTarget = targetCount(body?.targetCount)
    if (requestedTarget != null) {
      await saveNewsletterDailySettings(scope, {
        targetCount: requestedTarget,
        enabled: true,
      })
    }
    const run = await ensureNewsletterDailyRun(scope, {
      marketDate: marketDate(body?.marketDate),
      targetCount: requestedTarget,
    })
    const settings = await getNewsletterDailySettings(scope)
    const response = NextResponse.json({ run, settings }, { status: 201 })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return errorResponse(error)
  }
}
