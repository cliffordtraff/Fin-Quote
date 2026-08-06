export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  NewsletterDraftConflictError,
  NewsletterDraftNotFoundError,
  NewsletterPublishedDraftImmutableError,
  regenerateNewsletterDraft,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'

function requireExpectedUpdatedAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('expectedUpdatedAt is required')
  }
  return value
}

function getRequestBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3005'
  return `${proto}://${host}`
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

  const message =
    error instanceof Error ? error.message : 'Newsletter regeneration failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const body = await request.json().catch(() => ({}))
    const expectedUpdatedAt = requireExpectedUpdatedAt(body?.expectedUpdatedAt)
    const host = request.headers.get('host')

    const draft = await regenerateNewsletterDraft(scope, id, {
      baseUrl: getRequestBaseUrl(request),
      chartBaseUrl: getDefaultChartingBaseUrlForHost(host),
      publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
      editorMode: true,
    }, { expectedUpdatedAt })

    const response = NextResponse.json({ draft })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof Error && error.message === 'expectedUpdatedAt is required') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}
