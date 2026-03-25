import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MASSIVE_BASE = 'https://api.massive.com'
const SEARCH_LIMIT = 20
const RESPONSE_LIMIT = 10
const SUPPORTED_TICKER_TYPES = new Set(['CS', 'ETF', 'ADRC'])

interface MassiveTickerResult {
  ticker?: string
  name?: string
  market?: string
  type?: string
  primary_exchange?: string
}

interface SearchTickerResult {
  symbol: string
  name: string
  type: string
  market: string
}

function getApiKey(): string {
  const key = process.env.MASSIVE_API_KEY
  if (!key) throw new Error('MASSIVE_API_KEY not set')
  return key
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}` }
}

function formatMarket(value: string | undefined): string {
  if (!value) return 'Stocks'
  if (value.toUpperCase() === 'STOCKS') return 'Stocks'

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatExchange(value: string | undefined): string | null {
  if (!value) return null

  const normalized = value.trim().toUpperCase()
  const exchangeLabels: Record<string, string> = {
    XNAS: 'NASDAQ',
    NASDAQ: 'NASDAQ',
    XNYS: 'NYSE',
    NYSE: 'NYSE',
    XASE: 'NYSE American',
    ARCX: 'NYSE Arca',
    BATS: 'Cboe',
    XCBO: 'Cboe',
    IEXG: 'IEX',
  }

  return exchangeLabels[normalized] ?? normalized
}

function getRelevanceScore(result: MassiveTickerResult, query: string): number {
  const normalizedQuery = query.trim().toUpperCase()
  const symbol = result.ticker?.toUpperCase() ?? ''
  const name = result.name?.toUpperCase() ?? ''

  if (symbol === normalizedQuery) return 0
  if (symbol.startsWith(normalizedQuery)) return 1
  if (symbol.includes(normalizedQuery)) return 2
  if (name.startsWith(normalizedQuery)) return 3
  if (name.includes(normalizedQuery)) return 4
  return 5
}

function compareTickerResults(a: MassiveTickerResult, b: MassiveTickerResult, query: string): number {
  const scoreDiff = getRelevanceScore(a, query) - getRelevanceScore(b, query)
  if (scoreDiff !== 0) return scoreDiff

  const symbolA = a.ticker?.toUpperCase() ?? ''
  const symbolB = b.ticker?.toUpperCase() ?? ''
  const symbolDiff = symbolA.localeCompare(symbolB)
  if (symbolDiff !== 0) return symbolDiff

  return (a.name ?? '').localeCompare(b.name ?? '')
}

function mapTickerResult(result: MassiveTickerResult): SearchTickerResult | null {
  const symbol = result.ticker?.trim().toUpperCase()
  const name = result.name?.trim()
  const type = result.type?.trim().toUpperCase()

  if (!symbol || !name || !type || !SUPPORTED_TICKER_TYPES.has(type)) {
    return null
  }

  return {
    symbol,
    name,
    type,
    market: formatExchange(result.primary_exchange) ?? formatMarket(result.market),
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] })
  }

  try {
    const params = new URLSearchParams({
      search: query,
      active: 'true',
      market: 'stocks',
      limit: String(SEARCH_LIMIT),
    })

    const response = await fetch(`${MASSIVE_BASE}/v3/reference/tickers?${params.toString()}`, {
      headers: authHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error(`Ticker search failed for "${query}" with status ${response.status}`)
      return NextResponse.json(
        { error: 'Search unavailable' },
        { status: response.status >= 500 ? 503 : 502 }
      )
    }

    const data = await response.json() as { results?: MassiveTickerResult[] }

    const results = (data.results ?? [])
      .slice()
      .sort((a, b) => compareTickerResults(a, b, query))
      .map(mapTickerResult)
      .filter((result): result is SearchTickerResult => result !== null)
      .slice(0, RESPONSE_LIMIT)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Ticker search unavailable:', error)
    return NextResponse.json(
      { error: 'Search unavailable' },
      { status: 503 }
    )
  }
}
