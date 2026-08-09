export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  deleteNewsletterChartLibraryItem,
  getNewsletterChartLibraryItem,
  updateNewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'
import {
  authorizeNewsletterChartRequest,
  finalizeNewsletterChartResponse,
  newsletterChartErrorResponse,
  newsletterChartJson,
  newsletterChartPreflight,
  newsletterChartSessionEstablishmentResponse,
  normalizeNewsletterChartId,
  readNewsletterChartJson,
  type NewsletterChartApiMethods,
} from '../_shared'

const METHODS = [
  'GET',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const satisfies NewsletterChartApiMethods

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function OPTIONS(request: NextRequest) {
  return newsletterChartPreflight(request, METHODS)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let createdSessionId: string | null = null
  try {
    const authorization = await authorizeNewsletterChartRequest(request, METHODS)
    if (authorization.response) return authorization.response
    const { scope } = authorization.access
    createdSessionId = authorization.access.createdSessionId
    const id = normalizeNewsletterChartId((await params).id)
    const chart = await getNewsletterChartLibraryItem(scope, id, request.signal)
    if (!chart) {
      return finalizeNewsletterChartResponse(
        newsletterChartJson(
          request,
          METHODS,
          { error: `Newsletter chart library item not found: ${id}` },
          { status: 404 },
        ),
        request,
        METHODS,
        createdSessionId,
      )
    }
    return finalizeNewsletterChartResponse(
      NextResponse.json({ chart }),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let createdSessionId: string | null = null
  try {
    const authorization = await authorizeNewsletterChartRequest(request, METHODS)
    if (authorization.response) return authorization.response
    const { scope } = authorization.access
    createdSessionId = authorization.access.createdSessionId
    const sessionResponse = newsletterChartSessionEstablishmentResponse(
      request,
      METHODS,
      scope.ownerId,
      createdSessionId,
    )
    if (sessionResponse) return sessionResponse
    const id = normalizeNewsletterChartId((await params).id)
    await deleteNewsletterChartLibraryItem(scope, id, request.signal)
    return finalizeNewsletterChartResponse(
      NextResponse.json({ success: true }),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let createdSessionId: string | null = null
  try {
    const authorization = await authorizeNewsletterChartRequest(request, METHODS)
    if (authorization.response) return authorization.response
    const { scope } = authorization.access
    createdSessionId = authorization.access.createdSessionId
    const sessionResponse = newsletterChartSessionEstablishmentResponse(
      request,
      METHODS,
      scope.ownerId,
      createdSessionId,
    )
    if (sessionResponse) return sessionResponse
    const id = normalizeNewsletterChartId((await params).id)
    const body = await readNewsletterChartJson(request)
    if (!isRecord(body) || typeof body.title !== 'string') {
      return finalizeNewsletterChartResponse(
        newsletterChartJson(
          request,
          METHODS,
          { error: 'Chart title is required' },
          { status: 400 },
        ),
        request,
        METHODS,
        createdSessionId,
      )
    }
    const chart = await updateNewsletterChartLibraryItem(
      scope,
      id,
      { title: body.title },
      request.signal,
    )
    return finalizeNewsletterChartResponse(
      NextResponse.json({ chart }),
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
