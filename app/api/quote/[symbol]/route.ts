import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'

const TTL_MS = 4_000 // 4-second cache per symbol
const cache = new Map<string, { at: number; data: any }>()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const rawSymbol = decodeURIComponent((await params).symbol)

  if (!/^[A-Z]{1,5}(=[A-Z])?$/.test(rawSymbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  const now = Date.now()
  const cached = cache.get(rawSymbol)

  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'no-cache', 'X-Cache': 'HIT' },
    })
  }

  try {
    const provider = getProvider()
    const q = await provider.getQuote(rawSymbol)

    if (!q) {
      return NextResponse.json({ error: 'No quote' }, { status: 404 })
    }

    const data = {
      price: q.price,
      change: q.change,
      changesPercentage: q.changesPercentage,
    }

    cache.set(rawSymbol, { at: now, data })

    // Evict stale
    if (cache.size > 50) {
      for (const [key, entry] of cache) {
        if (now - entry.at > TTL_MS * 4) cache.delete(key)
      }
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-cache', 'X-Cache': 'MISS' },
    })
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })
  }
}
