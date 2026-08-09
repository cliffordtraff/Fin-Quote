import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SlowMarketDataSnapshot } from '@/lib/slow-snapshot-types'

const mocks = vi.hoisted(() => ({
  fetchSlowMarketData: vi.fn(),
}))

vi.mock('@/lib/fetch-market-data', () => ({
  fetchSlowMarketData: mocks.fetchSlowMarketData,
}))

import {
  getSlowSnapshotBase,
  getSlowSnapshotBaseCacheStateForTests,
  resetSlowSnapshotBaseCacheForTests,
  SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS,
  SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS,
  SLOW_SNAPSHOT_BASE_MAX_ABANDONED_LOADS,
  SLOW_SNAPSHOT_BASE_TIMEOUT_MS,
} from '@/lib/slow-snapshot-base-cache'

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
  data: SlowMarketDataSnapshot['data'],
  failedSections: SlowMarketDataSnapshot['failedSections'] = [],
  capturedAt = new Date().toISOString(),
): SlowMarketDataSnapshot {
  return { data, failedSections, capturedAt }
}

function news(title: string) {
  return {
    title,
    text: '',
    url: 'https://example.com',
    publishedDate: '2026-08-08',
    site: 'Example',
  }
}

function economicEvent(event: string) {
  return {
    date: '2026-08-08',
    country: 'US',
    event,
    currency: 'USD',
    previous: null,
    estimate: null,
    actual: null,
    impact: 'High',
    unit: '',
  }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-08T14:00:00.000Z')
  resetSlowSnapshotBaseCacheForTests()
})

afterEach(() => {
  resetSlowSnapshotBaseCacheForTests()
  vi.useRealTimers()
})

describe('slow snapshot base cache', () => {
  it('coalesces concurrent loads and starts the complete TTL at settlement', async () => {
    const load = deferred<SlowMarketDataSnapshot>()
    mocks.fetchSlowMarketData.mockReturnValueOnce(load.promise)
    const startedAt = Date.now()

    const callers = Array.from({ length: 50 }, () => getSlowSnapshotBase())
    await flushMicrotasks()
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(1)

    vi.setSystemTime(startedAt + 5_000)
    const sourceCapturedAt = new Date().toISOString()
    load.resolve(snapshot({ sectors: [] }, [], sourceCapturedAt))
    const settled = await Promise.all(callers)
    expect(settled).toHaveLength(50)
    expect(
      settled.every((result) => result.capturedAt === sourceCapturedAt),
    ).toBe(true)
    expect(settled[0].sectionCapturedAt).toEqual({
      sectors: sourceCapturedAt,
    })

    vi.setSystemTime(
      startedAt + 5_000 + SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS - 1,
    )
    await expect(getSlowSnapshotBase()).resolves.toMatchObject({
      data: { sectors: [] },
      failedSections: [],
      capturedAt: sourceCapturedAt,
      sectionCapturedAt: { sectors: sourceCapturedAt },
    })
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(1)

    mocks.fetchSlowMarketData.mockResolvedValueOnce(
      snapshot({ sectors: [{ sector: 'Energy', changesPercentage: '1' }] }),
    )
    vi.setSystemTime(
      startedAt + 5_000 + SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS,
    )
    await expect(getSlowSnapshotBase()).resolves.toMatchObject({
      data: { sectors: [{ sector: 'Energy', changesPercentage: '1' }] },
    })
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(2)
  })

  it('detaches an aborted waiter without canceling the shared internal load', async () => {
    const load = deferred<SlowMarketDataSnapshot>()
    mocks.fetchSlowMarketData.mockReturnValueOnce(load.promise)
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = getSlowSnapshotBase(firstController.signal)
    const second = getSlowSnapshotBase(secondController.signal)
    await flushMicrotasks()
    firstController.abort(new DOMException('waiter left', 'AbortError'))

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(getSlowSnapshotBaseCacheStateForTests().hasInFlight).toBe(true)
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(1)

    load.resolve(snapshot({ sectors: [] }))
    await expect(second).resolves.toMatchObject({ failedSections: [] })
    expect(getSlowSnapshotBaseCacheStateForTests().hasInFlight).toBe(false)
  })

  it('omits cold failed placeholders while retaining successful empty sections', async () => {
    mocks.fetchSlowMarketData.mockResolvedValueOnce(snapshot({
      sectors: [],
      marketNews: [],
    }, ['sectors']))

    const result = await getSlowSnapshotBase()

    expect(result.data).not.toHaveProperty('sectors')
    expect(result.data).toHaveProperty('marketNews', [])
    expect(result.failedSections).toEqual(['sectors'])
    expect(result.staleSections).toEqual([])
  })

  it('times out to stale data, retries after cooldown, and fences the late load', async () => {
    mocks.fetchSlowMarketData.mockResolvedValueOnce(snapshot({
      sectors: [{ sector: 'Technology', changesPercentage: '1' }],
    }))
    await getSlowSnapshotBase()
    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_COMPLETE_TTL_MS)

    const expired = deferred<SlowMarketDataSnapshot>()
    const replacement = deferred<SlowMarketDataSnapshot>()
    mocks.fetchSlowMarketData
      .mockReturnValueOnce(expired.promise)
      .mockReturnValueOnce(replacement.promise)

    const timedRequest = getSlowSnapshotBase()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_TIMEOUT_MS)
    await expect(timedRequest).resolves.toMatchObject({
      data: {
        sectors: [{ sector: 'Technology', changesPercentage: '1' }],
      },
      timedOut: true,
      usedStale: true,
    })
    expect(getSlowSnapshotBaseCacheStateForTests().abandonedCount).toBe(1)

    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)
    const replacementRequest = getSlowSnapshotBase()
    await flushMicrotasks()
    expect(getSlowSnapshotBaseCacheStateForTests().hasInFlight).toBe(true)

    expired.resolve(snapshot({
      sectors: [{ sector: 'Late', changesPercentage: '99' }],
    }))
    await flushMicrotasks()
    expect(getSlowSnapshotBaseCacheStateForTests().hasInFlight).toBe(true)
    expect(getSlowSnapshotBaseCacheStateForTests().abandonedCount).toBe(0)

    replacement.resolve(snapshot({
      sectors: [{ sector: 'Energy', changesPercentage: '2' }],
    }))
    await expect(replacementRequest).resolves.toMatchObject({
      data: { sectors: [{ sector: 'Energy', changesPercentage: '2' }] },
      failedSections: [],
    })
    expect(
      getSlowSnapshotBaseCacheStateForTests().lastKnownGood?.sectors,
    ).toEqual([{ sector: 'Energy', changesPercentage: '2' }])
  })

  it('hard-caps abandoned fanouts and recovers capacity after one settles', async () => {
    const abandoned = Array.from(
      { length: SLOW_SNAPSHOT_BASE_MAX_ABANDONED_LOADS },
      () => deferred<SlowMarketDataSnapshot>(),
    )
    const recovered = deferred<SlowMarketDataSnapshot>()
    mocks.fetchSlowMarketData
      .mockReturnValueOnce(abandoned[0].promise)
      .mockReturnValueOnce(abandoned[1].promise)
      .mockReturnValueOnce(recovered.promise)

    for (const load of abandoned) {
      const request = getSlowSnapshotBase()
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_TIMEOUT_MS)
      await expect(request).resolves.toMatchObject({ timedOut: true })
      await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)
      expect(load.promise).toBeDefined()
    }

    expect(getSlowSnapshotBaseCacheStateForTests().abandonedCount).toBe(
      SLOW_SNAPSHOT_BASE_MAX_ABANDONED_LOADS,
    )
    await expect(getSlowSnapshotBase()).resolves.toMatchObject({
      timedOut: true,
    })
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(2)

    abandoned[0].resolve(snapshot({ sectors: [] }))
    await flushMicrotasks()
    expect(getSlowSnapshotBaseCacheStateForTests().abandonedCount).toBe(1)
    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)

    const retry = getSlowSnapshotBase()
    await flushMicrotasks()
    expect(mocks.fetchSlowMarketData).toHaveBeenCalledTimes(3)
    recovered.resolve(snapshot({ sectors: [] }))
    await expect(retry).resolves.toMatchObject({ failedSections: [] })
  })

  it('advances healthy per-section fallbacks across sequential degraded loads', async () => {
    const firstCapturedAt = '2026-08-08T14:00:00.000Z'
    const secondCapturedAt = '2026-08-08T14:00:30.000Z'
    const thirdCapturedAt = '2026-08-08T14:01:00.000Z'
    mocks.fetchSlowMarketData
      .mockResolvedValueOnce(snapshot({
        sectors: [{ sector: 'Technology', changesPercentage: '1' }],
        marketNews: [],
        economicEvents: [],
      }, ['economicEvents'], firstCapturedAt))
      .mockResolvedValueOnce(snapshot({
        sectors: [],
        marketNews: [news('New headline')],
        economicEvents: [economicEvent('Payrolls')],
      }, ['sectors'], secondCapturedAt))
      .mockResolvedValueOnce(snapshot({
        sectors: [{ sector: 'Energy', changesPercentage: '2' }],
        marketNews: [],
        economicEvents: [],
      }, ['marketNews'], thirdCapturedAt))

    await getSlowSnapshotBase()
    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)

    const second = await getSlowSnapshotBase()
    expect(second).toMatchObject({
      data: {
        sectors: [{ sector: 'Technology', changesPercentage: '1' }],
        marketNews: [news('New headline')],
        economicEvents: [economicEvent('Payrolls')],
      },
      failedSections: ['sectors'],
      staleSections: ['sectors'],
      capturedAt: firstCapturedAt,
      sectionCapturedAt: {
        sectors: firstCapturedAt,
        marketNews: secondCapturedAt,
        economicEvents: secondCapturedAt,
      },
    })
    await vi.advanceTimersByTimeAsync(SLOW_SNAPSHOT_BASE_FAILURE_COOLDOWN_MS)

    const third = await getSlowSnapshotBase()
    expect(third).toMatchObject({
      data: {
        sectors: [{ sector: 'Energy', changesPercentage: '2' }],
        marketNews: [news('New headline')],
        // This empty array was a successful third result, so it replaces the
        // prior non-empty value rather than being mistaken for failure.
        economicEvents: [],
      },
      failedSections: ['marketNews'],
      staleSections: ['marketNews'],
      capturedAt: secondCapturedAt,
      sectionCapturedAt: {
        sectors: thirdCapturedAt,
        marketNews: secondCapturedAt,
        economicEvents: thirdCapturedAt,
      },
    })
    expect(
      getSlowSnapshotBaseCacheStateForTests()
        .lastKnownGoodSectionCapturedAt,
    ).toMatchObject({
      sectors: thirdCapturedAt,
      marketNews: secondCapturedAt,
      economicEvents: thirdCapturedAt,
    })
  })
})
