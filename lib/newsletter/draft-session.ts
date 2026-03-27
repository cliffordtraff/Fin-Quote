import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { NewsletterDraftScope } from './drafts'

export const NEWSLETTER_DRAFT_SESSION_COOKIE = 'newsletter_draft_session'

interface ResolvedNewsletterDraftScope {
  scope: NewsletterDraftScope
  createdSessionId: string | null
}

export async function resolveNewsletterDraftScope(
  request: NextRequest,
): Promise<ResolvedNewsletterDraftScope> {
  const rawCookie = request.cookies.get(NEWSLETTER_DRAFT_SESSION_COOKIE)?.value?.trim()
  const sessionId = rawCookie || crypto.randomUUID()
  let ownerId: string | null = null

  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    ownerId = user?.id ?? null
  } catch {
    ownerId = null
  }

  return {
    scope: {
      ownerId,
      sessionId,
    },
    createdSessionId: rawCookie ? null : sessionId,
  }
}

export function attachNewsletterDraftSessionCookie(
  response: NextResponse,
  createdSessionId: string | null,
) {
  if (!createdSessionId) return response

  response.cookies.set(NEWSLETTER_DRAFT_SESSION_COOKIE, createdSessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return response
}
