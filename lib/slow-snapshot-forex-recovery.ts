import 'server-only'

import {
  getForexBondsData,
  type ForexBondData,
} from '@/app/actions/forex-bonds'
import { normalizeCompleteForexBondPanel } from '@/lib/forex-bonds-panel'

export const SLOW_FOREX_RECOVERY_TIMEOUT_MS = 8_000
export const SLOW_FOREX_RECOVERY_COOLDOWN_MS = 30_000
export const SLOW_FOREX_RECOVERY_MAX_ABANDONED_LOADS = 2

export interface SlowForexRecoverySnapshot {
  forexBonds: ForexBondData[]
  /** Time the live recovery provider request completed. */
  capturedAt: string
}

interface RecentRecovery {
  expiresAt: number
  value: SlowForexRecoverySnapshot | null
}

interface RecoveryEntry {
  invalidate: () => void
  promise: Promise<SlowForexRecoverySnapshot | null>
}

let recent: RecentRecovery | null = null
let inFlight: RecoveryEntry | null = null
const abandonedLoads = new Set<Promise<Awaited<ReturnType<typeof getForexBondsData>>>>()
let stateGeneration = 0

function normalizeResult(
  result: Awaited<ReturnType<typeof getForexBondsData>>,
): ForexBondData[] | null {
  if (!('forexBonds' in result) || !Array.isArray(result.forexBonds)) {
    return null
  }
  return normalizeCompleteForexBondPanel(result.forexBonds)
}

function waitForDetachedRecovery(
  promise: Promise<SlowForexRecoverySnapshot | null>,
  signal?: AbortSignal,
): Promise<SlowForexRecoverySnapshot | null> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise((resolve, reject) => {
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

/**
 * Runs one true-live FX/rates repair at a time. Both positive and negative
 * outcomes receive a short lease so an upstream outage cannot amplify into a
 * fresh provider request for every public snapshot request.
 */
export function recoverSlowSnapshotForexBonds(
  waiterSignal?: AbortSignal,
): Promise<SlowForexRecoverySnapshot | null> {
  const now = Date.now()
  if (recent && now < recent.expiresAt) {
    return waitForDetachedRecovery(Promise.resolve(recent.value), waiterSignal)
  }
  if (recent) recent = null
  if (inFlight) return waitForDetachedRecovery(inFlight.promise, waiterSignal)
  if (abandonedLoads.size >= SLOW_FOREX_RECOVERY_MAX_ABANDONED_LOADS) {
    recent = {
      expiresAt: Date.now() + SLOW_FOREX_RECOVERY_COOLDOWN_MS,
      value: null,
    }
    return waitForDetachedRecovery(Promise.resolve(null), waiterSignal)
  }

  const generation = stateGeneration
  const controller = new AbortController()
  let active = true
  let resolveShared!: (value: SlowForexRecoverySnapshot | null) => void
  const sharedPromise = new Promise<SlowForexRecoverySnapshot | null>((resolve) => {
    resolveShared = resolve
  })

  const recordAndResolve = (value: SlowForexRecoverySnapshot | null) => {
    if (!active) return
    active = false
    clearTimeout(deadline)
    if (inFlight === entry) inFlight = null
    if (generation === stateGeneration) {
      recent = {
        expiresAt: Date.now() + SLOW_FOREX_RECOVERY_COOLDOWN_MS,
        value,
      }
    }
    resolveShared(value)
  }

  const entry: RecoveryEntry = {
    promise: sharedPromise,
    invalidate() {
      if (!active) return
      controller.abort(
        new DOMException('Slow snapshot forex recovery timed out.', 'TimeoutError'),
      )
      recordAndResolve(null)
    },
  }
  inFlight = entry

  const underlyingLoad = Promise.resolve().then(() =>
    getForexBondsData({ freshness: 'live', signal: controller.signal }),
  )
  const deadline = setTimeout(() => {
    abandonedLoads.add(underlyingLoad)
    entry.invalidate()
  }, SLOW_FOREX_RECOVERY_TIMEOUT_MS)

  underlyingLoad.then(
    (result) => {
      abandonedLoads.delete(underlyingLoad)
      const forexBonds = normalizeResult(result)
      recordAndResolve(
        forexBonds
          ? {
              forexBonds,
              capturedAt: new Date().toISOString(),
            }
          : null,
      )
    },
    () => {
      abandonedLoads.delete(underlyingLoad)
      recordAndResolve(null)
    },
  )

  return waitForDetachedRecovery(sharedPromise, waiterSignal)
}

/** Test-only reset with late-result generation fencing. */
export function resetSlowSnapshotForexRecoveryForTests(): void {
  stateGeneration += 1
  recent = null
  inFlight?.invalidate()
  inFlight = null
  abandonedLoads.clear()
}

/** Test-only state snapshot. */
export function getSlowSnapshotForexRecoveryStateForTests() {
  return {
    hasInFlight: inFlight !== null,
    abandonedCount: abandonedLoads.size,
    recentExpiresAt: recent?.expiresAt ?? null,
    recentValue: recent?.value ?? null,
  }
}
