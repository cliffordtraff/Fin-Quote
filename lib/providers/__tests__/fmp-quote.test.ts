import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FMPProvider } from '@/lib/providers/fmp'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function quote(symbol = 'AAPL', price = 100) {
  return {
    symbol,
    name: symbol,
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

describe('FMPProvider quote freshness', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FMP_API_KEY
  })

  it('preserves cached behavior by default and opts live requests out of caching', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([quote()]))
      .mockResolvedValueOnce(jsonResponse([quote('ESUSD')]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new FMPProvider().getQuote('AAPL')).resolves.toMatchObject({
      symbol: 'AAPL',
      price: 100,
    })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      next: { revalidate: 60 },
    })
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('cache')

    const controller = new AbortController()
    await expect(new FMPProvider().getQuote('ES=F', {
      freshness: 'live',
      signal: controller.signal,
    })).resolves.toMatchObject({ symbol: 'ES=F', price: 100 })
    expect(String(fetchMock.mock.calls[1][0])).toContain('/quote/ESUSD')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('next')
  })

  it('uses null only for authoritative absence and throws live transient failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([42]))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'AAPL', name: 'Apple' }]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new FMPProvider().getQuote('AAPL')).resolves.toBeNull()
    await expect(new FMPProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toThrow('status 503')
    await expect(new FMPProvider().getQuote('AAPL', { freshness: 'live' }))
      .resolves.toBeNull()
    await expect(new FMPProvider().getQuote('AAPL', { freshness: 'live' }))
      .resolves.toBeNull()
    await expect(new FMPProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toThrow('invalid quote payload')
    await expect(new FMPProvider().getQuote('AAPL', { freshness: 'live' }))
      .rejects.toThrow('invalid quote payload')
  })

  it('propagates cancellation even when the transport ignores the signal', async () => {
    const load = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(load.promise)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new FMPProvider().getQuote('AAPL', {
      freshness: 'live',
      signal: controller.signal,
    })

    const reason = new DOMException('Caller left', 'AbortError')
    controller.abort(reason)
    load.resolve(jsonResponse([quote()]))

    await expect(request).rejects.toBe(reason)
  })

  it('rejects a mismatched raw futures symbol before applying the public alias', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([quote('NQUSD')]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new FMPProvider().getQuote('ES=F', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses FMP class-share aliases while preserving canonical provider symbols', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([quote('BRK-A', 500)]))
      .mockResolvedValueOnce(jsonResponse([quote('BF-B', 45)]))
      .mockResolvedValueOnce(jsonResponse([
        {
          symbol: 'BRK-A',
          title: 'Berkshire update',
          text: 'Update',
          url: 'https://example.com/berkshire',
        },
        {
          symbol: 'BF-B',
          title: 'Wrong company',
          text: 'Wrong',
          url: 'https://example.com/wrong',
        },
      ]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuote('brk.a')).resolves.toMatchObject({
      symbol: 'BRK.A',
      price: 500,
    })
    await expect(provider.getQuote('bf-b')).resolves.toMatchObject({
      symbol: 'BF.B',
      price: 45,
    })
    await expect(provider.getNews('BRK.A', 5)).resolves.toEqual([
      expect.objectContaining({ symbol: 'BRK.A', title: 'Berkshire update' }),
    ])

    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote/BRK-A')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/quote/BF-B')
    expect(String(fetchMock.mock.calls[2][0])).toContain('tickers=BRK-A')
  })

  it('never relabels a mismatched cached or live class-share quote', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([quote('BF-B')]))
      .mockResolvedValueOnce(jsonResponse([quote('BF-B')]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuote('BRK.A')).resolves.toBeNull()
    await expect(provider.getQuote('BRK.A', { freshness: 'live' }))
      .rejects.toMatchObject({ name: 'ProviderQuoteSymbolMismatchError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves a legitimate negative commodity-futures quote', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([quote('CLUSD', -37.63)]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new FMPProvider().getQuote('CL=F', { freshness: 'live' }))
      .resolves.toMatchObject({ symbol: 'CL=F', price: -37.63 })
  })
})
