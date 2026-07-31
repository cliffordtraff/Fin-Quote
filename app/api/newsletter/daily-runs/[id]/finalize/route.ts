export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  finalizeNewsletterDailyItems,
  NewsletterDailyRunNotFoundError,
} from '@/lib/newsletter/daily-runs'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

function itemIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return ids.length ? [...new Set(ids)] : undefined
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in before finalizing newsletter drafts.' },
        { status: 401 },
      )
    }
    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const run = await finalizeNewsletterDailyItems(
      scope,
      id,
      itemIds(body?.itemIds),
    )
    const response = NextResponse.json({ run })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to finalize newsletter drafts',
      },
      {
        status:
          error instanceof NewsletterDailyRunNotFoundError ? 404 : 500,
      },
    )
  }
}
