import 'server-only'

import {
  getStockOverview,
  type StockOverview,
} from '@/app/actions/stock-overview'
import {
  getCompanyProfile,
  type CompanyProfile,
} from '@/app/actions/get-company-profile'
import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'

export const STOCK_PAGE_ESSENTIAL_CACHE_TTL_MS = 15_000
export const STOCK_PAGE_ESSENTIAL_CACHE_MAX_ENTRIES = 100
export const STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES = 25
export const STOCK_PAGE_ESSENTIAL_LOAD_TIMEOUT_MS = 4_000

export interface StockPageEssentials {
  overview: StockOverview | null
  profile: CompanyProfile | null
}

export class StockPageEssentialLoadTimeoutError extends Error {
  constructor() {
    super('The shared stock-page essential load exceeded its deadline.')
    this.name = 'StockPageEssentialLoadTimeoutError'
  }
}

interface CacheEntry {
  cachedAt: number
  value: StockPageEssentials
}

interface InFlightEntry {
  invalidate: (error: Error) => void
  promise: Promise<StockPageEssentials>
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
const outstanding = new Set<InFlightEntry>()
const abandoned = new Set<InFlightEntry>()
let stateGeneration = 0

function writeCache(
  key: string,
  value: StockPageEssentials,
  cachedAt: number,
): void {
  cache.delete(key)
  cache.set(key, { cachedAt, value })
  while (cache.size > STOCK_PAGE_ESSENTIAL_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

function readCache(key: string, now: number): StockPageEssentials | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= STOCK_PAGE_ESSENTIAL_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

function startEssentialLoad(
  key: string,
  loader: () => Promise<StockPageEssentials>,
): Promise<StockPageEssentials> | null {
  const existing = inFlight.get(key)
  if (existing) return existing.promise
  // Timed-out loaders may ignore cancellation. They retain a physical slot
  // until their underlying promise settles, preventing repeated deadline waves
  // from multiplying provider work without bound.
  if (outstanding.size >= STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES) return null

  const generation = stateGeneration
  let active = true
  let resolveShared!: (value: StockPageEssentials) => void
  let rejectShared!: (error: unknown) => void
  const sharedPromise = new Promise<StockPageEssentials>((resolve, reject) => {
    resolveShared = resolve
    rejectShared = reject
  })

  const releaseLogicalLease = () => {
    clearTimeout(deadline)
    if (inFlight.get(key) === entry) inFlight.delete(key)
  }
  const entry: InFlightEntry = {
    promise: sharedPromise,
    invalidate(error) {
      if (!active) return
      active = false
      releaseLogicalLease()
      abandoned.add(entry)
      rejectShared(error)
    },
  }
  inFlight.set(key, entry)
  outstanding.add(entry)

  // The underlying actions do not currently accept an AbortSignal. Releasing
  // this logical lease on time still bounds capacity; entry identity and the
  // generation check fence any abort-resistant late completion.
  const deadline = setTimeout(() => {
    entry.invalidate(new StockPageEssentialLoadTimeoutError())
  }, STOCK_PAGE_ESSENTIAL_LOAD_TIMEOUT_MS)

  Promise.resolve()
    .then(loader)
    .then(
      (value) => {
        outstanding.delete(entry)
        abandoned.delete(entry)
        if (!active) return
        active = false
        releaseLogicalLease()
        if (generation === stateGeneration) {
          writeCache(key, value, Date.now())
        }
        resolveShared(value)
      },
      (error) => {
        outstanding.delete(entry)
        abandoned.delete(entry)
        if (!active) return
        active = false
        releaseLogicalLease()
        rejectShared(error)
      },
    )

  return sharedPromise
}

/**
 * Bounded provider confirmation used only when registry admission is
 * unavailable. It lets a real stock page stay reachable during a registry
 * outage without letting arbitrary valid-shaped URLs fan out provider work.
 */
export async function getBoundedStockPageEssentials(
  symbol: string,
): Promise<StockPageEssentials | null> {
  const normalizedSymbol = normalizeMarketSymbol(symbol)
  if (!isValidStockPageSymbol(normalizedSymbol)) return null

  const cached = readCache(normalizedSymbol, Date.now())
  if (cached) return cached

  const promise = startEssentialLoad(normalizedSymbol, async () => {
    const [overview, profile] = await Promise.all([
      getStockOverview(normalizedSymbol).catch(() => null),
      getCompanyProfile(normalizedSymbol).catch(() => null),
    ])
    return { overview, profile }
  })
  if (!promise) return null

  try {
    return await promise
  } catch {
    return null
  }
}

/** Test-only reset with generation fencing for late prior loads. */
export function resetStockPageEssentialAdmissionForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of [...inFlight.values()]) {
    entry.invalidate(new Error('Stock-page essential admission was reset.'))
  }
  inFlight.clear()
  outstanding.clear()
  abandoned.clear()
}

/** Test-only bounded-state snapshot. */
export function getStockPageEssentialAdmissionStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
    outstandingCount: outstanding.size,
    abandonedCount: abandoned.size,
  }
}
