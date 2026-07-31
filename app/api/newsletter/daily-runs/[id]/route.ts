export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getNewsletterDailyRun,
  NewsletterDailyRunNotFoundError,
} from '@/lib/newsletter/daily-runs'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const { id } = await context.params
    const run = await getNewsletterDailyRun(scope, id)
    const response = NextResponse.json({ run })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
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
