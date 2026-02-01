import { NextResponse } from 'next/server'
import { fetchSlowMarketData } from '@/lib/fetch-market-data'

const TTL_MS = 5 * 60_000
let cache: { at: number; data: any } | null = null

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Snapshot': 'slow',
      },
    })
  }

  const data = await fetchSlowMarketData()
  cache = { at: now, data }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      'X-Cache': 'MISS',
      'X-Snapshot': 'slow',
    },
  })
}
