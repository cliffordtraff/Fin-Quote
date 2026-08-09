import 'server-only'

import { fetchSlowMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData } from '@/lib/market-types'
import {
  mergeFailedSlowSections,
  normalizeSlowFailedSections,
  oldestSlowCaptureTime,
  SLOW_MARKET_DATA_SECTIONS,
  type SlowMarketDataSection,
  type SlowMarketDataSnapshot,
  type SlowSectionCaptureTimes,
} from '@/lib/slow-snapshot-types'

export const SLOW_SNAPSHOT_BASE_TIMEOUT_MS = 8_000
export const SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS = 5 * 60_000
export const SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS = 30_000
export const SLOW_SNAPSHOT_BASE_MAX_ABANDONED_LOADS = 2

export interface SlowSnapshotBaseResult extends SlowMarketDataSnapshot {
  sectionCapturedAt: SlowSectionCaptureTimes
  staleSections: SlowMarketDataSection[]
  timedOut: boolean
  usedStale: boolean
}

interface RecentBaseResult {
  expiresAt: number
  result: SlowSnapshotBaseResult
}

interface BaseLoadEntry {
  invalidate: () => void
  promise: Promise<SlowSnapshotBaseResult>
}

interface LastKnownGoodState {
  data: Partial<AllMarketData>
  sectionCapturedAt: SlowSectionCaptureTimes
}

let recent: RecentBaseResult | null = null
let lastKnownGood: LastKnownGoodState | null = null
let inFlight: BaseLoadEntry | null = null
const abandonedLoads = new Set<Promise<SlowMarketDataSnapshot>>()
let stateGeneration = 0

function cloneResult(result: SlowSnapshotBaseResult): SlowSnapshotBaseResult {
  return {
    data: { ...result.data },
    failedSections: [...result.failedSections],
    capturedAt: result.capturedAt,
    sectionCapturedAt: { ...result.sectionCapturedAt },
    staleSections: [...result.staleSections],
    timedOut: result.timedOut,
    usedStale: result.usedStale,
  }
}

function hasFallbackSection(
  fallback: LastKnownGoodState | null,
  section: SlowMarketDataSection,
): boolean {
  return Boolean(
    fallback && Object.prototype.hasOwnProperty.call(fallback.data, section),
  )
}

function normalizeLoadResult(
  snapshot: SlowMarketDataSnapshot,
  timedOut: boolean,
): SlowSnapshotBaseResult {
  const failedSections = normalizeSlowFailedSections(snapshot.failedSections)
  const staleSections = failedSections.filter((section) =>
    hasFallbackSection(lastKnownGood, section),
  )
  const patchData = { ...snapshot.data } as Record<string, unknown>
  for (const section of failedSections) {
    delete patchData[section]
  }
  const data = mergeFailedSlowSections(
    patchData as Partial<AllMarketData>,
    lastKnownGood?.data ?? null,
    staleSections,
  )
  const dataRecord = data as Record<string, unknown>
  const stale = new Set(staleSections)
  const sectionCapturedAt: SlowSectionCaptureTimes = {}
  for (const section of SLOW_MARKET_DATA_SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(dataRecord, section)) continue
    sectionCapturedAt[section] = stale.has(section)
      ? lastKnownGood?.sectionCapturedAt[section] ?? snapshot.capturedAt
      : snapshot.capturedAt
  }

  return {
    data,
    failedSections,
    capturedAt: oldestSlowCaptureTime(
      Object.values(sectionCapturedAt),
      snapshot.capturedAt,
    ),
    sectionCapturedAt,
    staleSections,
    timedOut,
    usedStale: staleSections.length > 0,
  }
}

function failedLoadResult(timedOut: boolean): SlowSnapshotBaseResult {
  return normalizeLoadResult(
    {
      data: {},
      failedSections: [...SLOW_MARKET_DATA_SECTIONS],
      capturedAt: new Date().toISOString(),
    },
    timedOut,
  )
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

function startBaseLoad(): Promise<SlowSnapshotBaseResult> {
  if (abandonedLoads.size >= SLOW_SNAPSHOT_BASE_MAX_ABANDONED_LOADS) {
    const result = failedLoadResult(true)
    recent = {
      expiresAt: Date.now() + SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS,
      result: cloneResult(result),
    }
    return Promise.resolve(result)
  }

  const generation = stateGeneration
  let active = true
  let resolveShared!: (value: SlowSnapshotBaseResult) => void
  const sharedPromise = new Promise<SlowSnapshotBaseResult>((resolve) => {
    resolveShared = resolve
  })

  const settle = (result: SlowSnapshotBaseResult) => {
    if (!active) return
    active = false
    clearTimeout(deadline)
    if (inFlight === entry) inFlight = null

    if (generation === stateGeneration) {
      const complete = result.failedSections.length === 0
      const nextLastKnownGoodData = {
        ...(lastKnownGood?.data ?? {}),
      } as Record<string, unknown>
      const nextLastKnownGoodCaptureTimes = {
        ...(lastKnownGood?.sectionCapturedAt ?? {}),
      }
      const data = result.data as Record<string, unknown>
      const failed = new Set(result.failedSections)
      for (const section of SLOW_MARKET_DATA_SECTIONS) {
        if (
          !failed.has(section) &&
          Object.prototype.hasOwnProperty.call(data, section)
        ) {
          nextLastKnownGoodData[section] = data[section]
          nextLastKnownGoodCaptureTimes[section] =
            result.sectionCapturedAt[section] ?? result.capturedAt
        }
      }
      lastKnownGood = {
        data: nextLastKnownGoodData as Partial<AllMarketData>,
        sectionCapturedAt: nextLastKnownGoodCaptureTimes,
      }
      recent = {
        expiresAt: Date.now() + (complete
          ? SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS
          : SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS),
        result: cloneResult(result),
      }
    }
    resolveShared(cloneResult(result))
  }

  const entry: BaseLoadEntry = {
    promise: sharedPromise,
    invalidate() {
      settle(failedLoadResult(true))
    },
  }
  inFlight = entry
  const underlyingLoad = Promise.resolve().then(() => fetchSlowMarketData())
  const deadline = setTimeout(() => {
    abandonedLoads.add(underlyingLoad)
    entry.invalidate()
  }, SLOW_SNAPSHOT_BASE_TIMEOUT_MS)

  underlyingLoad.then(
    (snapshot) => {
      abandonedLoads.delete(underlyingLoad)
      settle(normalizeLoadResult(snapshot, false))
    },
    () => {
      abandonedLoads.delete(underlyingLoad)
      settle(failedLoadResult(false))
    },
  )

  return sharedPromise
}

/**
 * Return a shared base snapshot while keeping each HTTP request's cancellation
 * detached from the internal load. Complete snapshots live for five minutes;
 * explicit failures and timeouts retry after a short cooldown.
 */
export function getSlowSnapshotBase(
  waiterSignal?: AbortSignal,
): Promise<SlowSnapshotBaseResult> {
  const now = Date.now()
  if (recent && now < recent.expiresAt) {
    return waitForDetachedResult(
      Promise.resolve(cloneResult(recent.result)),
      waiterSignal,
    )
  }
  if (recent) recent = null

  const shared = inFlight?.promise ?? startBaseLoad()
  return waitForDetachedResult(shared, waiterSignal)
}

/** Test-only reset with matching-entry and generation fencing. */
export function resetSlowSnapshotBaseCacheForTests(): void {
  stateGeneration += 1
  recent = null
  lastKnownGood = null
  inFlight?.invalidate()
  inFlight = null
  abandonedLoads.clear()
}

/** Test-only state snapshot. */
export function getSlowSnapshotBaseCacheStateForTests() {
  return {
    hasInFlight: inFlight !== null,
    abandonedCount: abandonedLoads.size,
    lastKnownGood: lastKnownGood ? { ...lastKnownGood.data } : null,
    lastKnownGoodSectionCapturedAt: lastKnownGood
      ? { ...lastKnownGood.sectionCapturedAt }
      : null,
    recentExpiresAt: recent?.expiresAt ?? null,
    recentResult: recent ? cloneResult(recent.result) : null,
  }
}
