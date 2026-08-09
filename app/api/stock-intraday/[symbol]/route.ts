import { NextResponse } from 'next/server'
import {
  getStockIntradayOHLC,
  type StockIntradayOHLC,
} from '@/app/actions/stock-intraday-ohlc'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'
import {
  leaseStockIntradayRouteLoad,
  readStockIntradayRouteCache,
  StockIntradayLoadTimeoutError,
} from '@/lib/stock-intraday-route-cache'

const SUCCESS_HEADERS = {
  'Cache-Control': 'no-store',
} as const
const ERROR_HEADERS = { 'Cache-Control': 'no-store' } as const
const INTERVAL_RE = /^\d+$/

function errorResponse(error: string, status: 400 | 502 | 504) {
  return NextResponse.json({ error }, { status, headers: ERROR_HEADERS })
}

function parseInterval(url: URL): number | null {
  const values = url.searchParams.getAll('interval')
  if (values.length === 0) return 5
  if (values.length !== 1 || !INTERVAL_RE.test(values[0])) return null
  const interval = Number(values[0])
  return Number.isSafeInteger(interval) && interval >= 1 && interval <= 30
    ? interval
    : null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCompleteCandle(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const candle = value as Record<string, unknown>
  return (
    typeof candle.date === 'string' &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close)
  )
}

function isCompleteStockIntradayData(
  value: unknown,
): value is StockIntradayOHLC {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    typeof data.symbol === 'string' &&
    typeof data.name === 'string' &&
    isFiniteNumber(data.currentPrice) &&
    isFiniteNumber(data.priceChange) &&
    isFiniteNumber(data.priceChangePercent) &&
    Array.isArray(data.yesterdayOHLC) &&
    data.yesterdayOHLC.every(isCompleteCandle) &&
    Array.isArray(data.todayOHLC) &&
    data.todayOHLC.every(isCompleteCandle) &&
    (data.previousClose === null || isFiniteNumber(data.previousClose))
  )
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
  { params }: { params: Promise<{ symbol: string }> }
) {
  request.signal.throwIfAborted()
  let decodedSymbol: string
  try {
    decodedSymbol = decodeURIComponent((await params).symbol)
  } catch {
    return errorResponse('Invalid symbol', 400)
  }
  request.signal.throwIfAborted()
  const rawSymbol = normalizeMarketSymbol(decodedSymbol)

  // Validate stocks, class shares (BRK.B), and futures (ES=F).
  if (!isValidMarketSymbol(rawSymbol)) {
    return errorResponse('Invalid symbol', 400)
  }

  const symbol = rawSymbol
  const isCompleteForSymbol = (
    value: unknown,
  ): value is StockIntradayOHLC =>
    isCompleteStockIntradayData(value) &&
    normalizeMarketSymbol(value.symbol) === symbol

  const url = new URL(request.url)
  const interval = parseInterval(url)
  if (interval === null) return errorResponse('Invalid interval', 400)

  const cacheKey = `${symbol}:${interval}`
  const cached = readStockIntradayRouteCache(cacheKey, Date.now())
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        ...SUCCESS_HEADERS,
        'X-Cache': 'HIT',
      },
    })
  }

  const lease = leaseStockIntradayRouteLoad(
    cacheKey,
    () => getStockIntradayOHLC(symbol, interval),
    isCompleteForSymbol,
  )
  if (lease.status === 'capacity') {
    return NextResponse.json(
      { error: 'Intraday data is temporarily busy. Please retry.' },
      {
        status: 503,
        headers: { ...ERROR_HEADERS, 'Retry-After': '1' },
      },
    )
  }

  try {
    const result = await waitForSharedLoad(lease.promise, request.signal)
    if (result.error || !isCompleteForSymbol(result.data)) {
      return errorResponse(
        result.error || `Failed to load data for ${symbol}`,
        502,
      )
    }
    return NextResponse.json(result.data, {
      headers: { ...SUCCESS_HEADERS, 'X-Cache': 'MISS' },
    })
  } catch (error) {
    if (request.signal.aborted) throw abortReason(request.signal)
    if (error instanceof StockIntradayLoadTimeoutError) {
      return errorResponse(`Failed to load data for ${symbol}`, 504)
    }
    return errorResponse(`Failed to load data for ${symbol}`, 502)
  }
}
