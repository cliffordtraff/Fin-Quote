export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  NewsletterDraftConflictError,
  NewsletterDraftNotFoundError,
  NewsletterPublishedDraftImmutableError,
  getNewsletterDraft,
  regenerateNewsletterDraftChart,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'
import type { NewsletterDraftDocument } from '@/lib/newsletter/types'
import { NewsletterCapturePathError } from '@/lib/newsletter/capture-output-path'

function requireExpectedUpdatedAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('expectedUpdatedAt is required')
  }
  return value
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof NewsletterDraftConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof NewsletterPublishedDraftImmutableError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof NewsletterCapturePathError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const message =
    error instanceof Error ? error.message : 'Chart regeneration failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const body = await request.json()
    const host = request.headers.get('host')
    const draft = body?.draft as NewsletterDraftDocument | undefined
    const blockId =
      typeof body?.blockId === 'string' && body.blockId.trim()
        ? body.blockId.trim()
        : ''

    if (!draft) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 })
    }

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 })
    }

    const expectedUpdatedAt = requireExpectedUpdatedAt(body?.expectedUpdatedAt)

    const updatedDraft = await regenerateNewsletterDraftChart(
      scope,
      id,
      blockId,
      draft,
      {
        chartBaseUrl: getDefaultChartingBaseUrlForHost(host),
        publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
        expectedUpdatedAt,
        signal: request.signal,
      },
    )

    const response = NextResponse.json({ draft: updatedDraft })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof Error && error.message === 'expectedUpdatedAt is required') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (
      error instanceof NewsletterDraftConflictError ||
      error instanceof NewsletterPublishedDraftImmutableError
    ) {
      try {
        const { id } = await params
        const { scope } = await resolveNewsletterDraftScope(request)
        const latest = await getNewsletterDraft(scope, id)
        return NextResponse.json(
          {
            code: 'draft_conflict',
            error: error.message,
            latest,
          },
          { status: 409 },
        )
      } catch {
        return NextResponse.json(
          { code: 'draft_conflict', error: error.message },
          { status: 409 },
        )
      }
    }
    return toErrorResponse(error)
  }
}
