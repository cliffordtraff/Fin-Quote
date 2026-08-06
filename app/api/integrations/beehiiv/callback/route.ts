export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth/current-user'
import { listBeehiivPublications } from '@/lib/beehiiv/client'
import { selectBeehiivPublication } from '@/lib/beehiiv/publication'
import {
  BEEHIIV_OAUTH_COOKIE,
  finishBeehiivOAuth,
} from '@/lib/beehiiv/oauth'
import {
  deleteBeehiivIntegration,
  saveBeehiivIntegrationConnection,
  saveBeehiivPublication,
} from '@/lib/beehiiv/store'

function redirectWithResult(
  request: NextRequest,
  returnTo: string,
  result: 'connected' | 'error',
  message?: string,
): NextResponse {
  const url = new URL(returnTo, request.nextUrl.origin)
  url.searchParams.set('beehiiv', result)
  if (message) url.searchParams.set('beehiiv_message', message)
  const response = NextResponse.redirect(url)
  response.cookies.delete(BEEHIIV_OAUTH_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const encryptedPendingState = request.cookies.get(
    BEEHIIV_OAUTH_COOKIE,
  )?.value
  const state = request.nextUrl.searchParams.get('state')
  const authorizationCode = request.nextUrl.searchParams.get('code')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError) {
    return redirectWithResult(
      request,
      '/newsletter/morning-review',
      'error',
      'Beehiiv access was not granted.',
    )
  }
  if (!encryptedPendingState || !state || !authorizationCode) {
    return redirectWithResult(
      request,
      '/newsletter/morning-review',
      'error',
      'Beehiiv authorization could not be verified. Connect again.',
    )
  }

  try {
    const user = await requireCurrentUser()
    const completed = await finishBeehiivOAuth({
      encryptedPendingState,
      ownerId: user.id,
      state,
      authorizationCode,
    })
    await saveBeehiivIntegrationConnection(user.id, completed.credentials)

    try {
      const publications = await listBeehiivPublications(user.id)
      const publication = selectBeehiivPublication(publications)
      if (!publication) {
        throw new Error(
          'The Beehiiv connection does not expose an available publication.',
        )
      }
      await saveBeehiivPublication(user.id, publication)
    } catch (error) {
      // The new credentials deliberately cleared any publication cached by an
      // older account. If verification fails, remove the partial connection so
      // the UI cannot report a connected but unverified destination.
      await deleteBeehiivIntegration(user.id).catch(() => undefined)
      throw error
    }

    return redirectWithResult(
      request,
      completed.returnTo,
      'connected',
      'Beehiiv connected.',
    )
  } catch {
    return redirectWithResult(
      request,
      '/newsletter/morning-review',
      'error',
      'Beehiiv authorization failed. Connect again.',
    )
  }
}
