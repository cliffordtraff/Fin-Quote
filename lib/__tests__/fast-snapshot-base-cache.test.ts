import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastMarketDataSnapshot } from '@/lib/fast-snapshot-types'

const mocks = vi.hoisted(() => ({
  fetchFastMarketData: vi.fn(),
}))

vi.mock('@/lib/fetch-market-data', () => ({
  fetchFastMarketData: mocks.fetchFastMarketData,
}))

import {
  FAST_SNAPSHOT_BASE_COMPLETE_TTL_MS,
  FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS,
  FAST_SNAPSHOT_BASE_MAX_ABANDONED_LOADS,
  FAST_SNAPSHOT_BASE_TIMEOUT_MS,
  getFastSnapshotBase,
  getFastSnapshotBaseCacheStateForTests,
  resetFastSnapshotBaseCacheForTests,
} from '@/lib/fast-snapshot-base-cache'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function snapshot(
  data: FastMarketDataSnapshot['data'],
  failedSections: FastMarketDataSnapshot['failedSections'] = [],
  capturedAt = new Date().toISOString(),
): FastMarketDataSnapshot {
  return { data, failedSections, capturedAt }
}

function completeSnapshot(label = 'AAPL') {
  const movers = {
    premarket: [],
    cash: [],
    afterhours: [],
    currentSession: 'cash' as const,
  }
  return snapshot({
    gainers: movers,
    losers: movers,
    stocks: [{
      symbol: label,
      name: label,
      price: 100,
      change: 1,
      changePercent: 1,
    }],
    sparklineIndices: [],
  })
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-09T14:00:00.000Z')
  resetFastSnapshotBaseCacheForTests()
})

afterEach(() => {
  resetFastSnapshotBaseCacheForTests()
  vi.useRealTimers()
})

describe('fast snapshot base cache', () => {
  it('coalesces misses and starts TTL at completion while preserving capture time on HIT', async () => {
    const load = deferred<FastMarketDataSnapshot>()
    mocks.fetchFastMarketData.mockReturnValueOnce(load.promise)
    const startedAt = Date.now()
    const callers = Array.from({ length: 40 }, () => getFastSnapshotBase())
    await flushMicrotasks()

    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(1)
    vi.setSystemTime(startedAt + 5_000)
    const completed = completeSnapshot()
    load.resolve(completed)
    const results = await Promise.all(callers)
    expect(results).toHaveLength(40)
    expect(results[0].cacheStatus).toBe('MISS')

    vi.setSystemTime(
      startedAt + 5_000 + FAST_SNAPSHOT_BASE_COMPLETE_TTL_MS - 1,
    )
    const hit = await getFastSnapshotBase()
    expect(hit.cacheStatus).toBe('HIT')
    expect(hit.capturedAt).toBe(completed.capturedAt)
    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(1)

    vi.setSystemTime(
      startedAt + 5_000 + FAST_SNAPSHOT_BASE_COMPLETE_TTL_MS,
    )
    mocks.fetchFastMarketData.mockResolvedValueOnce(completeSnapshot('MSFT'))
    expect((await getFastSnapshotBase()).cacheStatus).toBe('MISS')
    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(2)
  })

  it('detaches one aborted waiter without canceling the shared load', async () => {
    const load = deferred<FastMarketDataSnapshot>()
    mocks.fetchFastMarketData.mockReturnValueOnce(load.promise)
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = getFastSnapshotBase(firstController.signal)
    const second = getFastSnapshotBase(secondController.signal)
    await flushMicrotasks()
    firstController.abort(new DOMException('left', 'AbortError'))

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(getFastSnapshotBaseCacheStateForTests().hasInFlight).toBe(true)
    load.resolve(completeSnapshot())
    await expect(second).resolves.toMatchObject({ failedSections: [] })
    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(1)
  })

  it('omits failed or missing fields while retaining successful empties', async () => {
    mocks.fetchFastMarketData.mockResolvedValueOnce(snapshot({
      stocks: [],
      sparklineIndices: [],
    }, ['sparklineIndices']))

    const result = await getFastSnapshotBase()

    expect(result.data).toEqual({ stocks: [] })
    expect(result.failedSections).toEqual([
      'gainers',
      'losers',
      'sparklineIndices',
    ])
  })

  it('times out, retries after cooldown, and fences a late abandoned load', async () => {
    const expired = deferred<FastMarketDataSnapshot>()
    const replacement = deferred<FastMarketDataSnapshot>()
    mocks.fetchFastMarketData
      .mockReturnValueOnce(expired.promise)
      .mockReturnValueOnce(replacement.promise)

    const timedRequest = getFastSnapshotBase()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(FAST_SNAPSHOT_BASE_TIMEOUT_MS)
    await expect(timedRequest).resolves.toMatchObject({
      timedOut: true,
      failedSections: ['gainers', 'losers', 'stocks', 'sparklineIndices'],
    })
    expect(getFastSnapshotBaseCacheStateForTests().abandonedCount).toBe(1)

    await vi.advanceTimersByTimeAsync(FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)
    const retry = getFastSnapshotBase()
    await flushMicrotasks()
    expired.resolve(completeSnapshot('LATE'))
    await flushMicrotasks()
    expect(getFastSnapshotBaseCacheStateForTests().hasInFlight).toBe(true)

    replacement.resolve(completeSnapshot('FRESH'))
    await expect(retry).resolves.toMatchObject({
      data: { stocks: [{ symbol: 'FRESH' }] },
      failedSections: [],
    })
    expect(
      getFastSnapshotBaseCacheStateForTests().recentResult?.data.stocks?.[0]
        ?.symbol,
    ).toBe('FRESH')
  })

  it('hard-caps abandoned physical fan-outs and recovers when one settles', async () => {
    const abandoned = Array.from(
      { length: FAST_SNAPSHOT_BASE_MAX_ABANDONED_LOADS },
      () => deferred<FastMarketDataSnapshot>(),
    )
    mocks.fetchFastMarketData
      .mockReturnValueOnce(abandoned[0].promise)
      .mockReturnValueOnce(abandoned[1].promise)
      .mockResolvedValueOnce(completeSnapshot('RECOVERED'))

    for (const load of abandoned) {
      const request = getFastSnapshotBase()
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(FAST_SNAPSHOT_BASE_TIMEOUT_MS)
      await expect(request).resolves.toMatchObject({ timedOut: true })
      await vi.advanceTimersByTimeAsync(FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)
      expect(load.promise).toBeDefined()
    }

    await expect(getFastSnapshotBase()).resolves.toMatchObject({ timedOut: true })
    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(2)

    abandoned[0].resolve(completeSnapshot('LATE'))
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(FAST_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)

    await expect(getFastSnapshotBase()).resolves.toMatchObject({
      data: { stocks: [{ symbol: 'RECOVERED' }] },
      failedSections: [],
    })
    expect(mocks.fetchFastMarketData).toHaveBeenCalledTimes(3)
  })

  it('fails the whole boundary when capturedAt is not strict UTC', async () => {
    mocks.fetchFastMarketData.mockResolvedValueOnce(
      snapshot(completeSnapshot().data, [], '2026-08-09T10:00:00-04:00'),
    )

    await expect(getFastSnapshotBase()).resolves.toMatchObject({
      data: {},
      failedSections: ['gainers', 'losers', 'stocks', 'sparklineIndices'],
    })
  })
})
