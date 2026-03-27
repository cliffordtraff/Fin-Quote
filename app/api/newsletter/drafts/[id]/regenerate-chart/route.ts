export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  NewsletterDraftNotFoundError,
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

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
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

    const updatedDraft = await regenerateNewsletterDraftChart(
      scope,
      id,
      blockId,
      draft,
      {
        chartBaseUrl: getDefaultChartingBaseUrlForHost(host),
        publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
        editorMode: true,
      },
    )

    const response = NextResponse.json({ draft: updatedDraft })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return toErrorResponse(error)
  }
}
