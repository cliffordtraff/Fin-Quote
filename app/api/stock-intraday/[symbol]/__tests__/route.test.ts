import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'

const mocks = vi.hoisted(() => ({
  getStockIntradayOHLC: vi.fn(),
}))

vi.mock('@/app/actions/stock-intraday-ohlc', () => ({
  getStockIntradayOHLC: mocks.getStockIntradayOHLC,
}))

import { GET } from '@/app/api/stock-intraday/[symbol]/route'
import {
  getStockIntradayRouteStateForTests,
  resetStockIntradayRouteStateForTests,
  STOCK_INTRADAY_CACHE_MAX_ENTRIES,
  STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
  STOCK_INTRADAY_LOAD_TIMEOUT_MS,
} from '@/lib/stock-intraday-route-cache'

function data(symbol: string, currentPrice = 100): StockIntradayOHLC {
  return {
    symbol,
    name: `${symbol} Inc.`,
    currentPrice,
    priceChange: 1,
    priceChangePercent: 1,
    yesterdayOHLC: [
      {
        date: '2026-08-07 15:55:00',
        open: 98,
        high: 100,
        low: 97,
        close: 99,
      },
    ],
    todayOHLC: [
      {
        date: '2026-08-08 09:35:00',
        open: 99,
        high: 101,
        low: 99,
        close: currentPrice,
      },
    ],
    previousClose: 99,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function flushMicrotasks(turns = 4) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

function routeRequest(
  symbol: string,
  query = '',
  signal?: AbortSignal,
) {
  const request = new Request(
    `https://theintraday.com/api/stock-intraday/${encodeURIComponent(symbol)}${query}`,
    { signal },
  )
  return GET(request, { params: Promise.resolve({ symbol }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetStockIntradayRouteStateForTests()
  mocks.getStockIntradayOHLC.mockImplementation(
    async (symbol: string) => ({ data: data(symbol) }),
  )
})

afterEach(() => {
  resetStockIntradayRouteStateForTests()
  vi.useRealTimers()
})

describe('GET /api/stock-intraday/[symbol]', () => {
  it('normalizes valid intervals and rejects malformed or repeated values', async () => {
    const defaultResponse = await routeRequest('aapl')
    expect(defaultResponse.status).toBe(200)
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledWith('AAPL', 5)

    const normalizedResponse = await routeRequest('msft', '?interval=05')
    expect(normalizedResponse.status).toBe(200)
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledWith('MSFT', 5)

    for (const [index, query] of [
      '?interval=abc',
      '?interval=1.5',
      '?interval=0',
      '?interval=31',
      '?interval=-1',
      '?interval=',
      '?interval=1e1',
      '?interval=5&interval=10',
    ].entries()) {
      const response = await routeRequest(`Z${index}`, query)
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid interval',
      })
    }
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(2)
  })

  it('coalesces normalized concurrent misses and then serves a deterministic hit', async () => {
    const load = deferred<{ data: StockIntradayOHLC }>()
    mocks.getStockIntradayOHLC.mockReturnValue(load.promise)

    const first = routeRequest('brk-b', '?interval=05')
    const second = routeRequest('BRK.B', '?interval=5')
    await flushMicrotasks()

    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(1)
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledWith('BRK.B', 5)
    load.resolve({ data: data('BRK.B', 500) })

    const [firstResponse, secondResponse] = await Promise.all([first, second])
    for (const response of [firstResponse, secondResponse]) {
      expect(response.status).toBe(200)
      expect(response.headers.get('x-cache')).toBe('MISS')
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toMatchObject({
        symbol: 'BRK.B',
        currentPrice: 500,
      })
    }

    const hit = await routeRequest('BRK.B', '?interval=5')
    expect(hit.headers.get('x-cache')).toBe('HIT')
    expect(hit.headers.get('cache-control')).toBe('no-store')
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(1)
  })

  it('uses completion time for the absolute TTL and expires exactly at the boundary', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-08T14:00:00.000Z')
    vi.setSystemTime(startedAt)
    const firstLoad = deferred<{ data: StockIntradayOHLC }>()
    mocks.getStockIntradayOHLC
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce({ data: data('AAPL', 102) })

    const first = routeRequest('AAPL')
    await flushMicrotasks()
    vi.setSystemTime(startedAt.getTime() + 10_000)
    firstLoad.resolve({ data: data('AAPL', 101) })
    expect((await first).headers.get('x-cache')).toBe('MISS')

    vi.setSystemTime(startedAt.getTime() + 24_999)
    const beforeExpiry = await routeRequest('AAPL')
    expect(beforeExpiry.headers.get('x-cache')).toBe('HIT')
    expect((await beforeExpiry.json()).currentPrice).toBe(101)

    vi.setSystemTime(startedAt.getTime() + 25_000)
    const atExpiry = await routeRequest('AAPL')
    expect(atExpiry.headers.get('x-cache')).toBe('MISS')
    expect((await atExpiry.json()).currentPrice).toBe(102)
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(2)
  })

  it('enforces a hard all-fresh LRU cap and promotes hits before eviction', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')

    for (let index = 0; index < STOCK_INTRADAY_CACHE_MAX_ENTRIES; index += 1) {
      const symbol = `S${String(index).padStart(3, '0')}`
      expect((await routeRequest(symbol)).status).toBe(200)
    }
    expect(getStockIntradayRouteStateForTests().cacheKeys).toHaveLength(
      STOCK_INTRADAY_CACHE_MAX_ENTRIES,
    )

    expect((await routeRequest('S000')).headers.get('x-cache')).toBe('HIT')
    expect((await routeRequest('S100')).headers.get('x-cache')).toBe('MISS')
    const keys = getStockIntradayRouteStateForTests().cacheKeys
    expect(keys).toHaveLength(STOCK_INTRADAY_CACHE_MAX_ENTRIES)
    expect(keys).toContain('S000:5')
    expect(keys).toContain('S100:5')
    expect(keys).not.toContain('S001:5')

    expect((await routeRequest('S001')).headers.get('x-cache')).toBe('MISS')
    expect((await routeRequest('S000')).headers.get('x-cache')).toBe('HIT')
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(
      STOCK_INTRADAY_CACHE_MAX_ENTRIES + 2,
    )
  })

  it('fails closed at distinct in-flight capacity while still allowing same-key joins', async () => {
    const pending = Array.from(
      { length: STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES },
      () => deferred<{ data: StockIntradayOHLC }>(),
    )
    mocks.getStockIntradayOHLC.mockImplementation(
      () =>
        pending[mocks.getStockIntradayOHLC.mock.calls.length - 1].promise,
    )

    const requests = pending.map((_entry, index) =>
      routeRequest(`Q${String(index).padStart(3, '0')}`),
    )
    await flushMicrotasks()
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toHaveLength(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
    )
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
    )

    const join = routeRequest('Q000')
    const overloaded = await routeRequest('Z999')
    expect(overloaded.status).toBe(503)
    expect(overloaded.headers.get('retry-after')).toBe('1')
    expect(overloaded.headers.get('cache-control')).toBe('no-store')
    await expect(overloaded.json()).resolves.toEqual({
      error: 'Intraday data is temporarily busy. Please retry.',
    })
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
    )

    pending.forEach((entry, index) => {
      entry.resolve({ data: data(`Q${String(index).padStart(3, '0')}`) })
    })
    const responses = await Promise.all([...requests, join])
    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toEqual([])
  })

  it('lets one waiter abort without canceling shared work or another waiter', async () => {
    const load = deferred<{ data: StockIntradayOHLC }>()
    mocks.getStockIntradayOHLC.mockReturnValue(load.promise)
    const controller = new AbortController()
    const first = routeRequest('NVDA', '', controller.signal).then(
      () => null,
      (error) => error,
    )
    const second = routeRequest('NVDA')
    await flushMicrotasks()
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(1)

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    expect(await first).toBe(reason)
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toEqual([
      'NVDA:5',
    ])

    load.resolve({ data: data('NVDA', 180) })
    const secondResponse = await second
    expect(secondResponse.status).toBe(200)
    expect(secondResponse.headers.get('x-cache')).toBe('MISS')
    expect((await routeRequest('NVDA')).headers.get('x-cache')).toBe('HIT')
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(1)
  })

  it('times out shared provider work and fences its late result from a same-key retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const expiredLoad = deferred<{ data: StockIntradayOHLC }>()
    const replacementLoad = deferred<{ data: StockIntradayOHLC }>()
    mocks.getStockIntradayOHLC
      .mockReturnValueOnce(expiredLoad.promise)
      .mockReturnValueOnce(replacementLoad.promise)

    const expiredRequest = routeRequest('AAPL')
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(STOCK_INTRADAY_LOAD_TIMEOUT_MS)

    const timeoutResponse = await expiredRequest
    expect(timeoutResponse.status).toBe(504)
    expect(timeoutResponse.headers.get('cache-control')).toBe('no-store')
    await expect(timeoutResponse.json()).resolves.toEqual({
      error: 'Failed to load data for AAPL',
    })
    expect(getStockIntradayRouteStateForTests()).toEqual({
      cacheKeys: [],
      inFlightKeys: [],
    })

    const retry = routeRequest('AAPL')
    await flushMicrotasks()
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toEqual([
      'AAPL:5',
    ])

    expiredLoad.resolve({ data: data('AAPL', 101) })
    await flushMicrotasks()
    expect(getStockIntradayRouteStateForTests().cacheKeys).toEqual([])
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toEqual([
      'AAPL:5',
    ])

    replacementLoad.resolve({ data: data('AAPL', 102) })
    const retryResponse = await retry
    expect(retryResponse.status).toBe(200)
    expect(retryResponse.headers.get('x-cache')).toBe('MISS')
    expect((await retryResponse.json()).currentPrice).toBe(102)

    const hit = await routeRequest('AAPL')
    expect(hit.headers.get('x-cache')).toBe('HIT')
    expect((await hit.json()).currentPrice).toBe(102)
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(2)
  })

  it('recovers distinct-key capacity after every HTTP waiter aborts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const pending = Array.from(
      { length: STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES },
      () => deferred<{ data: StockIntradayOHLC }>(),
    )
    const recovery = deferred<{ data: StockIntradayOHLC }>()
    mocks.getStockIntradayOHLC.mockImplementation(() => {
      const callIndex = mocks.getStockIntradayOHLC.mock.calls.length - 1
      return callIndex < pending.length
        ? pending[callIndex].promise
        : recovery.promise
    })

    const controllers = pending.map(() => new AbortController())
    const requests = controllers.map((controller, index) =>
      routeRequest(
        `Q${String(index).padStart(3, '0')}`,
        '',
        controller.signal,
      ).then(
        () => null,
        (error) => error,
      ),
    )
    await flushMicrotasks()
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toHaveLength(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
    )

    const abortReason = new DOMException('All callers left', 'AbortError')
    controllers.forEach((controller) => controller.abort(abortReason))
    const abortResults = await Promise.all(requests)
    expect(abortResults.every((error) => error === abortReason)).toBe(true)
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toHaveLength(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES,
    )

    await vi.advanceTimersByTimeAsync(STOCK_INTRADAY_LOAD_TIMEOUT_MS)
    expect(getStockIntradayRouteStateForTests()).toEqual({
      cacheKeys: [],
      inFlightKeys: [],
    })

    const recoveredRequest = routeRequest('Z999')
    await flushMicrotasks()
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(
      STOCK_INTRADAY_INFLIGHT_MAX_ENTRIES + 1,
    )
    expect(getStockIntradayRouteStateForTests().inFlightKeys).toEqual([
      'Z999:5',
    ])
    recovery.resolve({ data: data('Z999', 999) })
    const recoveredResponse = await recoveredRequest
    expect(recoveredResponse.status).toBe(200)
    expect((await recoveredResponse.json()).currentPrice).toBe(999)

    pending.forEach((entry, index) => {
      entry.resolve({ data: data(`Q${String(index).padStart(3, '0')}`, index) })
    })
    await flushMicrotasks()
    expect(getStockIntradayRouteStateForTests()).toEqual({
      cacheKeys: ['Z999:5'],
      inFlightKeys: [],
    })
  })

  it('never caches provider errors, rejected loads, or partial data', async () => {
    mocks.getStockIntradayOHLC
      .mockResolvedValueOnce({ error: 'Provider unavailable' })
      .mockResolvedValueOnce({ data: { symbol: 'AAPL' } })
      .mockRejectedValueOnce(new Error('Socket closed'))
      .mockResolvedValueOnce({ data: data('AAPL', 104) })

    const providerError = await routeRequest('AAPL')
    expect(providerError.status).toBe(502)
    expect(providerError.headers.get('cache-control')).toBe('no-store')
    await expect(providerError.json()).resolves.toEqual({
      error: 'Provider unavailable',
    })

    const partial = await routeRequest('AAPL')
    expect(partial.status).toBe(502)
    await expect(partial.json()).resolves.toEqual({
      error: 'Failed to load data for AAPL',
    })

    const rejected = await routeRequest('AAPL')
    expect(rejected.status).toBe(502)
    await expect(rejected.json()).resolves.toEqual({
      error: 'Failed to load data for AAPL',
    })

    const retry = await routeRequest('AAPL')
    expect(retry.status).toBe(200)
    expect(retry.headers.get('x-cache')).toBe('MISS')
    expect((await retry.json()).currentPrice).toBe(104)
    expect((await routeRequest('AAPL')).headers.get('x-cache')).toBe('HIT')
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(4)
  })

  it('rejects and never caches a complete payload for the wrong symbol', async () => {
    mocks.getStockIntradayOHLC
      .mockResolvedValueOnce({ data: data('MSFT', 300) })
      .mockResolvedValueOnce({ data: data('AAPL', 105) })

    const mismatch = await routeRequest('AAPL')
    expect(mismatch.status).toBe(502)
    expect(mismatch.headers.get('cache-control')).toBe('no-store')
    await expect(mismatch.json()).resolves.toEqual({
      error: 'Failed to load data for AAPL',
    })

    const retry = await routeRequest('AAPL')
    expect(retry.status).toBe(200)
    expect(retry.headers.get('x-cache')).toBe('MISS')
    expect((await retry.json()).symbol).toBe('AAPL')
    expect(mocks.getStockIntradayOHLC).toHaveBeenCalledTimes(2)
  })
})
