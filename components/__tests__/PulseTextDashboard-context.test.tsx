import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  derivePulseTextMarketValues,
  usePulseTextContext,
} from '@/components/PulseTextDashboard'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'
import type { PulseTextContext, PulseTextSymbol } from '@/lib/pulse-text-context'

function context(symbol: PulseTextSymbol): PulseTextContext {
  return {
    news: [{
      title: `${symbol} headline`,
      publishedDate: '2026-08-09T12:00:00.000Z',
      site: 'The Intraday',
      url: `https://example.com/${symbol.toLowerCase()}`,
    }],
    profile: {
      symbol,
      companyName: `${symbol} Company`,
      description: 'Company description',
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

function response(symbol: PulseTextSymbol): Response {
  return new Response(JSON.stringify(context(symbol)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('usePulseTextContext', () => {
  it('aborts and suppresses an old-symbol response after a rapid switch', async () => {
    const aapl = deferred<Response>()
    const nvda = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(aapl.promise)
      .mockReturnValueOnce(nvda.promise)
    vi.stubGlobal('fetch', fetchMock)

    const view = renderHook(
      ({ symbol }: { symbol: PulseTextSymbol }) => usePulseTextContext(symbol),
      { initialProps: { symbol: 'AAPL' } },
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal

    view.rerender({ symbol: 'NVDA' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(firstSignal.aborted).toBe(true)
    expect(view.result.current.context).toBeNull()

    await act(async () => {
      aapl.resolve(response('AAPL'))
      await Promise.resolve()
    })
    expect(view.result.current.context).toBeNull()

    await act(async () => {
      nvda.resolve(response('NVDA'))
    })
    await waitFor(() => {
      expect(view.result.current.context?.profile?.symbol).toBe('NVDA')
      expect(view.result.current.loading).toBe(false)
    })
  })

  it('uses the new symbol fallback on failure instead of relabeling prior context', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('AAPL'))
      .mockRejectedValueOnce(new Error('service unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(
      ({ symbol }: { symbol: PulseTextSymbol }) => usePulseTextContext(symbol),
      { initialProps: { symbol: 'AAPL' } },
    )

    await waitFor(() => {
      expect(view.result.current.context?.profile?.symbol).toBe('AAPL')
    })
    view.rerender({ symbol: 'TSLA' })
    expect(view.result.current.context).toBeNull()

    await waitFor(() => {
      expect(view.result.current.error).toBe(true)
      expect(view.result.current.loading).toBe(false)
    })
    expect(view.result.current.context).toBeNull()
  })

  it('aborts on unmount and never commits the transport\'s late result', async () => {
    const load = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(load.promise)
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => usePulseTextContext('GOOGL'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal

    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      load.resolve(response('GOOGL'))
      await Promise.resolve()
    })
  })

  it('rejects malformed browser payloads and keeps the safe authored fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        news: [{ title: 'unsafe', url: 'javascript:alert(1)', site: '', publishedDate: '' }],
        profile: null,
      }), { status: 200 }),
    ))
    const { result } = renderHook(() => usePulseTextContext('AAPL'))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.context).toBeNull()
  })
})

describe('derivePulseTextMarketValues', () => {
  it('recomputes live change and merges the complete day range with the live range', () => {
    const stream: LiveStreamState = {
      candles: [],
      liveCandle: undefined,
      lastPrice: 110,
      lastChange: null,
      lastChangePct: null,
      previousClose: null,
      dayHigh: 105,
      dayLow: 95,
      connected: true,
      error: null,
    }

    const values = derivePulseTextMarketValues({
      candles: [{
        date: '2026-08-09 10:00:00',
        open: 100,
        high: 120,
        low: 80,
        close: 101,
      }],
      previousClose: 100,
      changePct: 1,
    }, stream)

    expect(values.changePct).toBeCloseTo(10)
    expect(values.dayHigh).toBe(120)
    expect(values.dayLow).toBe(80)
    expect(values.lastPrice).toBe(110)
  })
})
