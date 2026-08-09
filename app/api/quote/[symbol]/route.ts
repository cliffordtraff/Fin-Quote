import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import type { ProviderQuote } from '@/lib/providers/types'
import { getCurrentMarketSession } from '@/lib/market-utils'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'
import {
  leaseQuoteRouteLoad,
  QuoteRouteLoadTimeoutError,
  readQuoteRouteCache,
} from '@/lib/quote-route-cache'

const RESPONSE_CACHE_CONTROL =
  'public, max-age=0, s-maxage=4, stale-while-revalidate=1'
const ERROR_HEADERS = { 'Cache-Control': 'no-store' } as const

type QuoteResponse = {
  price: number
  change: number
  changesPercentage: number
  previousClose: number | null
  marketStatus: 'open' | 'closed' | 'premarket' | 'afterhours'
}

function getMarketStatus(): QuoteResponse['marketStatus'] {
  const session = getCurrentMarketSession()
  if (session === 'regular') return 'open'
  if (session === 'premarket') return 'premarket'
  if (session === 'afterhours') return 'afterhours'
  return 'closed'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCompleteQuoteForSymbol(
  value: unknown,
  symbol: string,
): value is ProviderQuote {
  if (!value || typeof value !== 'object') return false
  const quote = value as Record<string, unknown>
  return (
    typeof quote.symbol === 'string' &&
    normalizeMarketSymbol(quote.symbol) === symbol &&
    typeof quote.name === 'string' &&
    isFiniteNumber(quote.price) &&
    quote.price !== 0 &&
    isFiniteNumber(quote.change) &&
    isFiniteNumber(quote.changesPercentage) &&
    (quote.previousClose === undefined || isFiniteNumber(quote.previousClose))
  )
}

function toResponse(quote: ProviderQuote): QuoteResponse {
  return {
    price: quote.price,
    change: quote.change,
    changesPercentage: quote.changesPercentage,
    previousClose: quote.previousClose ?? null,
    marketStatus: getMarketStatus(),
  }
}

function errorResponse(error: string, status: 400 | 404 | 502 | 504) {
  return NextResponse.json({ error }, { status, headers: ERROR_HEADERS })
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError')
}

function waitForSharedLoad<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  request.signal.throwIfAborted()
  let decodedSymbol: string
  try {
    decodedSymbol = decodeURIComponent((await params).symbol)
  } catch {
    return errorResponse('Invalid symbol', 400)
  }
  request.signal.throwIfAborted()

  const symbol = normalizeMarketSymbol(decodedSymbol)
  if (!isValidMarketSymbol(symbol)) {
    return errorResponse('Invalid symbol', 400)
  }

  const cached = readQuoteRouteCache(symbol, Date.now())
  if (cached) {
    return NextResponse.json(toResponse(cached), {
      headers: {
        'Cache-Control': RESPONSE_CACHE_CONTROL,
        'X-Cache': 'HIT',
      },
    })
  }

  const lease = leaseQuoteRouteLoad(
    symbol,
    (signal) => getProvider().getQuote(symbol, { freshness: 'live', signal }),
    (quote): quote is ProviderQuote => isCompleteQuoteForSymbol(quote, symbol),
  )
  if (lease.status === 'capacity') {
    return NextResponse.json(
      { error: 'Quote service is temporarily busy. Please retry.' },
      {
        status: 503,
        headers: { ...ERROR_HEADERS, 'Retry-After': '1' },
      },
    )
  }

  try {
    const quote = await waitForSharedLoad(lease.promise, request.signal)
    if (quote === null) return errorResponse('No quote', 404)
    if (!isCompleteQuoteForSymbol(quote, symbol)) {
      return errorResponse('Fetch failed', 502)
    }

    return NextResponse.json(toResponse(quote), {
      headers: {
        'Cache-Control': RESPONSE_CACHE_CONTROL,
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    if (request.signal.aborted) throw abortReason(request.signal)
    if (error instanceof QuoteRouteLoadTimeoutError) {
      return errorResponse('Fetch failed', 504)
    }
    return errorResponse('Fetch failed', 502)
  }
}
