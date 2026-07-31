export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  listNewsletterChartLibraryItems,
  saveNewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'
import {
  getDefaultPublicChartingBaseUrlForHost,
} from '@/lib/newsletter/charting-platform-export'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import {
  isAllowedNewsletterChartOrigin,
  resolveNewsletterChartBaseUrl,
} from '@/lib/newsletter/chart-api-origin'
import type { PriceChartExportSpec } from '@/lib/newsletter/types'

function rejectDisallowedOrigin(request: NextRequest): NextResponse | null {
  if (isAllowedNewsletterChartOrigin(request)) return null

  return NextResponse.json(
    { error: 'This origin is not allowed to access newsletter charts' },
    { status: 403 },
  )
}

function withCors(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin')
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Vary', 'Origin')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}

function toErrorResponse(error: unknown, request: NextRequest): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Newsletter chart request failed'
  const status = message === 'chartBaseUrl must use a configured charting origin'
    ? 400
    : 500
  return withCors(NextResponse.json({ error: message }, { status }), request)
}

function isChartExportSpec(value: unknown): value is PriceChartExportSpec {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as { symbol?: unknown }).symbol === 'string'
}

export async function OPTIONS(request: NextRequest) {
  const rejection = rejectDisallowedOrigin(request)
  if (rejection) return rejection

  return withCors(new NextResponse(null, { status: 204 }), request)
}

export async function GET(request: NextRequest) {
  const rejection = rejectDisallowedOrigin(request)
  if (rejection) return rejection

  try {
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const response = NextResponse.json({
      charts: await listNewsletterChartLibraryItems(scope),
    })
    return withCors(
      attachNewsletterDraftSessionCookie(response, createdSessionId),
      request,
    )
  } catch (error) {
    return toErrorResponse(error, request)
  }
}

export async function POST(request: NextRequest) {
  const rejection = rejectDisallowedOrigin(request)
  if (rejection) return rejection

  try {
    const { scope, createdSessionId } = await resolveNewsletterDraftScope(request)
    const body = await request.json()
    const chartExportSpec = body?.chartExportSpec ?? body?.spec

    if (!isChartExportSpec(chartExportSpec)) {
      return withCors(
        NextResponse.json({ error: 'chartExportSpec is required' }, { status: 400 }),
        request,
      )
    }

    const host = request.headers.get('host')
    const item = await saveNewsletterChartLibraryItem(
      scope,
      {
        title: typeof body?.title === 'string' ? body.title : undefined,
        chartExportSpec,
      },
      {
        chartBaseUrl: resolveNewsletterChartBaseUrl(request, body?.chartBaseUrl),
        publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(host),
      },
    )

    const response = NextResponse.json({ chart: item })
    return withCors(
      attachNewsletterDraftSessionCookie(response, createdSessionId),
      request,
    )
  } catch (error) {
    return toErrorResponse(error, request)
  }
}
