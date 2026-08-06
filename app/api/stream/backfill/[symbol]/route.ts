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
  const lookbackSecs = Math.min(
    Number(url.searchParams.get('lookback') ?? '300'),
    3600, // cap at 1 hour
  )

  if (timeframe !== '1s' && timeframe !== '10s') {
    return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
  }

  const provider = getProvider()
  const now = Date.now()
  const fromMs = now - lookbackSecs * 1000

  // Request the exact resolution from Massive (supports second-level data)
  const multiplier = timeframe === '1s' ? 1 : 10
  const timespan: CandleTimespan = 'second'

  const fromStr = new Date(fromMs).toISOString().split('T')[0]
  const toStr = new Date(now).toISOString().split('T')[0]

  try {
    const [candles, quote] = await Promise.all([
      provider.getIntraday(fmpSymbol, multiplier, timespan, fromStr, toStr),
      provider.getQuote(fmpSymbol),
    ])

    // Filter to lookback window and convert to CandlePoint format
    const candlePoints = candles
      .filter(c => c.timestampMs >= fromMs)
      .map(c => ({
        time: Math.floor(c.timestampMs / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

    return NextResponse.json({
      candles: candlePoints,
      previousClose: quote?.previousClose ?? 0,
      dayHigh: quote?.dayHigh ?? null,
      dayLow: quote?.dayLow ?? null,
    })
  } catch (err) {
    console.error(`[backfill] Error for ${fmpSymbol}:`, err)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 502 })
  }
}
