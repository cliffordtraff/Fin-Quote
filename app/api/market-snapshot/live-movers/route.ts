import { NextResponse } from 'next/server'
import {
  fetchLiveMoversMarketData,
  type LiveMoversMarketData,
} from '@/lib/fetch-market-data'

const TTL_MS = 15_000
let cache: { at: number; data: LiveMoversMarketData } | null = null

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        'X-Cache': 'HIT',
        'X-Snapshot': 'live-movers',
      },
    })
  }

  const data = await fetchLiveMoversMarketData()
  cache = { at: Date.now(), data }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      'X-Cache': 'MISS',
      'X-Snapshot': 'live-movers',
    },
  })
}
