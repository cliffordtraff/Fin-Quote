export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  forkNewsletterDraft,
  NewsletterDraftConflictError,
  NewsletterDraftIdempotencyConflictError,
  NewsletterDraftNotFoundError,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { getDefaultPublicChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'
import {
  NewsletterDraftInputValidationError,
  isNewsletterUuid,
  parseNewsletterDraftForkRequest,
} from '@/lib/newsletter/draft-request'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!isNewsletterUuid(id)) {
      throw new NewsletterDraftInputValidationError(
        'Invalid newsletter draft ID.',
      )
    }
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in to create an editable copy.' },
        { status: 401 },
      )
    }
    const { draft, idempotencyKey } =
      await parseNewsletterDraftForkRequest(request)
    const forked = await forkNewsletterDraft(scope, id, draft, {
      idempotencyKey,
      publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(
        request.headers.get('host'),
      ),
      signal: request.signal,
    })
    const response = NextResponse.json({ draft: forked }, { status: 201 })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof NewsletterDraftNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (
      error instanceof NewsletterDraftConflictError ||
      error instanceof NewsletterDraftIdempotencyConflictError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof NewsletterDraftInputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create an editable copy',
      },
      { status: 500 },
    )
  }
}
