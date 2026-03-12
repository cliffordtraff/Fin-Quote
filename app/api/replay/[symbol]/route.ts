/**
 * REST endpoint to fetch historical candles for replay mode.
 *
 * GET /api/replay/:symbol?from=2026-03-11T09:30:00&to=2026-03-11T09:35:00&timeframe=1s
 *
 * Returns JSON: { candles: StreamCandle[], previousClose: number }
 *
 * `from` and `to` are ET local times. The route handles DST/EST offset internally.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import type { CandleTimespan } from '@/lib/providers/types'

interface CacheEntry {
  candles: { time: number; open: number; high: number; low: number; close: number; volume?: number }[]
  previousClose: number
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const fmpSymbol = decodeURIComponent(symbol).toUpperCase()

  if (!/^[A-Z]{1,5}(=[A-Z])?$/.test(fmpSymbol)) {
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

  // Resolve date, from, to
  const today = new Date().toISOString().split('T')[0]
  const date = dateParam ?? today

  // Support both full ISO and short HH:MM format
  let fromIso: string
  let toIso: string

  if (fromParam && fromParam.includes('T')) {
    // Full ISO-ish: "2026-03-11T09:30:00"
    const offset = isEDT(date) ? '-04:00' : '-05:00'
    fromIso = fromParam.length > 19 ? fromParam : fromParam + offset
    toIso = toParam
      ? (toParam.length > 19 ? toParam : toParam + (toParam.includes('T') ? offset : ''))
      : etToIso(date, '10:00')
  } else {
    // Short format: "09:30"
    const fromTime = fromParam ?? '09:30'
    const toTime = toParam ?? '10:00'
    fromIso = etToIso(date, fromTime)
    toIso = etToIso(date, toTime)
  }

  const fromMs = new Date(fromIso).getTime()
  const toMs = new Date(toIso).getTime()

  if (isNaN(fromMs) || isNaN(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: 'Invalid from/to range' }, { status: 400 })
  }

  // Cache lookup
  const cacheKey = `${fmpSymbol}:${timeframe}:${fromMs}:${toMs}`
  const cached = cache.get(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const provider = getProvider()
  const multiplier = timeframe === '1s' ? 1 : 10
  const timespan: CandleTimespan = 'second'

  try {
    const [candles, quote] = await Promise.all([
      provider.getIntraday(fmpSymbol, multiplier, timespan, date, date),
      provider.getQuote(fmpSymbol),
    ])

    // Filter candles to the [from, to] window
    const candlePoints = candles
      .filter(c => c.timestampMs >= fromMs && c.timestampMs <= toMs)
      .map(c => ({
        time: Math.floor(c.timestampMs / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

    const result: CacheEntry = {
      candles: candlePoints,
      previousClose: quote?.previousClose ?? 0,
    }

    // Store in cache, evict oldest if over limit
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(cacheKey, result)

    return NextResponse.json(result)
  } catch (err) {
    console.error(`[replay] Error for ${fmpSymbol}:`, err)
    return NextResponse.json({ error: 'Replay fetch failed' }, { status: 502 })
  }
}
