export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  deleteNewsletterChartLibraryItem,
  updateNewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

function toErrorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Newsletter chart request failed'
  const status = message.includes('not found') ? 404 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    await deleteNewsletterChartLibraryItem(scope, id)
    const response = NextResponse.json({ success: true })
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
    const body = await request.json().catch(() => ({}))
    const chart = await updateNewsletterChartLibraryItem(scope, id, {
      title: typeof body?.title === 'string' ? body.title : '',
    })
    const response = NextResponse.json({ chart })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Newsletter chart request failed'
    if (
      message === 'Chart title is required' ||
      message === 'Chart title must be 120 characters or fewer'
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}
