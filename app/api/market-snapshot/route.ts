import { NextResponse } from 'next/server'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Simple in-process cache to avoid recomputing on every client poll.
// Note: serverless platforms may not keep this warm, but it still helps locally
// and complements Next fetch caching inside each action.
const TTL_MS = 30_000
let cache: { at: number; data: any } | null = null

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=20, stale-while-revalidate=40',
        'X-Cache': 'HIT',
      },
    })
  }

  const data = await fetchAllMarketData()
  cache = { at: now, data }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=20, stale-while-revalidate=40',
      'X-Cache': 'MISS',
    },
  })
}
