/**
 * REST endpoint to seed the chart with recent candle data before streaming begins.
 *
 * GET /api/stream/backfill/:symbol?timeframe=1s|10s&lookback=300
 *
 * Returns JSON: { candles: CandlePoint[], previousClose: number }
 *
 * Fetches real candles from Massive at the requested resolution (1s or 10s).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import type { CandleTimespan } from '@/lib/providers/types'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'
import {
  normalizePulseStreamCandles,
  parsePulseLiveStreamBackfillPayload,
  PULSE_CANDLE_MAX_INPUT_ROWS,
  type PulseLiveStreamBackfillPayload,
} from '@/lib/pulse-market-data-contract'
import {
  leaseLiveStreamBackfill,
  LiveStreamBackfillLoadTimeoutError,
  waitForLiveStreamBackfill,
} from '@/lib/live-stream-backfill-admission'

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

function errorResponse(
  error: string,
  status: 400 | 501 | 502 | 503 | 504,
  code?: string,
  retryAfter?: string,
) {
  return NextResponse.json(
    code ? { error, code } : { error },
    {
      status,
      headers: retryAfter
        ? { ...RESPONSE_HEADERS, 'Retry-After': retryAfter }
        : RESPONSE_HEADERS,
    },
  )
}

async function loadBackfill(
  fmpSymbol: string,
  timeframe: '1s' | '10s',
  lookbackSecs: number,
  signal: AbortSignal,
): Promise<PulseLiveStreamBackfillPayload> {
  signal.throwIfAborted()
  const provider = getProvider()
  const now = Date.now()
  const fromMs = now - lookbackSecs * 1000
  const multiplier = timeframe === '1s' ? 1 : 10
  const timespan: CandleTimespan = 'second'
  // Massive accepts epoch-millisecond aggregate bounds. Keep the provider
  // request aligned to the actual lookback instead of fetching a whole day of
  // one-second rows and only filtering after that much larger response lands.
  const fromStr = String(fromMs)
  const toStr = String(now)
  const siblingController = new AbortController()
  const loadSignal = AbortSignal.any([signal, siblingController.signal])
  let firstFailure: unknown

  const observeFailure = <T,>(promise: Promise<T>): Promise<T> =>
    promise.catch((error) => {
      if (firstFailure === undefined) {
        firstFailure = error
        siblingController.abort(error)
      }
      throw error
    })

  try {
    const candlePromise = observeFailure(provider.getIntraday(
      fmpSymbol,
      multiplier,
      timespan,
      fromStr,
      toStr,
      { failureMode: 'throw', signal: loadSignal },
    ))
    const quotePromise = observeFailure(provider.getQuote(fmpSymbol, {
      failureMode: 'throw',
      freshness: 'live',
      signal: loadSignal,
    }))
    const [candleResult, quoteResult] = await Promise.allSettled([
      candlePromise,
      quotePromise,
    ] as const)

    signal.throwIfAborted()
    if (candleResult.status === 'rejected') throw candleResult.reason
    if (quoteResult.status === 'rejected') throw quoteResult.reason
    const candles = candleResult.value
    const quote = quoteResult.value
    if (candles.length > PULSE_CANDLE_MAX_INPUT_ROWS) {
      throw new Error('Backfill returned too many candle rows.')
    }
    if (!quote || normalizeMarketSymbol(quote.symbol) !== fmpSymbol) {
      throw new Error('Backfill quote identity did not match the request.')
    }

    const rawCandlePoints = candles
      .filter((candle) =>
        candle.timestampMs >= fromMs && candle.timestampMs <= now
      )
      .map((candle) => ({
        time: Math.floor(candle.timestampMs / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }))
    const candlePoints = normalizePulseStreamCandles(rawCandlePoints, {
      maximumInputRows: PULSE_CANDLE_MAX_INPUT_ROWS,
    })
    if (!candlePoints) throw new Error('Backfill candles were malformed.')

    const payload = parsePulseLiveStreamBackfillPayload({
      symbol: fmpSymbol,
      candles: candlePoints,
      previousClose: quote.previousClose ?? null,
      dayHigh: quote.dayHigh ?? null,
      dayLow: quote.dayLow ?? null,
    }, fmpSymbol)
    if (!payload) throw new Error('Backfill payload was malformed.')
    return payload
  } finally {
    siblingController.abort(
      firstFailure ?? new DOMException('Backfill sibling reads settled.', 'AbortError'),
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  request.signal.throwIfAborted()
  const { symbol } = await params
  let decodedSymbol: string
  try {
    decodedSymbol = decodeURIComponent(symbol)
  } catch {
    return errorResponse('Invalid symbol', 400)
  }
  const fmpSymbol = normalizeMarketSymbol(decodedSymbol)

  if (!isValidMarketSymbol(fmpSymbol)) {
    return errorResponse('Invalid symbol', 400)
  }

  const url = new URL(request.url)
  const timeframe = url.searchParams.get('timeframe') ?? '1s'
  const requestedLookback = Number(url.searchParams.get('lookback') ?? '300')

  if (timeframe !== '1s' && timeframe !== '10s') {
    return errorResponse('Invalid timeframe', 400)
  }

  if (
    !Number.isFinite(requestedLookback) ||
    !Number.isInteger(requestedLookback) ||
    requestedLookback <= 0
  ) {
    return errorResponse(
      'Lookback must be a positive integer number of seconds.',
      400,
      'INVALID_BACKFILL_LOOKBACK',
    )
  }

  const lookbackSecs = Math.min(requestedLookback, 3600)

  // This endpoint promises second-resolution candles. The default FMP
  // provider silently maps `second` to daily history, so fail explicitly
  // rather than returning a plausible empty 200 response.
  if (
    process.env.DATA_PROVIDER !== 'massive' ||
    !process.env.MASSIVE_API_KEY?.trim()
  ) {
    return errorResponse(
      'Second-level backfill requires the Massive data provider.',
      501,
      'UNSUPPORTED_BACKFILL_PROVIDER',
    )
  }

  const lease = leaseLiveStreamBackfill(
    `${fmpSymbol}:${timeframe}:${lookbackSecs}`,
    (signal) => loadBackfill(fmpSymbol, timeframe, lookbackSecs, signal),
  )
  if (lease.status === 'capacity') {
    return errorResponse(
      'Backfill is temporarily busy. Please retry.',
      503,
      'BACKFILL_CAPACITY_EXCEEDED',
      '1',
    )
  }

  try {
    const payload = await waitForLiveStreamBackfill(lease.promise, request.signal)
    return NextResponse.json(payload, { headers: RESPONSE_HEADERS })
  } catch (err) {
    if (request.signal.aborted) throw request.signal.reason
    if (err instanceof LiveStreamBackfillLoadTimeoutError) {
      return errorResponse(
        'Backfill timed out. Please retry.',
        504,
        'BACKFILL_DEADLINE_EXCEEDED',
        '1',
      )
    }
    if (lease.status === 'started') {
      console.error(`[backfill] Error for ${fmpSymbol}:`, err)
    }
    return errorResponse('Backfill failed', 502)
  }
}
