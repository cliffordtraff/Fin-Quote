import { NextResponse } from 'next/server'
import { fetchSlowMarketData } from '@/lib/fetch-market-data'

const TTL_MS = 5 * 60_000
let cache: { at: number; data: any } | null = null

function hasForexBondsData(data: any): boolean {
  return Array.isArray(data?.forexBonds) && data.forexBonds.length > 0
}

export async function GET() {
  const now = Date.now()

  if (cache && now - cache.at < TTL_MS && hasForexBondsData(cache.data)) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Cache': 'HIT',
        'X-Snapshot': 'slow',
      },
    })
  }

  let data = await fetchSlowMarketData()

  // Recover from transient provider/cache misses so the dashboard does not leave
  // the forex/bonds slot blank for the full slow-snapshot TTL.
  if (!hasForexBondsData(data)) {
    data = await fetchSlowMarketData()
  }

  if (hasForexBondsData(data)) {
    cache = { at: now, data }
  } else {
    cache = null
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      'X-Cache': 'MISS',
      'X-Snapshot': 'slow',
    },
  })
}
