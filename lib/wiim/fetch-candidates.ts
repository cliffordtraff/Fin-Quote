import { createClient } from '@supabase/supabase-js'

import { getSP500Constituent, isSP500, normalizeSP500Symbol } from '@/lib/sp500'

import { fetchMarketContext, fetchRecentPicks } from '../newsletter/fetch-context'
import type { StockWhyMovingResult } from '../stock-why-moving'

import type { WiimCandidateInput, WiimFetchCandidatesResult } from './types'

interface StockWhyMovingCacheRow {
  symbol: string
  status: string
  display_text: string | null
  headline: string | null
  summary: string | null
  bullet_points: unknown
  sentiment: string | null
  source: string | null
  source_timestamp: string | null
  is_catalyst: boolean | null
  source_url: string
  fetched_at: string
  error_message: string | null
}

function createSupabaseReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function mapWhyMovingRow(row: StockWhyMovingCacheRow): StockWhyMovingResult {
  return {
    symbol: row.symbol,
    status: (row.status as StockWhyMovingResult['status']) ?? 'not_found',
    displayText: row.display_text,
    headline: row.headline,
    summary: row.summary,
    bulletPoints: Array.isArray(row.bullet_points)
      ? row.bullet_points.filter((item): item is string => typeof item === 'string')
      : [],
    sentiment: row.sentiment,
    source: row.source,
    sourceTimestamp: row.source_timestamp,
    isCatalyst: row.is_catalyst,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    errorMessage: row.error_message,
  }
}

async function fetchRecentWhyMovingBySymbol(symbols: string[]): Promise<Map<string, StockWhyMovingResult>> {
  const filteredSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => normalizeSP500Symbol(symbol))
        .filter((symbol): symbol is string => Boolean(symbol && isSP500(symbol))),
    ),
  )
  if (filteredSymbols.length === 0) return new Map()

  const supabase = createSupabaseReadClient()
  if (!supabase) return new Map()

  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const rows: StockWhyMovingCacheRow[] = []
    for (let index = 0; index < filteredSymbols.length; index += 100) {
      const batch = filteredSymbols.slice(index, index + 100)
      const { data, error } = await supabase
        .from('stock_why_moving_cache')
        .select('symbol, status, display_text, headline, summary, bullet_points, sentiment, source, source_timestamp, is_catalyst, source_url, fetched_at, error_message')
        .in('symbol', batch)
        .eq('status', 'found')
        .gte('fetched_at', since)

      if (error || !Array.isArray(data)) return new Map()
      rows.push(...(data as StockWhyMovingCacheRow[]))
    }

    return new Map(
      rows.flatMap((row) => {
        const mapped = mapWhyMovingRow(row)
        const canonical = normalizeSP500Symbol(mapped.symbol)
        if (!canonical || !isSP500(canonical)) {
          return []
        }
        return [[canonical, { ...mapped, symbol: canonical }] as const]
      }),
    )
  } catch {
    return new Map()
  }
}

export async function raceReadOnlyWiimFetch<T>(
  worker: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return worker()
  signal.throwIfAborted()
  let removeAbortListener: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new Error('WIIM candidate fetch was cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })
  try {
    // Candidate collection is read-only. Some provider clients cannot consume
    // AbortSignal yet, so race the lease signal and discard any late result.
    return await Promise.race([
      Promise.resolve().then(worker),
      aborted,
    ])
  } finally {
    removeAbortListener()
  }
}

async function fetchWiimCandidatesUnbounded(): Promise<WiimFetchCandidatesResult> {
  const [market, recentPicks] = await Promise.all([
    fetchMarketContext(),
    fetchRecentPicks(14),
  ])

  const canonicalCandidates = market.candidates
    .map((candidate) => {
      const symbol = normalizeSP500Symbol(candidate.symbol)
      if (!symbol || !isSP500(symbol)) return null
      const constituent = getSP500Constituent(symbol)
      return {
        ...candidate,
        symbol,
        name: constituent?.name || candidate.name,
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  const symbols = canonicalCandidates.map((candidate) => candidate.symbol)
  const whyMovingBySymbol = await fetchRecentWhyMovingBySymbol(symbols)

  const earningsBySymbol = new Map(
    (market.earningsReports ?? [])
      .map((entry) => {
        const symbol = normalizeSP500Symbol(entry.symbol)
        if (!symbol || !isSP500(symbol)) return null
        return [symbol, { ...entry, symbol }] as const
      })
      .filter((entry): entry is readonly [string, NonNullable<(typeof market.earningsReports)>[number]] => Boolean(entry)),
  )

  const recentPicksBySymbol = new Map(
    recentPicks
      .map((entry) => {
        const symbol = normalizeSP500Symbol(entry.ticker)
        if (!symbol || !isSP500(symbol)) return null
        return [symbol, { ...entry, ticker: symbol }] as const
      })
      .filter((entry): entry is readonly [string, typeof recentPicks[number]] => Boolean(entry)),
  )

  const candidates: WiimCandidateInput[] = canonicalCandidates.map((candidate) => ({
    symbol: candidate.symbol,
    name: candidate.name,
    price: candidate.price,
    change: candidate.change,
    changesPercentage: candidate.changesPercentage,
    news: market.newsBySymbol[candidate.symbol] ?? [],
    earningsReport: earningsBySymbol.get(candidate.symbol),
    recentPick: recentPicksBySymbol.get(candidate.symbol),
    whyMoving: whyMovingBySymbol.get(candidate.symbol) ?? null,
  }))

  return {
    generatedAt: new Date().toISOString(),
    marketCandidateCount: canonicalCandidates.length,
    candidates,
  }
}

export async function fetchWiimCandidates(
  signal?: AbortSignal,
): Promise<WiimFetchCandidatesResult> {
  return raceReadOnlyWiimFetch(fetchWiimCandidatesUnbounded, signal)
}
