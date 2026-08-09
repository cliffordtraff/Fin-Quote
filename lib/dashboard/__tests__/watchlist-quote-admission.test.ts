import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdmittedWatchlistQuotes,
  getWatchlistQuoteAdmissionStateForTests,
  parseWatchlistQuoteRequest,
  resetWatchlistQuoteAdmissionForTests,
  WATCHLIST_QUOTE_CACHE_MAX_ENTRIES,
  WATCHLIST_QUOTE_CACHE_TTL_MS,
  WATCHLIST_QUOTE_LOAD_TIMEOUT_MS,
  WATCHLIST_QUOTE_MAX_SYMBOLS,
  WATCHLIST_QUOTE_PHYSICAL_MAX,
  WatchlistQuoteCapacityError,
  WatchlistQuoteInputError,
  WatchlistQuoteLoadTimeoutError,
  WatchlistQuoteRuntimeContractError,
  type WatchlistQuote,
  type WatchlistQuoteLoader,
} from '@/lib/dashboard/watchlist-quote-admission'

function quote(symbol: string, price = 100): WatchlistQuote {
  return {
    symbol,
    name: `${symbol} Incorporated`,
    price,
    change: 1,
    changesPercentage: 1,
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

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-09T14:00:00.000Z')
  resetWatchlistQuoteAdmissionForTests()
})

afterEach(() => {
  resetWatchlistQuoteAdmissionForTests()
  vi.useRealTimers()
})

describe('watchlist quote request normalization', () => {
  it('canonicalizes, deduplicates, and preserves first-seen equity order', () => {
    expect(parseWatchlistQuoteRequest({
      symbols: [' aapl ', 'BRK-B', 'AAPL', 'brk.b', 'msft'],
    })).toEqual(['AAPL', 'BRK.B', 'MSFT'])
  })

  it.each([
    null,
    {},
    { symbols: [] },
    { symbols: ['ES=F'] },
    { symbols: ['AAPL!'] },
    { symbols: [1] },
    { symbols: ['AAPL'], extra: true },
    {
      symbols: Array.from(
        { length: WATCHLIST_QUOTE_MAX_SYMBOLS + 1 },
        (_, index) => `S${index}`,
      ),
    },
  ])('rejects malformed or non-equity payload %#', (input) => {
    expect(() => parseWatchlistQuoteRequest(input)).toThrow(
      WatchlistQuoteInputError,
    )
  })
})

describe('watchlist quote admission', () => {
  it('singleflights a canonical set, preserves caller order, and starts TTL at completion', async () => {
    const load = deferred<unknown>()
    const loader = vi.fn<WatchlistQuoteLoader>().mockReturnValue(load.promise)

    const first = getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader)
    const second = getAdmittedWatchlistQuotes(['MSFT', 'AAPL'], loader)
    await flushMicrotasks()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader.mock.calls[0][0]).toEqual(['AAPL', 'MSFT'])
    expect(loader.mock.calls[0][1]).toBeInstanceOf(AbortSignal)

    vi.setSystemTime('2026-08-09T14:00:03.000Z')
    load.resolve([quote('MSFT', 200), quote('AAPL', 100)])
    await expect(Promise.all([first, second])).resolves.toEqual([
      [quote('AAPL', 100), quote('MSFT', 200)],
      [quote('MSFT', 200), quote('AAPL', 100)],
    ])

    await expect(
      getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader),
    ).resolves.toEqual([quote('AAPL', 100), quote('MSFT', 200)])
    expect(loader).toHaveBeenCalledTimes(1)

    await expect(
      getAdmittedWatchlistQuotes(['MSFT', 'AAPL'], loader),
    ).resolves.toEqual([quote('MSFT', 200), quote('AAPL', 100)])
    expect(loader).toHaveBeenCalledTimes(1)

    vi.setSystemTime(
      new Date('2026-08-09T14:00:03.000Z').getTime() +
        WATCHLIST_QUOTE_CACHE_TTL_MS,
    )
    loader.mockResolvedValueOnce([quote('AAPL', 102), quote('MSFT', 202)])
    await expect(
      getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader),
    ).resolves.toEqual([quote('AAPL', 102), quote('MSFT', 202)])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('detaches an aborted waiter without cancelling a shared provider load', async () => {
    const load = deferred<unknown>()
    const providerSignals: AbortSignal[] = []
    const loader: WatchlistQuoteLoader = async (_symbols, signal) => {
      providerSignals.push(signal)
      return load.promise
    }
    const firstController = new AbortController()
    const first = getAdmittedWatchlistQuotes(
      ['AAPL'],
      loader,
      firstController.signal,
    )
    const second = getAdmittedWatchlistQuotes(['AAPL'], loader)
    await flushMicrotasks()

    const reason = new DOMException('Caller left.', 'AbortError')
    firstController.abort(reason)
    await expect(first).rejects.toBe(reason)
    expect(providerSignals[0]).not.toBe(firstController.signal)
    expect(providerSignals[0]?.aborted).toBe(false)

    load.resolve([quote('AAPL')])
    await expect(second).resolves.toEqual([quote('AAPL')])
  })

  it('never caches partial, duplicate, wrong-symbol, zero, nonfinite, or transient batches', async () => {
    const loader = vi
      .fn<WatchlistQuoteLoader>()
      .mockResolvedValueOnce([quote('AAPL')])
      .mockResolvedValueOnce([quote('AAPL'), quote('AAPL')])
      .mockResolvedValueOnce([quote('AAPL'), quote('TSLA')])
      .mockResolvedValueOnce([quote('AAPL', 0), quote('MSFT')])
      .mockResolvedValueOnce([
        quote('AAPL'),
        { ...quote('MSFT'), changesPercentage: Number.NaN },
      ])
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce([quote('AAPL'), quote('MSFT')])

    for (let index = 0; index < 5; index += 1) {
      await expect(
        getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader),
      ).rejects.toBeInstanceOf(WatchlistQuoteRuntimeContractError)
      expect(getWatchlistQuoteAdmissionStateForTests().cacheKeys).toEqual([])
    }
    await expect(
      getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader),
    ).rejects.toThrow('provider unavailable')
    expect(getWatchlistQuoteAdmissionStateForTests().cacheKeys).toEqual([])

    await expect(
      getAdmittedWatchlistQuotes(['AAPL', 'MSFT'], loader),
    ).resolves.toEqual([quote('AAPL'), quote('MSFT')])
    expect(loader).toHaveBeenCalledTimes(7)
  })

  it('retains abort-ignoring timed-out work as physical capacity until settlement', async () => {
    const loads = Array.from(
      { length: WATCHLIST_QUOTE_PHYSICAL_MAX },
      () => deferred<unknown>(),
    )
    const signals: AbortSignal[] = []
    const loader = vi.fn<WatchlistQuoteLoader>((_symbols, signal) => {
      signals.push(signal)
      return loads[signals.length - 1].promise
    })
    const requests = loads.map((_load, index) =>
      getAdmittedWatchlistQuotes([`Q${index}`], loader),
    )
    const settled = Promise.allSettled(requests)
    await flushMicrotasks()

    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      outstandingCount: WATCHLIST_QUOTE_PHYSICAL_MAX,
      timedOutOrphanCount: 0,
    })
    await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_LOAD_TIMEOUT_MS)
    const results = await settled
    expect(
      results.every(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof WatchlistQuoteLoadTimeoutError,
      ),
    ).toBe(true)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      inFlightKeys: loads.map((_load, index) => `["Q${index}"]`),
      outstandingCount: WATCHLIST_QUOTE_PHYSICAL_MAX,
      timedOutOrphanCount: WATCHLIST_QUOTE_PHYSICAL_MAX,
    })

    await expect(
      getAdmittedWatchlistQuotes(['RECOVER'], loader),
    ).rejects.toBeInstanceOf(WatchlistQuoteCapacityError)
    expect(loader).toHaveBeenCalledTimes(WATCHLIST_QUOTE_PHYSICAL_MAX)

    loads[0].resolve([quote('Q0')])
    await flushMicrotasks()
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      outstandingCount: WATCHLIST_QUOTE_PHYSICAL_MAX - 1,
      timedOutOrphanCount: WATCHLIST_QUOTE_PHYSICAL_MAX - 1,
    })

    loader.mockResolvedValueOnce([quote('RECOVER')])
    await expect(
      getAdmittedWatchlistQuotes(['RECOVER'], loader),
    ).resolves.toEqual([quote('RECOVER')])

    loads.slice(1).forEach((load, index) => load.resolve([quote(`Q${index + 1}`)]))
    await flushMicrotasks()
  })

  it('retains a timed-out same key until settlement and fences its late cache write', async () => {
    const expired = deferred<unknown>()
    const replacement = deferred<unknown>()
    const loader = vi
      .fn<WatchlistQuoteLoader>()
      .mockReturnValueOnce(expired.promise)
      .mockReturnValueOnce(replacement.promise)

    const expiredRequest = getAdmittedWatchlistQuotes(['AAPL'], loader)
    const expiredResult = expiredRequest.catch((error) => error)
    await flushMicrotasks()
    const expiredSignal = loader.mock.calls[0][1]
    await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_LOAD_TIMEOUT_MS)
    expect(await expiredResult).toBeInstanceOf(WatchlistQuoteLoadTimeoutError)
    expect(expiredSignal.aborted).toBe(true)

    await expect(
      getAdmittedWatchlistQuotes(['AAPL'], loader),
    ).rejects.toBeInstanceOf(WatchlistQuoteLoadTimeoutError)
    expect(loader).toHaveBeenCalledTimes(1)

    expired.resolve([quote('AAPL', 101)])
    await flushMicrotasks()
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      cacheKeys: [],
      inFlightKeys: [],
      outstandingCount: 0,
      timedOutOrphanCount: 0,
    })

    const retry = getAdmittedWatchlistQuotes(['AAPL'], loader)
    await flushMicrotasks()
    replacement.resolve([quote('AAPL', 102)])
    await expect(retry).resolves.toEqual([quote('AAPL', 102)])
    await expect(
      getAdmittedWatchlistQuotes(['AAPL'], loader),
    ).resolves.toEqual([quote('AAPL', 102)])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('generation-fences physical work that settles after a state reset', async () => {
    const priorGeneration = deferred<unknown>()
    const currentGeneration = deferred<unknown>()
    const loader = vi
      .fn<WatchlistQuoteLoader>()
      .mockReturnValueOnce(priorGeneration.promise)
      .mockReturnValueOnce(currentGeneration.promise)

    const priorRequest = getAdmittedWatchlistQuotes(['AAPL'], loader)
    const priorResult = priorRequest.catch((error) => error)
    await flushMicrotasks()
    resetWatchlistQuoteAdmissionForTests()
    expect(await priorResult).toBeInstanceOf(Error)

    const currentRequest = getAdmittedWatchlistQuotes(['AAPL'], loader)
    await flushMicrotasks()
    priorGeneration.resolve([quote('AAPL', 101)])
    await flushMicrotasks()
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      cacheKeys: [],
      inFlightKeys: ['["AAPL"]'],
      outstandingCount: 1,
    })

    currentGeneration.resolve([quote('AAPL', 102)])
    await expect(currentRequest).resolves.toEqual([quote('AAPL', 102)])
    await expect(
      getAdmittedWatchlistQuotes(['AAPL'], loader),
    ).resolves.toEqual([quote('AAPL', 102)])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('uses access-order LRU eviction for completed valid batches', async () => {
    const loader = vi.fn<WatchlistQuoteLoader>((symbols) =>
      Promise.resolve([quote(symbols[0])]),
    )

    for (let index = 0; index < WATCHLIST_QUOTE_CACHE_MAX_ENTRIES; index += 1) {
      await getAdmittedWatchlistQuotes([`S${index}`], loader)
    }
    await getAdmittedWatchlistQuotes(['S0'], loader)
    await getAdmittedWatchlistQuotes(['EXTRA'], loader)

    const keys = getWatchlistQuoteAdmissionStateForTests().cacheKeys
    expect(keys).toHaveLength(WATCHLIST_QUOTE_CACHE_MAX_ENTRIES)
    expect(keys).toContain('["S0"]')
    expect(keys).toContain('["EXTRA"]')
    expect(keys).not.toContain('["S1"]')
  })
})
