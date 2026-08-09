import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderQuote, QuoteRequestOptions } from '@/lib/providers/types'

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  getQuotes: vi.fn(),
  getSymbolValidity: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: mocks.getProvider,
}))

vi.mock('@/lib/symbol-resolver', () => ({
  getSymbolValidity: mocks.getSymbolValidity,
}))

import { POST } from '@/app/api/watchlist/quotes/route'
import { WATCHLIST_REQUEST_MAX_BYTES } from '@/lib/dashboard/watchlist-http-contract'
import {
  getWatchlistQuoteAdmissionStateForTests,
  resetWatchlistQuoteAdmissionForTests,
  WATCHLIST_QUOTE_LOAD_TIMEOUT_MS,
  WATCHLIST_QUOTE_PHYSICAL_MAX,
} from '@/lib/dashboard/watchlist-quote-admission'

function quote(symbol: string, price = 100): ProviderQuote {
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

async function flushMicrotasks(turns = 24): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

function request(
  body: unknown,
  options: {
    contentType?: string | null
    headers?: Record<string, string>
    origin?: string | null
    query?: string
    raw?: boolean
    signal?: AbortSignal
  } = {},
) {
  const headers = new Headers(options.headers)
  if (options.origin !== null) {
    headers.set('Origin', options.origin ?? 'https://theintraday.com')
  }
  if (options.contentType !== null) {
    headers.set('Content-Type', options.contentType ?? 'application/json')
  }
  return new Request(
    `https://theintraday.com/api/watchlist/quotes${options.query ?? ''}`,
    {
      method: 'POST',
      headers,
      body: options.raw ? String(body) : JSON.stringify(body),
      signal: options.signal,
    },
  )
}

function expectPrivate(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
  resetWatchlistQuoteAdmissionForTests()
  mocks.getProvider.mockReturnValue({ getQuotes: mocks.getQuotes })
  mocks.getSymbolValidity.mockResolvedValue('valid')
  mocks.getQuotes.mockImplementation(async (symbols: string[]) =>
    symbols.map((symbol, index) => quote(symbol, 100 + index)),
  )
})

afterEach(() => {
  resetWatchlistQuoteAdmissionForTests()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('POST /api/watchlist/quotes', () => {
  it('fails closed behind the exact feature flag before origin, body, or provider work', async () => {
    for (const flag of ['', 'false', 'TRUE', '1']) {
      vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', flag)
      const response = await POST(request('not json', {
        contentType: 'text/plain',
        origin: 'https://attacker.example',
        raw: true,
      }))
      expect(response.status).toBe(404)
      expectPrivate(response)
      await expect(response.json()).resolves.toMatchObject({
        code: 'WATCHLIST_QUOTES_DISABLED',
      })
    }
    expect(mocks.getProvider).not.toHaveBeenCalled()
    expect(mocks.getQuotes).not.toHaveBeenCalled()
    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
  })

  it('requires an exact same-origin browser request before reading or provider work', async () => {
    for (const candidate of [
      request({ symbols: ['AAPL'] }, { origin: null }),
      request({ symbols: ['AAPL'] }, { origin: 'https://attacker.example' }),
      request({ symbols: ['AAPL'] }, {
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }),
    ]) {
      const response = await POST(candidate)
      expect(response.status).toBe(403)
      expectPrivate(response)
      await expect(response.json()).resolves.toMatchObject({
        code: 'WATCHLIST_QUOTES_ORIGIN_FORBIDDEN',
      })
    }
    expect(mocks.getProvider).not.toHaveBeenCalled()
    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
  })

  it('rejects query parameters before body, registry, or provider work', async () => {
    const response = await POST(request(
      { symbols: ['AAPL'] },
      { query: '?extra=true' },
    ))

    expect(response.status).toBe(400)
    expectPrivate(response)
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_WATCHLIST_QUOTE_REQUEST',
    })
    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('rejects media-type, JSON, shape, empty, derivative, and batch-limit failures before the provider', async () => {
    const invalidRequests = [
      request({ symbols: ['AAPL'] }, { contentType: 'text/plain' }),
      request('{', { raw: true }),
      request({}),
      request({ symbols: [] }),
      request({ symbols: ['ES=F'] }),
      request({ symbols: ['AAPL!'] }),
      request({ symbols: ['AAPL'], extra: true }),
      request({
        symbols: Array.from({ length: 21 }, (_, index) => `S${index}`),
      }),
    ]

    for (const invalidRequest of invalidRequests) {
      const response = await POST(invalidRequest)
      expect(response.status).toBe(400)
      expectPrivate(response)
      await expect(response.json()).resolves.toMatchObject({
        code: 'INVALID_WATCHLIST_QUOTE_REQUEST',
      })
    }
    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('atomically registry-admits the full equity set before provider work', async () => {
    mocks.getSymbolValidity.mockImplementation(async (symbol: string) => {
      if (symbol === 'FAKE') return 'not_found'
      if (symbol === 'MSFT') return 'unavailable'
      return 'valid'
    })

    const unavailable = await POST(request({
      symbols: ['FAKE', 'MSFT', 'AAPL'],
    }))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('1')
    expectPrivate(unavailable)
    await expect(unavailable.json()).resolves.toMatchObject({
      code: 'WATCHLIST_QUOTE_REGISTRY_UNAVAILABLE',
    })

    mocks.getSymbolValidity.mockResolvedValueOnce('not_found')
    const missing = await POST(request({ symbols: ['S0000'] }))
    expect(missing.status).toBe(404)
    expectPrivate(missing)
    await expect(missing.json()).resolves.toMatchObject({
      code: 'WATCHLIST_QUOTE_SYMBOL_NOT_FOUND',
    })

    mocks.getSymbolValidity.mockRejectedValueOnce(new Error('registry down'))
    const rejected = await POST(request({ symbols: ['NVDA'] }))
    expect(rejected.status).toBe(503)
    expectPrivate(rejected)
    expect(rejected.headers.get('retry-after')).toBe('1')
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('enforces both declared and streamed request byte limits', async () => {
    const declared = await POST(request(
      { symbols: ['AAPL'] },
      { headers: { 'Content-Length': String(WATCHLIST_REQUEST_MAX_BYTES + 1) } },
    ))
    expect(declared.status).toBe(413)
    expectPrivate(declared)

    const streamed = await POST(request(
      JSON.stringify({
        symbols: ['AAPL'],
        padding: 'x'.repeat(WATCHLIST_REQUEST_MAX_BYTES),
      }),
      { raw: true },
    ))
    expect(streamed.status).toBe(413)
    expectPrivate(streamed)
    await expect(streamed.json()).resolves.toMatchObject({
      code: 'WATCHLIST_QUOTE_REQUEST_TOO_LARGE',
    })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('normalizes one batch, opts into strict live reads, and returns exact request order', async () => {
    const caller = new AbortController()
    mocks.getQuotes.mockResolvedValueOnce([
      quote('BRK.B', 200),
      quote('AAPL', 100),
    ])

    const response = await POST(request(
      { symbols: [' aapl ', 'BRK-B', 'AAPL', 'brk.b'] },
      { signal: caller.signal },
    ))

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      quotes: [
        {
          symbol: 'AAPL',
          name: 'AAPL Incorporated',
          price: 100,
          change: 1,
          changesPercentage: 1,
        },
        {
          symbol: 'BRK.B',
          name: 'BRK.B Incorporated',
          price: 200,
          change: 1,
          changesPercentage: 1,
        },
      ],
    })
    expect(mocks.getProvider).toHaveBeenCalledTimes(1)
    expect(mocks.getQuotes).toHaveBeenCalledTimes(1)
    const [symbols, providerOptions] = mocks.getQuotes.mock.calls[0] as [
      string[],
      QuoteRequestOptions,
    ]
    expect(symbols).toEqual(['AAPL', 'BRK.B'])
    expect(providerOptions).toMatchObject({
      failureMode: 'throw',
      freshness: 'live',
      signal: expect.any(AbortSignal),
    })
    expect(providerOptions.signal).not.toBe(caller.signal)
  })

  it('singleflights order permutations while preserving each caller order and detaching aborts', async () => {
    const load = deferred<ProviderQuote[]>()
    mocks.getQuotes.mockReturnValueOnce(load.promise)
    const firstController = new AbortController()
    const first = POST(request(
      { symbols: ['AAPL', 'MSFT'] },
      { signal: firstController.signal },
    )).catch((error) => error)
    const second = POST(request({ symbols: ['MSFT', 'AAPL'] }))
    await flushMicrotasks()

    expect(mocks.getQuotes).toHaveBeenCalledTimes(1)
    const providerSignal = (
      mocks.getQuotes.mock.calls[0][1] as QuoteRequestOptions
    ).signal!
    const reason = new DOMException('Caller left.', 'AbortError')
    firstController.abort(reason)
    expect(await first).toBe(reason)
    expect(providerSignal.aborted).toBe(false)

    load.resolve([quote('MSFT', 200), quote('AAPL', 100)])
    const response = await second
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      quotes: [
        { symbol: 'MSFT', price: 200 },
        { symbol: 'AAPL', price: 100 },
      ],
    })
    expect(mocks.getQuotes.mock.calls[0][0]).toEqual(['AAPL', 'MSFT'])
  })

  it('maps malformed, partial, duplicate, wrong, zero, transient, and missing-provider work to uncached 502s', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getQuotes
      .mockResolvedValueOnce([quote('AAPL')])
      .mockResolvedValueOnce([quote('AAPL'), quote('AAPL')])
      .mockResolvedValueOnce([quote('AAPL'), quote('TSLA')])
      .mockResolvedValueOnce([quote('AAPL', 0), quote('MSFT')])
      .mockResolvedValueOnce([
        quote('AAPL'),
        { ...quote('MSFT'), change: Number.NaN },
      ])
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce([quote('AAPL'), quote('MSFT')])

    for (let index = 0; index < 6; index += 1) {
      const response = await POST(request({ symbols: ['AAPL', 'MSFT'] }))
      expect(response.status).toBe(502)
      expectPrivate(response)
      expect(getWatchlistQuoteAdmissionStateForTests().cacheKeys).toEqual([])
    }

    const recovered = await POST(request({ symbols: ['AAPL', 'MSFT'] }))
    expect(recovered.status).toBe(200)
    expect(mocks.getQuotes).toHaveBeenCalledTimes(7)

    resetWatchlistQuoteAdmissionForTests()
    mocks.getProvider.mockImplementationOnce(() => {
      throw new Error('FMP_API_KEY not set')
    })
    const missingProvider = await POST(request({ symbols: ['NVDA'] }))
    expect(missingProvider.status).toBe(502)
    expectPrivate(missingProvider)
    errorSpy.mockRestore()
  })

  it('returns typed 504 timeouts and 503 Retry-After while physical orphans hold capacity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-09T14:00:00.000Z')
    const loads = Array.from(
      { length: WATCHLIST_QUOTE_PHYSICAL_MAX },
      () => deferred<ProviderQuote[]>(),
    )
    mocks.getQuotes.mockImplementation(
      () => loads[mocks.getQuotes.mock.calls.length - 1].promise,
    )

    const requests = loads.map((_load, index) =>
      POST(request({ symbols: [`Q${index}`] })),
    )
    const responsesPromise = Promise.all(requests)
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_LOAD_TIMEOUT_MS)
    const responses = await responsesPromise
    expect(responses.every((response) => response.status === 504)).toBe(true)
    responses.forEach(expectPrivate)
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      outstandingCount: WATCHLIST_QUOTE_PHYSICAL_MAX,
      timedOutOrphanCount: WATCHLIST_QUOTE_PHYSICAL_MAX,
    })

    const capacity = await POST(request({ symbols: ['RECOVER'] }))
    expect(capacity.status).toBe(503)
    expectPrivate(capacity)
    expect(capacity.headers.get('retry-after')).toBe('1')
    await expect(capacity.json()).resolves.toMatchObject({
      code: 'WATCHLIST_QUOTE_CAPACITY_EXCEEDED',
    })
    expect(mocks.getQuotes).toHaveBeenCalledTimes(WATCHLIST_QUOTE_PHYSICAL_MAX)

    loads.forEach((load, index) => load.resolve([quote(`Q${index}`)]))
    await flushMicrotasks()
    expect(getWatchlistQuoteAdmissionStateForTests()).toMatchObject({
      outstandingCount: 0,
      timedOutOrphanCount: 0,
    })
  })
})
