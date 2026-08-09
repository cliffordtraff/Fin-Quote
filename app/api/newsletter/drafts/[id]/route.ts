export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { isDeepStrictEqual } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import {
  deleteNewsletterDraft,
  NewsletterDraftConflictError,
  NewsletterDraftNotFoundError,
  NewsletterPublishedDraftImmutableError,
  getNewsletterDraft,
  normalizeNewsletterDraftDocument,
  preserveNewsletterDraftServerMetadata,
  reconcileNewsletterDraftClientCharts,
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
  if (error instanceof NewsletterDraftConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof NewsletterPublishedDraftImmutableError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
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

function requireExpectedUpdatedAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('expectedUpdatedAt is required')
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

    const expectedUpdatedAt = requireExpectedUpdatedAt(body?.expectedUpdatedAt)

    const existing = await getNewsletterDraft(scope, id)
    const host = request.headers.get('host')
    const publicChartBaseUrl = getDefaultPublicChartingBaseUrlForHost(host)
    const trustedDraft = await reconcileNewsletterDraftClientCharts(
      scope,
      existing.draft,
      preserveNewsletterDraftServerMetadata(existing.draft, draft),
      { signal: request.signal },
    )
    const normalizedDraft = normalizeNewsletterDraftDocument(
      trustedDraft,
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
      { expectedUpdatedAt },
    )
    const response = NextResponse.json({ draft: saved })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof NewsletterDraftConflictError) {
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
    if (
      error instanceof Error &&
      (error.message === 'Invalid newsletter draft status' ||
        error.message === 'expectedUpdatedAt is required')
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
