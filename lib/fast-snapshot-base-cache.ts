import 'server-only'

import { fetchFastMarketData } from '@/lib/fetch-market-data'
import {
  FAST_MARKET_DATA_SECTIONS,
  isValidSnapshotTimestamp,
  normalizeFastFailedSections,
  type FastMarketDataPatch,
  type FastMarketDataSection,
  type FastMarketDataSnapshot,
} from '@/lib/fast-snapshot-types'

export const FAST_SNAPSHOT_BASE_TIMEOUT_MS = 8_000
export const FAST_SNAPSHOT_BASE_COMPLETE_TTL_MS = 15_000
export const FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS = 5_000
export const FAST_SNAPSHOT_BASE_MAX_ABANDONED_LOADS = 2

export interface FastSnapshotBaseResult extends FastMarketDataSnapshot {
  timedOut: boolean
  cacheStatus: 'HIT' | 'MISS'
}

interface RecentBaseResult {
  expiresAt: number
  result: Omit<FastSnapshotBaseResult, 'cacheStatus'>
}

interface BaseLoadEntry {
  controller: AbortController
  invalidate: () => void
  promise: Promise<FastSnapshotBaseResult>
}

let recent: RecentBaseResult | null = null
let inFlight: BaseLoadEntry | null = null
const abandonedLoads = new Set<Promise<FastMarketDataSnapshot>>()
let stateGeneration = 0

function cloneSnapshot(
  result: Omit<FastSnapshotBaseResult, 'cacheStatus'>,
  cacheStatus: 'HIT' | 'MISS',
): FastSnapshotBaseResult {
  return {
    data: { ...result.data },
    failedSections: [...result.failedSections],
    capturedAt: result.capturedAt,
    timedOut: result.timedOut,
    cacheStatus,
  }
}

function failedSnapshot(timedOut: boolean): Omit<FastSnapshotBaseResult, 'cacheStatus'> {
  return {
    data: {},
    failedSections: [...FAST_MARKET_DATA_SECTIONS],
    capturedAt: new Date().toISOString(),
    timedOut,
  }
}

function normalizeSnapshot(
  snapshot: FastMarketDataSnapshot,
): Omit<FastSnapshotBaseResult, 'cacheStatus'> {
  if (!isValidSnapshotTimestamp(snapshot.capturedAt)) {
    return failedSnapshot(false)
  }

  const source = snapshot.data as Record<string, unknown>
  const failed = new Set<FastMarketDataSection>(snapshot.failedSections)
  for (const section of FAST_MARKET_DATA_SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(source, section)) {
      failed.add(section)
    }
  }

  const failedSections = normalizeFastFailedSections([...failed])
  const data: Record<string, unknown> = {}
  for (const section of FAST_MARKET_DATA_SECTIONS) {
    if (
      !failed.has(section) &&
      Object.prototype.hasOwnProperty.call(source, section)
    ) {
      data[section] = source[section]
    }
  }

  return {
    data: data as FastMarketDataPatch,
    failedSections,
    capturedAt: snapshot.capturedAt,
    timedOut: false,
  }
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

function startBaseLoad(): Promise<FastSnapshotBaseResult> {
  if (abandonedLoads.size >= FAST_SNAPSHOT_BASE_MAX_ABANDONED_LOADS) {
    const result = failedSnapshot(true)
    recent = {
      expiresAt: Date.now() + FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS,
      result,
    }
    return Promise.resolve(cloneSnapshot(result, 'MISS'))
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let active = true
  let resolveShared!: (value: FastSnapshotBaseResult) => void
  const sharedPromise = new Promise<FastSnapshotBaseResult>((resolve) => {
    resolveShared = resolve
  })

  const settle = (
    result: Omit<FastSnapshotBaseResult, 'cacheStatus'>,
  ) => {
    if (!active) return
    active = false
    clearTimeout(deadline)
    if (inFlight === entry) inFlight = null

    if (generation === stateGeneration) {
      recent = {
        expiresAt:
          Date.now() +
          (result.failedSections.length === 0
            ? FAST_SNAPSHOT_BASE_COMPLETE_TTL_MS
            : FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS),
        result: {
          ...result,
          data: { ...result.data },
          failedSections: [...result.failedSections],
        },
      }
    }
    resolveShared(cloneSnapshot(result, 'MISS'))
  }

  const entry: BaseLoadEntry = {
    controller,
    promise: sharedPromise,
    invalidate() {
      settle(failedSnapshot(true))
    },
  }
  inFlight = entry

  const underlyingLoad = Promise.resolve().then(() =>
    fetchFastMarketData(controller.signal),
  )
  const deadline = setTimeout(() => {
    abandonedLoads.add(underlyingLoad)
    controller.abort(
      new DOMException('Fast snapshot base timed out', 'TimeoutError'),
    )
    entry.invalidate()
  }, FAST_SNAPSHOT_BASE_TIMEOUT_MS)

  underlyingLoad.then(
    (snapshot) => {
      abandonedLoads.delete(underlyingLoad)
      settle(normalizeSnapshot(snapshot))
    },
    () => {
      abandonedLoads.delete(underlyingLoad)
      settle(failedSnapshot(false))
    },
  )

  return sharedPromise
}

/**
 * Share one bounded physical fan-out while detaching individual HTTP waiters.
 * A cached HIT preserves the original completion timestamp.
 */
export function getFastSnapshotBase(
  waiterSignal?: AbortSignal,
): Promise<FastSnapshotBaseResult> {
  const now = Date.now()
  if (recent && now < recent.expiresAt) {
    return waitForDetachedResult(
      Promise.resolve(cloneSnapshot(recent.result, 'HIT')),
      waiterSignal,
    )
  }
  if (recent) recent = null

  const shared = inFlight?.promise ?? startBaseLoad()
  return waitForDetachedResult(shared, waiterSignal)
}

/** Test-only reset with identity and generation fencing. */
export function resetFastSnapshotBaseCacheForTests(): void {
  stateGeneration += 1
  recent = null
  inFlight?.controller.abort()
  inFlight?.invalidate()
  inFlight = null
  abandonedLoads.clear()
}

/** Test-only state snapshot. */
export function getFastSnapshotBaseCacheStateForTests() {
  return {
    hasInFlight: inFlight !== null,
    abandonedCount: abandonedLoads.size,
    recentExpiresAt: recent?.expiresAt ?? null,
    recentResult: recent
      ? cloneSnapshot(recent.result, 'HIT')
      : null,
  }
}
