export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  processNewsletterDailyRun,
  NewsletterDailyRunNotFoundError,
} from '@/lib/newsletter/daily-runs'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in before generating newsletter drafts.' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const host = request.headers.get('host')
    const result = await processNewsletterDailyRun(scope, id, {
      limit: Math.max(1, Math.min(50, integer(body?.limit, 8))),
      concurrency: Math.max(1, Math.min(4, integer(body?.concurrency, 3))),
      retryFailed: body?.retryFailed === true,
      chartBaseUrl: getDefaultChartingBaseUrlForHost(host),
      publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
    })
    const response = NextResponse.json(result)
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process newsletter daily run',
      },
      {
        status:
          error instanceof NewsletterDailyRunNotFoundError ? 404 : 500,
      },
    )
  }
}
