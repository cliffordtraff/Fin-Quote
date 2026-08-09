import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLiveStreamBackfillAdmissionStateForTests,
  leaseLiveStreamBackfill,
  LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS,
  LIVE_STREAM_BACKFILL_PHYSICAL_MAX_ENTRIES,
  LiveStreamBackfillLoadTimeoutError,
  resetLiveStreamBackfillAdmissionForTests,
  waitForLiveStreamBackfill,
} from '@/lib/live-stream-backfill-admission'
import type { PulseLiveStreamBackfillPayload } from '@/lib/pulse-market-data-contract'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function payload(symbol = 'AAPL'): PulseLiveStreamBackfillPayload {
  return {
    symbol,
    candles: [],
    previousClose: null,
    dayHigh: null,
    dayLow: null,
  }
}

describe('live-stream backfill admission', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetLiveStreamBackfillAdmissionForTests()
  })

  afterEach(() => {
    resetLiveStreamBackfillAdmissionForTests()
    vi.useRealTimers()
  })

  it('coalesces the same physical key and detaches an aborted caller', async () => {
    const physical = deferred<PulseLiveStreamBackfillPayload>()
    let loaderSignal: AbortSignal | undefined
    const loader = vi.fn((signal: AbortSignal) => {
      loaderSignal = signal
      return physical.promise
    })

    const first = leaseLiveStreamBackfill('AAPL:1s:300', loader)
    const second = leaseLiveStreamBackfill('AAPL:1s:300', loader)
    expect(first.status).toBe('started')
    expect(second.status).toBe('joined')
    if (first.status === 'capacity' || second.status === 'capacity') {
      throw new Error('Expected a shared lease.')
    }

    const caller = new AbortController()
    const detachedWaiter = waitForLiveStreamBackfill(first.promise, caller.signal)
    caller.abort(new DOMException('Caller left.', 'AbortError'))
    await expect(detachedWaiter).rejects.toMatchObject({ name: 'AbortError' })
    expect(loaderSignal?.aborted).toBe(false)

    physical.resolve(payload())
    await expect(second.promise).resolves.toEqual(payload())
    expect(loader).toHaveBeenCalledTimes(1)
    expect(getLiveStreamBackfillAdmissionStateForTests().physicalKeys).toEqual([])
  })

  it('times out waiters but retains abort-ignoring work until physical settlement', async () => {
    const physical = deferred<PulseLiveStreamBackfillPayload>()
    let loaderSignal: AbortSignal | undefined
    const loader = vi.fn((signal: AbortSignal) => {
      loaderSignal = signal
      return physical.promise
    })
    const first = leaseLiveStreamBackfill('AAPL:1s:300', loader)
    if (first.status === 'capacity') throw new Error('Expected a lease.')

    await vi.advanceTimersByTimeAsync(LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS)

    await expect(first.promise).rejects.toBeInstanceOf(
      LiveStreamBackfillLoadTimeoutError,
    )
    expect(loaderSignal?.aborted).toBe(true)
    expect(getLiveStreamBackfillAdmissionStateForTests()).toEqual({
      physicalKeys: ['AAPL:1s:300'],
      timedOutKeys: ['AAPL:1s:300'],
    })

    const retryBeforeSettlement = leaseLiveStreamBackfill(
      'AAPL:1s:300',
      loader,
    )
    expect(retryBeforeSettlement.status).toBe('joined')
    if (retryBeforeSettlement.status === 'capacity') {
      throw new Error('Expected the retry to join timed-out physical work.')
    }
    await expect(retryBeforeSettlement.promise).rejects.toBeInstanceOf(
      LiveStreamBackfillLoadTimeoutError,
    )
    expect(loader).toHaveBeenCalledTimes(1)

    physical.resolve(payload())
    await vi.advanceTimersByTimeAsync(0)
    expect(getLiveStreamBackfillAdmissionStateForTests().physicalKeys).toEqual([])

    const fresh = leaseLiveStreamBackfill(
      'AAPL:1s:300',
      async () => payload('AAPL'),
    )
    expect(fresh.status).toBe('started')
    if (fresh.status === 'capacity') throw new Error('Expected a fresh lease.')
    await expect(fresh.promise).resolves.toEqual(payload())
  })

  it('enforces a hard cap across distinct physical provider loads', () => {
    const loader = vi.fn(
      () => new Promise<PulseLiveStreamBackfillPayload>(() => undefined),
    )

    for (let index = 0; index < LIVE_STREAM_BACKFILL_PHYSICAL_MAX_ENTRIES; index += 1) {
      expect(leaseLiveStreamBackfill(`key-${index}`, loader).status).toBe(
        'started',
      )
    }

    expect(leaseLiveStreamBackfill('over-capacity', loader).status).toBe(
      'capacity',
    )
    expect(getLiveStreamBackfillAdmissionStateForTests().physicalKeys).toHaveLength(
      LIVE_STREAM_BACKFILL_PHYSICAL_MAX_ENTRIES,
    )
  })
})
