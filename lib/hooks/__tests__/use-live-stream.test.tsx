import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveStream } from '@/lib/hooks/use-live-stream'
import {
  MULTI_STREAM_BACKFILL_DEADLINE_MS,
  useMultiStream,
} from '@/lib/hooks/use-multi-stream'

class MockEventSource {
  static instances: MockEventSource[] = []

  readonly url: string
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  close = vi.fn()
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  open() {
    this.onopen?.(new Event('open'))
  }

  emit(type: string, payload: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(payload) })
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function jsonResponse(
  payload: unknown,
  init: { ok: boolean; status: number },
): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: vi.fn().mockResolvedValue(payload),
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

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

function candle(time: number, close = 101) {
  return {
    time,
    open: 100,
    high: Math.max(102, close),
    low: 99,
    close,
    volume: 10,
  }
}

describe('live stream backfill degradation', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    setVisibility('visible')
    vi.stubGlobal('EventSource', MockEventSource)
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('retains a typed backfill issue while continuing to a connected live stream', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(
      {
        error: 'Second-level backfill requires the Massive data provider.',
        code: 'UNSUPPORTED_BACKFILL_PROVIDER',
      },
      { ok: false, status: 501 },
    ))

    const { result, unmount } = renderHook(() => useLiveStream('AAPL', '1s'))

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    await waitFor(() => expect(result.current.backfillIssue).toEqual({
      code: 'UNSUPPORTED_BACKFILL_PROVIDER',
      message: 'Second-level backfill requires the Massive data provider.',
      status: 501,
    }))

    act(() => MockEventSource.instances[0].open())

    expect(result.current.connected).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.backfillIssue?.code).toBe('UNSUPPORTED_BACKFILL_PROVIDER')

    unmount()
    expect(MockEventSource.instances[0].close).toHaveBeenCalledTimes(1)
  })

  it('deduplicates multi-stream backfill and preserves per-symbol issues', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(
      {
        error: 'Second-level backfill requires the Massive data provider.',
        code: 'UNSUPPORTED_BACKFILL_PROVIDER',
      },
      { ok: false, status: 501 },
    ))

    const { result } = renderHook(() => useMultiStream(
      ['AAPL', 'AAPL', 'MSFT'],
      '10s',
    ))

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(MockEventSource.instances[0].url).toBe(
      '/api/stream/multi?symbols=AAPL,MSFT&timeframe=10s',
    )
    await waitFor(() => {
      expect(result.current.AAPL.backfillIssue?.code).toBe(
        'UNSUPPORTED_BACKFILL_PROVIDER',
      )
      expect(result.current.MSFT.backfillIssue?.code).toBe(
        'UNSUPPORTED_BACKFILL_PROVIDER',
      )
    })

    act(() => MockEventSource.instances[0].open())
    expect(result.current.AAPL.connected).toBe(true)
    expect(result.current.MSFT.connected).toBe(true)
  })

  it('treats a wrong-symbol 200 backfill as malformed without poisoning state', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      symbol: 'NVDA',
      candles: [candle(1_786_276_800)],
      previousClose: 98,
      dayHigh: 103,
      dayLow: 97,
    }, { ok: true, status: 200 }))

    const { result } = renderHook(() => useMultiStream(['AAPL'], '1s'))
    await waitFor(() => {
      expect(result.current.AAPL.backfillIssue?.code).toBe(
        'BACKFILL_MALFORMED_RESPONSE',
      )
    })
    expect(result.current.AAPL.candles).toEqual([])
    expect(result.current.AAPL.previousClose).toBeNull()
  })

  it('opens live transport before a hung backfill and aborts it at the deadline', async () => {
    vi.useFakeTimers()
    const load = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(load.promise)

    const { unmount } = renderHook(() => useLiveStream('AAPL', '1s'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toBe(
      '/api/stream/multi?symbols=AAPL&timeframe=1s',
    )
    const signal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal as AbortSignal
    expect(signal.aborted).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_STREAM_BACKFILL_DEADLINE_MS)
    })
    expect(signal.aborted).toBe(true)
    expect(MockEventSource.instances).toHaveLength(1)
    unmount()
  })

  it('closes listeners and aborts backfill while hidden, then resumes exactly once', async () => {
    const loads = [deferred<Response>(), deferred<Response>()]
    vi.mocked(fetch)
      .mockReturnValueOnce(loads[0].promise)
      .mockReturnValueOnce(loads[1].promise)
    const view = renderHook(() => useMultiStream(['AAPL'], '1s'))
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    const firstSignal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal as AbortSignal

    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(firstSignal.aborted).toBe(true)
    expect(MockEventSource.instances[0].close).toHaveBeenCalled()

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {
      await Promise.resolve()
    })
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(2))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    const secondSignal = (vi.mocked(fetch).mock.calls[1][1] as RequestInit).signal as AbortSignal

    view.unmount()
    expect(secondSignal.aborted).toBe(true)
    expect(MockEventSource.instances[1].close).toHaveBeenCalled()
  })

  it('replaces one visible session on focus and fences late events from the old source', async () => {
    const loads = [deferred<Response>(), deferred<Response>()]
    vi.mocked(fetch)
      .mockReturnValueOnce(loads[0].promise)
      .mockReturnValueOnce(loads[1].promise)
    const { result, unmount } = renderHook(() => useMultiStream(['AAPL'], '1s'))
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    const first = MockEventSource.instances[0]
    act(() => first.emit('candle', {
      symbol: 'AAPL',
      ...candle(1_786_276_800, 101),
    }))
    expect(result.current.AAPL.lastPrice).toBe(101)

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(2))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(first.close).toHaveBeenCalledTimes(1)

    act(() => {
      first.emit('candle', {
        symbol: 'AAPL',
        ...candle(1_786_276_801, 999),
      })
    })
    expect(result.current.AAPL.lastPrice).toBe(101)

    act(() => MockEventSource.instances[1].emit('candle', {
      symbol: 'AAPL',
      ...candle(1_786_276_801, 105),
    }))
    expect(result.current.AAPL.lastPrice).toBe(105)
    unmount()
  })

  it('deduplicates visible focus bursts across separate microtasks', async () => {
    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    )
    const view = renderHook(() => useMultiStream(['AAPL'], '1s'))
    expect(MockEventSource.instances).toHaveLength(1)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      await Promise.resolve()
    })
    expect(MockEventSource.instances).toHaveLength(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)

    now = 1_100
    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      await Promise.resolve()
    })
    expect(MockEventSource.instances).toHaveLength(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)

    now = 1_251
    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      await Promise.resolve()
    })
    expect(MockEventSource.instances).toHaveLength(3)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
    view.unmount()
  })

  it('rejects malformed/wrong-symbol SSE and lets newer live candles beat late backfill', async () => {
    const load = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(load.promise)
    const { result } = renderHook(() => useMultiStream(['AAPL'], '1s'))
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
    const eventSource = MockEventSource.instances[0]

    act(() => {
      eventSource.emit('candle', { symbol: 'NVDA', ...candle(1_786_276_802, 999) })
      eventSource.emit('candle', {
        symbol: 'AAPL',
        ...candle(1_786_276_802, 999),
        high: 90,
      })
      eventSource.emit('candle', { symbol: 'AAPL', ...candle(1_786_276_802, 105) })
    })
    expect(result.current.AAPL.candles).toHaveLength(1)
    expect(result.current.AAPL.lastPrice).toBe(105)

    load.resolve(jsonResponse({
      symbol: 'AAPL',
      candles: [
        candle(1_786_276_800, 100),
        candle(1_786_276_802, 101),
      ],
      previousClose: 98,
      dayHigh: 103,
      dayLow: 97,
    }, { ok: true, status: 200 }))

    await waitFor(() => expect(result.current.AAPL.previousClose).toBe(98))
    expect(result.current.AAPL.candles.map((item) => [item.time, item.close]))
      .toEqual([
        [1_786_276_800, 100],
        [1_786_276_802, 105],
      ])
    expect(result.current.AAPL.lastPrice).toBe(105)
    expect(result.current.AAPL.dayHigh).toBe(105)
  })
})
