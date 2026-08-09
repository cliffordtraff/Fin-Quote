import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdmittedStockSearch,
  getStockSearchAdmissionStateForTests,
  resetStockSearchAdmissionForTests,
  STOCK_SEARCH_CACHE_MAX_ENTRIES,
  STOCK_SEARCH_CACHE_TTL_MS,
  STOCK_SEARCH_LOAD_TIMEOUT_MS,
  STOCK_SEARCH_PHYSICAL_MAX,
  StockSearchCapacityError,
  StockSearchLoadTimeoutError,
  StockSearchRuntimeContractError,
  type StockSearchLoader,
} from '@/lib/stock-search-admission'
import type { StockSearchOutcome } from '@/lib/stock-search-contract'

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

function primary(symbol = 'AAPL'): StockSearchOutcome {
  return {
    results: [{ symbol, name: `${symbol} Corporation` }],
    source: 'primary',
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-09T12:00:00.000Z')
  resetStockSearchAdmissionForTests()
})

afterEach(() => {
  resetStockSearchAdmissionForTests()
  vi.useRealTimers()
})

describe('stock-search admission', () => {
  it('singleflights case-equivalent searches and starts the cache TTL at completion', async () => {
    const load = deferred<StockSearchOutcome>()
    const loader = vi.fn<StockSearchLoader>().mockReturnValue(load.promise)

    const first = getAdmittedStockSearch('Apple Inc', loader)
    const second = getAdmittedStockSearch('APPLE INC', loader)
    await flushMicrotasks()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader.mock.calls[0][1]).toBeInstanceOf(AbortSignal)

    vi.setSystemTime('2026-08-09T12:00:03.000Z')
    load.resolve(primary())
    await expect(Promise.all([first, second])).resolves.toEqual([
      primary(),
      primary(),
    ])

    await expect(getAdmittedStockSearch('apple inc', loader)).resolves.toEqual(
      primary(),
    )
    expect(loader).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(STOCK_SEARCH_CACHE_TTL_MS)
    loader.mockResolvedValueOnce(primary('MSFT'))
    await expect(getAdmittedStockSearch('Apple Inc', loader)).resolves.toEqual(
      primary('MSFT'),
    )
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('never caches degraded, failed, or runtime-invalid outcomes', async () => {
    const loader = vi
      .fn<StockSearchLoader>()
      .mockResolvedValueOnce({
        results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
        source: 'fallback',
      })
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce({ results: [{ symbol: '', name: '' }], source: 'primary' })
      .mockResolvedValueOnce(primary())

    await expect(getAdmittedStockSearch('A', loader)).resolves.toMatchObject({
      source: 'fallback',
    })
    await expect(getAdmittedStockSearch('A', loader)).rejects.toThrow(
      'database down',
    )
    await expect(getAdmittedStockSearch('A', loader)).rejects.toBeInstanceOf(
      StockSearchRuntimeContractError,
    )
    await expect(getAdmittedStockSearch('A', loader)).resolves.toEqual(primary())
    expect(loader).toHaveBeenCalledTimes(4)
  })

  it('detaches an aborted waiter without cancelling shared physical work', async () => {
    const load = deferred<StockSearchOutcome>()
    const internalSignals: AbortSignal[] = []
    const loader: StockSearchLoader = async (_query, signal) => {
      internalSignals.push(signal)
      return load.promise
    }
    const firstController = new AbortController()
    const first = getAdmittedStockSearch('AAPL', loader, firstController.signal)
    const second = getAdmittedStockSearch('AAPL', loader)
    await flushMicrotasks()

    const reason = new DOMException('caller left', 'AbortError')
    firstController.abort(reason)
    await expect(first).rejects.toBe(reason)
    expect(internalSignals[0]?.aborted).toBe(false)

    load.resolve(primary())
    await expect(second).resolves.toEqual(primary())
  })

  it('hard-caps timeout waves while abort-resistant work retains physical slots', async () => {
    const loads = Array.from(
      { length: STOCK_SEARCH_PHYSICAL_MAX },
      () => deferred<StockSearchOutcome>(),
    )
    const signals: AbortSignal[] = []
    const loader = vi.fn<StockSearchLoader>((_query, signal) => {
      signals.push(signal)
      return loads[signals.length - 1].promise
    })

    const firstWave = Array.from({ length: 200 }, (_, index) =>
      getAdmittedStockSearch(`Q${index}`, loader),
    )
    const firstWaveSettled = Promise.allSettled(firstWave)
    await flushMicrotasks()

    expect(loader).toHaveBeenCalledTimes(STOCK_SEARCH_PHYSICAL_MAX)
    expect(getStockSearchAdmissionStateForTests()).toMatchObject({
      outstandingCount: STOCK_SEARCH_PHYSICAL_MAX,
    })

    await vi.advanceTimersByTimeAsync(STOCK_SEARCH_LOAD_TIMEOUT_MS)
    const firstResults = await firstWaveSettled
    expect(
      firstResults.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof StockSearchLoadTimeoutError,
      ),
    ).toHaveLength(STOCK_SEARCH_PHYSICAL_MAX)
    expect(
      firstResults.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof StockSearchCapacityError,
      ),
    ).toHaveLength(200 - STOCK_SEARCH_PHYSICAL_MAX)
    expect(signals.every((signal) => signal.aborted)).toBe(true)

    const sameTimedOutKey = getAdmittedStockSearch('Q0', loader)
    await expect(sameTimedOutKey).rejects.toBeInstanceOf(
      StockSearchLoadTimeoutError,
    )
    const secondWave = await Promise.allSettled(
      Array.from({ length: 200 }, (_, index) =>
        getAdmittedStockSearch(`R${index}`, loader),
      ),
    )
    expect(
      secondWave.every(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof StockSearchCapacityError,
      ),
    ).toBe(true)
    expect(loader).toHaveBeenCalledTimes(STOCK_SEARCH_PHYSICAL_MAX)

    loads[0].resolve(primary('AAPL'))
    await flushMicrotasks()
    expect(getStockSearchAdmissionStateForTests().outstandingCount).toBe(
      STOCK_SEARCH_PHYSICAL_MAX - 1,
    )

    loader.mockResolvedValueOnce(primary('MSFT'))
    await expect(getAdmittedStockSearch('RECOVER', loader)).resolves.toEqual(
      primary('MSFT'),
    )
    expect(loader).toHaveBeenCalledTimes(STOCK_SEARCH_PHYSICAL_MAX + 1)
  })

  it('keeps the complete-primary LRU physically bounded', async () => {
    const loader = vi.fn<StockSearchLoader>((query) =>
      Promise.resolve(primary(query)),
    )

    for (let index = 0; index <= STOCK_SEARCH_CACHE_MAX_ENTRIES; index += 1) {
      await getAdmittedStockSearch(`A${index}`, loader)
    }

    const state = getStockSearchAdmissionStateForTests()
    expect(state.cacheKeys).toHaveLength(STOCK_SEARCH_CACHE_MAX_ENTRIES)
    expect(state.cacheKeys).not.toContain('A0')
  })
})
