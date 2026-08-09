export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listNewsletterChartLibrarySummaries } from '@/lib/newsletter/chart-library'
import {
  authorizeNewsletterChartRequest,
  finalizeNewsletterChartResponse,
  newsletterChartErrorResponse,
  newsletterChartPreflight,
  type NewsletterChartApiMethods,
} from '../_shared'

const METHODS = ['GET', 'OPTIONS'] as const satisfies NewsletterChartApiMethods

export async function OPTIONS(request: NextRequest) {
  return newsletterChartPreflight(request, METHODS)
}

export async function GET(request: NextRequest) {
  let createdSessionId: string | null = null
  try {
    const authorization = await authorizeNewsletterChartRequest(request, METHODS)
    if (authorization.response) return authorization.response
    const { scope } = authorization.access
    createdSessionId = authorization.access.createdSessionId
    const search = request.nextUrl.searchParams
    const page = await listNewsletterChartLibrarySummaries(
      scope,
      {
        cursor: search.get('cursor'),
        limit: search.has('limit') ? Number(search.get('limit')) : undefined,
        query: search.get('q') ?? undefined,
        symbol: search.get('symbol') ?? undefined,
      },
      request.signal,
    )
    return finalizeNewsletterChartResponse(
      NextResponse.json(page),
      request,
      METHODS,
      createdSessionId,
    )
  } catch (error) {
    return newsletterChartErrorResponse(
      error,
      request,
      METHODS,
      createdSessionId,
    )
  }
}
