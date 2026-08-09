import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPulseTextContext,
  getPulseTextContextCacheStateForTests,
  PULSE_TEXT_CONTEXT_CACHE_MAX_ENTRIES,
  PULSE_TEXT_CONTEXT_CACHE_TTL_MS,
  PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS,
  PulseTextContextCapacityError,
  PulseTextContextLoadTimeoutError,
  resetPulseTextContextCacheForTests,
} from '@/lib/pulse-text-context-cache'
import {
  parsePulseTextContext,
  parsePulseTextSymbol,
  PULSE_TEXT_SYMBOLS,
  type PulseTextContext,
  type PulseTextSymbol,
} from '@/lib/pulse-text-context'

function context(symbol: PulseTextSymbol, suffix = ''): PulseTextContext {
  return {
    news: [{
      title: `${symbol} headline${suffix}`,
      publishedDate: '2026-08-09T12:00:00.000Z',
      site: 'The Intraday',
      url: `https://example.com/${symbol.toLowerCase()}${suffix}`,
    }],
    profile: {
      symbol,
      companyName: `${symbol} Company${suffix}`,
      description: 'A useful company description.',
      sector: 'Technology',
      industry: 'Software',
      exchange: 'NASDAQ',
      fullTimeEmployees: 10_000,
      ipoDate: '2004-08-19',
      country: 'US',
      city: 'New York',
    },
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

async function flushMicrotasks(turns = 5): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-09T12:00:00.000Z')
  resetPulseTextContextCacheForTests()
})

afterEach(() => {
  resetPulseTextContextCacheForTests()
  vi.useRealTimers()
})

describe('pulse text-context contract', () => {
  it('shares one exact symbol allowlist and bounds all public fields', () => {
    expect(PULSE_TEXT_SYMBOLS).toEqual(['GOOGL', 'AAPL', 'NVDA', 'TSLA'])
    expect(parsePulseTextSymbol('aapl')).toBe('AAPL')
    expect(parsePulseTextSymbol('MSFT')).toBeNull()
    expect(parsePulseTextSymbol(' AAPL')).toBeNull()

    const oversized = context('AAPL') as unknown as Record<string, unknown>
    oversized.news = Array.from({ length: 8 }, (_, index) => ({
      title: `${index}-${'x'.repeat(400)}`,
      publishedDate: 'p'.repeat(100),
      site: 's'.repeat(200),
      url: `https://example.com/${index}`,
    }))
    const profile = (oversized.profile as Record<string, unknown>)
    profile.companyName = 'c'.repeat(300)
    profile.description = 'd'.repeat(5_000)

    const parsed = parsePulseTextContext(oversized, 'AAPL')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.news).toHaveLength(3)
    expect(parsed.value.news[0].title).toHaveLength(240)
    expect(parsed.value.news[0].publishedDate).toHaveLength(64)
    expect(parsed.value.news[0].site).toHaveLength(120)
    expect(parsed.value.profile?.companyName).toHaveLength(160)
    expect(parsed.value.profile?.description).toHaveLength(4_000)
  })

  it('rejects malformed news, unsafe URLs, mismatched profiles, and non-finite employees', () => {
    expect(parsePulseTextContext({ news: [{}], profile: null }, 'AAPL').ok).toBe(false)
    expect(parsePulseTextContext({
      news: [{
        title: 'Unsafe',
        publishedDate: '',
        site: '',
        url: 'javascript:alert(1)',
      }],
      profile: null,
    }, 'AAPL').ok).toBe(false)
    expect(parsePulseTextContext({
      ...context('AAPL'),
      profile: { ...context('AAPL').profile, symbol: 'NVDA' },
    }, 'AAPL').ok).toBe(false)
    expect(parsePulseTextContext({
      ...context('AAPL'),
      profile: { ...context('AAPL').profile, fullTimeEmployees: Number.NaN },
    }, 'AAPL').ok).toBe(false)
  })
})

describe('pulse text-context cache', () => {
  it('does not start physical work for a caller that already left', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Already gone.', 'AbortError')
    controller.abort(reason)
    const loader = vi.fn(async () => context('AAPL'))

    await expect(getPulseTextContext('AAPL', loader, controller.signal))
      .rejects.toBe(reason)
    expect(loader).not.toHaveBeenCalled()
    expect(getPulseTextContextCacheStateForTests().physicalKeys).toEqual([])
  })

  it('coalesces a symbol while one caller detaches without canceling internal work', async () => {
    const load = deferred<unknown>()
    const loader = vi.fn((signal: AbortSignal) => {
      void signal
      return load.promise
    })
    const firstController = new AbortController()
    const first = getPulseTextContext('AAPL', loader, firstController.signal)
    const second = getPulseTextContext('AAPL', loader)
    await flushMicrotasks()

    expect(loader).toHaveBeenCalledTimes(1)
    const internalSignal = loader.mock.calls[0][0]
    const reason = new DOMException('Caller left.', 'AbortError')
    firstController.abort(reason)
    await expect(first).rejects.toBe(reason)
    expect(internalSignal.aborted).toBe(false)

    load.resolve(context('AAPL'))
    await expect(second).resolves.toMatchObject({ cacheStatus: 'MISS' })
    await expect(getPulseTextContext('AAPL', loader)).resolves.toMatchObject({
      cacheStatus: 'HIT',
    })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('holds a timed-out physical slot until settlement and fences its late value', async () => {
    const expired = deferred<unknown>()
    const replacement = vi.fn(async () => context('AAPL', '-replacement'))
    const expiredLoader = vi.fn((signal: AbortSignal) => {
      void signal
      return expired.promise
    })
    const request = getPulseTextContext('AAPL', expiredLoader)
    const timeoutAssertion = expect(request)
      .rejects.toBeInstanceOf(PulseTextContextLoadTimeoutError)
    await flushMicrotasks()
    const internalSignal = expiredLoader.mock.calls[0][0]

    await vi.advanceTimersByTimeAsync(PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS)
    await timeoutAssertion
    expect(internalSignal.aborted).toBe(true)
    expect(getPulseTextContextCacheStateForTests()).toEqual({
      cacheKeys: [],
      physicalKeys: ['AAPL'],
      timedOutKeys: ['AAPL'],
    })

    await expect(getPulseTextContext('AAPL', replacement))
      .rejects.toBeInstanceOf(PulseTextContextLoadTimeoutError)
    expect(replacement).not.toHaveBeenCalled()

    expired.resolve(context('AAPL', '-late'))
    await flushMicrotasks()
    expect(getPulseTextContextCacheStateForTests()).toEqual({
      cacheKeys: [],
      physicalKeys: [],
      timedOutKeys: [],
    })

    await expect(getPulseTextContext('AAPL', replacement)).resolves.toMatchObject({
      cacheStatus: 'MISS',
      value: { profile: { companyName: 'AAPL Company-replacement' } },
    })
    expect(replacement).toHaveBeenCalledTimes(1)
  })

  it('enforces four physical slots and an exact four-entry completed cache', async () => {
    const loads = PULSE_TEXT_SYMBOLS.map(() => deferred<unknown>())
    const requests = PULSE_TEXT_SYMBOLS.map((symbol, index) =>
      getPulseTextContext(symbol, () => loads[index].promise),
    )
    await flushMicrotasks()
    expect(getPulseTextContextCacheStateForTests().physicalKeys).toEqual(
      PULSE_TEXT_SYMBOLS,
    )

    await expect(getPulseTextContext(
      'MSFT' as PulseTextSymbol,
      async () => context('AAPL'),
    )).rejects.toBeInstanceOf(PulseTextContextCapacityError)

    loads.forEach((load, index) => load.resolve(context(PULSE_TEXT_SYMBOLS[index])))
    await Promise.all(requests)
    const state = getPulseTextContextCacheStateForTests()
    expect(state.cacheKeys).toHaveLength(PULSE_TEXT_CONTEXT_CACHE_MAX_ENTRIES)
    expect(state.cacheKeys).toEqual(PULSE_TEXT_SYMBOLS)
    expect(state.physicalKeys).toEqual([])
  })

  it('uses completion time for TTL and never caches rejected or malformed loads', async () => {
    const startedAt = Date.now()
    const slow = deferred<unknown>()
    const first = getPulseTextContext('NVDA', () => slow.promise)
    await flushMicrotasks()
    vi.setSystemTime(startedAt + 4_000)
    slow.resolve(context('NVDA'))
    await first

    vi.setSystemTime(startedAt + 4_000 + PULSE_TEXT_CONTEXT_CACHE_TTL_MS - 1)
    await expect(getPulseTextContext('NVDA', vi.fn())).resolves.toMatchObject({
      cacheStatus: 'HIT',
    })

    const afterExpiry = vi.fn(async () => context('NVDA', '-fresh'))
    vi.setSystemTime(startedAt + 4_000 + PULSE_TEXT_CONTEXT_CACHE_TTL_MS)
    await expect(getPulseTextContext('NVDA', afterExpiry)).resolves.toMatchObject({
      cacheStatus: 'MISS',
    })
    expect(afterExpiry).toHaveBeenCalledTimes(1)

    const failing = vi.fn()
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce({ news: [{}], profile: null })
      .mockResolvedValueOnce(context('TSLA'))
    await expect(getPulseTextContext('TSLA', failing)).rejects.toThrow('upstream unavailable')
    await expect(getPulseTextContext('TSLA', failing)).rejects.toThrow('malformed payload')
    await expect(getPulseTextContext('TSLA', failing)).resolves.toMatchObject({
      cacheStatus: 'MISS',
    })
    expect(failing).toHaveBeenCalledTimes(3)
  })
})
