/**
 * Futures contract resolver for the Massive (Polygon) API.
 *
 * FMP uses generic symbols like "ES=F" for the front-month S&P 500 future.
 * Massive requires the exact contract ticker (e.g. "ESZ25"). This module
 * resolves product codes to the current front-month contract via Massive's
 * contracts endpoint, with a 1-hour in-memory cache (rollovers are quarterly).
 */

import { safeErrorMessage } from '@/lib/safe-logging'
import type {
  CandleRequestOptions,
  QuoteRequestOptions,
} from './types'
import {
  ProviderQuoteSymbolMismatchError,
  providerQuoteSymbolsMatch,
} from './quote-errors'

const MASSIVE_BASE = 'https://api.massive.com'

function getApiKey(): string {
  const key = process.env.MASSIVE_API_KEY
  if (!key) throw new Error('MASSIVE_API_KEY not set')
  return key
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}` }
}

function rethrowAbort(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted()
  if (error instanceof Error && error.name === 'AbortError') throw error
}

function isStrictRequest(options: QuoteRequestOptions): boolean {
  return options.freshness === 'live' || options.failureMode === 'throw'
}

// ---------------------------------------------------------------------------
// Product alias → Massive product code
// ---------------------------------------------------------------------------

/**
 * Maps common product aliases to Massive product codes.
 * Most are identity mappings but having the table makes the API explicit.
 */
export const PRODUCT_ALIASES: Record<string, string> = {
  ES: 'ES',   // S&P 500 E-mini
  NQ: 'NQ',   // Nasdaq 100 E-mini
  YM: 'YM',   // Dow E-mini
  RTY: 'RTY', // Russell 2000 E-mini
  CL: 'CL',   // Crude Oil
  NG: 'NG',   // Natural Gas
  GC: 'GC',   // Gold
  SI: 'SI',   // Silver
}

// ---------------------------------------------------------------------------
// Front-month cache (1-hour TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  ticker: string
  expiresAt: number // epoch ms
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const frontMonthCache = new Map<string, CacheEntry>()

function isContractForProduct(ticker: string, productCode: string): boolean {
  const normalizedTicker = ticker.trim().toUpperCase()
  const normalizedProduct = productCode.trim().toUpperCase()
  if (!normalizedTicker.startsWith(normalizedProduct)) return false

  // Standard futures contract suffix: delivery-month code + 1-4 digit year.
  const contractSuffix = normalizedTicker.slice(normalizedProduct.length)
  return /^[FGHJKMNQUVXZ]\d{1,4}$/.test(contractSuffix)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the front-month contract ticker for a product code.
 *
 * Calls `GET /futures/vX/contracts?product_code={code}&active=true&sort=last_trade_date.asc&limit=1`
 * and caches the result for 1 hour.
 *
 * @param productCode  e.g. "ES", "NQ", "CL"
 * @returns The resolved contract ticker (e.g. "ESZ25") or null if lookup fails.
 */
export async function resolveFrontMonth(
  productCode: string,
  options: QuoteRequestOptions = {},
): Promise<string | null> {
  options.signal?.throwIfAborted()
  const strict = isStrictRequest(options)
  const code = PRODUCT_ALIASES[productCode] ?? productCode

  // Check cache
  const cached = frontMonthCache.get(code)
  if (cached && cached.expiresAt > Date.now()) {
    options.signal?.throwIfAborted()
    return cached.ticker
  }

  try {
    const url = `${MASSIVE_BASE}/futures/vX/contracts?product_code=${code}&active=true&sort=last_trade_date.asc&limit=1`

    const res = await fetch(url, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: options.signal,
    })
    options.signal?.throwIfAborted()
    if (!res.ok) {
      if (res.status === 404) {
        return null
      }
      if (strict) {
        throw new Error(`Massive futures contract request failed with status ${res.status}`)
      }
      if (res.status === 401 || res.status === 403) {
        console.warn(`[futures-resolver] Contract lookup unavailable for ${code}: ${res.status}`)
      } else {
        console.error(`[futures-resolver] Contract lookup failed for ${code}: ${res.status}`)
      }
      return null
    }

    const json = await res.json()
    options.signal?.throwIfAborted()
    if (strict && !Array.isArray(json?.results)) {
      throw new Error('Massive returned an invalid futures contract payload')
    }
    const results: Array<{ ticker?: string }> = Array.isArray(json?.results)
      ? json.results
      : []

    if (results.length === 0 || !results[0].ticker) {
      console.error(`[futures-resolver] No active contract found for ${code}`)
      return null
    }

    const ticker = results[0].ticker
    if (!isContractForProduct(ticker, code)) {
      const mismatch = new ProviderQuoteSymbolMismatchError(
        'Massive',
        `${code}<front-month>`,
        ticker,
      )
      if (strict) throw mismatch
      console.error(`[futures-resolver] ${mismatch.message}`)
      return null
    }

    // Cache the result
    frontMonthCache.set(code, { ticker, expiresAt: Date.now() + CACHE_TTL_MS })

    return ticker
  } catch (err) {
    rethrowAbort(err, options.signal)
    if (strict) throw err
    console.error(`[futures-resolver] Error resolving ${code}:`, safeErrorMessage(err))
    return null
  }
}

/**
 * Fetch a snapshot for a specific futures contract.
 *
 * @param contractTicker  The resolved contract ticker (e.g. "ESZ25")
 */
export async function getFuturesSnapshot(
  contractTicker: string,
  options: QuoteRequestOptions = {},
): Promise<{
  price: number
  change: number
  changePercent: number
  volume: number
  open: number
  high: number
  low: number
} | null> {
  options.signal?.throwIfAborted()
  const strict = isStrictRequest(options)
  try {
    const url = `${MASSIVE_BASE}/futures/vX/snapshot?ticker=${contractTicker}`

    const res = await fetch(url, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: options.signal,
    })
    options.signal?.throwIfAborted()
    if (!res.ok) {
      if (res.status === 404) return null
      if (strict) {
        throw new Error(`Massive futures snapshot request failed with status ${res.status}`)
      }
      return null
    }

    const json = await res.json()
    options.signal?.throwIfAborted()
    if (strict && !Array.isArray(json?.results)) {
      throw new Error('Massive returned an invalid futures snapshot payload')
    }
    const results: any[] = Array.isArray(json?.results) ? json.results : []
    if (results.length === 0) return null

    const snap = results[0]
    if (
      strict &&
      typeof snap?.ticker === 'string' &&
      !providerQuoteSymbolsMatch(snap.ticker, contractTicker)
    ) {
      throw new ProviderQuoteSymbolMismatchError(
        'Massive',
        contractTicker,
        snap.ticker,
      )
    }
    const session = snap.session ?? {}
    const lastTrade = snap.last_trade ?? {}

    const price = lastTrade.price ?? session.c ?? 0
    const change = session.change ?? 0
    // Use session.change_percent if available, otherwise calculate from price/change
    const changePercent = session.change_percent
      ?? (price && change ? (change / (price - change)) * 100 : 0)

    return {
      price,
      change,
      changePercent,
      volume: session.v ?? 0,
      open: session.o ?? 0,
      high: session.h ?? 0,
      low: session.l ?? 0,
    }
  } catch (err) {
    rethrowAbort(err, options.signal)
    if (strict) throw err
    console.error(`[futures-resolver] Snapshot error for ${contractTicker}:`, safeErrorMessage(err))
    return null
  }
}

/**
 * Fetch aggregate candles for a futures contract.
 *
 * @param contractTicker  Resolved contract ticker (e.g. "ESZ25")
 * @param resolution      Candle resolution (e.g. "1min", "1hr", "1day")
 * @param from            Start date "YYYY-MM-DD"
 */
export async function getFuturesCandles(
  contractTicker: string,
  resolution: string,
  from?: string,
  options: CandleRequestOptions = {},
): Promise<Array<{
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestampMs: number
}>> {
  options.signal?.throwIfAborted()
  const strict = options.failureMode === 'throw'

  try {
    let url = `${MASSIVE_BASE}/futures/vX/aggs/${contractTicker}?resolution=${resolution}&limit=50000`
    if (from) url += `&window_start=${from}`

    const res = await fetch(url, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: options.signal,
    })
    options.signal?.throwIfAborted()
    if (!res.ok) {
      if (strict) {
        throw new Error(`Massive futures candle request failed with status ${res.status}`)
      }
      return []
    }

    const json: unknown = await res.json()
    options.signal?.throwIfAborted()
    const results = json &&
      typeof json === 'object' &&
      !Array.isArray(json) &&
      Array.isArray((json as { results?: unknown }).results)
      ? (json as { results: unknown[] }).results
      : null
    if (!results) {
      if (strict) throw new Error('Massive returned an invalid futures candle payload')
      return []
    }

    const candles = results.map((result) => {
      if (!result || typeof result !== 'object' || Array.isArray(result)) return null
      const raw = result as Record<string, unknown>
      const open = Number(raw.open)
      const high = Number(raw.high)
      const low = Number(raw.low)
      const close = Number(raw.close)
      const volume = Number(raw.volume ?? 0)
      const windowStart = Number(raw.window_start)
      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(windowStart) ||
        windowStart <= 0
      ) {
        return null
      }
      return {
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
        // Futures timestamps are nanoseconds — convert to ms
        timestampMs: Math.floor(windowStart / 1_000_000),
      }
    })
    if (strict && candles.some((candle) => candle === null)) {
      throw new Error('Massive returned an invalid futures candle payload')
    }
    return candles.filter((candle): candle is NonNullable<typeof candle> => candle !== null)
  } catch (err) {
    rethrowAbort(err, options.signal)
    if (strict) throw err
    console.error(`[futures-resolver] Candles error for ${contractTicker}:`, safeErrorMessage(err))
    return []
  }
}

/**
 * Clear the front-month cache (useful for testing).
 */
export function clearFrontMonthCache(): void {
  frontMonthCache.clear()
}
