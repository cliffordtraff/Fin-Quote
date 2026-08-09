export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  NewsletterManagedPublicationBusyError,
  NewsletterManagedPublicationVersionError,
  NewsletterPublicationReadinessError,
  recordNewsletterPublication,
} from '@/lib/newsletter/publication'
import {
  NewsletterDraftConflictError,
  NewsletterPublishedDraftImmutableError,
} from '@/lib/newsletter/drafts'

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
    const expectedUpdatedAt =
      typeof body?.expectedUpdatedAt === 'string'
        ? body.expectedUpdatedAt
        : undefined
    if (!expectedUpdatedAt) {
      return NextResponse.json(
        { error: 'expectedUpdatedAt is required' },
        { status: 400 },
      )
    }
    const draft = await recordNewsletterPublication(
      scope,
      id,
      beehiivUrl,
      new Date(),
      expectedUpdatedAt,
    )
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
    if (error instanceof NewsletterManagedPublicationVersionError) {
      return NextResponse.json(
        { error: error.message, code: 'beehiiv_source_mismatch' },
        { status: 409 },
      )
    }
    if (error instanceof NewsletterManagedPublicationBusyError) {
      return NextResponse.json(
        { error: error.message, code: 'beehiiv_sync_in_progress' },
        { status: 409 },
      )
    }
    if (error instanceof NewsletterDraftConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof NewsletterPublishedDraftImmutableError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
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
