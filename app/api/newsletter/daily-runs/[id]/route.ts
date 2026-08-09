export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getNewsletterDailyRun,
  NewsletterDailyRunNotFoundError,
} from '@/lib/newsletter/daily-runs-read'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    request.signal.throwIfAborted()
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    request.signal.throwIfAborted()
    const { id } = await context.params
    const run = await getNewsletterDailyRun(scope, id, request.signal)
    const response = NextResponse.json({ run })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load newsletter daily run',
      },
      {
        status:
          error instanceof NewsletterDailyRunNotFoundError ? 404 : 500,
      },
    )
  }
}
