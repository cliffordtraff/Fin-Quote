import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AllMarketData } from '@/lib/market-types'
import {
  DASHBOARD_INDEX_SYMBOLS,
  DASHBOARD_STOCK_SYMBOLS,
} from '@/lib/dashboard-fixed-panels'
import { FOREX_BOND_SYMBOLS } from '@/lib/forex-bonds-panel'
import { useDashboardMarketSnapshots } from '@/lib/hooks/use-dashboard-market-snapshots'

const INITIAL_AT = '2026-08-09T14:00:00.000Z'
const FAST_AT = '2026-08-09T14:30:00.000Z'
const SLOW_AT = '2026-08-09T14:25:00.000Z'
const INITIAL_CAPTURE_TIMES = {
  fastCapturedAt: INITIAL_AT,
  slowCapturedAt: INITIAL_AT,
  globalLoadedAt: INITIAL_AT,
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

function movers(symbol: string) {
  const item = {
    symbol,
    name: symbol,
    price: 100,
    change: 1,
    changesPercentage: 1,
  }
  return {
    premarket: [item],
    cash: [item],
    afterhours: [item],
    currentSession: 'cash' as const,
  }
}

function initialData(): AllMarketData {
  return {
    spx: null,
    nasdaq: null,
    dow: null,
    russell: null,
    esFutures: null,
    futures: [],
    futuresWithHistory: [],
    gainers: movers('OLD-GAINER'),
    losers: movers('OLD-LOSER'),
    stocks: [{
      symbol: 'OLD',
      name: 'Old stock',
      price: 1,
      change: 0,
      changePercent: 0,
    }],
    sectors: [{ sector: 'Old sector', changesPercentage: '1' }],
    vix: null,
    economicEvents: [],
    marketNews: [],
    sparklineIndices: [{ symbol: 'OLD-INDEX' }] as AllMarketData['sparklineIndices'],
    mostActive: [],
    trending: [],
    sp500Gainers: [],
    sp500Losers: [],
    earnings: [],
    earningsTotalCount: 0,
    sp500GainerSparklines: [],
    sp500LoserSparklines: [],
    metaSparkline: null,
    xlbSparkline: null,
    forexBonds: [],
    largeInsiderTrades: [],
    globalIndexQuotes: [],
    globalFuturesQuotes: [],
    marketSummary: '',
    marketTrendsBullets: [],
  }
}

function fastBody(overrides: Record<string, unknown> = {}) {
  return {
    gainers: movers('NEW-GAINER'),
    losers: movers('NEW-LOSER'),
    stocks: DASHBOARD_STOCK_SYMBOLS.map((symbol) => ({
      symbol,
      name: symbol,
      price: 100,
      change: 1,
      changePercent: 1,
    })),
    sparklineIndices: DASHBOARD_INDEX_SYMBOLS.map((symbol) => ({
      symbol,
      name: symbol,
      currentPrice: 100,
      priceChange: 1,
      priceChangePercent: 1,
      yesterdayChangePercent: null,
      priceHistory: [],
      priceTimestamps: [],
      yesterdayOHLC: [],
      todayOHLC: [],
      previousClose: null,
      todayStartIndex: null,
    })),
    ...overrides,
  }
}

function slowBody(overrides: Record<string, unknown> = {}) {
  return {
    esFutures: null,
    futures: [],
    futuresWithHistory: [],
    sectors: [],
    economicEvents: [],
    marketNews: [],
    earnings: [],
    earningsTotalCount: 0,
    sp500GainerSparklines: [],
    sp500LoserSparklines: [],
    metaSparkline: null,
    xlbSparkline: null,
    forexBonds: FOREX_BOND_SYMBOLS.map((symbol) => ({
      symbol,
      name: symbol,
      price: 1,
      change: 0,
      changesPercentage: 0,
    })),
    largeInsiderTrades: [],
    ...overrides,
  }
}

function snapshotResponse(
  kind: 'fast' | 'slow',
  body: unknown,
  options: { capturedAt?: string; degraded?: string; status?: number } = {},
) {
  const headers = new Headers({
    'content-type': 'application/json',
    'X-Snapshot': kind,
    'X-Snapshot-Captured-At':
      options.capturedAt ?? (kind === 'fast' ? FAST_AT : SLOW_AT),
  })
  if (options.degraded) {
    headers.set('X-Snapshot-Degraded', options.degraded)
  }
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers,
  })
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString()
}

function requestSignal(call: unknown[]): AbortSignal {
  return (call[1] as RequestInit).signal as AbortSignal
}

describe('useDashboardMarketSnapshots', () => {
  let visibilitySpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(INITIAL_AT)
    visibilitySpy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('initializes each freshness clock from the cached snapshot provenance', () => {
    vi.stubGlobal('fetch', vi.fn())
    const captureTimes = {
      fastCapturedAt: '2026-08-09T13:58:00.000Z',
      slowCapturedAt: '2026-08-09T13:55:00.000Z',
      globalLoadedAt: '2026-08-09T13:50:00.000Z',
    }

    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(initialData(), captureTimes, INITIAL_AT),
    )

    expect(result.current.freshness).toMatchObject(captureTimes)
    expect(result.current.clockAt).toBe(INITIAL_AT)
  })

  it('serializes the recursive auto cadence and schedules from settlement', async () => {
    const first = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(snapshotResponse('fast', fastBody()))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.advanceTimersByTimeAsync(11_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(snapshotResponse('fast', fastBody()))
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts on hide, refreshes on visibility and focus, and aborts on unmount', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    visibilitySpy.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(requestSignal(fetchMock.mock.calls[0]).aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    visibilitySpy.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    act(() => window.dispatchEvent(new Event('focus')))
    expect(requestSignal(fetchMock.mock.calls[1]).aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    view.unmount()
    expect(requestSignal(fetchMock.mock.calls[2]).aborted).toBe(true)
  })

  it('suppresses an older automatic fast patch without changing data or freshness', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      snapshotResponse('fast', fastBody(), {
        capturedAt: '2026-08-09T13:59:59.000Z',
        degraded: 'stocks',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(result.current.data.stocks[0]?.symbol).toBe('OLD')
    expect(result.current.data.gainers.cash[0]?.symbol).toBe('OLD-GAINER')
    expect(result.current.freshness).toEqual({
      ...INITIAL_CAPTURE_TIMES,
      fastDegradedSections: [],
      slowDegradedSections: [],
    })
    expect(result.current.clockAt).toBe(INITIAL_AT)
  })

  it('keeps a degraded fixed panel while applying a successful empty dynamic section', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      snapshotResponse(
        'fast',
        fastBody({
          gainers: {
            premarket: [],
            cash: [],
            afterhours: [],
            currentSession: 'cash',
          },
          sparklineIndices: [{ symbol: 'STALE' }],
        }),
        { degraded: 'sparkline-indices' },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(result.current.data.gainers.cash).toEqual([])
    expect(result.current.data.sparklineIndices[0]?.symbol).toBe('OLD-INDEX')
    expect(result.current.freshness.fastDegradedSections).toEqual([
      'sparklineIndices',
    ])
  })

  it('lets a manual refresh supersede auto work and reports a slow-only success accurately', async () => {
    const lateAuto = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input)
      if (fetchMock.mock.calls.length === 1) return lateAuto.promise
      if (url.endsWith('/fast')) {
        return Promise.resolve(
          snapshotResponse('fast', { error: true }, { status: 503 }),
        )
      }
      return Promise.resolve(
        snapshotResponse('slow', slowBody({
          sectors: [{ sector: 'Fresh slow', changesPercentage: '2' }],
        })),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    let refresh!: Promise<void>
    await act(async () => {
      refresh = result.current.refreshDashboard()
      // Synchronous re-entry must not start a second fast/slow pair.
      void result.current.refreshDashboard()
      await refresh
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.data.stocks[0]?.symbol).toBe('OLD')
    expect(result.current.data.sectors[0]?.sector).toBe('Fresh slow')
    expect(result.current.refreshError).toBe(
      'Slower sections refreshed; live prices remain on their previous snapshot.',
    )

    await act(async () => {
      lateAuto.resolve(snapshotResponse('fast', fastBody({
        stocks: [{ symbol: 'LATE' }],
      })))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.data.stocks[0]?.symbol).toBe('OLD')
  })

  it.each([
    {
      label: 'clears a recovered fast-only warning',
      slowResponse: snapshotResponse('slow', slowBody()),
      autoCapturedAt: FAST_AT,
      expectedBefore:
        'Slower sections refreshed; live prices remain on their previous snapshot.',
      expectedAfter: null,
      expectedSymbol: 'AAPL',
    },
    {
      label: 'keeps an unresolved slow warning after fast recovery',
      slowResponse: snapshotResponse('slow', { error: true }, { status: 503 }),
      autoCapturedAt: FAST_AT,
      expectedBefore: 'Market data could not be refreshed.',
      expectedAfter:
        'Core prices refreshed; some slower sections remain on their previous snapshot.',
      expectedSymbol: 'AAPL',
    },
    {
      label: 'does not treat an older automatic patch as fast recovery',
      slowResponse: snapshotResponse('slow', slowBody()),
      autoCapturedAt: '2026-08-09T13:59:59.000Z',
      expectedBefore:
        'Slower sections refreshed; live prices remain on their previous snapshot.',
      expectedAfter:
        'Slower sections refreshed; live prices remain on their previous snapshot.',
      expectedSymbol: 'OLD',
    },
  ])('$label', async ({
    slowResponse,
    autoCapturedAt,
    expectedBefore,
    expectedAfter,
    expectedSymbol,
  }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        snapshotResponse('fast', { error: true }, { status: 503 }),
      )
      .mockResolvedValueOnce(slowResponse)
      .mockResolvedValueOnce(
        snapshotResponse('fast', fastBody(), { capturedAt: autoCapturedAt }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await result.current.refreshDashboard()
    })
    expect(result.current.refreshError).toBe(expectedBefore)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(result.current.refreshError).toBe(expectedAfter)
    expect(result.current.data.stocks[0]?.symbol).toBe(expectedSymbol)
  })

  it('treats an older manual slow patch as failed while applying newer fast data', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (urlOf(input).endsWith('/fast')) {
        return Promise.resolve(snapshotResponse('fast', fastBody()))
      }
      return Promise.resolve(snapshotResponse(
        'slow',
        slowBody({
          sectors: [{ sector: 'Stale slow', changesPercentage: '9' }],
        }),
        { capturedAt: '2026-08-09T13:59:59.000Z' },
      ))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await result.current.refreshDashboard()
    })

    expect(result.current.data.stocks[0]?.symbol).toBe('AAPL')
    expect(result.current.data.sectors[0]?.sector).toBe('Old sector')
    expect(result.current.freshness).toMatchObject({
      fastCapturedAt: FAST_AT,
      slowCapturedAt: INITIAL_AT,
      slowDegradedSections: [],
    })
    expect(result.current.refreshError).toBe(
      'Core prices refreshed; some slower sections remain on their previous snapshot.',
    )
  })

  it('leaves every capture clock unchanged when both manual patches are older', async () => {
    const olderAt = '2026-08-09T13:59:59.000Z'
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        urlOf(input).endsWith('/fast')
          ? snapshotResponse('fast', fastBody(), { capturedAt: olderAt })
          : snapshotResponse('slow', slowBody(), { capturedAt: olderAt }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await result.current.refreshDashboard()
    })

    expect(result.current.data.stocks[0]?.symbol).toBe('OLD')
    expect(result.current.data.sectors[0]?.sector).toBe('Old sector')
    expect(result.current.freshness).toEqual({
      ...INITIAL_CAPTURE_TIMES,
      fastDegradedSections: [],
      slowDegradedSections: [],
    })
    expect(result.current.clockAt).toBe(INITIAL_AT)
    expect(result.current.refreshError).toBe(
      'Market data could not be refreshed.',
    )
  })

  it('filters slow degraded fallbacks and advances only the matching timestamps', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input)
      if (url.endsWith('/fast')) {
        return Promise.resolve(snapshotResponse('fast', fastBody()))
      }
      return Promise.resolve(snapshotResponse(
        'slow',
        slowBody({
          sectors: [{ sector: 'Do not apply', changesPercentage: '99' }],
          marketNews: [{
            title: 'Fresh headline',
            text: '',
            url: 'https://example.test/story',
            publishedDate: SLOW_AT,
            site: 'Example',
          }],
        }),
        { degraded: 'sectors' },
      ))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() =>
      useDashboardMarketSnapshots(
        initialData(),
        INITIAL_CAPTURE_TIMES,
        INITIAL_AT,
      ),
    )

    await act(async () => {
      await result.current.refreshDashboard()
    })

    expect(result.current.data.sectors[0]?.sector).toBe('Old sector')
    expect(result.current.data.marketNews[0]?.title).toBe('Fresh headline')
    expect(result.current.freshness).toMatchObject({
      fastCapturedAt: FAST_AT,
      slowCapturedAt: SLOW_AT,
      globalLoadedAt: INITIAL_AT,
      slowDegradedSections: ['sectors'],
    })
    expect(result.current.refreshError).toBe(
      'Core prices refreshed; some slower sections remain on their previous snapshot.',
    )
  })
})
