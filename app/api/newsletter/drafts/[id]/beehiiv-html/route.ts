export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  NewsletterDraftNotFoundError,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { buildNewsletterDraftBeehiivExport } from '@/lib/newsletter/beehiiv-export'

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const message =
    error instanceof Error ? error.message : 'Newsletter draft request failed'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const beehiivExport = await buildNewsletterDraftBeehiivExport(
      scope,
      id,
      request.headers.get('host'),
    )
    const response = NextResponse.json({ html: beehiivExport.html })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return toErrorResponse(error)
  }
}
