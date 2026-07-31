export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth/current-user'
import { listBeehiivPublications } from '@/lib/beehiiv/client'
import {
  BEEHIIV_OAUTH_COOKIE,
  finishBeehiivOAuth,
} from '@/lib/beehiiv/oauth'
import {
  saveBeehiivIntegrationConnection,
  saveBeehiivPublication,
} from '@/lib/beehiiv/store'
import type { BeehiivPublication } from '@/lib/beehiiv/types'

function selectPublication(
  publications: BeehiivPublication[],
): BeehiivPublication | null {
  const configuredId = process.env.BEEHIIV_PUBLICATION_ID?.trim()
  if (configuredId) {
    const configured = publications.find(
      (publication) => publication.id === configuredId,
    )
    if (configured) return configured
  }

  return (
    publications.find(
      (publication) => publication.name.toLowerCase() === 'the intraday',
    ) ??
    publications[0] ??
    null
  )
}

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

    let publicationSaved = false
    try {
      const publications = await listBeehiivPublications(user.id)
      const publication = selectPublication(publications)
      if (publication) {
        await saveBeehiivPublication(user.id, publication)
        publicationSaved = true
      }
    } catch {
      publicationSaved = false
    }

    return redirectWithResult(
      request,
      completed.returnTo,
      'connected',
      publicationSaved
        ? 'Beehiiv connected.'
        : 'Beehiiv connected. Publication details will refresh on the next sync.',
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
