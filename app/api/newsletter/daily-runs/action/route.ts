export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  ensureNewsletterDailyRun,
  getNewsletterDailySettings,
  NewsletterDailySourceError,
  saveNewsletterDailySettings,
} from '@/lib/newsletter/daily-runs'
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

export async function POST(request: NextRequest) {
  try {
    request.signal.throwIfAborted()
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    request.signal.throwIfAborted()
    const accessError = productionAccessError(scope.ownerId)
    if (accessError) return accessError

    const body = await request.json().catch(() => ({}))
    request.signal.throwIfAborted()
    const requestedTarget = targetCount(body?.targetCount)
    if (requestedTarget != null) {
      await saveNewsletterDailySettings(
        scope,
        {
          targetCount: requestedTarget,
          enabled: true,
        },
        request.signal,
      )
    }
    const run = await ensureNewsletterDailyRun(scope, {
      marketDate: marketDate(body?.marketDate),
      targetCount: requestedTarget,
      signal: request.signal,
    })
    const settings = await getNewsletterDailySettings(scope, request.signal)
    const response = NextResponse.json({ run, settings }, { status: 201 })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error
    }
    return errorResponse(error)
  }
}
