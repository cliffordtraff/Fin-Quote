import { NextResponse } from 'next/server'
import { fetchFastMarketData } from '@/lib/fetch-market-data'

const TTL_MS = 15_000
let cache: { at: number; data: any } | null = null

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        'X-Cache': 'HIT',
        'X-Snapshot': 'fast',
      },
    })
  }

  const data = await fetchFastMarketData()
  cache = { at: now, data }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      'X-Cache': 'MISS',
      'X-Snapshot': 'fast',
    },
  })
}
