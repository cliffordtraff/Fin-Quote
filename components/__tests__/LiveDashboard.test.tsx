import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoverData } from '@/app/actions/market-movers'
import type { StockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'
import LiveDashboard from '@/components/LiveDashboard'

vi.mock('liveline', () => ({
  Liveline: () => null,
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light' }),
}))

vi.mock('@/lib/hooks/use-live-stream', () => ({
  useLiveStream: () => ({
    candles: [],
    liveCandle: undefined,
    lastPrice: null,
    lastChange: null,
    lastChangePct: null,
    previousClose: null,
    connected: false,
    error: null,
  }),
}))

vi.mock('@/lib/hooks/use-replay', () => ({
  useReplay: () => ({
    candles: [],
    liveCandle: undefined,
    lastPrice: null,
    lastChange: null,
    lastChangePct: null,
    previousClose: null,
    error: null,
    mode: 'static',
    status: 'idle',
    speed: 1,
    totalCandles: 0,
    revealedCount: 0,
    play: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    skip: vi.fn(),
    setMode: vi.fn(),
    setSpeed: vi.fn(),
  }),
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mover(symbol: string, changesPercentage = 1): MoverData {
  return {
    symbol,
    name: `${symbol} Inc`,
    price: 100,
    change: changesPercentage,
    changesPercentage,
  }
}

function ohlc(symbol: string, name = `${symbol} Company`, currentPrice = 100): StockIntradayOHLC {
  return {
    symbol,
    name,
    currentPrice,
    priceChange: 1,
    priceChangePercent: 1,
    yesterdayOHLC: [],
    todayOHLC: [],
    previousClose: currentPrice - 1,
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function moversResponse(gainers: MoverData[], losers: MoverData[] = []) {
  return jsonResponse({
    gainers: {
      premarket: [],
      cash: gainers,
      afterhours: [],
      currentSession: 'cash',
    },
    losers: {
      premarket: [],
      cash: losers,
      afterhours: [],
      currentSession: 'cash',
    },
  })
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === 'string' ? input : input.toString()
}

function callsFor(fetchMock: ReturnType<typeof vi.fn>, fragment: string) {
  return fetchMock.mock.calls.filter(([input]) => requestUrl(input as RequestInfo | URL).includes(fragment))
}

function requestSignal(call: unknown[]) {
  return (call[1] as RequestInit | undefined)?.signal as AbortSignal | undefined
}

function renderDashboard({
  symbol = 'AMD',
  gainers = [mover(symbol)],
  losers = [],
}: {
  symbol?: string
  gainers?: MoverData[]
  losers?: MoverData[]
} = {}) {
  return render(
    <LiveDashboard
      initialGainers={gainers}
      initialLosers={losers}
      initialGainerOHLC={symbol ? ohlc(symbol) : null}
      initialSession="cash"
    />,
  )
}

describe('LiveDashboard polling reliability', () => {
  let visibilitySpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('polls the route-specific live movers snapshot instead of the broad fast snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(moversResponse([], []))
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard({ symbol: '', gainers: [] })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/market-snapshot/live-movers',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(callsFor(fetchMock, '/api/market-snapshot/fast')).toHaveLength(0)
  })

  it('never overlaps a movers, OHLC, or quote cadence with itself', async () => {
    const firstMovers = deferred<Response>()
    const firstOHLC = deferred<Response>()
    const firstQuote = deferred<Response>()
    const routeCounts = { movers: 0, ohlc: 0, quote: 0 }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) {
        routeCounts.movers += 1
        return routeCounts.movers === 1 ? firstMovers.promise : Promise.resolve(moversResponse([mover('AMD')]))
      }
      if (url.includes('/stock-intraday/')) {
        routeCounts.ohlc += 1
        return routeCounts.ohlc === 1 ? firstOHLC.promise : Promise.resolve(jsonResponse(ohlc('AMD')))
      }
      routeCounts.quote += 1
      return routeCounts.quote === 1
        ? firstQuote.promise
        : Promise.resolve(jsonResponse({ price: 101, change: 1, changesPercentage: 1, previousClose: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })

    expect(routeCounts).toEqual({ movers: 1, ohlc: 1, quote: 1 })

    await act(async () => {
      firstMovers.resolve(moversResponse([mover('AMD')]))
      firstOHLC.resolve(jsonResponse(ohlc('AMD')))
      firstQuote.resolve(jsonResponse({ price: 101, change: 1, changesPercentage: 1, previousClose: 100 }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(routeCounts.movers).toBe(2)
    expect(routeCounts.ohlc).toBe(2)
    expect(routeCounts.quote).toBeGreaterThan(1)
  })

  it('aborts all active polls while hidden, refreshes on visibility, and cancels on unmount', async () => {
    const fetchMock = vi.fn(() => deferred<Response>().promise)
    vi.stubGlobal('fetch', fetchMock)

    const view = renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(callsFor(fetchMock, '/api/quote/')).toHaveLength(1)
    expect(callsFor(fetchMock, '/stock-intraday/')).toHaveLength(1)
    expect(callsFor(fetchMock, '/live-movers')).toHaveLength(1)

    visibilitySpy.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    for (const call of fetchMock.mock.calls) {
      expect(requestSignal(call)?.aborted).toBe(true)
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    visibilitySpy.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(fetchMock).toHaveBeenCalledTimes(6)

    const resumedCalls = fetchMock.mock.calls.slice(3)
    view.unmount()
    for (const call of resumedCalls) {
      expect(requestSignal(call)?.aborted).toBe(true)
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('aborts active work and refreshes every enabled loop when the window regains focus', async () => {
    const firstQuote = deferred<Response>()
    let quoteCalls = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('AMD')]))
      if (url.includes('/stock-intraday/')) return Promise.resolve(jsonResponse(ohlc('AMD')))
      quoteCalls += 1
      if (quoteCalls === 1) return firstQuote.promise
      return Promise.resolve(jsonResponse({ price: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    const firstQuoteCall = callsFor(fetchMock, '/api/quote/')[0]

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(requestSignal(firstQuoteCall)?.aborted).toBe(true)
    expect(callsFor(fetchMock, '/api/quote/')).toHaveLength(2)
    expect(callsFor(fetchMock, '/stock-intraday/')).toHaveLength(1)
    expect(callsFor(fetchMock, '/live-movers')).toHaveLength(1)
  })

  it('ignores an abort-resistant old OHLC response after a mover-triggered symbol switch', async () => {
    const oldOHLC = deferred<Response>()
    const newOHLC = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('TSM')]))
      if (url.includes('/stock-intraday/AMD')) return oldOHLC.promise
      if (url.includes('/stock-intraday/TSM')) return newOHLC.promise
      return Promise.resolve(jsonResponse({ price: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('TSM')
    const oldCall = callsFor(fetchMock, '/stock-intraday/AMD')[0]
    expect(requestSignal(oldCall)?.aborted).toBe(true)
    expect(callsFor(fetchMock, '/stock-intraday/TSM')).toHaveLength(1)

    await act(async () => {
      newOHLC.resolve(jsonResponse(ohlc('TSM', 'Fresh TSM', 222)))
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      // Deliberately resolve after abort to model a transport that ignores it.
      oldOHLC.resolve(jsonResponse(ohlc('AMD', 'Stale AMD', 999)))
      await Promise.resolve()
      await Promise.resolve()
    })

    const heading = screen.getByRole('heading', { level: 1 }).textContent
    expect(heading).toContain('Fresh TSM')
    expect(heading).not.toContain('Stale AMD')
  })

  it('fetches OHLC immediately when movers select the first symbol on an empty dashboard', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('AAPL')]))
      if (url.includes('/stock-intraday/AAPL')) return Promise.resolve(jsonResponse(ohlc('AAPL')))
      return Promise.resolve(jsonResponse({ price: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard({ symbol: '', gainers: [] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(callsFor(fetchMock, '/stock-intraday/AAPL?interval=5')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('AAPL')
  })

  it('invalidates an old timeframe response and only installs the requested interval', async () => {
    const fiveMinuteOHLC = deferred<Response>()
    const oneMinuteOHLC = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('AMD')]))
      if (url.includes('/stock-intraday/AMD?interval=5')) return fiveMinuteOHLC.promise
      if (url.includes('/stock-intraday/AMD?interval=1')) return oneMinuteOHLC.promise
      return Promise.resolve(jsonResponse({ price: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    fireEvent.click(screen.getByRole('button', { name: '1m' }))
    await act(async () => {
      await Promise.resolve()
    })

    const oldCall = callsFor(fetchMock, 'interval=5')[0]
    expect(requestSignal(oldCall)?.aborted).toBe(true)
    expect(callsFor(fetchMock, 'interval=1')).toHaveLength(1)

    await act(async () => {
      oneMinuteOHLC.resolve(jsonResponse(ohlc('AMD', 'Fresh one minute')))
      await Promise.resolve()
      fiveMinuteOHLC.resolve(jsonResponse(ohlc('AMD', 'Stale five minute')))
      await Promise.resolve()
      await Promise.resolve()
    })

    const heading = screen.getByRole('heading', { level: 1 }).textContent
    expect(heading).toContain('Fresh one minute')
    expect(heading).not.toContain('Stale five minute')
  })

  it('keeps a selected loser when it remains in the refreshed loser list', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/live-movers')) {
        return Promise.resolve(moversResponse([mover('NEWGAIN')], [mover('LOSE', -2)]))
      }
      if (url.includes('/stock-intraday/')) return Promise.resolve(jsonResponse(ohlc('LOSE')))
      return Promise.resolve(jsonResponse({ price: 99 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard({
      symbol: 'LOSE',
      gainers: [mover('GAIN')],
      losers: [mover('LOSE', -2)],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Top Losers' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('LOSE')
    expect(callsFor(fetchMock, '/stock-intraday/NEWGAIN')).toHaveLength(0)
  })

  it('clears prior OHLC immediately and leaves it cleared when a new symbol fetch fails', async () => {
    const failedSelection = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/stock-intraday/MSFT')) return failedSelection.promise
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('AMD')]))
      return Promise.resolve(jsonResponse({ price: 100 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'MSFT' }))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Microsoft')
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('AMD Company')

    await act(async () => {
      failedSelection.resolve(jsonResponse({ error: 'unavailable' }, 503))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Microsoft')
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('AMD Company')
  })

  it('recovers at the normal cadence after a request failure', async () => {
    let quoteCalls = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.includes('/api/quote/')) {
        quoteCalls += 1
        return quoteCalls === 1
          ? Promise.reject(new Error('temporary failure'))
          : Promise.resolve(jsonResponse({ price: 123 }))
      }
      if (url.includes('/live-movers')) return Promise.resolve(moversResponse([mover('AMD')]))
      return Promise.resolve(jsonResponse(ohlc('AMD')))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(4_999)
    })
    expect(quoteCalls).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(quoteCalls).toBe(2)
  })

  it('aborts live polling when replay starts', async () => {
    const fetchMock = vi.fn(() => deferred<Response>().promise)
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    const quoteCall = callsFor(fetchMock, '/api/quote/')[0]
    expect(requestSignal(quoteCall)?.aborted).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Replay' }))

    expect(requestSignal(quoteCall)?.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts REST symbol polling when switching into streaming mode', async () => {
    const fetchMock = vi.fn(() => deferred<Response>().promise)
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    const quoteCall = callsFor(fetchMock, '/api/quote/')[0]
    const ohlcCall = callsFor(fetchMock, '/stock-intraday/')[0]
    expect(requestSignal(quoteCall)?.aborted).toBe(false)
    expect(requestSignal(ohlcCall)?.aborted).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '1s' }))

    expect(requestSignal(quoteCall)?.aborted).toBe(true)
    expect(requestSignal(ohlcCall)?.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(callsFor(fetchMock, '/api/quote/')).toHaveLength(1)
    expect(callsFor(fetchMock, '/stock-intraday/')).toHaveLength(1)
  })
})
