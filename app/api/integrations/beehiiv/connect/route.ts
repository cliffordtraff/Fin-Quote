export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationRequiredError,
  requireCurrentUser,
} from '@/lib/auth/current-user'
import {
  BEEHIIV_OAUTH_COOKIE,
  BEEHIIV_OAUTH_COOKIE_MAX_AGE_SECONDS,
  sanitizeBeehiivReturnTo,
  startBeehiivOAuth,
} from '@/lib/beehiiv/oauth'

export async function GET(request: NextRequest) {
  const returnTo = sanitizeBeehiivReturnTo(
    request.nextUrl.searchParams.get('returnTo'),
  )

  try {
    const user = await requireCurrentUser()
    const flow = await startBeehiivOAuth({
      ownerId: user.id,
      origin: request.nextUrl.origin,
      returnTo,
    })
    const response = NextResponse.redirect(flow.authorizationUrl)
    response.cookies.set(BEEHIIV_OAUTH_COOKIE, flow.encryptedPendingState, {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: BEEHIIV_OAUTH_COOKIE_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      const authUrl = new URL('/auth', request.nextUrl.origin)
      const connectPath = new URL(
        '/api/integrations/beehiiv/connect',
        request.nextUrl.origin,
      )
      connectPath.searchParams.set('returnTo', returnTo)
      authUrl.searchParams.set(
        'redirect',
        `${connectPath.pathname}${connectPath.search}`,
      )
      return NextResponse.redirect(authUrl)
    }

    const errorUrl = new URL(returnTo, request.nextUrl.origin)
    errorUrl.searchParams.set('beehiiv', 'error')
    errorUrl.searchParams.set(
      'beehiiv_error',
      error instanceof Error
        ? error.message
        : 'Could not start Beehiiv authorization',
    )
    return NextResponse.redirect(errorUrl)
  }
}
