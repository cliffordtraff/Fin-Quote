import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderQuote, QuoteRequestOptions } from '@/lib/providers/types'

const mocks = vi.hoisted(() => ({
  getQuote: vi.fn(),
  getCurrentMarketSession: vi.fn(() => 'regular'),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: () => ({ getQuote: mocks.getQuote }),
}))

vi.mock('@/lib/market-utils', () => ({
  getCurrentMarketSession: mocks.getCurrentMarketSession,
}))

import { GET } from '@/app/api/quote/[symbol]/route'
import {
  getQuoteRouteStateForTests,
  QUOTE_ROUTE_CACHE_MAX_ENTRIES,
  QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES,
  QUOTE_ROUTE_LOAD_TIMEOUT_MS,
  resetQuoteRouteStateForTests,
} from '@/lib/quote-route-cache'

const SUCCESS_CACHE_CONTROL =
  'public, max-age=0, s-maxage=4, stale-while-revalidate=1'

function quote(symbol: string, price = 100): ProviderQuote {
  return {
    symbol,
    name: `${symbol} Inc.`,
    price,
    change: 1,
    changesPercentage: 1,
    previousClose: price - 1,
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

async function flushMicrotasks(turns = 4): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

function routeRequest(symbol: string, signal?: AbortSignal) {
  const request = new Request(
    `https://theintraday.com/api/quote/${encodeURIComponent(symbol)}`,
    { signal },
  )
  return GET(request, { params: Promise.resolve({ symbol }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetQuoteRouteStateForTests()
  mocks.getQuote.mockImplementation(async (symbol: string) => quote(symbol))
  mocks.getCurrentMarketSession.mockReturnValue('regular')
})

afterEach(() => {
  resetQuoteRouteStateForTests()
  vi.useRealTimers()
})

describe('GET /api/quote/[symbol]', () => {
  it('canonicalizes symbols, opts into detached live provider work, and returns 4s headers', async () => {
    const caller = new AbortController()
    const response = await routeRequest('brk-b', caller.signal)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(SUCCESS_CACHE_CONTROL)
    expect(response.headers.get('x-cache')).toBe('MISS')
    await expect(response.json()).resolves.toEqual({
      price: 100,
      change: 1,
      changesPercentage: 1,
      previousClose: 99,
      marketStatus: 'open',
    })

    expect(mocks.getQuote).toHaveBeenCalledTimes(1)
    const [symbol, options] = mocks.getQuote.mock.calls[0] as [
      string,
      QuoteRequestOptions,
    ]
    expect(symbol).toBe('BRK.B')
    expect(options).toMatchObject({ freshness: 'live' })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal).not.toBe(caller.signal)
  })

  it('accepts a legitimate negative commodity-futures quote while still rejecting zero', async () => {
    mocks.getQuote.mockResolvedValueOnce(quote('CL=F', -37.63))

    const response = await routeRequest('CL=F')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(SUCCESS_CACHE_CONTROL)
    await expect(response.json()).resolves.toMatchObject({ price: -37.63 })
  })

  it('rejects invalid and malformed encoded symbols without invoking a provider', async () => {
    for (const symbol of ['', '%', '../AAPL', 'AAPL!', 'A'.repeat(20)]) {
      const response = await routeRequest(symbol)
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({ error: 'Invalid symbol' })
    }
    expect(mocks.getQuote).not.toHaveBeenCalled()
  })

  it('coalesces misses while one waiter aborts without canceling shared work', async () => {
    const load = deferred<ProviderQuote | null>()
    mocks.getQuote.mockReturnValue(load.promise)
    const controller = new AbortController()
    const first = routeRequest('AAPL', controller.signal).then(
      () => null,
      (error) => error,
    )
    const second = routeRequest('AAPL')
    await flushMicrotasks()

    expect(mocks.getQuote).toHaveBeenCalledTimes(1)
    const providerSignal = (mocks.getQuote.mock.calls[0][1] as QuoteRequestOptions).signal!
    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    expect(await first).toBe(reason)
    expect(providerSignal.aborted).toBe(false)

    load.resolve(quote('AAPL', 101))
    const secondResponse = await second
    expect(secondResponse.status).toBe(200)
    expect(secondResponse.headers.get('x-cache')).toBe('MISS')
    const hit = await routeRequest('AAPL')
    expect(hit.headers.get('x-cache')).toBe('HIT')
    expect(hit.headers.get('cache-control')).toBe(SUCCESS_CACHE_CONTROL)
    expect(mocks.getQuote).toHaveBeenCalledTimes(1)
  })

  it('uses completion time for the absolute TTL and expires at four seconds', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-08T14:00:00.000Z')
    vi.setSystemTime(startedAt)
    const firstLoad = deferred<ProviderQuote | null>()
    mocks.getQuote
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce(quote('AAPL', 102))

    const first = routeRequest('AAPL')
    await flushMicrotasks()
    vi.setSystemTime(startedAt.getTime() + 3_000)
    firstLoad.resolve(quote('AAPL', 101))
    expect((await first).headers.get('x-cache')).toBe('MISS')

    vi.setSystemTime(startedAt.getTime() + 6_999)
    const beforeExpiry = await routeRequest('AAPL')
    expect(beforeExpiry.headers.get('x-cache')).toBe('HIT')
    expect((await beforeExpiry.json()).price).toBe(101)

    vi.setSystemTime(startedAt.getTime() + 7_000)
    const atExpiry = await routeRequest('AAPL')
    expect(atExpiry.headers.get('x-cache')).toBe('MISS')
    expect((await atExpiry.json()).price).toBe(102)
    expect(mocks.getQuote).toHaveBeenCalledTimes(2)
  })

  it('does not cache missing, rejected, or incomplete provider results', async () => {
    mocks.getQuote
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce(quote('MSFT'))
      .mockResolvedValueOnce({ ...quote('AAPL'), price: Number.NaN })
      .mockResolvedValueOnce(quote('AAPL', 0))
      .mockResolvedValueOnce(quote('AAPL', 104))

    const missing = await routeRequest('AAPL')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')

    const rejected = await routeRequest('AAPL')
    expect(rejected.status).toBe(502)
    expect(rejected.headers.get('cache-control')).toBe('no-store')

    const wrongSymbol = await routeRequest('AAPL')
    expect(wrongSymbol.status).toBe(502)
    expect(wrongSymbol.headers.get('cache-control')).toBe('no-store')

    const nonFinite = await routeRequest('AAPL')
    expect(nonFinite.status).toBe(502)
    expect(nonFinite.headers.get('cache-control')).toBe('no-store')

    const zeroPrice = await routeRequest('AAPL')
    expect(zeroPrice.status).toBe(502)
    expect(zeroPrice.headers.get('cache-control')).toBe('no-store')

    const retry = await routeRequest('AAPL')
    expect(retry.status).toBe(200)
    expect(retry.headers.get('x-cache')).toBe('MISS')
    expect(mocks.getQuote).toHaveBeenCalledTimes(6)
  })

  it('enforces a hard completed LRU cap and promotes cache hits', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')

    for (let index = 0; index < QUOTE_ROUTE_CACHE_MAX_ENTRIES; index += 1) {
      const symbol = `S${String(index).padStart(4, '0')}`
      expect((await routeRequest(symbol)).status).toBe(200)
    }
    expect(getQuoteRouteStateForTests().cacheKeys).toHaveLength(
      QUOTE_ROUTE_CACHE_MAX_ENTRIES,
    )

    expect((await routeRequest('S0000')).headers.get('x-cache')).toBe('HIT')
    expect((await routeRequest('S0500')).headers.get('x-cache')).toBe('MISS')
    const keys = getQuoteRouteStateForTests().cacheKeys
    expect(keys).toHaveLength(QUOTE_ROUTE_CACHE_MAX_ENTRIES)
    expect(keys).toContain('S0000')
    expect(keys).toContain('S0500')
    expect(keys).not.toContain('S0001')
  })

  it('fails closed at unique in-flight capacity while allowing same-key joins', async () => {
    const pending = Array.from(
      { length: QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES },
      () => deferred<ProviderQuote | null>(),
    )
    mocks.getQuote.mockImplementation(
      () => pending[mocks.getQuote.mock.calls.length - 1].promise,
    )

    const requests = pending.map((_entry, index) =>
      routeRequest(`Q${String(index).padStart(3, '0')}`),
    )
    await flushMicrotasks()
    expect(getQuoteRouteStateForTests().inFlightKeys).toHaveLength(
      QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES,
    )

    const join = routeRequest('Q000')
    const capacity = await routeRequest('Z999')
    expect(capacity.status).toBe(503)
    expect(capacity.headers.get('cache-control')).toBe('no-store')
    expect(capacity.headers.get('retry-after')).toBe('1')
    expect(mocks.getQuote).toHaveBeenCalledTimes(QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES)

    pending.forEach((entry, index) => {
      entry.resolve(quote(`Q${String(index).padStart(3, '0')}`))
    })
    const responses = await Promise.all([...requests, join])
    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(getQuoteRouteStateForTests().inFlightKeys).toEqual([])
  })

  it('times out detached work and fences its late result from a same-key retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const expiredLoad = deferred<ProviderQuote | null>()
    const replacementLoad = deferred<ProviderQuote | null>()
    mocks.getQuote
      .mockReturnValueOnce(expiredLoad.promise)
      .mockReturnValueOnce(replacementLoad.promise)

    const expiredRequest = routeRequest('AAPL')
    await flushMicrotasks()
    const expiredSignal = (mocks.getQuote.mock.calls[0][1] as QuoteRequestOptions).signal!
    await vi.advanceTimersByTimeAsync(QUOTE_ROUTE_LOAD_TIMEOUT_MS)

    const timeout = await expiredRequest
    expect(timeout.status).toBe(504)
    expect(timeout.headers.get('cache-control')).toBe('no-store')
    expect(expiredSignal.aborted).toBe(true)
    expect(getQuoteRouteStateForTests()).toEqual({ cacheKeys: [], inFlightKeys: [] })

    const retry = routeRequest('AAPL')
    await flushMicrotasks()
    expiredLoad.resolve(quote('AAPL', 101))
    await flushMicrotasks()
    expect(getQuoteRouteStateForTests()).toEqual({
      cacheKeys: [],
      inFlightKeys: ['AAPL'],
    })

    replacementLoad.resolve(quote('AAPL', 102))
    const retryResponse = await retry
    expect(retryResponse.status).toBe(200)
    expect((await retryResponse.json()).price).toBe(102)
    expect((await routeRequest('AAPL')).headers.get('x-cache')).toBe('HIT')
  })

  it('recovers full capacity after every HTTP waiter leaves and every provider hangs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const pending = Array.from(
      { length: QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES },
      () => deferred<ProviderQuote | null>(),
    )
    const recovery = deferred<ProviderQuote | null>()
    mocks.getQuote.mockImplementation(() => {
      const callIndex = mocks.getQuote.mock.calls.length - 1
      return callIndex < pending.length
        ? pending[callIndex].promise
        : recovery.promise
    })

    const controllers = pending.map(() => new AbortController())
    const requests = controllers.map((controller, index) =>
      routeRequest(`Q${String(index).padStart(3, '0')}`, controller.signal).then(
        () => null,
        (error) => error,
      ),
    )
    await flushMicrotasks()
    expect(getQuoteRouteStateForTests().inFlightKeys).toHaveLength(
      QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES,
    )

    const reason = new DOMException('All callers left', 'AbortError')
    controllers.forEach((controller) => controller.abort(reason))
    const abortResults = await Promise.all(requests)
    expect(abortResults.every((error) => error === reason)).toBe(true)
    expect(getQuoteRouteStateForTests().inFlightKeys).toHaveLength(
      QUOTE_ROUTE_INFLIGHT_MAX_ENTRIES,
    )

    await vi.advanceTimersByTimeAsync(QUOTE_ROUTE_LOAD_TIMEOUT_MS)
    expect(getQuoteRouteStateForTests()).toEqual({ cacheKeys: [], inFlightKeys: [] })
    for (const [, options] of mocks.getQuote.mock.calls) {
      expect((options as QuoteRequestOptions).signal?.aborted).toBe(true)
    }

    const recoveredRequest = routeRequest('Z999')
    await flushMicrotasks()
    expect(getQuoteRouteStateForTests().inFlightKeys).toEqual(['Z999'])
    recovery.resolve(quote('Z999', 999))
    expect((await recoveredRequest).status).toBe(200)

    pending.forEach((entry, index) => {
      entry.resolve(quote(`Q${String(index).padStart(3, '0')}`, index))
    })
    await flushMicrotasks()
    expect(getQuoteRouteStateForTests()).toEqual({
      cacheKeys: ['Z999'],
      inFlightKeys: [],
    })
  })
})
