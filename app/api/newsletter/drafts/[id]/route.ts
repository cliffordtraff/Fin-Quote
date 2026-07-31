export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { isDeepStrictEqual } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import {
  deleteNewsletterDraft,
  NewsletterDraftNotFoundError,
  getNewsletterDraft,
  normalizeNewsletterDraftDocument,
  preserveNewsletterDraftServerMetadata,
  renderNewsletterDraftPreviewHtml,
  saveNewsletterDraft,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { getDefaultPublicChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'
import type { NewsletterDraftDocument, NewsletterDraftStatus } from '@/lib/newsletter/types'
import {
  canSetNewsletterDraftStatus,
  isNewsletterDraftStatus,
  resolveNewsletterDraftSaveStatus,
} from '@/lib/newsletter/workflow'

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const message =
    error instanceof Error ? error.message : 'Newsletter draft request failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

function normalizeStatus(
  value: unknown,
  fallback: NewsletterDraftStatus,
): NewsletterDraftStatus {
  if (value === undefined) return fallback
  if (!isNewsletterDraftStatus(value)) {
    throw new Error('Invalid newsletter draft status')
  }
  return value
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(_request)
    const draft = await getNewsletterDraft(scope, id)
    const host = _request.headers.get('host')
    const normalizedDraft = normalizeNewsletterDraftDocument(
      draft.draft,
      getDefaultPublicChartingBaseUrlForHost(host),
    )
    const response = NextResponse.json({
      draft: {
        ...draft,
        draft: normalizedDraft,
        previewHtml: renderNewsletterDraftPreviewHtml(
          normalizedDraft,
          getDefaultPublicChartingBaseUrlForHost(host),
        ),
      },
    })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const body = await request.json()
    const draft = body?.draft as NewsletterDraftDocument | undefined

    if (!draft) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 })
    }

    const existing = await getNewsletterDraft(scope, id)
    const host = request.headers.get('host')
    const publicChartBaseUrl = getDefaultPublicChartingBaseUrlForHost(host)
    const normalizedDraft = normalizeNewsletterDraftDocument(
      preserveNewsletterDraftServerMetadata(existing.draft, draft),
      publicChartBaseUrl,
    )
    const normalizedExistingDraft = normalizeNewsletterDraftDocument(
      existing.draft,
      publicChartBaseUrl,
    )
    const hasExplicitStatus = Object.prototype.hasOwnProperty.call(body, 'status')
    const requestedStatus = normalizeStatus(body?.status, existing.status)
    const nextStatus = resolveNewsletterDraftSaveStatus({
      currentStatus: existing.status,
      requestedStatus,
      hasExplicitStatus,
      contentChanged: !isDeepStrictEqual(
        normalizedExistingDraft,
        normalizedDraft,
      ),
    })
    const readiness = canSetNewsletterDraftStatus(normalizedDraft, nextStatus)
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: 'Draft is not ready for that publishing stage',
          issues: readiness.issues,
        },
        { status: 422 },
      )
    }

    const saved = await saveNewsletterDraft(
      scope,
      id,
      normalizedDraft,
      nextStatus,
    )
    const response = NextResponse.json({ draft: saved })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Invalid newsletter draft status'
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    await deleteNewsletterDraft(scope, id)
    const response = NextResponse.json({ success: true })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return toErrorResponse(error)
  }
}
