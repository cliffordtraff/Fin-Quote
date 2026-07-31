export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  listNewsletterNotifications,
  markNewsletterNotificationsRead,
} from '@/lib/newsletter/notifications'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

function validMarketDate(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

export async function GET(request: NextRequest) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const notifications = await listNewsletterNotifications(scope, {
      marketDate: validMarketDate(
        request.nextUrl.searchParams.get('marketDate'),
      ),
    })
    const response = NextResponse.json({ notifications })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load notifications',
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const body = await request.json().catch(() => ({}))
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((value: unknown): value is string => {
          return typeof value === 'string' && value.length > 0
        })
      : []
    await markNewsletterNotificationsRead(scope, ids)
    const response = NextResponse.json({ ok: true })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update notifications',
      },
      { status: 500 },
    )
  }
}
