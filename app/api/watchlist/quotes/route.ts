export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import {
  getAdmittedWatchlistQuotes,
  parseWatchlistQuoteRequest,
  WatchlistQuoteCapacityError,
  WatchlistQuoteInputError,
  WatchlistQuoteLoadTimeoutError,
  WatchlistQuoteRuntimeContractError,
} from '@/lib/dashboard/watchlist-quote-admission'
import { WATCHLIST_REQUEST_MAX_BYTES } from '@/lib/dashboard/watchlist-http-contract'
import { admitPublicStreamSymbols } from '@/lib/stream-symbol-admission'

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

class WatchlistQuoteRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message)
    this.name = 'WatchlistQuoteRequestError'
  }
}

function errorResponse(
  error: string,
  code: string,
  status: 400 | 403 | 404 | 413 | 502 | 503 | 504,
  retryAfterSeconds?: number,
) {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: retryAfterSeconds === undefined
        ? RESPONSE_HEADERS
        : {
            ...RESPONSE_HEADERS,
            'Retry-After': String(retryAfterSeconds),
          },
    },
  )
}

function isWatchlistQuoteFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC === 'true'
}

function isSameOriginBrowserRequest(request: Request): boolean {
  const originValue = request.headers.get('origin')?.trim()
  if (!originValue || originValue === 'null') return false

  try {
    const origin = new URL(originValue)
    if (originValue !== origin.origin) return false
    if (origin.origin !== new URL(request.url).origin) return false
  } catch {
    return false
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  return !fetchSite || fetchSite === 'same-origin'
}

function isJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

function throwIfAborted(request: Request, fallback?: unknown): void {
  if (!request.signal.aborted) return
  throw request.signal.reason ?? fallback ?? new DOMException(
    'Watchlist quote request aborted.',
    'AbortError',
  )
}

async function readBoundedJson(request: Request): Promise<unknown> {
  throwIfAborted(request)
  if (!isJsonMediaType(request.headers.get('content-type'))) {
    throw new WatchlistQuoteRequestError(
      'Content-Type must be a JSON media type.',
      400,
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > WATCHLIST_REQUEST_MAX_BYTES
  ) {
    throw new WatchlistQuoteRequestError(
      'Watchlist quote request body is too large.',
      413,
    )
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new WatchlistQuoteRequestError(
      'Watchlist quote request body must be valid JSON.',
      400,
    )
  }

  const decoder = new TextDecoder()
  let serialized = ''
  let totalBytes = 0
  const cancelReader = () => {
    void reader.cancel(request.signal.reason).catch(() => undefined)
  }
  request.signal.addEventListener('abort', cancelReader, { once: true })
  try {
    while (true) {
      throwIfAborted(request)
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      totalBytes += value.byteLength
      if (totalBytes > WATCHLIST_REQUEST_MAX_BYTES) {
        await reader.cancel('Watchlist quote request body is too large.')
          .catch(() => undefined)
        throw new WatchlistQuoteRequestError(
          'Watchlist quote request body is too large.',
          413,
        )
      }
      serialized += decoder.decode(value, { stream: true })
    }
    serialized += decoder.decode()
  } finally {
    request.signal.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }

  throwIfAborted(request)
  try {
    return JSON.parse(serialized) as unknown
  } catch (error) {
    throwIfAborted(request, error)
    throw new WatchlistQuoteRequestError(
      'Watchlist quote request body must be valid JSON.',
      400,
    )
  }
}

export async function POST(request: Request) {
  if (!isWatchlistQuoteFeatureEnabled()) {
    return errorResponse(
      'Watchlist quote sync is not available.',
      'WATCHLIST_QUOTES_DISABLED',
      404,
    )
  }

  if (!isSameOriginBrowserRequest(request)) {
    return errorResponse(
      'This origin is not allowed to load watchlist quotes.',
      'WATCHLIST_QUOTES_ORIGIN_FORBIDDEN',
      403,
    )
  }

  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return errorResponse(
      'Watchlist quote requests do not accept query parameters.',
      'INVALID_WATCHLIST_QUOTE_REQUEST',
      400,
    )
  }

  try {
    throwIfAborted(request)
    const input = await readBoundedJson(request)
    const symbols = parseWatchlistQuoteRequest(input)
    throwIfAborted(request)

    let admission: Awaited<ReturnType<typeof admitPublicStreamSymbols>>
    try {
      admission = await admitPublicStreamSymbols(symbols, request.signal)
    } catch {
      throwIfAborted(request)
      return errorResponse(
        'Stock registry is temporarily unavailable.',
        'WATCHLIST_QUOTE_REGISTRY_UNAVAILABLE',
        503,
        1,
      )
    }
    throwIfAborted(request)
    if (admission.kind === 'invalid') {
      return errorResponse(
        'Watchlist quotes accept equity symbols only.',
        'INVALID_WATCHLIST_QUOTE_REQUEST',
        400,
      )
    }
    if (admission.kind === 'not_found') {
      return errorResponse(
        `Stock symbol was not found: ${admission.symbol}`,
        'WATCHLIST_QUOTE_SYMBOL_NOT_FOUND',
        404,
      )
    }
    if (admission.kind === 'unavailable') {
      return errorResponse(
        'Stock registry is temporarily unavailable.',
        'WATCHLIST_QUOTE_REGISTRY_UNAVAILABLE',
        503,
        1,
      )
    }

    const quotes = await getAdmittedWatchlistQuotes(
      symbols,
      (batchSymbols, signal) => getProvider().getQuotes([...batchSymbols], {
        failureMode: 'throw',
        freshness: 'live',
        signal,
      }),
      request.signal,
    )
    throwIfAborted(request)
    return NextResponse.json({ quotes }, { headers: RESPONSE_HEADERS })
  } catch (error) {
    throwIfAborted(request, error)
    if (error instanceof WatchlistQuoteRequestError) {
      return errorResponse(
        error.message,
        error.status === 413
          ? 'WATCHLIST_QUOTE_REQUEST_TOO_LARGE'
          : 'INVALID_WATCHLIST_QUOTE_REQUEST',
        error.status,
      )
    }
    if (error instanceof WatchlistQuoteInputError) {
      return errorResponse(
        error.message,
        'INVALID_WATCHLIST_QUOTE_REQUEST',
        400,
      )
    }
    if (error instanceof WatchlistQuoteCapacityError) {
      return errorResponse(
        'Watchlist quotes are temporarily busy. Please retry.',
        'WATCHLIST_QUOTE_CAPACITY_EXCEEDED',
        503,
        error.retryAfterSeconds,
      )
    }
    if (error instanceof WatchlistQuoteLoadTimeoutError) {
      return errorResponse(
        'Watchlist quote loading timed out. Please retry.',
        'WATCHLIST_QUOTE_DEADLINE_EXCEEDED',
        504,
      )
    }
    if (error instanceof WatchlistQuoteRuntimeContractError) {
      return errorResponse(
        'Watchlist quote loading failed.',
        'WATCHLIST_QUOTE_UPSTREAM_FAILED',
        502,
      )
    }

    console.error('[watchlist-quotes] Provider request failed.')
    return errorResponse(
      'Watchlist quote loading failed.',
      'WATCHLIST_QUOTE_UPSTREAM_FAILED',
      502,
    )
  }
}
