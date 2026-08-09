import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WATCHLIST_QUOTE_CLIENT_DEADLINE_MS,
  WATCHLIST_QUOTE_REFRESH_INTERVAL_MS,
  useWatchlistBatchQuotes,
} from '@/lib/hooks/use-watchlist-quotes'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function quote(symbol: string, price = 100) {
  return {
    symbol,
    name: `${symbol} Incorporated`,
    price,
    change: 1,
    changesPercentage: 1,
  }
}

function response(symbols: readonly string[], startPrice = 100): Response {
  return new Response(JSON.stringify({
    quotes: symbols.map((symbol, index) => quote(symbol, startPrice + index)),
  }), { status: 200 })
}

async function flush(turns = 10) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve()
}

function setVisibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

function requestSignal(call: unknown[]): AbortSignal {
  return (call[1] as RequestInit).signal as AbortSignal
}

describe('useWatchlistBatchQuotes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-09T14:00:00.000Z')
    setVisibility('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('loads one ordered batch and schedules the next refresh from settlement', async () => {
    const first = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(response(['NVDA', 'MSFT'], 200))
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() =>
      useWatchlistBatchQuotes(['NVDA', 'MSFT'], true),
    )
    await act(flush)

    expect(result.current.status).toBe('loading')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/watchlist/quotes')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ symbols: ['NVDA', 'MSFT'] }),
      cache: 'no-store',
      credentials: 'same-origin',
      method: 'POST',
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(response(['NVDA', 'MSFT']))
      await flush()
    })
    expect(result.current.quotes.NVDA?.price).toBe(100)
    expect(result.current.status).toBe('ready')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_REFRESH_INTERVAL_MS - 1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.quotes.NVDA?.price).toBe(200)
    expect(result.current.status).toBe('ready')
    unmount()
  })

  it('does not overlap when an aborted transport ignores its signal', async () => {
    const first = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(response(['NVDA'], 300))
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() =>
      useWatchlistBatchQuotes(['NVDA'], true),
    )
    await act(flush)
    const firstSignal = requestSignal(fetchMock.mock.calls[0])

    act(() => window.dispatchEvent(new Event('focus')))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WATCHLIST_QUOTE_CLIENT_DEADLINE_MS
          + WATCHLIST_QUOTE_REFRESH_INTERVAL_MS,
      )
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(response(['NVDA'], 999))
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(flush)
    expect(result.current.quotes.NVDA?.price).toBe(300)
    unmount()
  })

  it('pauses hidden, coalesces visible plus focus, and aborts on unmount', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => useWatchlistBatchQuotes(['NVDA'], true))
    await act(flush)
    const firstSignal = requestSignal(fetchMock.mock.calls[0])

    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * WATCHLIST_QUOTE_REFRESH_INTERVAL_MS)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(response(['NVDA'], 999))
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondSignal = requestSignal(fetchMock.mock.calls[1])
    expect(view.result.current.quotes.NVDA).toBeUndefined()

    view.unmount()
    expect(secondSignal.aborted).toBe(true)
    second.resolve(response(['NVDA']))
  })

  it('fences removed symbols and keeps same-symbol last-good data on failures', async () => {
    const stale = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(response(['MSFT'], 200))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [quote('WRONG', 900)],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(response(['MSFT'], 300))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender, unmount } = renderHook(
      ({ symbols }) => useWatchlistBatchQuotes(symbols, true),
      { initialProps: { symbols: ['NVDA'] } },
    )
    await act(flush)

    rerender({ symbols: ['MSFT'] })
    await act(async () => {
      stale.resolve(response(['NVDA'], 999))
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.quotes.NVDA).toBeUndefined()
    expect(result.current.quotes.MSFT?.price).toBe(200)
    expect(result.current.status).toBe('ready')

    for (let refresh = 0; refresh < 2; refresh += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_REFRESH_INTERVAL_MS)
        await flush()
      })
      expect(result.current.quotes.MSFT?.price).toBe(200)
      expect(result.current.status).toBe('stale')
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_REFRESH_INTERVAL_MS)
      await flush()
    })
    expect(result.current.quotes.MSFT?.price).toBe(300)
    expect(result.current.status).toBe('ready')
    unmount()
  })

  it('gives add requests a real deadline without opening a second physical slot', async () => {
    const background = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(background.promise)
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() =>
      useWatchlistBatchQuotes(['NVDA'], true),
    )
    await act(flush)

    let added!: Promise<unknown>
    act(() => {
      added = result.current.loadSymbol('MSFT')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCHLIST_QUOTE_CLIENT_DEADLINE_MS)
    })
    await expect(added).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    background.resolve(response(['NVDA']))
    await act(flush)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('exposes unavailable state, keeps the automatic retry, and supports Retry now', async () => {
    const manualRetry = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockReturnValueOnce(manualRetry.promise)
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() =>
      useWatchlistBatchQuotes(['NVDA'], true),
    )
    await act(flush)

    expect(result.current.status).toBe('unavailable')
    expect(result.current.quotes).toEqual({})
    act(() => result.current.retry())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('loading')

    await act(async () => {
      manualRetry.resolve(response(['NVDA'], 250))
      await flush()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.quotes.NVDA?.price).toBe(250)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WATCHLIST_QUOTE_REFRESH_INTERVAL_MS - 1,
      )
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('cancels an add queued behind refresh when any visible-list identity changes', async () => {
    const background = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(background.promise)
      .mockResolvedValue(response(['NVDA']))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender, unmount } = renderHook(
      ({ identity }) => useWatchlistBatchQuotes(
        ['NVDA'],
        true,
        identity,
      ),
      { initialProps: { identity: 'AAPL|NVDA' } },
    )
    await act(flush)

    let added!: Promise<unknown>
    act(() => {
      added = result.current.loadSymbol('MSFT')
    })
    rerender({ identity: 'NVDA|AAPL' })
    await expect(added).resolves.toBeNull()

    await act(async () => {
      background.resolve(response(['NVDA'], 200))
      await flush()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.some((call) => {
      const body = JSON.parse((call[1] as RequestInit).body as string) as {
        symbols: string[]
      }
      return body.symbols.includes('MSFT')
    })).toBe(false)
    expect(result.current.quotes.NVDA?.price).toBe(200)
    unmount()
  })

  it('aborts and fences an active add when the visible list changes', async () => {
    const addLoad = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(addLoad.promise)
      .mockResolvedValue(response(['NVDA'], 300))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender, unmount } = renderHook(
      ({ identity, symbols }) => useWatchlistBatchQuotes(
        symbols,
        true,
        identity,
      ),
      { initialProps: { identity: 'AAPL', symbols: [] as string[] } },
    )
    await act(flush)

    let added!: Promise<unknown>
    act(() => {
      added = result.current.loadSymbol('MSFT')
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const addSignal = requestSignal(fetchMock.mock.calls[0])

    rerender({ identity: 'AAPL|NVDA', symbols: ['NVDA'] })
    expect(addSignal.aborted).toBe(true)
    await expect(added).resolves.toBeNull()
    await act(async () => {
      addLoad.resolve(response(['MSFT'], 999))
      await flush()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.quotes.MSFT).toBeUndefined()
    expect(result.current.quotes.NVDA?.price).toBe(300)
    unmount()
  })
})
