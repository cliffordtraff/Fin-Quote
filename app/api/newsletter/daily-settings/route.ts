export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getNewsletterDailySettings,
  saveNewsletterDailySettings,
} from '@/lib/newsletter/daily-runs'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

export async function PATCH(request: NextRequest) {
  try {
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    if (process.env.NODE_ENV === 'production' && !scope.ownerId) {
      return NextResponse.json(
        { error: 'Sign in before changing newsletter automation settings.' },
        { status: 401 },
      )
    }
    const body = await request.json().catch(() => ({}))
    const current = await getNewsletterDailySettings(scope)
    const settings = await saveNewsletterDailySettings(scope, {
      enabled:
        typeof body?.enabled === 'boolean' ? body.enabled : current.enabled,
      targetCount:
        typeof body?.targetCount === 'number'
          ? body.targetCount
          : current.targetCount,
      generationHour:
        typeof body?.generationHour === 'number'
          ? body.generationHour
          : current.generationHour,
    })
    const response = NextResponse.json({ settings })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save newsletter automation settings',
      },
      { status: 500 },
    )
  }
}
