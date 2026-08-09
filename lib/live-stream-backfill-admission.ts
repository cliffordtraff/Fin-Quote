import 'server-only'

import type { PulseLiveStreamBackfillPayload } from '@/lib/pulse-market-data-contract'

/** Finishes before the browser hook's 8-second backfill deadline. */
export const LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS = 7_000
export const LIVE_STREAM_BACKFILL_PHYSICAL_MAX_ENTRIES = 16

export class LiveStreamBackfillLoadTimeoutError extends Error {
  constructor() {
    super('The shared live-stream backfill load exceeded its deadline.')
    this.name = 'LiveStreamBackfillLoadTimeoutError'
  }
}

export class LiveStreamBackfillCapacityError extends Error {
  constructor() {
    super('The live-stream backfill loader is at physical capacity.')
    this.name = 'LiveStreamBackfillCapacityError'
  }
}

interface PhysicalLoad {
  controller: AbortController
  deadline: ReturnType<typeof setTimeout> | null
  promise: Promise<PulseLiveStreamBackfillPayload>
  rejectWaiters: (reason: unknown) => void
  waiterSettled: boolean
  timedOut: boolean
}

export type LiveStreamBackfillLease =
  | {
      status: 'started' | 'joined'
      promise: Promise<PulseLiveStreamBackfillPayload>
    }
  | { status: 'capacity' }

const physicalLoads = new Map<string, PhysicalLoad>()

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError')
}

export function waitForLiveStreamBackfill<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
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

export function leaseLiveStreamBackfill(
  key: string,
  loader: (signal: AbortSignal) => Promise<PulseLiveStreamBackfillPayload>,
): LiveStreamBackfillLease {
  const existing = physicalLoads.get(key)
  if (existing) return { status: 'joined', promise: existing.promise }
  if (physicalLoads.size >= LIVE_STREAM_BACKFILL_PHYSICAL_MAX_ENTRIES) {
    return { status: 'capacity' }
  }

  const controller = new AbortController()
  let resolveWaiters!: (value: PulseLiveStreamBackfillPayload) => void
  let rejectWaiters!: (reason: unknown) => void
  const waiterPromise = new Promise<PulseLiveStreamBackfillPayload>(
    (resolve, reject) => {
      resolveWaiters = resolve
      rejectWaiters = reject
    },
  )
  // A caller can disconnect between leasing and attaching its waiter. Keep the
  // shared deadline rejection observed even in that narrow race.
  void waiterPromise.catch(() => undefined)

  const entry: PhysicalLoad = {
    controller,
    deadline: null,
    promise: waiterPromise,
    rejectWaiters,
    waiterSettled: false,
    timedOut: false,
  }
  physicalLoads.set(key, entry)

  const physicalPromise = Promise.resolve().then(() => loader(controller.signal))
  entry.deadline = setTimeout(() => {
    if (entry.waiterSettled) return
    entry.waiterSettled = true
    entry.timedOut = true
    const error = new LiveStreamBackfillLoadTimeoutError()
    controller.abort(new DOMException(error.message, 'TimeoutError'))
    rejectWaiters(error)
    // Keep the map entry until the actual provider promises settle. Retries
    // join this rejected lease instead of multiplying abort-ignoring work.
  }, LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS)

  physicalPromise.then(
    (value) => {
      if (entry.deadline !== null) clearTimeout(entry.deadline)
      if (physicalLoads.get(key) === entry) physicalLoads.delete(key)
      if (entry.waiterSettled) return
      entry.waiterSettled = true
      resolveWaiters(value)
    },
    (error) => {
      if (entry.deadline !== null) clearTimeout(entry.deadline)
      if (physicalLoads.get(key) === entry) physicalLoads.delete(key)
      if (entry.waiterSettled) return
      entry.waiterSettled = true
      rejectWaiters(error)
    },
  )

  return { status: 'started', promise: waiterPromise }
}

export function resetLiveStreamBackfillAdmissionForTests(): void {
  for (const entry of physicalLoads.values()) {
    if (entry.deadline !== null) clearTimeout(entry.deadline)
    entry.controller.abort(new DOMException('Backfill admission reset.', 'AbortError'))
    if (!entry.waiterSettled) {
      entry.waiterSettled = true
      entry.rejectWaiters(new Error('Backfill admission was reset.'))
    }
  }
  physicalLoads.clear()
}

export function getLiveStreamBackfillAdmissionStateForTests() {
  return {
    physicalKeys: [...physicalLoads.keys()],
    timedOutKeys: [...physicalLoads.entries()]
      .filter(([, entry]) => entry.timedOut)
      .map(([key]) => key),
  }
}
