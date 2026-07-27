import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import { getCurrentMarketSession } from '@/lib/market-utils'
import { createKeyedAsyncTTLCache } from '@/lib/async-ttl-cache'

const TTL_MS = 4_000 // 4-second cache per symbol
const RESPONSE_CACHE_CONTROL = 'public, max-age=5, s-maxage=30, stale-while-revalidate=60'

type QuoteResponse = {
  price: number
  change: number
  changesPercentage: number
  previousClose: number | null
  marketStatus: 'open' | 'closed' | 'premarket' | 'afterhours'
}

const getCachedQuote = createKeyedAsyncTTLCache<string, QuoteResponse>(
  TTL_MS,
  500
)

function getMarketStatus(): QuoteResponse['marketStatus'] {
  const session = getCurrentMarketSession()
  if (session === 'regular') return 'open'
  if (session === 'premarket') return 'premarket'
  if (session === 'afterhours') return 'afterhours'
  return 'closed'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const rawSymbol = decodeURIComponent((await params).symbol)

  if (!/^[A-Z]{1,10}(?:\.[A-Z]{1,4}|=[A-Z])?$/.test(rawSymbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  try {
    const data = await getCachedQuote(rawSymbol, async () => {
      const provider = getProvider()
      const q = await provider.getQuote(rawSymbol)

      if (!q) {
        throw new Error('No quote')
      }

      return {
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage,
        previousClose: q.previousClose ?? null,
        marketStatus: getMarketStatus(),
      }
    })

    return NextResponse.json(data, {
      headers: { 'Cache-Control': RESPONSE_CACHE_CONTROL },
    })
  } catch (error) {
    const status = error instanceof Error && error.message === 'No quote' ? 404 : 502
    const message = status === 404 ? 'No quote' : 'Fetch failed'
    return NextResponse.json({ error: message }, { status })
  }
}
