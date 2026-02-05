'use server'

import { createClient } from '@supabase/supabase-js'
import { getMarketStatus, getTradingDate, type MarketSession } from '@/lib/market-hours'

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
        movers: cached.data as MoverData[],
        session,
        cachedAt: cached.fetched_at,
        isLive: false
      }
    }

    // If active session and cache is fresh, use it
    if (isFresh) {
      return {
        movers: cached.data as MoverData[],
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
    movers: (cached?.data as MoverData[]) || [],
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
          data: movers,
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
    return data
      .filter((item: Record<string, unknown>) => {
        const pctChange = Math.abs((item.changesPercentage as number) || 0)
        const price = item.price as number
        // Filter unrealistic changes and zero/negative prices
        return pctChange < 1000 && price > 0
      })
      .slice(0, 20)
      .map((item: Record<string, unknown>) => ({
        symbol: item.symbol as string,
        name: item.name as string,
        price: item.price as number,
        change: item.change as number,
        changesPercentage: item.changesPercentage as number
      }))
  } catch (error) {
    console.error(`FMP fetch error for ${session} ${direction}:`, error)
    return []
  }
}

/**
 * Get all sessions for a direction (for initial page load).
 * Returns cached data for all three sessions.
 */
export async function getAllSessionMovers(
  direction: Direction
): Promise<AllSessionMoversResult> {
  const marketStatus = getMarketStatus()

  const [premarket, cash, afterhours] = await Promise.all([
    getMarketMovers('premarket', direction),
    getMarketMovers('cash', direction),
    getMarketMovers('afterhours', direction)
  ])

  return {
    premarket: premarket.movers,
    cash: cash.movers,
    afterhours: afterhours.movers,
    currentSession: marketStatus.session
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
