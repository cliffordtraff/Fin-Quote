export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  bulkSetNewsletterDraftArchiveState,
  NewsletterDraftArchiveValidationError,
  NewsletterDraftConflictError,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import type {
  NewsletterDraftArchiveAction,
  NewsletterDraftArchiveMutationItem,
} from '@/lib/newsletter/types'

export async function POST(request: NextRequest) {
  try {
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in to manage newsletter history.' },
        { status: 401 },
      )
    }
    const body = await request.json().catch(() => ({}))
    const action = body?.action as NewsletterDraftArchiveAction
    const items = Array.isArray(body?.items)
      ? (body.items as NewsletterDraftArchiveMutationItem[])
      : []
    const idempotencyKey =
      typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : ''
    const results = await bulkSetNewsletterDraftArchiveState(
      scope,
      action,
      items,
      idempotencyKey,
    )
    const response = NextResponse.json({ results })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    if (error instanceof NewsletterDraftArchiveValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof NewsletterDraftConflictError) {
      return NextResponse.json(
        {
          code: 'draft_conflict',
          error:
            'One or more selected issues changed. Refresh the archive and review the selection before trying again.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update newsletter history',
      },
      { status: 500 },
    )
  }
}
