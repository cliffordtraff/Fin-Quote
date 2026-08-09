import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FMPProvider } from '@/lib/providers/fmp'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function candle(date = '2026-08-08 09:30:00') {
  return {
    date,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1_000,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('FMPProvider candle failure semantics', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FMP_API_KEY
  })

  it('preserves legacy empties only for non-OK and valid-JSON wrong-shape responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'malformed' }))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'malformed' }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getIntraday('AAPL', 5, 'minute')).resolves.toEqual([])
    await expect(provider.getIntraday('AAPL', 5, 'minute')).resolves.toEqual([])
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01')).resolves.toEqual([])
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01')).resolves.toEqual([])
  })

  it('preserves no-options transport and JSON parser rejections', async () => {
    const parserError = new SyntaxError('invalid JSON')
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('intraday network unavailable'))
      .mockRejectedValueOnce(new Error('historical network unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(parserError),
      } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()

    await expect(provider.getIntraday('AAPL', 5, 'minute'))
      .rejects.toThrow('intraday network unavailable')
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01'))
      .rejects.toThrow('historical network unavailable')
    await expect(provider.getIntraday('AAPL', 5, 'minute'))
      .rejects.toBe(parserError)
  })

  it('preserves cancellation without requiring strict failure mode', async () => {
    const load = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(load.promise))
    const controller = new AbortController()
    const reason = new DOMException('caller left', 'AbortError')
    const request = new FMPProvider().getIntraday(
      'AAPL',
      5,
      'minute',
      undefined,
      undefined,
      { signal: controller.signal },
    )

    controller.abort(reason)
    load.resolve(jsonResponse([]))

    await expect(request).rejects.toBe(reason)
  })

  it('preserves the missing API-key rejection in default mode', async () => {
    delete process.env.FMP_API_KEY

    await expect(new FMPProvider().getHistoricalDaily('AAPL', '2026-01-01'))
      .rejects.toThrow('FMP_API_KEY not set')
  })

  it('throws strict intraday failures while retaining the normal provider cache', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'malformed' }))
      .mockResolvedValueOnce(jsonResponse([{ ...candle(), close: 'not-a-number' }]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()
    const options = { failureMode: 'throw' } as const

    await expect(provider.getIntraday('AAPL', 5, 'minute', undefined, undefined, options))
      .rejects.toThrow('network unavailable')
    await expect(provider.getIntraday('AAPL', 5, 'minute', undefined, undefined, options))
      .rejects.toThrow('status 503')
    await expect(provider.getIntraday('AAPL', 5, 'minute', undefined, undefined, options))
      .rejects.toThrow('invalid intraday candle payload')
    await expect(provider.getIntraday('AAPL', 5, 'minute', undefined, undefined, options))
      .rejects.toThrow('invalid intraday candle payload')

    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1]).toMatchObject({ next: { revalidate: 10 } })
      expect(call[1]).not.toHaveProperty('cache')
    }
  })

  it('throws strict historical failures but accepts authoritative HTTP-200 empties', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'malformed' }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ historical: [] }))
      .mockResolvedValueOnce(jsonResponse({ historical: [candle('2026-08-08')] }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new FMPProvider()
    const options = { failureMode: 'throw' } as const

    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01', undefined, options))
      .rejects.toThrow('status 503')
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01', undefined, options))
      .rejects.toThrow('invalid historical candle payload')
    await expect(provider.getIntraday('AAPL', 5, 'minute', undefined, undefined, options))
      .resolves.toEqual([])
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01', undefined, options))
      .resolves.toEqual([])
    await expect(provider.getHistoricalDaily('AAPL', '2026-01-01', undefined, options))
      .resolves.toEqual([
        expect.objectContaining({ date: '2026-08-08', close: 101 }),
      ])
  })
})
