import 'server-only'

import type { ProviderQuote } from '@/lib/providers/types'

export const QUOTE_ROUTE_CACHE_TTL_MS = 4_000
export const QUOTE_ROUTE_CACHE_MAX_ENTRIES = 500
export const QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES = 100
export const QUOTE_ROUTE_LOAD_TIMEOUT_MS = 4_000

export class QuoteRouteLoadTimeoutError extends Error {
  constructor() {
    super('The shared live quote load exceeded its deadline.')
    this.name = 'QuoteRouteLoadTimeoutError'
  }
}

interface CacheEntry {
  cachedAt: number
  quote: ProviderQuote
}

interface InFlightEntry {
  invalidate: (error: Error) => void
  promise: Promise<ProviderQuote | null>
}

export type QuoteRouteLoadLease =
  | {
      status: 'started' | 'joined'
      promise: Promise<ProviderQuote | null>
    }
  | { status: 'capacity' }

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
let stateGeneration = 0

function writeCache(key: string, quote: ProviderQuote, cachedAt: number): void {
  cache.delete(key)
  cache.set(key, { cachedAt, quote })
  while (cache.size > QUOTE_ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

/** Reads an absolute-TTL entry and promotes it to the LRU tail. */
export function readQuoteRouteCache(
  key: string,
  now: number,
): ProviderQuote | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= QUOTE_ROUTE_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.quote
}

/**
 * Starts one detached provider request per key. HTTP callers only wait on the
 * shared promise; their individual AbortSignals never own the provider load.
 */
export function leaseQuoteRouteLoad(
  key: string,
  loader: (signal: AbortSignal) => Promise<ProviderQuote | null>,
  isComplete: (quote: unknown) => quote is ProviderQuote,
): QuoteRouteLoadLease {
  const existing = inFlight.get(key)
  if (existing) return { status: 'joined', promise: existing.promise }
  if (inFlight.size >= QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES) {
    return { status: 'capacity' }
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let active = true
  let resolveShared!: (quote: ProviderQuote | null) => void
  let rejectShared!: (error: unknown) => void
  const sharedPromise = new Promise<ProviderQuote | null>((resolve, reject) => {
    resolveShared = resolve
    rejectShared = reject
  })

  const release = () => {
    clearTimeout(deadline)
    if (inFlight.get(key) === entry) inFlight.delete(key)
  }
  const entry: InFlightEntry = {
    promise: sharedPromise,
    invalidate(error) {
      if (!active) return
      active = false
      controller.abort(error)
      release()
      rejectShared(error)
    },
  }
  inFlight.set(key, entry)

  const deadline = setTimeout(() => {
    entry.invalidate(new QuoteRouteLoadTimeoutError())
  }, QUOTE_ROUTE_LOAD_TIMEOUT_MS)

  Promise.resolve()
    .then(() => loader(controller.signal))
    .then(
      (quote) => {
        if (!active) return
        active = false
        release()
        if (
          generation === stateGeneration &&
          quote !== null &&
          isComplete(quote)
        ) {
          writeCache(key, quote, Date.now())
        }
        resolveShared(quote)
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

/** Test-only reset; aborting detached work also closes real fetch resources. */
export function resetQuoteRouteStateForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of [...inFlight.values()]) {
    entry.invalidate(new Error('Live quote route state was reset.'))
  }
}

/** Test-only bounded-state snapshot. */
export function getQuoteRouteStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
  }
}
