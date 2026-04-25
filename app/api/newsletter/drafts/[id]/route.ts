export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  deleteNewsletterDraft,
  NewsletterDraftNotFoundError,
  getNewsletterDraft,
  normalizeNewsletterDraftDocument,
  renderNewsletterDraftPreviewHtml,
  saveNewsletterDraft,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { getDefaultPublicChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'
import type { NewsletterDraftDocument, NewsletterDraftStatus } from '@/lib/newsletter/types'

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const message =
    error instanceof Error ? error.message : 'Newsletter draft request failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

function normalizeStatus(value: unknown): NewsletterDraftStatus {
  return value === 'published' ? 'published' : 'draft'
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

    const saved = await saveNewsletterDraft(
      scope,
      id,
      draft,
      normalizeStatus(body?.status),
    )
    const response = NextResponse.json({ draft: saved })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
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
