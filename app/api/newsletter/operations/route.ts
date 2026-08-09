export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationRequiredError,
  requireCurrentUser,
} from '@/lib/auth/current-user'
import {
  getNewsletterOperationsSnapshot,
  NewsletterOperatorAccessError,
  NewsletterOperationsActionError,
} from '@/lib/newsletter/operations-read'

function errorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Newsletter operations failed.'
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: message }, { status: 401 })
  }
  if (error instanceof NewsletterOperatorAccessError) {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (error instanceof NewsletterOperationsActionError) {
    return NextResponse.json({ error: message }, { status: 409 })
  }
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json(
      await getNewsletterOperationsSnapshot(user.id, request.signal),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  // Keep the original POST URL working for API callers without pulling the
  // command pipeline (Puppeteer, chart generation, WIIM) into the frequently
  // polled snapshot function. A 307 preserves the method and request body.
  return NextResponse.redirect(
    new URL('/api/newsletter/operations/action', request.url),
    307,
  )
}
