import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MassiveAggregateIncompleteError,
  MassiveProvider,
} from '@/lib/providers/massive'
import { clearFrontMonthCache } from '@/lib/providers/futures-resolver'

function response(json: unknown, ok = true, status = ok ? 200 : 503) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
  } as unknown as Response
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

function aggregate(timestampMs: number, close = timestampMs) {
  return {
    t: timestampMs,
    o: close - 1,
    h: close + 1,
    l: close - 2,
    c: close,
    v: 1_000,
  }
}

describe('MassiveProvider index quotes', () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = 'test-key'
    process.env.FMP_API_KEY = 'fallback-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.MASSIVE_API_KEY
    delete process.env.FMP_API_KEY
  })

  it('retries missing batch index quotes through individual snapshots', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ results: [] }))
      .mockResolvedValueOnce(
        response({
          results: [{
            ticker: 'I:SPX',
            value: 7413.18,
            session: { change: 1.2, change_percent: 0.02 },
          }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          results: [{
            ticker: 'I:DJI',
            value: 52210.08,
            session: { change: 265.3, change_percent: 0.51 },
          }],
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const quotes = await new MassiveProvider().getQuotes(['^GSPC', '^DJI'])

    expect(quotes.map(quote => quote.symbol)).toEqual(['^GSPC', '^DJI'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1][0])).toContain('ticker.any_of=I:SPX')
    expect(String(fetchMock.mock.calls[2][0])).toContain('ticker.any_of=I:DJI')
  })

  it('falls back to FMP when index snapshots are unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(
        response([{
          symbol: '^GSPC',
          name: 'S&P 500',
          price: 7413.18,
          change: 1.2,
          changesPercentage: 0.02,
        }]),
      )

    vi.stubGlobal('fetch', fetchMock)

    const quotes = await new MassiveProvider().getQuotes(['^GSPC'])

    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ symbol: '^GSPC', price: 7413.18 })
    expect(String(fetchMock.mock.calls[2][0])).toContain('/v3/quote/%5EGSPC')
  })
})

describe('MassiveProvider live quote semantics', () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = 'test-key'
    process.env.FMP_API_KEY = 'fallback-key'
    clearFrontMonthCache()
  })

  afterEach(() => {
    clearFrontMonthCache()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.MASSIVE_API_KEY
    delete process.env.FMP_API_KEY
  })

  it('propagates stock cancellation even when transport ignores the signal', async () => {
    const load = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(load.promise)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new MassiveProvider().getQuote('AAPL', {
      freshness: 'live',
      signal: controller.signal,
    })

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    load.resolve(response({ ticker: { ticker: 'AAPL', day: { c: 100 } } }))

    await expect(request).rejects.toBe(reason)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
  })

  it('keeps legacy null behavior but throws live transient stock failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({ ticker: { ticker: 'AAPL' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('AAPL')).resolves.toBeNull()
    await expect(new MassiveProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toThrow('status 503')
    await expect(new MassiveProvider().getQuote('AAPL', { freshness: 'live' }))
      .resolves.toBeNull()
    await expect(new MassiveProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toThrow('invalid quote payload')
  })

  it('preserves legacy batch empties but throws strict transport, malformed, and empty batches', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 503))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(response({ error: 'malformed' }))
      .mockResolvedValueOnce(response({ tickers: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MassiveProvider()

    await expect(provider.getQuotes(['AAPL'])).resolves.toEqual([])
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('status 503')
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('network unavailable')
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('invalid stock batch quote payload')
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('no usable batch quotes')
  })

  it('propagates batch cancellation even when transport ignores the signal', async () => {
    const load = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(load.promise)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new MassiveProvider().getQuotes(['AAPL'], {
      failureMode: 'throw',
      signal: controller.signal,
    })

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    load.resolve(response({
      tickers: [{
        ticker: 'AAPL',
        day: { c: 100 },
        todaysChange: 1,
        todaysChangePerc: 1,
      }],
    }))

    await expect(request).rejects.toBe(reason)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
  })

  it('rejects a mismatched raw stock ticker before applying the caller symbol', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      ticker: {
        ticker: 'MSFT',
        day: { c: 100 },
        todaysChange: 1,
        todaysChangePerc: 1,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null for a mismatched cached stock ticker instead of relabeling it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(response({
      ticker: {
        ticker: 'BF.B',
        day: { c: 45 },
        todaysChange: 1,
        todaysChangePerc: 1,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('BRK.A')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/tickers/BRK.A')
  })

  it('threads live freshness and the same signal through an index fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response([{
        symbol: '^GSPC',
        name: 'S&P 500',
        price: 7_400,
        change: 10,
        changesPercentage: 0.14,
      }]))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(new MassiveProvider().getQuote('^GSPC', {
      freshness: 'live',
      signal: controller.signal,
    })).resolves.toMatchObject({ symbol: '^GSPC', price: 7_400 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('next')
  })

  it('does not invoke index fallback after cancellation', async () => {
    const load = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(load.promise)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new MassiveProvider().getQuote('^GSPC', {
      freshness: 'live',
      signal: controller.signal,
    })

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    load.resolve(response({}, false, 503))

    await expect(request).rejects.toBe(reason)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched raw index ticker without invoking fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      results: [{
        ticker: 'I:DJI',
        value: 52_000,
        session: { change: 1, change_percent: 0.01 },
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('^GSPC', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed live index fallback twice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('^GSPC', { freshness: 'live' }))
      .rejects.toThrow('status 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never returns a fabricated zero-price index when the primary omits price', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        results: [{
          ticker: 'I:SPX',
          session: { change: 0, change_percent: 0 },
        }],
      }))
      .mockResolvedValueOnce(response({}, false, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('^GSPC', { freshness: 'live' }))
      .rejects.toThrow('status 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('threads live options through futures fallback and preserves the generic symbol', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response([{
        symbol: 'ESUSD',
        name: 'S&P 500',
        price: 6_400,
        change: 5,
        changesPercentage: 0.08,
      }]))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(new MassiveProvider().getQuote('ES=F', {
      freshness: 'live',
      signal: controller.signal,
    })).resolves.toMatchObject({ symbol: 'ES=F', price: 6_400 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
  })

  it('rejects and never caches a front-month contract for the wrong product', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ ticker: 'NQZ26' }] }))
      .mockResolvedValueOnce(response({ results: [{ ticker: 'ESZ26' }] }))
      .mockResolvedValueOnce(response({
        results: [{
          ticker: 'ESZ26',
          last_trade: { price: 6_400 },
          session: { change: 5, change_percent: 0.08 },
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MassiveProvider()

    await expect(provider.getQuote('ES=F', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    await expect(provider.getQuote('ES=F', { freshness: 'live' }))
      .resolves.toMatchObject({ symbol: 'ES=F', price: 6_400 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('product_code=ES')
    expect(String(fetchMock.mock.calls[1][0])).toContain('product_code=ES')
  })

  it('does not fall back after cancellation during a futures snapshot', async () => {
    const snapshotLoad = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ ticker: 'ESZ26' }] }))
      .mockReturnValueOnce(snapshotLoad.promise)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new MassiveProvider().getQuote('ES=F', {
      freshness: 'live',
      signal: controller.signal,
    })
    for (let turn = 0; turn < 8 && fetchMock.mock.calls.length < 2; turn += 1) {
      await Promise.resolve()
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    snapshotLoad.resolve(response({
      results: [{
        last_trade: { price: 6_400 },
        session: { change: 5, change_percent: 0.08 },
      }],
    }))

    await expect(request).rejects.toBe(reason)
  })

  it('rejects an exposed mismatched futures contract without invoking fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ ticker: 'ESZ26' }] }))
      .mockResolvedValueOnce(response({
        results: [{
          ticker: 'NQZ26',
          last_trade: { price: 6_400 },
          session: { change: 5, change_percent: 0.08 },
        }],
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('ES=F', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never returns a fabricated zero-price future when the snapshot omits price', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ ticker: 'ESZ26' }] }))
      .mockResolvedValueOnce(response({
        results: [{ session: { change: 0, change_percent: 0 } }],
      }))
      .mockResolvedValueOnce(response({}, false, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getQuote('ES=F', { freshness: 'live' }))
      .rejects.toThrow('status 503')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('MassiveProvider aggregate pagination', () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete process.env.MASSIVE_API_KEY
  })

  it('follows authenticated next_url pages and returns ordered, deduplicated candles', async () => {
    const nextUrl = 'https://api.massive.com/v2/aggs/ticker/AAPL/range/1/second/1710000000000/1710000060000?cursor=page-2'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        results: [aggregate(3_000, 30), aggregate(1_000, 10)],
        next_url: nextUrl,
      }))
      .mockResolvedValueOnce(response({
        results: [aggregate(2_000, 20), aggregate(3_000, 33)],
      }))
    vi.stubGlobal('fetch', fetchMock)

    const candles = await new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '1710000000000',
      '1710000060000',
    )

    expect(candles.map(candle => candle.timestampMs)).toEqual([1_000, 2_000, 3_000])
    expect(candles.at(-1)?.close).toBe(33)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/1710000000000/1710000060000?adjusted=true&sort=asc&limit=50000',
    )
    expect(String(fetchMock.mock.calls[1][0])).toBe(nextUrl)

    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        headers: { Authorization: 'Bearer test-key' },
        cache: 'no-store',
      })
      expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('accepts an authoritative HTTP-200 empty aggregate window in strict mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getIntraday(
      'AAPL',
      5,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw' },
    )).resolves.toEqual([])
  })

  it('rejects malformed aggregate rows in strict mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      results: [{ t: 1_000, o: 100, h: 101, l: 99 }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MassiveProvider().getIntraday(
      'AAPL',
      5,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw' },
    )).rejects.toThrow('invalid aggregate candle payload')
  })

  it('throws typed incomplete data when a later page fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        results: [aggregate(1_000)],
        next_url: 'https://api.massive.com/v2/aggs/ticker/AAPL/range/1/second/a/b?cursor=page-2',
      }))
      .mockResolvedValueOnce(response({}, false))
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )

    await expect(request).rejects.toMatchObject({
      name: 'MassiveAggregateIncompleteError',
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'page_fetch_failed',
      pagesFetched: 1,
      rowsFetched: 1,
    })
  })

  it('does not disguise an initial upstream failure as a valid empty stock window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}, false))
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )

    await expect(request).rejects.toMatchObject({
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'page_fetch_failed',
      pagesFetched: 0,
      rowsFetched: 0,
    })
  })

  it('throws instead of returning a plausible prefix when the page cap is reached', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount += 1
      return response({
        results: [aggregate(callCount * 1_000)],
        next_url: `https://api.massive.com/v2/aggs/ticker/AAPL/range/1/second/a/b?cursor=page-${callCount + 1}`,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )

    await expect(request).rejects.toMatchObject({
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'page_limit',
      pagesFetched: 8,
      rowsFetched: 8,
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('throws instead of returning a plausible prefix when the row cap is reached', async () => {
    const fullPage = Array.from({ length: 50_000 }, (_, index) => aggregate(index))
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount += 1
      return response({
        results: fullPage,
        next_url: `https://api.massive.com/v2/aggs/ticker/AAPL/range/1/second/a/b?cursor=page-${callCount + 1}`,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )

    await expect(request).rejects.toMatchObject({
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'row_limit',
      pagesFetched: 5,
      rowsFetched: 250_000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('aborts at the aggregate deadline and exposes a typed incomplete-data error', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((_: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )
    const rejection = expect(request).rejects.toBeInstanceOf(MassiveAggregateIncompleteError)

    await vi.advanceTimersByTimeAsync(12_001)
    await rejection
    await expect(request).rejects.toMatchObject({
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'deadline',
      pagesFetched: 0,
      rowsFetched: 0,
    })
  })

  it('rejects cross-origin next_url values instead of forwarding provider auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      results: [aggregate(1_000)],
      next_url: 'https://example.com/steal-cursor',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = new MassiveProvider().getIntraday(
      'AAPL',
      1,
      'second',
      '2026-08-06',
      '2026-08-06',
    )

    await expect(request).rejects.toMatchObject({
      code: 'MASSIVE_AGGREGATE_INCOMPLETE',
      reason: 'invalid_next_url',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
