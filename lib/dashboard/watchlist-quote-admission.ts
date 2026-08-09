import 'server-only'

import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'

export const WATCHLIST_QUOTE_MAX_SYMBOLS = 20
export const WATCHLIST_QUOTE_CACHE_TTL_MS = 15_000
export const WATCHLIST_QUOTE_CACHE_MAX_ENTRIES = 128
export const WATCHLIST_QUOTE_PHYSICAL_MAX = 16
export const WATCHLIST_QUOTE_LOAD_TIMEOUT_MS = 4_000
export const WATCHLIST_QUOTE_RETRY_AFTER_SECONDS = 1

export interface WatchlistQuote {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export type WatchlistQuoteLoader = (
  symbols: readonly string[],
  signal: AbortSignal,
) => Promise<unknown>

export class WatchlistQuoteInputError extends Error {
  constructor(message = 'Invalid watchlist quote request.') {
    super(message)
    this.name = 'WatchlistQuoteInputError'
  }
}

export class WatchlistQuoteCapacityError extends Error {
  readonly retryAfterSeconds = WATCHLIST_QUOTE_RETRY_AFTER_SECONDS

  constructor() {
    super('Watchlist quote loading is at capacity.')
    this.name = 'WatchlistQuoteCapacityError'
  }
}

export class WatchlistQuoteLoadTimeoutError extends Error {
  constructor() {
    super('The shared watchlist quote load exceeded its deadline.')
    this.name = 'WatchlistQuoteLoadTimeoutError'
  }
}

export class WatchlistQuoteRuntimeContractError extends Error {
  constructor() {
    super('The quote provider returned an invalid watchlist batch.')
    this.name = 'WatchlistQuoteRuntimeContractError'
  }
}

interface CacheEntry {
  cachedAt: number
  quotes: WatchlistQuote[]
}

interface PhysicalLoad {
  controller: AbortController
  generation: number
  logicalPromise: Promise<WatchlistQuote[]>
  logicalSettled: boolean
  rejectLogical: (error: unknown) => void
  timedOut: boolean
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, PhysicalLoad>()
const outstanding = new Set<PhysicalLoad>()
const timedOutOrphans = new Set<PhysicalLoad>()
let stateGeneration = 0

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Parse the one-field wire payload and establish the canonical batch identity.
 * Class-share aliases collapse to one symbol while the user's first-seen order
 * remains the response order.
 */
export function parseWatchlistQuoteRequest(input: unknown): string[] {
  if (!isPlainRecord(input)) throw new WatchlistQuoteInputError()
  const keys = Object.keys(input)
  if (keys.length !== 1 || keys[0] !== 'symbols' || !Array.isArray(input.symbols)) {
    throw new WatchlistQuoteInputError()
  }

  const symbols: string[] = []
  const seen = new Set<string>()
  for (const value of input.symbols) {
    if (typeof value !== 'string') throw new WatchlistQuoteInputError()
    const symbol = normalizeMarketSymbol(value)
    if (!isValidStockPageSymbol(symbol)) {
      throw new WatchlistQuoteInputError(
        'Watchlist quotes accept equity symbols only.',
      )
    }
    if (seen.has(symbol)) continue
    seen.add(symbol)
    symbols.push(symbol)
    if (symbols.length > WATCHLIST_QUOTE_MAX_SYMBOLS) {
      throw new WatchlistQuoteInputError(
        `Watchlist quotes accept at most ${WATCHLIST_QUOTE_MAX_SYMBOLS} symbols.`,
      )
    }
  }

  if (symbols.length === 0) {
    throw new WatchlistQuoteInputError(
      'Watchlist quotes require at least one symbol.',
    )
  }
  return symbols
}

function cloneQuotes(quotes: readonly WatchlistQuote[]): WatchlistQuote[] {
  return quotes.map((quote) => ({ ...quote }))
}

function canonicalBatchSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols)].sort()
}

function batchKey(canonicalSymbols: readonly string[]): string {
  return JSON.stringify(canonicalSymbols)
}

function orderQuotes(
  quotes: readonly WatchlistQuote[],
  requestedSymbols: readonly string[],
): WatchlistQuote[] {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]))
  return requestedSymbols.map((symbol) => ({ ...bySymbol.get(symbol)! }))
}

function readCache(key: string, now: number): WatchlistQuote[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.cachedAt >= WATCHLIST_QUOTE_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  // Map insertion order doubles as access-order LRU state.
  cache.delete(key)
  cache.set(key, entry)
  return cloneQuotes(entry.quotes)
}

function writeCache(
  key: string,
  quotes: readonly WatchlistQuote[],
  cachedAt: number,
): void {
  cache.delete(key)
  cache.set(key, { cachedAt, quotes: cloneQuotes(quotes) })
  while (cache.size > WATCHLIST_QUOTE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

function normalizeProviderBatch(
  value: unknown,
  requestedSymbols: readonly string[],
): WatchlistQuote[] | null {
  if (!Array.isArray(value) || value.length !== requestedSymbols.length) {
    return null
  }

  const expected = new Set(requestedSymbols)
  const bySymbol = new Map<string, WatchlistQuote>()
  for (const rawQuote of value) {
    if (!isPlainRecord(rawQuote) || typeof rawQuote.symbol !== 'string') {
      return null
    }
    const symbol = normalizeMarketSymbol(rawQuote.symbol)
    if (
      !expected.has(symbol) ||
      bySymbol.has(symbol) ||
      typeof rawQuote.name !== 'string' ||
      rawQuote.name.length > 240 ||
      typeof rawQuote.price !== 'number' ||
      !Number.isFinite(rawQuote.price) ||
      rawQuote.price <= 0 ||
      typeof rawQuote.change !== 'number' ||
      !Number.isFinite(rawQuote.change) ||
      typeof rawQuote.changesPercentage !== 'number' ||
      !Number.isFinite(rawQuote.changesPercentage)
    ) {
      return null
    }

    bySymbol.set(symbol, {
      symbol,
      name: rawQuote.name.trim() || symbol,
      price: rawQuote.price,
      change: rawQuote.change,
      changesPercentage: rawQuote.changesPercentage,
    })
  }

  if (bySymbol.size !== requestedSymbols.length) return null
  return requestedSymbols.map((symbol) => bySymbol.get(symbol)!)
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Watchlist quote request aborted.', 'AbortError')
}

/** A browser disconnect detaches one waiter without owning shared work. */
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
  symbols: readonly string[],
  loader: WatchlistQuoteLoader,
): Promise<WatchlistQuote[]> {
  if (outstanding.size >= WATCHLIST_QUOTE_PHYSICAL_MAX) {
    return Promise.reject(new WatchlistQuoteCapacityError())
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let resolveLogical!: (quotes: WatchlistQuote[]) => void
  let rejectLogicalPromise!: (error: unknown) => void
  const logicalPromise = new Promise<WatchlistQuote[]>((resolve, reject) => {
    resolveLogical = resolve
    rejectLogicalPromise = reject
  })
  const entry: PhysicalLoad = {
    controller,
    generation,
    logicalPromise,
    logicalSettled: false,
    rejectLogical(error) {
      if (entry.logicalSettled) return
      entry.logicalSettled = true
      rejectLogicalPromise(error)
    },
    timedOut: false,
  }
  inFlight.set(key, entry)
  outstanding.add(entry)

  const deadline = setTimeout(() => {
    if (entry.logicalSettled) return
    entry.timedOut = true
    timedOutOrphans.add(entry)
    const error = new WatchlistQuoteLoadTimeoutError()
    controller.abort(error)
    entry.rejectLogical(error)
    // The exact key and physical slot intentionally remain occupied until the
    // loader settles, even when it ignores the owned AbortSignal.
  }, WATCHLIST_QUOTE_LOAD_TIMEOUT_MS)

  Promise.resolve()
    .then(() => loader([...symbols], controller.signal))
    .then(
      (value) => {
        clearTimeout(deadline)
        outstanding.delete(entry)
        timedOutOrphans.delete(entry)
        const isCurrent = inFlight.get(key) === entry
        if (isCurrent) inFlight.delete(key)
        if (entry.logicalSettled) return
        entry.logicalSettled = true

        const quotes = normalizeProviderBatch(value, symbols)
        if (!quotes) {
          rejectLogicalPromise(new WatchlistQuoteRuntimeContractError())
          return
        }
        if (isCurrent && entry.generation === stateGeneration) {
          writeCache(key, quotes, Date.now())
        }
        resolveLogical(cloneQuotes(quotes))
      },
      (error) => {
        clearTimeout(deadline)
        outstanding.delete(entry)
        timedOutOrphans.delete(entry)
        if (inFlight.get(key) === entry) inFlight.delete(key)
        if (entry.logicalSettled) return
        entry.logicalSettled = true
        rejectLogicalPromise(error)
      },
    )

  return logicalPromise
}

/**
 * Coalesce one canonical symbol set, enforce physical admission, and cache
 * only a complete identity-checked provider result. Each caller receives its
 * own requested order even when it joined a differently ordered permutation.
 */
export function getAdmittedWatchlistQuotes(
  symbols: readonly string[],
  loader: WatchlistQuoteLoader,
  waiterSignal?: AbortSignal,
): Promise<WatchlistQuote[]> {
  const requestedSymbols = [...symbols]
  const canonicalSymbols = canonicalBatchSymbols(requestedSymbols)
  const key = batchKey(canonicalSymbols)
  const cached = readCache(key, Date.now())
  if (cached) {
    return waitForDetachedResult(Promise.resolve(cached), waiterSignal)
      .then((quotes) => orderQuotes(quotes, requestedSymbols))
  }

  const shared = inFlight.get(key)?.logicalPromise ??
    startLoad(key, canonicalSymbols, loader)
  return waitForDetachedResult(shared, waiterSignal)
    .then((quotes) => orderQuotes(quotes, requestedSymbols))
}

/** Test-only reset; generation fencing makes every late prior result inert. */
export function resetWatchlistQuoteAdmissionForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of outstanding) {
    entry.controller.abort(new Error('Watchlist quote admission was reset.'))
    entry.rejectLogical(new Error('Watchlist quote admission was reset.'))
  }
  inFlight.clear()
  outstanding.clear()
  timedOutOrphans.clear()
}

export function getWatchlistQuoteAdmissionStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    inFlightKeys: [...inFlight.keys()],
    outstandingCount: outstanding.size,
    timedOutOrphanCount: timedOutOrphans.size,
  }
}
