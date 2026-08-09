import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FMPProvider } from '@/lib/providers/fmp'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function quote(symbol: string, price = 100) {
  return {
    symbol,
    name: symbol,
    price,
    change: 1,
    changesPercentage: 1,
  }
}

describe('FMPProvider batch quote freshness', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FMP_API_KEY
  })

  it('bypasses the lower quote cache for a live recovery after a cached empty result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([quote('EURUSD', 1.17)]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuotes(['EURUSD'])).resolves.toEqual([])
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      next: { revalidate: 60 },
    })
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('cache')

    const controller = new AbortController()
    await expect(provider.getQuotes(['EURUSD'], {
      freshness: 'live',
      signal: controller.signal,
    })).resolves.toMatchObject([{ symbol: 'EURUSD', price: 1.17 }])
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('next')
  })

  it('throws live transient and malformed responses instead of caching absence', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse([quote('MSFT')]))
      .mockResolvedValueOnce(jsonResponse([quote('EURUSD', 0)]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuotes(['EURUSD'], { freshness: 'live' }))
      .rejects.toThrow('status 503')
    await expect(provider.getQuotes(['EURUSD'], { freshness: 'live' }))
      .rejects.toThrow('invalid batch quote payload')
    await expect(provider.getQuotes(['EURUSD'], { freshness: 'live' }))
      .rejects.toThrow('invalid batch quote payload')
  })

  it('can preserve cached transport while surfacing failures for status-aware consumers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'malformed' }))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('status 503')
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .rejects.toThrow('invalid batch quote payload')
    await expect(provider.getQuotes(['AAPL'], { failureMode: 'throw' }))
      .resolves.toEqual([])

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({ next: { revalidate: 60 } })
      expect(call[1]).not.toHaveProperty('cache')
    }
  })

  it('requires exact one-to-one coverage for every live batch symbol', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([quote('EURUSD')]))
      .mockResolvedValueOnce(jsonResponse([
        quote('EURUSD'),
        quote('EURUSD'),
      ]))
      .mockResolvedValueOnce(jsonResponse([
        quote('EURUSD'),
        quote('USDJPY'),
      ]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getQuotes(
      ['EURUSD', 'USDJPY'],
      { freshness: 'live' },
    )).rejects.toThrow('invalid batch quote payload')
    await expect(provider.getQuotes(
      ['EURUSD', 'USDJPY'],
      { freshness: 'live' },
    )).rejects.toThrow('invalid batch quote payload')
    await expect(provider.getQuotes(
      ['EURUSD', 'USDJPY'],
      { freshness: 'live' },
    )).rejects.toThrow('invalid batch quote payload')
    await expect(provider.getQuotes(
      ['EURUSD', 'USDJPY'],
      { freshness: 'live' },
    )).resolves.toMatchObject([
      { symbol: 'EURUSD' },
      { symbol: 'USDJPY' },
    ])
  })

  it('round-trips class-share batch aliases through canonical provider symbols', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      quote('BRK-A', 500),
      quote('BF-B', 45),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new FMPProvider().getQuotes(
      ['BRK.A', 'bf-b'],
      { freshness: 'live' },
    )).resolves.toMatchObject([
      { symbol: 'BRK.A', price: 500 },
      { symbol: 'BF.B', price: 45 },
    ])
    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote/BRK-A,BF-B')
  })
})
