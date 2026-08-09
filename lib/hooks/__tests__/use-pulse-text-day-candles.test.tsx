import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PULSE_TEXT_DAY_POLL_INTERVAL_MS,
  PULSE_TEXT_DAY_REQUEST_DEADLINE_MS,
  usePulseTextDayCandles,
} from '@/lib/hooks/use-pulse-text-day-candles'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function payload(symbol: string, close = 101) {
  return {
    symbol,
    todayOHLC: [{
      date: '2026-08-09 10:00:00',
      open: 100,
      high: Math.max(102, close),
      low: 99,
      close,
    }],
    previousClose: 98,
  }
}

function response(symbol: string, close = 101): Response {
  return new Response(JSON.stringify(payload(symbol, close)), { status: 200 })
}

async function flush(turns = 8) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve()
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

describe('usePulseTextDayCandles', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('runs one exact four-symbol fanout and schedules only after settlement', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const symbol = /stock-intraday\/([^?]+)/.exec(url)?.[1] ?? ''
      return response(symbol)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => usePulseTextDayCandles())
    await act(flush)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/stock-intraday/GOOGL?interval=1',
      '/api/stock-intraday/AAPL?interval=1',
      '/api/stock-intraday/NVDA?interval=1',
      '/api/stock-intraday/TSLA?interval=1',
    ])
    expect(Object.keys(view.result.current)).toEqual([
      'GOOGL',
      'AAPL',
      'NVDA',
      'TSLA',
    ])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_TEXT_DAY_POLL_INTERVAL_MS - 1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
    view.unmount()
  })

  it('releases an abort-ignoring logical slot and coalesces hide/show/focus', async () => {
    const loads = Array.from({ length: 8 }, () => deferred<Response>())
    const fetchMock = vi.fn((_: string, init?: RequestInit) => {
      const index = fetchMock.mock.calls.length - 1
      void init
      return loads[index].promise
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => usePulseTextDayCandles())
    await act(flush)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const initialSignals = fetchMock.mock.calls.map((call) =>
      (call[1] as RequestInit).signal as AbortSignal
    )

    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(initialSignals.every((signal) => signal.aborted)).toBe(true)
    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(flush)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(fetchMock).toHaveBeenCalledTimes(8)

    await act(async () => {
      loads.slice(0, 4).forEach((load, index) => {
        const symbol = ['GOOGL', 'AAPL', 'NVDA', 'TSLA'][index]
        load.resolve(response(symbol, 999))
      })
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(view.result.current.AAPL).toBeUndefined()

    const resumedSignals = fetchMock.mock.calls.slice(4).map((call) =>
      (call[1] as RequestInit).signal as AbortSignal
    )
    view.unmount()
    expect(resumedSignals.every((signal) => signal.aborted)).toBe(true)
  })

  it('focus supersedes an active generation without waiting for transport settlement', async () => {
    const loads = Array.from({ length: 8 }, () => deferred<Response>())
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url
      void _init
      const index = fetchMock.mock.calls.length - 1
      return loads[index].promise
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => usePulseTextDayCandles())
    await act(flush)
    const oldSignals = fetchMock.mock.calls.map((call) =>
      (call[1] as RequestInit).signal as AbortSignal
    )

    act(() => window.dispatchEvent(new Event('focus')))
    expect(oldSignals.every((signal) => signal.aborted)).toBe(true)
    await act(flush)
    expect(fetchMock).toHaveBeenCalledTimes(8)

    await act(async () => {
      loads.slice(0, 4).forEach((load, index) => {
        load.resolve(response(['GOOGL', 'AAPL', 'NVDA', 'TSLA'][index], 999))
      })
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(result.current.AAPL).toBeUndefined()

    await act(async () => {
      loads.slice(4).forEach((load, index) => {
        load.resolve(response(['GOOGL', 'AAPL', 'NVDA', 'TSLA'][index], 105))
      })
      await flush()
    })
    expect(result.current.AAPL?.candles[0].close).toBe(105)
    unmount()
  })

  it('commits partial progress and repolls when one transport ignores the deadline abort', async () => {
    const callCounts = new Map<string, number>()
    const pending = deferred<Response>()
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      void _init
      const symbol = /stock-intraday\/([^?]+)/.exec(url)?.[1] ?? ''
      const count = (callCounts.get(symbol) ?? 0) + 1
      callCounts.set(symbol, count)
      if (count === 1) return Promise.resolve(response(symbol, 101))
      if (symbol === 'AAPL') {
        return Promise.resolve(response('NVDA', 999))
      }
      if (symbol === 'TSLA') return pending.promise
      return Promise.resolve(response(symbol, 102))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => usePulseTextDayCandles())
    await act(flush)
    expect(result.current.AAPL?.candles[0].close).toBe(101)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_TEXT_DAY_POLL_INTERVAL_MS)
      await flush()
    })
    const secondSignals = fetchMock.mock.calls.slice(4).map((call) =>
      (call[1] as RequestInit).signal as AbortSignal
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_TEXT_DAY_REQUEST_DEADLINE_MS)
      await flush()
    })
    expect(secondSignals.every((signal) => signal.aborted)).toBe(true)
    expect(result.current.AAPL?.candles[0].close).toBe(101)
    expect(result.current.GOOGL?.candles[0].close).toBe(102)
    expect(result.current.NVDA?.candles[0].close).toBe(102)
    expect(result.current.TSLA?.candles[0].close).toBe(101)
    expect(fetchMock).toHaveBeenCalledTimes(8)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_TEXT_DAY_POLL_INTERVAL_MS)
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(12)
    unmount()
  })
})
