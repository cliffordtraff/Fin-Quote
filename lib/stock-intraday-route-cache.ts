import 'server-only'

import type { StockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'

export const STOCK_INTRADAY_CACHE_TTL_MS = 15_000
export const STOCK_INTRADAY_CACHE_MAX_ENTRIES = 100
export const STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES = 100
export const STOCK_INTRADAY_LOAD_TIMEOUT_MS = 12_000

export class StockIntradayLoadTimeoutError extends Error {
  constructor() {
    super('The shared stock intraday load exceeded its deadline.')
    this.name = 'StockIntradayLoadTimeoutError'
  }
}

export interface StockIntradayLoadResult {
  data?: StockIntradayOHLC
  error?: string
}

interface CacheEntry {
  cachedAt: number
  data: StockIntradayOHLC
}

export type StockIntradayLoadLease =
  | {
      status: 'started' | 'joined'
      promise: Promise<StockIntradayLoadResult>
    }
  | { status: 'capacity' }

interface InFlightEntry {
  invalidate: (error: Error) => void
  promise: Promise<StockIntradayLoadResult>
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
let stateGeneration = 0

function writeCache(
  key: string,
  data: StockIntradayOHLC,
  cachedAt: number,
) {
  cache.delete(key)
  cache.set(key, { cachedAt, data })
  while (cache.size > STOCK_INTRADAY_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

/** Reads an absolute-TTL entry and promotes it to the LRU tail. */
export function readStockIntradayRouteCache(
  key: string,
  now: number,
): StockIntradayOHLC | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= STOCK_INTRADAY_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.data
}

/**
 * Returns one shared load per key. Unique pending keys are fail-closed at a
 * hard cap, while callers for an existing key can still join at capacity.
 */
export function leaseStockIntradayRouteLoad(
  key: string,
  loader: () => Promise<StockIntradayLoadResult>,
  isComplete: (data: unknown) => data is StockIntradayOHLC,
): StockIntradayLoadLease {
  const existing = inFlight.get(key)
  if (existing) return { status: 'joined', promise: existing.promise }
  if (inFlight.size >= STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES) {
    return { status: 'capacity' }
  }

  const generation = stateGeneration
  let active = true
  let resolveShared!: (result: StockIntradayLoadResult) => void
  let rejectShared!: (error: unknown) => void
  const sharedPromise = new Promise<StockIntradayLoadResult>(
    (resolve, reject) => {
      resolveShared = resolve
      rejectShared = reject
    },
  )

  const release = () => {
    clearTimeout(deadline)
    if (inFlight.get(key) === entry) inFlight.delete(key)
  }
  const entry: InFlightEntry = {
    promise: sharedPromise,
    invalidate(error) {
      if (!active) return
      active = false
      release()
      rejectShared(error)
    },
  }
  inFlight.set(key, entry)

  const deadline = setTimeout(() => {
    entry.invalidate(new StockIntradayLoadTimeoutError())
  }, STOCK_INTRADAY_LOAD_TIMEOUT_MS)

  // The provider currently has no AbortSignal contract. Keep its work detached
  // from individual HTTP waiters, but fence any result that arrives after this
  // lease's deadline or after a replacement lease has started for the same key.
  Promise.resolve()
    .then(loader)
    .then(
      (result) => {
        if (!active) return
        active = false
        release()
        if (
          generation === stateGeneration &&
          !result.error &&
          isComplete(result.data)
        ) {
          // Timestamp successful data at completion, never at request start.
          writeCache(key, result.data, Date.now())
        }
        resolveShared(result)
      },
      (error) => {
        if (!active) return
        active = false
        release()
        rejectShared(error)
      },
    )

  return { status: 'started', promise: sharedPromise }
}

/** Test-only state reset. Generation fencing prevents late old loads recaching. */
export function resetStockIntradayRouteStateForTests() {
  stateGeneration += 1
  cache.clear()
  for (const entry of [...inFlight.values()]) {
    entry.invalidate(new Error('Stock intraday route state was reset.'))
  }
}

/** Test-only bounded-state snapshot. */
export function getStockIntradayRouteStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
  }
}
