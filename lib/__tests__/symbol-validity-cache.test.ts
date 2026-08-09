import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSymbolValidityCacheStateForTests,
  leaseSymbolValidityLoad,
  readSymbolValidityCache,
  resetSymbolValidityCacheForTests,
  SYMBOL_VALIDITY_CACHE_MAX_ENTRIES,
  SYMBOL_VALIDITY_CACHE_TTL_MS,
  SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES,
  SYMBOL_VALIDITY_LOAD_TIMEOUT_MS,
  SymbolValidityLoadTimeoutError,
  type CacheableSymbolValidity,
} from '@/lib/symbol-validity-cache'

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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-08T15:00:00.000Z')
  resetSymbolValidityCacheForTests()
})

afterEach(() => {
  resetSymbolValidityCacheForTests()
  vi.useRealTimers()
})

describe('symbol validity cache', () => {
  it('coalesces matching keys and starts the TTL at completion', async () => {
    const load = deferred<CacheableSymbolValidity>()
    const loader = vi.fn(() => load.promise)
    const first = leaseSymbolValidityLoad('AAPL', loader)
    const second = leaseSymbolValidityLoad('AAPL', loader)

    expect(first.status).toBe('started')
    expect(second.status).toBe('joined')
    await flushMicrotasks()
    expect(loader).toHaveBeenCalledTimes(1)

    vi.setSystemTime('2026-08-08T15:00:05.000Z')
    load.resolve('valid')
    if (first.status === 'capacity' || second.status === 'capacity') {
      throw new Error('Unexpected capacity result')
    }
    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
      'valid',
      'valid',
    ])

    const completedAt = Date.now()
    expect(readSymbolValidityCache('AAPL', completedAt)).toBe('valid')
    expect(
      readSymbolValidityCache(
        'AAPL',
        completedAt + SYMBOL_VALIDITY_CACHE_TTL_MS - 1,
      ),
    ).toBe('valid')
    expect(
      readSymbolValidityCache(
        'AAPL',
        completedAt + SYMBOL_VALIDITY_CACHE_TTL_MS,
      ),
    ).toBeNull()
  })

  it('hard-caps physical loads across timeout waves and recovers only when an abandoned load settles', async () => {
    const signals: AbortSignal[] = []
    const loads = Array.from(
      { length: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES },
      () => deferred<CacheableSymbolValidity>(),
    )
    let physicalStarts = 0
    const leases = Array.from(
      { length: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES },
      (_, index) => leaseSymbolValidityLoad(`SYM${index}`, (signal) => {
        signals.push(signal)
        physicalStarts += 1
        return loads[index].promise
      }),
    )
    await flushMicrotasks()

    expect(getSymbolValidityCacheStateForTests().inFlightKeys).toHaveLength(
      SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES,
    )
    expect(
      leaseSymbolValidityLoad('OVER_CAPACITY', async () => 'valid'),
    ).toEqual({ status: 'capacity' })
    expect(
      leaseSymbolValidityLoad('SYM0', async () => 'valid').status,
    ).toBe('joined')

    const settled = Promise.allSettled(
      leases.flatMap((lease) =>
        lease.status === 'capacity' ? [] : [lease.promise]
      ),
    )
    await vi.advanceTimersByTimeAsync(SYMBOL_VALIDITY_LOAD_TIMEOUT_MS)
    const results = await settled

    expect(results).toHaveLength(SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES)
    expect(results.every((result) =>
      result.status === 'rejected' &&
      result.reason instanceof SymbolValidityLoadTimeoutError
    )).toBe(true)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(getSymbolValidityCacheStateForTests()).toMatchObject({
      inFlightKeys: [],
      outstandingCount: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES,
      abandonedCount: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES,
    })

    const secondWave = Array.from(
      { length: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES },
      (_, index) => leaseSymbolValidityLoad(
        `RETRY${index}`,
        async () => {
          physicalStarts += 1
          return 'valid'
        },
      ),
    )
    expect(secondWave.every((lease) => lease.status === 'capacity')).toBe(true)
    expect(physicalStarts).toBe(SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES)

    loads[0].resolve('valid')
    await flushMicrotasks()
    expect(getSymbolValidityCacheStateForTests()).toMatchObject({
      outstandingCount: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES - 1,
      abandonedCount: SYMBOL_VALIDITY_INFLIGHT_MAX_ENTRIES - 1,
    })

    const recovered = leaseSymbolValidityLoad('RECOVERED', async () => 'valid')
    expect(recovered.status).toBe('started')
    expect(
      leaseSymbolValidityLoad('STILL_FULL', async () => 'valid').status,
    ).toBe('capacity')
    if (recovered.status !== 'capacity') {
      await expect(recovered.promise).resolves.toBe('valid')
    }
  })

  it('fences a timed-out late result from a replacement lease', async () => {
    const expiredLoad = deferred<CacheableSymbolValidity>()
    const replacementLoad = deferred<CacheableSymbolValidity>()
    const expired = leaseSymbolValidityLoad('AAPL', () => expiredLoad.promise)
    if (expired.status === 'capacity') throw new Error('Unexpected capacity result')
    const expiredResult = expired.promise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(SYMBOL_VALIDITY_LOAD_TIMEOUT_MS)
    await expect(expiredResult).resolves.toBeInstanceOf(
      SymbolValidityLoadTimeoutError,
    )

    const replacement = leaseSymbolValidityLoad(
      'AAPL',
      () => replacementLoad.promise,
    )
    if (replacement.status === 'capacity') {
      throw new Error('Unexpected capacity result')
    }

    expiredLoad.resolve('valid')
    await flushMicrotasks()
    expect(readSymbolValidityCache('AAPL', Date.now())).toBeNull()
    expect(getSymbolValidityCacheStateForTests().inFlightKeys).toEqual(['AAPL'])

    replacementLoad.resolve('not_found')
    await expect(replacement.promise).resolves.toBe('not_found')
    expect(readSymbolValidityCache('AAPL', Date.now())).toBe('not_found')
  })

  it('bounds completed entries with LRU eviction', async () => {
    for (let index = 0; index <= SYMBOL_VALIDITY_CACHE_MAX_ENTRIES; index += 1) {
      const lease = leaseSymbolValidityLoad(
        `SYM${index}`,
        async () => 'valid',
      )
      if (lease.status === 'capacity') throw new Error('Unexpected capacity result')
      await lease.promise
    }

    const state = getSymbolValidityCacheStateForTests()
    expect(state.cacheKeys).toHaveLength(SYMBOL_VALIDITY_CACHE_MAX_ENTRIES)
    expect(state.cacheKeys).not.toContain('SYM0')
    expect(state.cacheKeys.at(-1)).toBe(
      `SYM${SYMBOL_VALIDITY_CACHE_MAX_ENTRIES}`,
    )
  })
})
