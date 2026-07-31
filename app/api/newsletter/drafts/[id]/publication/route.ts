export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  NewsletterPublicationReadinessError,
  recordNewsletterPublication,
} from '@/lib/newsletter/publication'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const body = await request.json().catch(() => ({}))
    const beehiivUrl =
      typeof body?.beehiivUrl === 'string' ? body.beehiivUrl : ''
    const draft = await recordNewsletterPublication(scope, id, beehiivUrl)
    const response = NextResponse.json({ draft })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof NewsletterPublicationReadinessError) {
      return NextResponse.json(
        {
          error: error.message,
          issues: error.readiness.issues,
        },
        { status: 422 },
      )
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to record newsletter publication'
    const status =
      message.startsWith('Beehiiv publication URL') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
