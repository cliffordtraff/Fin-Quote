import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FMPProvider } from '@/lib/providers/fmp'
import { MassiveProvider } from '@/lib/providers/massive'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fmpArticle() {
  return {
    symbol: 'AAPL',
    title: 'Apple update',
    text: 'Article body',
    url: 'https://example.com/apple',
    image: null,
    publishedDate: '2026-08-09T12:00:00.000Z',
    site: 'The Intraday',
  }
}

function massiveArticle() {
  return {
    tickers: ['AAPL'],
    title: 'Apple update',
    description: 'Article body',
    article_url: 'https://example.com/apple',
    image_url: null,
    published_utc: '2026-08-09T12:00:00.000Z',
    publisher: { name: 'The Intraday' },
  }
}

beforeEach(() => {
  process.env.FMP_API_KEY = 'fmp-test-key'
  process.env.MASSIVE_API_KEY = 'massive-test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.FMP_API_KEY
  delete process.env.MASSIVE_API_KEY
})

describe('strict provider news reads', () => {
  it('makes FMP transport/malformed failures observable while preserving legitimate and legacy empties', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([fmpArticle()]))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()
    const controller = new AbortController()

    await expect(provider.getNews('AAPL', 3, {
      failureMode: 'throw',
      signal: controller.signal,
    })).rejects.toThrow('status 503')
    await expect(provider.getNews('AAPL', 3, { failureMode: 'throw' }))
      .rejects.toThrow('invalid news payload')
    await expect(provider.getNews('AAPL', 3, { failureMode: 'throw' }))
      .resolves.toEqual([])
    await expect(provider.getNews('AAPL', 100, {
      failureMode: 'throw',
      signal: controller.signal,
    })).resolves.toEqual([
      expect.objectContaining({ symbol: 'AAPL', title: 'Apple update' }),
    ])
    await expect(provider.getNews('AAPL')).resolves.toEqual([])

    expect(String(fetchMock.mock.calls[3][0])).toContain('limit=25')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      next: { revalidate: 300 },
      signal: controller.signal,
    })
  })

  it('makes Massive transport/malformed failures observable while preserving legitimate and legacy empties', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'wrong shape' }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [massiveArticle()] }))
      .mockResolvedValueOnce(jsonResponse({ error: 'wrong shape' }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MassiveProvider()
    const controller = new AbortController()

    await expect(provider.getNews('AAPL', 3, {
      failureMode: 'throw',
      signal: controller.signal,
    })).rejects.toThrow('status 503')
    await expect(provider.getNews('AAPL', 3, { failureMode: 'throw' }))
      .rejects.toThrow('invalid news payload')
    await expect(provider.getNews('AAPL', 3, { failureMode: 'throw' }))
      .resolves.toEqual([])
    await expect(provider.getNews('AAPL', 100, {
      failureMode: 'throw',
      signal: controller.signal,
    })).resolves.toEqual([
      expect.objectContaining({ symbol: 'AAPL', title: 'Apple update' }),
    ])
    await expect(provider.getNews('AAPL')).resolves.toEqual([])

    expect(String(fetchMock.mock.calls[3][0])).toContain('limit=25')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
    })
  })

  it('propagates strict cancellation after an ignored transport abort', async () => {
    let resolveFetch!: (response: Response) => void
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = new FMPProvider().getNews('AAPL', 3, {
      failureMode: 'throw',
      signal: controller.signal,
    })
    const reason = new DOMException('Deadline elapsed.', 'TimeoutError')

    controller.abort(reason)
    resolveFetch(jsonResponse([fmpArticle()]))

    await expect(request).rejects.toBe(reason)
  })
})
