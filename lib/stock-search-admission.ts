import {
  isStockSearchOutcome,
  type StockSearchOutcome,
} from '@/lib/stock-search-contract'

export const STOCK_SEARCH_CACHE_TTL_MS = 30_000
export const STOCK_SEARCH_CACHE_MAX_ENTRIES = 256
export const STOCK_SEARCH_PHYSICAL_MAX = 32
export const STOCK_SEARCH_LOAD_TIMEOUT_MS = 4_000
export const STOCK_SEARCH_RETRY_AFTER_SECONDS = 1

export type StockSearchLoader = (
  query: string,
  signal: AbortSignal,
) => Promise<unknown>

export class StockSearchCapacityError extends Error {
  readonly retryAfterSeconds = STOCK_SEARCH_RETRY_AFTER_SECONDS

  constructor() {
    super('Stock search is at capacity.')
    this.name = 'StockSearchCapacityError'
  }
}

export class StockSearchLoadTimeoutError extends Error {
  constructor() {
    super('The shared stock search exceeded its deadline.')
    this.name = 'StockSearchLoadTimeoutError'
  }
}

export class StockSearchRuntimeContractError extends Error {
  constructor() {
    super('Stock search returned an invalid result.')
    this.name = 'StockSearchRuntimeContractError'
  }
}

interface CacheEntry {
  cachedAt: number
  outcome: StockSearchOutcome
}

interface InFlightEntry {
  controller: AbortController
  generation: number
  promise: Promise<StockSearchOutcome>
  rejectLogical: (error: unknown) => void
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
const outstanding = new Set<InFlightEntry>()
let stateGeneration = 0

function cloneOutcome(outcome: StockSearchOutcome): StockSearchOutcome {
  return {
    source: outcome.source,
    results: outcome.results.map((result) => ({ ...result })),
  }
}

function cacheKey(query: string): string {
  return query.toUpperCase()
}

function readCache(key: string, now: number): StockSearchOutcome | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= STOCK_SEARCH_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, entry)
  return cloneOutcome(entry.outcome)
}

function writeCache(
  key: string,
  outcome: StockSearchOutcome,
  cachedAt: number,
): void {
  cache.delete(key)
  cache.set(key, { cachedAt, outcome: cloneOutcome(outcome) })
  while (cache.size > STOCK_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Stock search aborted', 'AbortError')
}

function waitForDetachedResult<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onAbort = () => finish(() => reject(abortReason(signal)))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

function startLoad(
  key: string,
  query: string,
  loader: StockSearchLoader,
): Promise<StockSearchOutcome> {
  if (outstanding.size >= STOCK_SEARCH_PHYSICAL_MAX) {
    return Promise.reject(new StockSearchCapacityError())
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let logicalSettled = false
  let resolveLogical!: (outcome: StockSearchOutcome) => void
  let rejectLogical!: (error: unknown) => void
  const promise = new Promise<StockSearchOutcome>((resolve, reject) => {
    resolveLogical = resolve
    rejectLogical = reject
  })
  const entry: InFlightEntry = {
    controller,
    generation,
    promise,
    rejectLogical(error) {
      if (logicalSettled) return
      logicalSettled = true
      rejectLogical(error)
    },
  }
  inFlight.set(key, entry)
  outstanding.add(entry)

  const deadline = setTimeout(() => {
    const error = new StockSearchLoadTimeoutError()
    controller.abort(error)
    entry.rejectLogical(error)
  }, STOCK_SEARCH_LOAD_TIMEOUT_MS)

  // Keep the physical slot and matching-key entry until the loader itself
  // settles. Abort-resistant database work therefore cannot be multiplied by
  // repeated logical timeout waves.
  Promise.resolve()
    .then(() => loader(query, controller.signal))
    .then(
      (value) => {
        clearTimeout(deadline)
        outstanding.delete(entry)
        if (inFlight.get(key) === entry) inFlight.delete(key)
        if (logicalSettled) return
        logicalSettled = true
        if (!isStockSearchOutcome(value)) {
          rejectLogical(new StockSearchRuntimeContractError())
          return
        }
        const outcome = cloneOutcome(value)
        if (
          outcome.source === 'primary' &&
          generation === stateGeneration
        ) {
          writeCache(key, outcome, Date.now())
        }
        resolveLogical(outcome)
      },
      (error) => {
        clearTimeout(deadline)
        outstanding.delete(entry)
        if (inFlight.get(key) === entry) inFlight.delete(key)
        if (logicalSettled) return
        logicalSettled = true
        rejectLogical(error)
      },
    )

  return promise
}

/**
 * Bound, coalesce, and briefly cache stock-registry searches. Request aborts
 * detach only their waiter; the shared internal signal is owned by the
 * admission layer and enforces the physical search deadline.
 */
export function getAdmittedStockSearch(
  query: string,
  loader: StockSearchLoader,
  waiterSignal?: AbortSignal,
): Promise<StockSearchOutcome> {
  const key = cacheKey(query)
  const cached = readCache(key, Date.now())
  if (cached) return waitForDetachedResult(Promise.resolve(cached), waiterSignal)

  const shared = inFlight.get(key)?.promise ?? startLoad(key, query, loader)
  return waitForDetachedResult(shared, waiterSignal)
}

/** Test-only reset; generation fencing prevents late prior writes. */
export function resetStockSearchAdmissionForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of inFlight.values()) {
    entry.controller.abort(new Error('Stock-search admission was reset.'))
    entry.rejectLogical(new Error('Stock-search admission was reset.'))
  }
  inFlight.clear()
  outstanding.clear()
}

export function getStockSearchAdmissionStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
    outstandingCount: outstanding.size,
  }
}
