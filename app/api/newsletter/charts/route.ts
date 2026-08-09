export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import {
  listNewsletterChartLibrarySummaries,
  normalizeNewsletterChartLibrarySaveInput,
  saveNewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'
import { getDefaultPublicChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'
import { resolveNewsletterChartBaseUrl } from '@/lib/newsletter/chart-api-origin'
import { registerNewsletterChartBackgroundTask } from '@/lib/newsletter/chart-background-work'
import type { PriceChartExportSpec } from '@/lib/newsletter/types'
import {
  buildNewsletterChartPostFingerprint,
  buildNewsletterChartPostPersistenceIdentity,
  NEWSLETTER_CHART_POST_DEADLINE_MS,
  requireNewsletterChartIdempotencyKey,
  runNewsletterChartPost,
} from '@/lib/newsletter/chart-post-admission'
import {
  authorizeNewsletterChartRequest,
  finalizeNewsletterChartResponse,
  newsletterChartErrorResponse,
  newsletterChartJson,
  newsletterChartPreflight,
  newsletterChartSessionEstablishmentResponse,
  readNewsletterChartJson,
  type NewsletterChartApiMethods,
} from './_shared'

const METHODS = ['GET', 'POST', 'OPTIONS'] as const satisfies NewsletterChartApiMethods

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isChartExportSpec(value: unknown): value is PriceChartExportSpec {
  return isRecord(value) && typeof value.symbol === 'string'
}

export async function OPTIONS(request: NextRequest) {
  return newsletterChartPreflight(request, METHODS)
}

/**
 * Compatibility alias for the old collection GET.
 *
 * Full chart scenes are intentionally available only one-at-a-time through
 * `/api/newsletter/charts/[id]`. Returning summary pages here keeps older
 * collection callers bounded without exposing the automation-only full-list
 * loader over HTTP.
 */
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

export async function POST(request: NextRequest) {
  let createdSessionId: string | null = null
  try {
    const authorization = await authorizeNewsletterChartRequest(request, METHODS)
    if (authorization.response) return authorization.response
    const { scope } = authorization.access
    createdSessionId = authorization.access.createdSessionId

    // Anonymous development saves are keyed by a browser session. Establish
    // that cookie in a response before the first side effect so a disconnect
    // cannot strand a chart under an identity the browser never received.
    const sessionResponse = newsletterChartSessionEstablishmentResponse(
      request,
      METHODS,
      scope.ownerId,
      createdSessionId,
    )
    if (sessionResponse) return sessionResponse

    const idempotencyKey = requireNewsletterChartIdempotencyKey(
      request.headers.get('idempotency-key'),
    )
    const body = await readNewsletterChartJson(request)
    if (!isRecord(body)) {
      return finalizeNewsletterChartResponse(
        newsletterChartJson(
          request,
          METHODS,
          { error: 'Newsletter chart request body must be an object.' },
          { status: 400 },
        ),
        request,
        METHODS,
        createdSessionId,
      )
    }
    const chartExportSpec = body.chartExportSpec ?? body.spec

    if (!isChartExportSpec(chartExportSpec)) {
      return finalizeNewsletterChartResponse(
        newsletterChartJson(
          request,
          METHODS,
          { error: 'chartExportSpec is required' },
          { status: 400 },
        ),
        request,
        METHODS,
        createdSessionId,
      )
    }

    const saveInput = normalizeNewsletterChartLibrarySaveInput({
      title: typeof body.title === 'string' ? body.title : undefined,
      chartExportSpec,
    })
    const chartBaseUrl = resolveNewsletterChartBaseUrl(
      request,
      body.chartBaseUrl,
    )
    const scopeKey = scope.ownerId
      ? `owner:${scope.ownerId}`
      : `session:${scope.sessionId}`
    const fingerprint = buildNewsletterChartPostFingerprint({
      scopeKey,
      saveInput,
      renderOrigin: chartBaseUrl,
    })
    const durableOwnerId = process.env.NODE_ENV === 'production'
      ? scope.ownerId
      : null
    const durableRequest = durableOwnerId
      ? {
        ...buildNewsletterChartPostPersistenceIdentity({
          ownerId: durableOwnerId,
          idempotencyKey,
        }),
        fingerprint,
      }
      : undefined
    const result = await runNewsletterChartPost({
      scopeKey,
      idempotencyKey,
      fingerprint,
      callerSignal: request.signal,
      durableOwnerId,
      registerBackgroundTask: registerNewsletterChartBackgroundTask,
      operation: (signal) => saveNewsletterChartLibraryItem(
        scope,
        saveInput,
        {
          chartBaseUrl,
          publicChartBaseUrl: getDefaultPublicChartingBaseUrlForHost(
            request.headers.get('host'),
          ),
          captureTotalTimeoutMs: NEWSLETTER_CHART_POST_DEADLINE_MS,
          durableRequest,
          signal,
        },
      ),
    })

    const response = NextResponse.json({ chart: result.value })
    response.headers.set(
      'X-Idempotency-Replay',
      result.replayed ? 'true' : 'false',
    )

    return finalizeNewsletterChartResponse(
      response,
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
