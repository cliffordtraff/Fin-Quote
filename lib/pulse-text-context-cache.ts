import 'server-only'

import {
  parsePulseTextContext,
  type PulseTextContext,
  type PulseTextSymbol,
} from '@/lib/pulse-text-context'

export const PULSE_TEXT_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1_000
export const PULSE_TEXT_CONTEXT_CACHE_MAX_ENTRIES = 4
export const PULSE_TEXT_CONTEXT_PHYSICAL_MAX_ENTRIES = 4
export const PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS = 5_000

export class PulseTextContextLoadTimeoutError extends Error {
  constructor() {
    super('The shared pulse text-context load exceeded its deadline.')
    this.name = 'PulseTextContextLoadTimeoutError'
  }
}

export class PulseTextContextCapacityError extends Error {
  constructor() {
    super('The pulse text-context loader is at physical capacity.')
    this.name = 'PulseTextContextCapacityError'
  }
}

export class PulseTextContextMalformedError extends Error {
  constructor() {
    super('The pulse text-context upstream returned a malformed payload.')
    this.name = 'PulseTextContextMalformedError'
  }
}

interface CacheEntry {
  cachedAt: number
  value: PulseTextContext
}

interface PhysicalLoad {
  controller: AbortController
  deadline: ReturnType<typeof setTimeout> | null
  promise: Promise<PulseTextContextLoadResult>
  rejectWaiters: (reason: unknown) => void
  waiterSettled: boolean
  timedOut: boolean
}

export interface PulseTextContextLoadResult {
  cacheStatus: 'HIT' | 'MISS'
  value: PulseTextContext
}

const cache = new Map<PulseTextSymbol, CacheEntry>()
const physicalLoads = new Map<PulseTextSymbol, PhysicalLoad>()
let stateGeneration = 0

function cloneContext(value: PulseTextContext): PulseTextContext {
  return {
    news: value.news.map((item) => ({ ...item })),
    profile: value.profile ? { ...value.profile } : null,
  }
}

function writeCache(
  symbol: PulseTextSymbol,
  value: PulseTextContext,
  cachedAt: number,
): void {
  cache.delete(symbol)
  cache.set(symbol, { cachedAt, value: cloneContext(value) })
  while (cache.size > PULSE_TEXT_CONTEXT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as PulseTextSymbol | undefined
    if (!oldest) break
    cache.delete(oldest)
  }
}

function readCache(
  symbol: PulseTextSymbol,
  now: number,
): PulseTextContext | null {
  const entry = cache.get(symbol)
  if (!entry) return null
  if (now - entry.cachedAt >= PULSE_TEXT_CONTEXT_CACHE_TTL_MS) {
    cache.delete(symbol)
    return null
  }
  cache.delete(symbol)
  cache.set(symbol, entry)
  return cloneContext(entry.value)
}

function waitForDetachedResult<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

function startPhysicalLoad(
  symbol: PulseTextSymbol,
  loader: (signal: AbortSignal) => Promise<unknown>,
): Promise<PulseTextContextLoadResult> {
  if (physicalLoads.size >= PULSE_TEXT_CONTEXT_PHYSICAL_MAX_ENTRIES) {
    return Promise.reject(new PulseTextContextCapacityError())
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let resolveWaiters!: (value: PulseTextContextLoadResult) => void
  let rejectWaiters!: (reason: unknown) => void
  const waiterPromise = new Promise<PulseTextContextLoadResult>((resolve, reject) => {
    resolveWaiters = resolve
    rejectWaiters = reject
  })

  const entry: PhysicalLoad = {
    controller,
    deadline: null,
    promise: waiterPromise,
    rejectWaiters,
    waiterSettled: false,
    timedOut: false,
  }
  physicalLoads.set(symbol, entry)

  const physicalPromise = Promise.resolve().then(() => loader(controller.signal))

  entry.deadline = setTimeout(() => {
    if (entry.waiterSettled) return
    entry.waiterSettled = true
    entry.timedOut = true
    const error = new PulseTextContextLoadTimeoutError()
    controller.abort(new DOMException(error.message, 'TimeoutError'))
    rejectWaiters(error)
    // Deliberately retain the map entry. A transport that ignores abort still
    // owns the symbol's physical slot until its actual promise settles.
  }, PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS)

  physicalPromise.then(
    (rawValue) => {
      if (entry.deadline) clearTimeout(entry.deadline)
      if (physicalLoads.get(symbol) === entry) physicalLoads.delete(symbol)
      if (entry.waiterSettled) return

      entry.waiterSettled = true
      const parsed = parsePulseTextContext(rawValue, symbol)
      if (!parsed.ok) {
        rejectWaiters(new PulseTextContextMalformedError())
        return
      }

      const completedValue = cloneContext(parsed.value)
      if (generation === stateGeneration) {
        writeCache(symbol, completedValue, Date.now())
      }
      resolveWaiters({ cacheStatus: 'MISS', value: completedValue })
    },
    (error) => {
      if (entry.deadline) clearTimeout(entry.deadline)
      if (physicalLoads.get(symbol) === entry) physicalLoads.delete(symbol)
      if (entry.waiterSettled) return
      entry.waiterSettled = true
      rejectWaiters(error)
    },
  )

  return waiterPromise
}

/**
 * Shares one internal load per allowlisted symbol. Caller cancellation only
 * detaches that HTTP waiter; the internal deadline owns the provider signal.
 */
export function getPulseTextContext(
  symbol: PulseTextSymbol,
  loader: (signal: AbortSignal) => Promise<unknown>,
  waiterSignal?: AbortSignal,
): Promise<PulseTextContextLoadResult> {
  if (waiterSignal?.aborted) return Promise.reject(waiterSignal.reason)
  const cached = readCache(symbol, Date.now())
  if (cached) {
    return waitForDetachedResult(
      Promise.resolve({ cacheStatus: 'HIT', value: cached }),
      waiterSignal,
    )
  }

  const shared = physicalLoads.get(symbol)?.promise
    ?? startPhysicalLoad(symbol, loader)
  return waitForDetachedResult(shared, waiterSignal)
}

/** Test-only state reset with generation and identity fencing. */
export function resetPulseTextContextCacheForTests(): void {
  stateGeneration += 1
  cache.clear()
  for (const entry of physicalLoads.values()) {
    if (entry.deadline) clearTimeout(entry.deadline)
    entry.controller.abort(
      new DOMException('Pulse text-context state reset.', 'AbortError'),
    )
    if (!entry.waiterSettled) {
      entry.waiterSettled = true
      entry.rejectWaiters(new Error('Pulse text-context state was reset.'))
    }
  }
  physicalLoads.clear()
}

/** Test-only bounded-state snapshot. */
export function getPulseTextContextCacheStateForTests() {
  return {
    cacheKeys: [...cache.keys()],
    physicalKeys: [...physicalLoads.keys()],
    timedOutKeys: [...physicalLoads.entries()]
      .filter(([, entry]) => entry.timedOut)
      .map(([symbol]) => symbol),
  }
}
