import 'server-only'

export type CacheableSymbolValidity = 'valid' | 'not_found'

export const SYMBOL_VALIDITY_CACHE_TTL_MS = 30 * 60_000
export const SYMBOL_VALIDITY_CACHE_MAX_ENTRIES = 2_000
export const SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES = 100
export const SYMBOL_VALIDITY_LOAD_TIMEOUT_MS = 4_000

export class SymbolValidityLoadTimeoutError extends Error {
  constructor() {
    super('The shared symbol validation load exceeded its deadline.')
    this.name = 'SymbolValidityLoadTimeoutError'
  }
}

interface CacheEntry {
  cachedAt: number
  value: CacheableSymbolValidity
}

interface InFlightEntry {
  invalidate: (error: Error) => void
  promise: Promise<CacheableSymbolValidity>
}

export type SymbolValidityLoadLease =
  | {
      status: 'started' | 'joined'
      promise: Promise<CacheableSymbolValidity>
    }
  | { status: 'capacity' }

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
const outstanding = new Set<InFlightEntry>()
const abandoned = new Set<InFlightEntry>()
let stateGeneration = 0

function writeCache(
  key: string,
  value: CacheableSymbolValidity,
  cachedAt: number,
): void {
  cache.delete(key)
  cache.set(key, { cachedAt, value })
  while (cache.size > SYMBOL_VALIDITY_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

/** Read an absolute-TTL entry and promote it to the LRU tail. */
export function readSymbolValidityCache(
  key: string,
  now: number,
): CacheableSymbolValidity | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= SYMBOL_VALIDITY_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

/**
 * Lease one internally timed validation per key. Matching callers can always
 * join, while unique pending keys fail closed at a hard process-local cap.
 */
export function leaseSymbolValidityLoad(
  key: string,
  loader: (signal: AbortSignal) => Promise<CacheableSymbolValidity>,
): SymbolValidityLoadLease {
  const existing = inFlight.get(key)
  if (existing) return { status: 'joined', promise: existing.promise }
  // A timed-out database client may ignore AbortSignal. Keep its physical slot
  // occupied until the loader actually settles so repeated timeout waves
  // cannot multiply abandoned registry queries without bound.
  if (outstanding.size >= SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES) {
    return { status: 'capacity' }
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let active = true
  let resolveShared!: (value: CacheableSymbolValidity) => void
  let rejectShared!: (error: unknown) => void
  const sharedPromise = new Promise<CacheableSymbolValidity>((resolve, reject) => {
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
      controller.abort(error)
      releaseLogicalLease()
      abandoned.add(entry)
      rejectShared(error)
    },
  }
  inFlight.set(key, entry)
  outstanding.add(entry)

  const deadline = setTimeout(() => {
    entry.invalidate(new SymbolValidityLoadTimeoutError())
  }, SYMBOL_VALIDITY_LOAD_TIMEOUT_MS)

  Promise.resolve()
    .then(() => loader(controller.signal))
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

  return { status: 'started', promise: sharedPromise }
}

/** Test-only reset; entry identity and generation fence late old completions. */
export function resetSymbolValidityCacheForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of [...inFlight.values()]) {
    entry.invalidate(new Error('Symbol validity cache state was reset.'))
  }
  inFlight.clear()
  outstanding.clear()
  abandoned.clear()
}

/** Test-only bounded-state snapshot. */
export function getSymbolValidityCacheStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
    outstandingCount: outstanding.size,
    abandonedCount: abandoned.size,
  }
}
