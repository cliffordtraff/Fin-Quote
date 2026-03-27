'use server'

import { createClient } from '@supabase/supabase-js'
import { getMarketStatus, getTradingDate, type MarketSession } from '@/lib/market-hours'
import { deriveGainers, deriveLosers, type ExtendedHoursStock } from '@/app/actions/scan-extended-hours'
import { getProvider } from '@/lib/providers'
import type { ProviderQuote } from '@/lib/providers/types'
import { isPulseTodayChartableCandidate } from '@/lib/pulse-today-utils'

// Types
export interface MoverData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export interface MarketMoversResult {
  movers: MoverData[]
  session: SessionType
  cachedAt: string | null
  isLive: boolean
}

export interface AllSessionMoversResult {
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}

export type Direction = 'gainers' | 'losers'
export type SessionType = 'premarket' | 'cash' | 'afterhours'

// Supabase clients
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

// FMP endpoints by session
// Note: Verify these endpoints match FMP's actual API
const FMP_ENDPOINTS: Record<SessionType, Record<Direction, string>> = {
  premarket: {
    gainers: 'pre_market_gainers',
    losers: 'pre_market_losers'
  },
  cash: {
    gainers: 'stock_market/gainers',
    losers: 'stock_market/losers'
  },
  afterhours: {
    gainers: 'aftermarket_gainers',
    losers: 'aftermarket_losers'
  }
}

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60 * 1000
const MIN_MOVER_PRICE = 0.3
const PULSE_TODAY_MOVER_LIMIT = 20
const TOP_MOVER_CANDIDATE_LIMIT = 60
const CHARTABILITY_CACHE_TTL_MS = 5 * 60 * 1000
const MIN_PULSE_TODAY_MINUTE_BARS = 5
const MIN_PULSE_TODAY_STREAM_BARS = 12

type PulseChartabilityCacheEntry = {
  chartable: boolean
  checkedAt: number
}

const pulseChartabilityCache = new Map<string, PulseChartabilityCacheEntry>()

function normalizeMoverCandidates(movers: MoverData[]): MoverData[] {
  return movers.filter((mover) => {
    return (
      Number.isFinite(mover.price) &&
      mover.price >= MIN_MOVER_PRICE &&
      Number.isFinite(mover.change) &&
      Number.isFinite(mover.changesPercentage)
    )
  })
}

function sanitizeMovers(movers: MoverData[]): MoverData[] {
  return normalizeMoverCandidates(movers).slice(0, PULSE_TODAY_MOVER_LIMIT)
}


async function filterPulseTodayChartableMovers(
  provider: ReturnType<typeof getProvider>,
  movers: MoverData[],
): Promise<MoverData[]> {
  const candidates = normalizeMoverCandidates(movers)
  if (candidates.length === 0) return []

  const supportsSecondLevel = (process.env.DATA_PROVIDER ?? 'fmp') === 'massive'
  const marketDate = getTradingDate()
  const now = Date.now()
  const uniqueSymbols = Array.from(new Set(candidates.map((mover) => mover.symbol.toUpperCase())))

  const chartableBySymbol = new Map<string, boolean>()
  const symbolsNeedingChecks: string[] = []

  for (const symbol of uniqueSymbols) {
    const cached = pulseChartabilityCache.get(symbol)
    if (cached && now - cached.checkedAt < CHARTABILITY_CACHE_TTL_MS) {
      chartableBySymbol.set(symbol, cached.chartable)
    } else {
      symbolsNeedingChecks.push(symbol)
    }
  }

  if (symbolsNeedingChecks.length > 0) {
    let quoteSet = new Set<string>()
    try {
      const quotes = await provider.getQuotes(symbolsNeedingChecks)
      quoteSet = new Set(quotes.map((quote) => quote.symbol.toUpperCase()))
    } catch (err) {
      console.error('[market-movers] chartability batch quote check failed:', err)
    }

    const minuteChecks = await Promise.allSettled(
      symbolsNeedingChecks.map(async (symbol) => ({
        symbol,
        minuteBars: (await provider.getIntraday(symbol, 1, 'minute', marketDate, marketDate)).length,
      })),
    )

    const streamEligible = new Map<string, number>()
    for (const result of minuteChecks) {
      if (result.status !== 'fulfilled') {
        console.error('[market-movers] minute chartability check failed:', result.reason)
        continue
      }

      const { symbol, minuteBars } = result.value
      if (quoteSet.has(symbol) && minuteBars < MIN_PULSE_TODAY_MINUTE_BARS && supportsSecondLevel) {
        streamEligible.set(symbol, minuteBars)
        continue
      }

      const chartable = isPulseTodayChartableCandidate({
        quoteExists: quoteSet.has(symbol),
        minuteBars,
        streamBars: 0,
        supportsSecondLevel: false,
      })

      chartableBySymbol.set(symbol, chartable)
      pulseChartabilityCache.set(symbol, { chartable, checkedAt: now })
    }

    if (supportsSecondLevel && streamEligible.size > 0) {
      const streamChecks = await Promise.allSettled(
        Array.from(streamEligible.entries()).map(async ([symbol, minuteBars]) => ({
          symbol,
          minuteBars,
          streamBars: (await provider.getIntraday(symbol, 10, 'second', marketDate, marketDate)).length,
        })),
      )

      for (const result of streamChecks) {
        if (result.status !== 'fulfilled') {
          console.error('[market-movers] stream chartability check failed:', result.reason)
          continue
        }

        const { symbol, minuteBars, streamBars } = result.value
        const chartable = isPulseTodayChartableCandidate({
          quoteExists: quoteSet.has(symbol),
          minuteBars,
          streamBars,
          supportsSecondLevel,
        })

        chartableBySymbol.set(symbol, chartable)
        pulseChartabilityCache.set(symbol, { chartable, checkedAt: now })
      }
    }

    for (const symbol of symbolsNeedingChecks) {
      if (!chartableBySymbol.has(symbol)) {
        const chartable = false
        chartableBySymbol.set(symbol, chartable)
        pulseChartabilityCache.set(symbol, { chartable, checkedAt: now })
      }
    }
  }

  return candidates
    .filter((mover) => chartableBySymbol.get(mover.symbol.toUpperCase()) !== false)
    .slice(0, PULSE_TODAY_MOVER_LIMIT)
}

/**
 * Check if we should fetch LIVE data for this session.
 * Only fetch during the session's active hours.
 */
function canFetchLiveData(
  session: SessionType,
  status: ReturnType<typeof getMarketStatus>
): boolean {
  if (!status.isFetchingEnabled) return false
  return status.session === session
}

/**
 * Check if we can bootstrap missing cache data for a session that already ended today.
 * This allows us to populate the cache with closing data if we missed the session.
 */
function canBootstrapClosedSession(
  session: SessionType,
  status: ReturnType<typeof getMarketStatus>
): boolean {
  // Can only bootstrap regular session (FMP always has this data)
  // Pre-market and after-hours endpoints don't work outside their hours
  if (session !== 'cash') return false

  // Only bootstrap if we're past the cash session (after 4pm ET)
  // During premarket, we don't have today's cash data yet
  if (status.session === 'premarket') return false

  return true
}

/**
 * Get market movers (gainers or losers) for a specific session.
 *
 * Logic:
 * - During active session: fetch live data every 60s
 * - After session ends: use cached "closing" data for the rest of the day
 * - If cache is missing for a closed session: bootstrap once with closing data (cash only)
 */
export async function getMarketMovers(
  session: SessionType,
  direction: Direction
): Promise<MarketMoversResult> {
  const marketDate = getTradingDate()
  const marketStatus = getMarketStatus()
  const isActiveSession = marketStatus.session === session

  // 1. Check cache
  const cached = await getCachedMovers(session, direction, marketDate)

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.fetched_at).getTime()
    const isFresh = cacheAge < CACHE_TTL_MS

    // If this is NOT the active session, always use cache (it's the closing snapshot)
    if (!isActiveSession) {
      return {
        movers: sanitizeMovers(cached.data as MoverData[]),
        session,
        cachedAt: cached.fetched_at,
        isLive: false
      }
    }

    // If active session and cache is fresh, use it
    if (isFresh) {
      return {
        movers: sanitizeMovers(cached.data as MoverData[]),
        session,
        cachedAt: cached.fetched_at,
        isLive: true
      }
    }
  }

  // 2. Fetch live data if this session is currently active
  if (canFetchLiveData(session, marketStatus)) {
    const fresh = await fetchFromFMP(session, direction)
    if (fresh.length > 0) {
      await updateCache(session, direction, marketDate, fresh)
      return {
        movers: fresh,
        session,
        cachedAt: new Date().toISOString(),
        isLive: true
      }
    }
  }

  // 3. Bootstrap: if no cache and session already ended, fetch closing data once
  if (!cached && canBootstrapClosedSession(session, marketStatus)) {
    const closing = await fetchFromFMP(session, direction)
    if (closing.length > 0) {
      await updateCache(session, direction, marketDate, closing)
      return {
        movers: closing,
        session,
        cachedAt: new Date().toISOString(),
        isLive: false
      }
    }
  }

  // 4. Fallback: return stale cache or empty
  return {
    movers: sanitizeMovers((cached?.data as MoverData[]) || []),
    session,
    cachedAt: cached?.fetched_at || null,
    isLive: false
  }
}

/**
 * Read from Supabase cache
 */
async function getCachedMovers(
  session: SessionType,
  direction: Direction,
  marketDate: string
): Promise<{ data: unknown; fetched_at: string } | null> {
  try {
    const { data, error } = await supabasePublic
      .from('market_movers_cache')
      .select('data, fetched_at')
      .eq('session_type', session)
      .eq('direction', direction)
      .eq('market_date', marketDate)
      .maybeSingle()

    if (error) {
      console.error('Market movers cache read error:', error.message)
      return null
    }

    return data
  } catch (err) {
    console.error('Market movers cache read exception:', err)
    return null
  }
}

/**
 * Write to Supabase cache (upsert)
 */
async function updateCache(
  session: SessionType,
  direction: Direction,
  marketDate: string,
  movers: MoverData[]
): Promise<void> {
  if (!supabaseAdmin) {
    console.warn('Cannot write market movers cache: SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }

  try {
    const { error } = await supabaseAdmin
      .from('market_movers_cache')
      .upsert(
        {
          session_type: session,
          direction: direction,
          market_date: marketDate,
          data: sanitizeMovers(movers),
          fetched_at: new Date().toISOString()
        },
        {
          onConflict: 'session_type,direction,market_date'
        }
      )

    if (error) {
      console.error('Market movers cache write error:', error.message)
    }
  } catch (err) {
    console.error('Market movers cache write exception:', err)
  }
}

/**
 * Fetch from FMP API
 */
async function fetchFromFMP(
  session: SessionType,
  direction: Direction
): Promise<MoverData[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.error('FMP_API_KEY not set')
    return []
  }

  const endpoint = FMP_ENDPOINTS[session][direction]
  const url = `https://financialmodelingprep.com/api/v3/${endpoint}?apikey=${apiKey}`

  try {
    const response = await fetch(url, { cache: 'no-store' })

    if (!response.ok) {
      console.error(`FMP API error for ${session} ${direction}: ${response.status}`)
      return []
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      // FMP sometimes returns error objects
      console.error(`Unexpected FMP response for ${session} ${direction}:`, data)
      return []
    }

    // Filter out bad data and transform
    const movers = data
      .filter((item: Record<string, unknown>) => {
        const pctChange = Math.abs((item.changesPercentage as number) || 0)
        const price = item.price as number
        // Filter unrealistic changes and zero/negative prices
        return pctChange < 1000 && price > 0
      })
      .map((item: Record<string, unknown>) => ({
        symbol: item.symbol as string,
        name: item.name as string,
        price: item.price as number,
        change: item.change as number,
        changesPercentage: item.changesPercentage as number
      }))

    return sanitizeMovers(movers)
  } catch (error) {
    console.error(`FMP fetch error for ${session} ${direction}:`, error)
    return []
  }
}

/**
 * Map ExtendedHoursStock[] to MoverData[] (drop extra fields like volume, marketCap)
 */
function mapToMoverData(stocks: ExtendedHoursStock[]): MoverData[] {
  return sanitizeMovers(stocks.map(s => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    change: s.change,
    changesPercentage: s.changesPercentage,
  })))
}

/**
 * Get movers for an extended session (premarket or afterhours) using the bulk scan.
 *
 * - During the active session: fetches fresh data via bulk scan, saves to Supabase
 * - After the session ends: returns the saved Supabase snapshot from earlier
 * - If Supabase cache is fresh (<60s) during active session: skips re-fetching
 */
async function getExtendedSessionMovers(
  session: 'premarket' | 'afterhours',
  direction: Direction
): Promise<MoverData[]> {
  const marketDate = getTradingDate()
  const marketStatus = getMarketStatus()
  const isActiveSession = marketStatus.session === session

  // 1. Check Supabase cache
  const cached = await getCachedMovers(session, direction, marketDate)

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.fetched_at).getTime()
    const isFresh = cacheAge < CACHE_TTL_MS

    // Session is over — return the persisted snapshot
    if (!isActiveSession) {
      return sanitizeMovers(cached.data as MoverData[])
    }

    // Session is active but cache is fresh enough — skip re-fetching
    if (isFresh) {
      return sanitizeMovers(cached.data as MoverData[])
    }
  }

  // 2. Session is active — fetch fresh via bulk scan and save to Supabase
  if (isActiveSession) {
    const deriveFn = direction === 'gainers' ? deriveGainers : deriveLosers
    const stocks = await deriveFn(session)
    const movers = mapToMoverData(stocks)

    if (movers.length > 0) {
      await updateCache(session, direction, marketDate, movers)
      return movers
    }
  }

  // 3. Fallback: stale cache or empty
  return sanitizeMovers((cached?.data as MoverData[]) || [])
}

/**
 * Convert ProviderQuote[] → MoverData[]
 */
function quotesToMovers(quotes: ProviderQuote[]): MoverData[] {
  return normalizeMoverCandidates(quotes.map(q => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.change,
    changesPercentage: q.changesPercentage,
  })))
}

/**
 * Get all sessions for a direction (for initial page load).
 *
 * Uses Massive (Polygon) as the primary source for gainers/losers.
 * Polygon's snapshot-based gainers endpoint reflects real-time data
 * across all sessions (regular + extended hours).
 *
 * Falls back to FMP endpoints + Supabase cache if Massive returns empty.
 */
export async function getAllSessionMovers(
  direction: Direction
): Promise<AllSessionMoversResult> {
  const marketStatus = getMarketStatus()
  const provider = getProvider()

  // Primary: fetch from Massive (Polygon snapshot-based gainers/losers)
  let movers: MoverData[] = []
  try {
    const quotes = direction === 'gainers'
      ? await provider.getGainers()
      : await provider.getLosers()
    movers = await filterPulseTodayChartableMovers(provider, quotesToMovers(quotes))
  } catch (err) {
    console.error(`[market-movers] Massive ${direction} fetch failed:`, err)
  }

  // Fallback: FMP endpoints if Massive returned empty
  if (movers.length === 0) {
    const cashResult = await getMarketMovers('cash', direction)
    movers = cashResult.movers
  }

  // Polygon returns the top movers across all sessions — use the same list
  // for whichever session is active (the data is always current)
  return {
    premarket: movers,
    cash: movers,
    afterhours: movers,
    currentSession: marketStatus.session,
  }
}

/**
 * Force refresh a specific session (called by cron job).
 * Bypasses cache freshness check and always fetches from FMP.
 */
export async function refreshMarketMovers(
  session: SessionType,
  direction: Direction
): Promise<{ success: boolean; count: number }> {
  const marketDate = getTradingDate()

  const movers = await fetchFromFMP(session, direction)

  if (movers.length > 0) {
    await updateCache(session, direction, marketDate, movers)
    return { success: true, count: movers.length }
  }

  return { success: false, count: 0 }
}
