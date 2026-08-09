import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllSessionMovers: vi.fn(),
  getAllSessionMoversWithStatus: vi.fn(),
  getStocksDataWithStatus: vi.fn(),
  getSparklineIndicesDataWithStatus: vi.fn(),
  unusedLoader: vi.fn(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (loader: () => Promise<unknown>) => loader,
}))

vi.mock('@/lib/async-ttl-cache', () => ({
  createAsyncTTLCache: () => {
    let cached: Promise<unknown> | null = null
    return (loader: () => Promise<unknown>) => {
      cached ??= loader()
      return cached
    }
  },
}))

vi.mock('@/app/actions/market-movers', () => ({
  getAllSessionMovers: mocks.getAllSessionMovers,
  getAllSessionMoversWithStatus: mocks.getAllSessionMoversWithStatus,
}))

vi.mock('@/app/actions/market-data', () => ({
  getAaplMarketData: mocks.unusedLoader,
  getNasdaqMarketData: mocks.unusedLoader,
  getDowMarketData: mocks.unusedLoader,
  getRussellMarketData: mocks.unusedLoader,
  getESFuturesMarketData: mocks.unusedLoader,
  getESFuturesMarketDataWithStatus: mocks.unusedLoader,
}))

vi.mock('@/app/actions/futures', () => ({
  getFuturesWithYTDSparkline: mocks.unusedLoader,
  getFuturesWithYTDSparklineWithStatus: mocks.unusedLoader,
  getFuturesWithHistory: mocks.unusedLoader,
  getFuturesWithHistoryWithStatus: mocks.unusedLoader,
}))

vi.mock('@/app/actions/stocks', () => ({
  getStocksData: mocks.unusedLoader,
  getStocksDataWithStatus: mocks.getStocksDataWithStatus,
}))
vi.mock('@/app/actions/sectors', () => ({ getSectorPerformance: mocks.unusedLoader }))
vi.mock('@/app/actions/vix', () => ({ getVIXData: mocks.unusedLoader }))
vi.mock('@/app/actions/economic-calendar', () => ({ getEconomicEvents: mocks.unusedLoader }))
vi.mock('@/app/actions/get-market-news', () => ({
  getMarketNews: mocks.unusedLoader,
  getMarketNewsWithStatus: mocks.unusedLoader,
}))
vi.mock('@/app/actions/sparkline-indices', () => ({
  getSparklineIndicesData: mocks.unusedLoader,
  getSparklineIndicesDataWithStatus: mocks.getSparklineIndicesDataWithStatus,
}))
vi.mock('@/app/actions/most-active', () => ({ getMostActiveData: mocks.unusedLoader }))
vi.mock('@/app/actions/trending-stocks', () => ({ getTrendingStocksData: mocks.unusedLoader }))
vi.mock('@/app/actions/sp500-movers', () => ({
  getSP500Gainers: mocks.unusedLoader,
  getSP500Losers: mocks.unusedLoader,
}))
vi.mock('@/app/actions/earnings-calendar', () => ({
  fetchEarningsCalendar: mocks.unusedLoader,
  fetchEarningsCalendarWithStatus: mocks.unusedLoader,
}))
vi.mock('@/app/actions/sp500-gainer-sparklines', () => ({
  getSP500GainerSparklines: mocks.unusedLoader,
  getSP500GainerSparklinesWithStatus: mocks.unusedLoader,
}))
vi.mock('@/app/actions/sp500-loser-sparklines', () => ({
  getSP500LoserSparklines: mocks.unusedLoader,
  getSP500LoserSparklinesWithStatus: mocks.unusedLoader,
}))
vi.mock('@/app/actions/stock-sparkline', () => ({ getStockSparkline: mocks.unusedLoader }))
vi.mock('@/app/actions/forex-bonds', () => ({ getForexBondsData: mocks.unusedLoader }))
vi.mock('@/app/actions/insider-trading', () => ({ getLargestInsiderTrades: mocks.unusedLoader }))
vi.mock('@/app/actions/global-indices', () => ({
  getGlobalIndexQuotes: mocks.unusedLoader,
  getFuturesQuotes: mocks.unusedLoader,
}))
vi.mock('@/app/actions/market-summary', () => ({ getCachedMarketSummary: mocks.unusedLoader }))
vi.mock('@/app/actions/market-trends-responses', () => ({ getCachedMarketTrendsBullets: mocks.unusedLoader }))

import {
  fetchAllMarketData,
  fetchFastMarketData,
  fetchLiveMoversMarketData,
} from '@/lib/fetch-market-data'

afterEach(() => {
  vi.useRealTimers()
})

const mover = {
  symbol: 'AAPL',
  name: 'Apple',
  price: 215,
  change: 5,
  changesPercentage: 2.38,
}

describe('fetchLiveMoversMarketData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAllSessionMovers.mockImplementation(async (direction: 'gainers' | 'losers') => ({
      premarket: direction === 'gainers' ? [mover] : [],
      cash: direction === 'gainers' ? [mover] : [],
      afterhours: direction === 'gainers' ? [mover] : [],
      currentSession: 'cash',
    }))
  })

  it('invokes only the two mover loaders instead of the 13-loader fast snapshot fan-out', async () => {
    const result = await fetchLiveMoversMarketData()

    expect(mocks.getAllSessionMovers).toHaveBeenCalledTimes(2)
    expect(mocks.getAllSessionMovers).toHaveBeenNthCalledWith(1, 'gainers')
    expect(mocks.getAllSessionMovers).toHaveBeenNthCalledWith(2, 'losers')
    expect(mocks.unusedLoader).not.toHaveBeenCalled()
    expect(Object.keys(result)).toEqual(['gainers', 'losers'])

    const legacyFastLoaderInvocations = 13
    const liveMoverLoaderInvocations = mocks.getAllSessionMovers.mock.calls.length
    expect(legacyFastLoaderInvocations - liveMoverLoaderInvocations).toBe(11)
    expect(1 - liveMoverLoaderInvocations / legacyFastLoaderInvocations).toBeCloseTo(0.846, 3)
  })
})

describe('fetchFastMarketData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-09T14:30:00.000Z')
    mocks.getAllSessionMoversWithStatus.mockImplementation(
      async (direction: 'gainers' | 'losers') => ({
        premarket: direction === 'gainers' ? [mover] : [],
        cash: direction === 'gainers' ? [mover] : [],
        afterhours: direction === 'gainers' ? [mover] : [],
        currentSession: 'cash',
      }),
    )
    mocks.getStocksDataWithStatus.mockResolvedValue({
      stocks: [{
        symbol: 'AAPL',
        name: 'Apple',
        price: 215,
        change: 5,
        changePercent: 2.38,
      }],
    })
    mocks.getSparklineIndicesDataWithStatus.mockResolvedValue({
      indices: [],
    })
  })

  it('runs only the four sections consumed by the market overview', async () => {
    const result = await fetchFastMarketData()

    expect(mocks.getAllSessionMoversWithStatus).toHaveBeenCalledTimes(2)
    expect(mocks.getStocksDataWithStatus).toHaveBeenCalledTimes(1)
    expect(mocks.getSparklineIndicesDataWithStatus).toHaveBeenCalledTimes(1)
    expect(mocks.unusedLoader).not.toHaveBeenCalled()
    expect(Object.keys(result.data)).toEqual([
      'gainers',
      'losers',
      'stocks',
      'sparklineIndices',
    ])
    expect(result.failedSections).toEqual([])
    expect(result.capturedAt).toBe('2026-08-09T14:30:00.000Z')
  })

  it('omits explicit failures while preserving a successful empty value', async () => {
    mocks.getStocksDataWithStatus.mockResolvedValueOnce({ stocks: [] })
    mocks.getSparklineIndicesDataWithStatus.mockResolvedValueOnce({
      error: 'provider unavailable',
    })

    const result = await fetchFastMarketData()

    expect(result.data).toHaveProperty('stocks', [])
    expect(result.data).not.toHaveProperty('sparklineIndices')
    expect(result.failedSections).toEqual(['sparklineIndices'])
  })
})

describe('fetchAllMarketData provenance', () => {
  it('keeps original capture times across cache hits and preserves the legacy data API', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-09T15:00:00.000Z')
    vi.clearAllMocks()
    mocks.unusedLoader.mockResolvedValue({})
    mocks.getAllSessionMovers.mockImplementation(
      async (direction: 'gainers' | 'losers') => ({
        premarket: direction === 'gainers' ? [mover] : [],
        cash: direction === 'gainers' ? [mover] : [],
        afterhours: direction === 'gainers' ? [mover] : [],
        currentSession: 'cash',
      }),
    )

    const first = await fetchAllMarketData({ withProvenance: true })
    const callsAfterMiss = mocks.unusedLoader.mock.calls.length
    vi.setSystemTime('2026-08-09T15:00:30.000Z')
    const hit = await fetchAllMarketData({ withProvenance: true })
    const legacy = await fetchAllMarketData()

    expect(first.captureTimes).toEqual({
      fastCapturedAt: '2026-08-09T15:00:00.000Z',
      slowCapturedAt: '2026-08-09T15:00:00.000Z',
      globalLoadedAt: '2026-08-09T15:00:00.000Z',
    })
    expect(hit.captureTimes).toEqual(first.captureTimes)
    expect(hit).toBe(first)
    expect(legacy).toBe(first.data)
    expect(mocks.unusedLoader).toHaveBeenCalledTimes(callsAfterMiss)
  })
})
