/**
 * REST endpoint to fetch historical candles for replay mode.
 *
 * GET /api/replay/:symbol?from=2026-03-11T09:30:00&to=2026-03-11T09:35:00&timeframe=1s
 *
 * Returns JSON: { candles: StreamCandle[], previousClose: number | null }
 *
 * `from` and `to` are ET local times. The route handles DST/EST offset internally.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { MassiveProvider } from '@/lib/providers/massive'
import type { CandleTimespan } from '@/lib/providers/types'
import { getTradingDate } from '@/lib/market-hours'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'

interface ReplayPayload {
  candles: { time: number; open: number; high: number; low: number; close: number; volume?: number }[]
  previousClose: number | null
  startTime: number
  endTime: number
}

interface CacheEntry {
  payload: ReplayPayload
  cachedAt: number
}

const cache = new Map<string, CacheEntry>()
const MAX_CACHE = 50

/**
 * Determine whether a given date falls in US Eastern Daylight Time.
 * DST runs from the second Sunday of March to the first Sunday of November.
 */
function isEDT(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z')
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() // 0-indexed

  // Jan, Feb, Dec → EST
  if (month < 2 || month > 10) return false
  // Apr–Oct → EDT
  if (month > 2 && month < 10) return true

  // March: DST starts second Sunday
  if (month === 2) {
    const firstDay = new Date(Date.UTC(year, 2, 1)).getUTCDay()
    const secondSunday = firstDay === 0 ? 8 : 15 - firstDay
    return d.getUTCDate() >= secondSunday
  }

  // November: DST ends first Sunday
  const firstDay = new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
  return d.getUTCDate() < firstSunday
}

function etToIso(dateStr: string, timeStr: string): string {
  const offset = isEDT(dateStr) ? '-04:00' : '-05:00'
  return `${dateStr}T${timeStr}:00${offset}`
}

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function isIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const parsed = new Date(`${dateStr}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr
}

function fullIsoBoundDate(value: string | null): string | null | undefined {
  if (!value?.includes('T')) return null

  const date = /^(\d{4}-\d{2}-\d{2})T/.exec(value)?.[1]
  return date && isIsoDate(date) ? date : undefined
}

function replayBoundToIso(value: string | null, fallbackTime: string, date: string): string {
  const bound = value ?? fallbackTime
  if (!bound.includes('T')) return etToIso(date, bound)

  // A full timestamp without a zone still represents Eastern local time in
  // this API. Check for a real zone suffix rather than using string length so
  // fractional seconds do not accidentally fall back to the server timezone.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(bound)
  if (hasZone) return bound

  const offset = isEDT(date) ? '-04:00' : '-05:00'
  return `${bound}${offset}`
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const fmpSymbol = normalizeMarketSymbol(decodeURIComponent(symbol))

  if (!isValidMarketSymbol(fmpSymbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  const url = new URL(request.url)
  const timeframe = url.searchParams.get('timeframe') ?? '1s'
  const fromParam = url.searchParams.get('from') // "2026-03-11T09:30:00" or "09:30"
  const toParam = url.searchParams.get('to')     // "2026-03-11T09:35:00" or "09:35"
  const dateParam = url.searchParams.get('date') // "2026-03-11"

  if (timeframe !== '1s' && timeframe !== '10s') {
    return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
  }

  // Full timestamps carry their own local calendar date. Resolve that date
  // before choosing the provider session so an omitted `date` parameter can
  // never silently fetch or baseline today's trading session instead.
  const fromBoundDate = fullIsoBoundDate(fromParam)
  const toBoundDate = fullIsoBoundDate(toParam)

  if (fromBoundDate === undefined || toBoundDate === undefined) {
    return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
  }

  if (fromBoundDate && toBoundDate && fromBoundDate !== toBoundDate) {
    return NextResponse.json(
      { error: 'Replay bounds must use the same trading date' },
      { status: 400 },
    )
  }

  const boundsDate = fromBoundDate ?? toBoundDate
  if (dateParam && boundsDate && dateParam !== boundsDate) {
    return NextResponse.json(
      { error: 'Replay date does not match from/to bounds' },
      { status: 400 },
    )
  }

  const date = dateParam ?? boundsDate ?? getTradingDate()

  if (!isIsoDate(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  // Support full ISO-ish timestamps and short HH:MM values independently, so
  // either bound can establish the session date while the other remains local.
  const fromIso = replayBoundToIso(fromParam, '09:30', date)
  const toIso = replayBoundToIso(toParam, '10:00', date)

  const fromMs = new Date(fromIso).getTime()
  const toMs = new Date(toIso).getTime()

  if (isNaN(fromMs) || isNaN(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: 'Invalid from/to range' }, { status: 400 })
  }

  // Replay is capability-specific: it uses Massive whenever that credential
  // exists without forcing every other market-data surface off FMP. FMP has
  // no second-candle endpoint; its generic fallback looks valid but returns
  // the wrong granularity.
  if (!process.env.MASSIVE_API_KEY) {
    return NextResponse.json(
      {
        error: 'Second-level replay requires MASSIVE_API_KEY.',
        code: 'UNSUPPORTED_REPLAY_PROVIDER',
      },
      { status: 501 },
    )
  }

  // Cache lookup
  const cacheKey = `${fmpSymbol}:${timeframe}:${fromMs}:${toMs}`
  const cached = cache.get(cacheKey)
  const isCurrentTradingDate = date === getTradingDate()
  const cacheTtlMs = isCurrentTradingDate ? 30_000 : Number.POSITIVE_INFINITY
  // `requestId` is intentionally not part of cache behavior. Clients may use
  // it to identify retries, but an arbitrary query value must not turn a
  // public request into a paid provider-cache bypass.
  if (cached && Date.now() - cached.cachedAt < cacheTtlMs) {
    return NextResponse.json(cached.payload)
  }

  const provider = new MassiveProvider()
  const multiplier = timeframe === '1s' ? 1 : 10
  const timespan: CandleTimespan = 'second'

  try {
    const [candles, dailyCandles] = await Promise.all([
      provider.getIntraday(fmpSymbol, multiplier, timespan, date, date),
      provider.getHistoricalDaily(fmpSymbol, shiftIsoDate(date, -14), date),
    ])

    const historicalPreviousClose = dailyCandles
      .filter((candle) => candle.date.slice(0, 10) < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.close

    // A current quote must never be used for a historical replay: its
    // previousClose belongs to today's session and silently corrupts the
    // replay's change calculations. Missing history is represented honestly.
    const previousClose = historicalPreviousClose != null && Number.isFinite(historicalPreviousClose)
      ? historicalPreviousClose
      : null

    // Use a half-open [from, to) window. Including a candle exactly at `to`
    // can pull the first after-hours bar into a cash-session replay and make
    // the chart auto-fit away from the session the user selected.
    const candlePoints = candles
      .filter(c => c.timestampMs >= fromMs && c.timestampMs < toMs)
      .map(c => ({
        time: Math.floor(c.timestampMs / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

    const result: ReplayPayload = {
      candles: candlePoints,
      previousClose,
      startTime: Math.floor(fromMs / 1_000),
      endTime: Math.floor(toMs / 1_000),
    }

    // Empty replay windows and missing historical baselines can fill in later
    // while the provider is catching up. Never fossilize an incomplete 200
    // response as permanent history.
    if (candlePoints.length > 0 && previousClose !== null) {
      if (cache.size >= MAX_CACHE) {
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
      }
      cache.set(cacheKey, { payload: result, cachedAt: Date.now() })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error(`[replay] Error for ${fmpSymbol}:`, err)
    return NextResponse.json({ error: 'Replay fetch failed' }, { status: 502 })
  }
}
