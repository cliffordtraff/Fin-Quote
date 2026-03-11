import { NextResponse } from 'next/server'
import { getStockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'

const TTL_MS = 15_000

// Per-symbol in-memory cache
const cache = new Map<string, { at: number; data: any }>()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const rawSymbol = decodeURIComponent((await params).symbol)

  // Validate: stock tickers (1-5 alpha) or futures (e.g. ES=F, NQ=F)
  if (!/^[A-Z]{1,5}(=[A-Z])?$/.test(rawSymbol)) {
    return NextResponse.json(
      { error: 'Invalid symbol' },
      { status: 400 }
    )
  }

  const symbol = rawSymbol

  const now = Date.now()
  const cached = cache.get(symbol)

  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        'X-Cache': 'HIT',
      },
    })
  }

  const result = await getStockIntradayOHLC(symbol)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 }
    )
  }

  cache.set(symbol, { at: now, data: result.data })

  // Evict stale entries to prevent unbounded growth
  if (cache.size > 100) {
    for (const [key, entry] of cache) {
      if (now - entry.at > TTL_MS * 4) cache.delete(key)
    }
  }

  return NextResponse.json(result.data, {
    headers: {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      'X-Cache': 'MISS',
    },
  })
}
