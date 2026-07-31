export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  AuthenticationRequiredError,
  requireCurrentUser,
} from '@/lib/auth/current-user'
import {
  deleteBeehiivIntegration,
  getBeehiivIntegrationStatus,
} from '@/lib/beehiiv/store'

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 401 },
    )
  }
  return NextResponse.json(
    {
      connected: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load the Beehiiv connection',
    },
    { status: 500 },
  )
}

export async function GET() {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json(await getBeehiivIntegrationStatus(user.id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUser()
    await deleteBeehiivIntegration(user.id)
    return NextResponse.json({
      connected: false,
      publication: null,
      connectedAt: null,
      lastVerifiedAt: null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
