import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOREX_BOND_PANEL } from '@/lib/forex-bonds-panel'

const mocks = vi.hoisted(() => ({
  es: vi.fn(),
  esLegacy: vi.fn(),
  futures: vi.fn(),
  futuresHistory: vi.fn(),
  sectors: vi.fn(),
  economic: vi.fn(),
  news: vi.fn(),
  earnings: vi.fn(),
  gainerSparklines: vi.fn(),
  loserSparklines: vi.fn(),
  stockSparkline: vi.fn(),
  forex: vi.fn(),
  insiders: vi.fn(),
  unused: vi.fn(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (loader: () => Promise<unknown>) => loader,
}))
vi.mock('@/app/actions/market-data', () => ({
  getAaplMarketData: mocks.unused,
  getNasdaqMarketData: mocks.unused,
  getDowMarketData: mocks.unused,
  getRussellMarketData: mocks.unused,
  getESFuturesMarketData: mocks.esLegacy,
  getESFuturesMarketDataWithStatus: mocks.es,
}))
vi.mock('@/app/actions/futures', () => ({
  getFuturesWithYTDSparkline: mocks.futures,
  getFuturesWithYTDSparklineWithStatus: mocks.futures,
  getFuturesWithHistory: mocks.futuresHistory,
  getFuturesWithHistoryWithStatus: mocks.futuresHistory,
}))
vi.mock('@/app/actions/market-movers', () => ({
  getAllSessionMovers: mocks.unused,
}))
vi.mock('@/app/actions/stocks', () => ({ getStocksData: mocks.unused }))
vi.mock('@/app/actions/sectors', () => ({ getSectorPerformance: mocks.sectors }))
vi.mock('@/app/actions/vix', () => ({ getVIXData: mocks.unused }))
vi.mock('@/app/actions/economic-calendar', () => ({
  getEconomicEvents: mocks.economic,
}))
vi.mock('@/app/actions/get-market-news', () => ({
  getMarketNews: mocks.unused,
  getMarketNewsWithStatus: mocks.news,
}))
vi.mock('@/app/actions/sparkline-indices', () => ({
  getSparklineIndicesData: mocks.unused,
}))
vi.mock('@/app/actions/most-active', () => ({ getMostActiveData: mocks.unused }))
vi.mock('@/app/actions/trending-stocks', () => ({
  getTrendingStocksData: mocks.unused,
}))
vi.mock('@/app/actions/sp500-movers', () => ({
  getSP500Gainers: mocks.unused,
  getSP500Losers: mocks.unused,
}))
vi.mock('@/app/actions/earnings-calendar', () => ({
  fetchEarningsCalendar: mocks.unused,
  fetchEarningsCalendarWithStatus: mocks.earnings,
}))
vi.mock('@/app/actions/sp500-gainer-sparklines', () => ({
  getSP500GainerSparklines: mocks.gainerSparklines,
  getSP500GainerSparklinesWithStatus: mocks.gainerSparklines,
}))
vi.mock('@/app/actions/sp500-loser-sparklines', () => ({
  getSP500LoserSparklines: mocks.loserSparklines,
  getSP500LoserSparklinesWithStatus: mocks.loserSparklines,
}))
vi.mock('@/app/actions/stock-sparkline', () => ({
  getStockSparkline: mocks.stockSparkline,
}))
vi.mock('@/app/actions/forex-bonds', () => ({
  getForexBondsData: mocks.forex,
}))
vi.mock('@/app/actions/insider-trading', () => ({
  getLargestInsiderTrades: mocks.insiders,
}))
vi.mock('@/app/actions/global-indices', () => ({
  getGlobalIndexQuotes: mocks.unused,
  getFuturesQuotes: mocks.unused,
}))
vi.mock('@/app/actions/market-summary', () => ({
  getCachedMarketSummary: mocks.unused,
}))
vi.mock('@/app/actions/market-trends-responses', () => ({
  getCachedMarketTrendsBullets: mocks.unused,
}))

import { fetchSlowMarketData } from '@/lib/fetch-market-data'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function forexPanel() {
  return FOREX_BOND_PANEL.map(({ symbol, name }, index) => ({
    symbol,
    name,
    price: 100 + index,
    change: 1,
    changesPercentage: 1,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.es.mockResolvedValue({
    currentPrice: 1,
    priceChange: 0,
    priceChangePercent: 0,
    date: '2026-08-08',
    priceHistory: [],
  })
  mocks.futures.mockResolvedValue({ futures: [] })
  mocks.futuresHistory.mockResolvedValue({ futuresWithHistory: [] })
  mocks.sectors.mockResolvedValue({ sectors: [] })
  mocks.economic.mockResolvedValue({ events: [] })
  mocks.news.mockResolvedValue({ news: [] })
  mocks.earnings.mockResolvedValue({ earnings: [], totalCount: 0 })
  mocks.gainerSparklines.mockResolvedValue({ sparklines: [] })
  mocks.loserSparklines.mockResolvedValue({ sparklines: [] })
  mocks.stockSparkline.mockResolvedValue({})
  mocks.forex.mockResolvedValue({ forexBonds: forexPanel() })
  mocks.insiders.mockResolvedValue({ trades: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('slow market data failure provenance', () => {
  it('captures provenance when the source fan-out finishes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const newsLoad = deferred<{ news: [] }>()
    mocks.news.mockReturnValueOnce(newsLoad.promise)

    const pending = fetchSlowMarketData()
    vi.setSystemTime('2026-08-08T14:00:05.000Z')
    newsLoad.resolve({ news: [] })

    await expect(pending).resolves.toMatchObject({
      capturedAt: '2026-08-08T14:00:05.000Z',
    })
  })

  it('marks explicit error unions and thrown loaders without inferring from emptiness', async () => {
    mocks.es.mockResolvedValue({ error: 'ES candle outage' })
    mocks.sectors.mockResolvedValue({ error: 'sector outage' })
    mocks.news.mockResolvedValue({ error: 'news outage' })
    mocks.earnings.mockResolvedValue({ error: 'earnings outage' })
    mocks.gainerSparklines.mockResolvedValue({ error: 'mover outage' })
    mocks.insiders.mockResolvedValue({ error: 'insider outage' })
    mocks.stockSparkline.mockImplementation((symbol: string) =>
      symbol === 'META' ? Promise.reject(new Error('sparkline outage')) : {},
    )

    const result = await fetchSlowMarketData()

    expect(result.failedSections).toEqual([
      'esFutures',
      'sectors',
      'marketNews',
      'earnings',
      'earningsTotalCount',
      'sp500GainerSparklines',
      'metaSparkline',
      'largeInsiderTrades',
    ])
    expect(result.data).toMatchObject({
      esFutures: null,
      sectors: [],
      marketNews: [],
      earnings: [],
      earningsTotalCount: 0,
      sp500GainerSparklines: [],
      metaSparkline: null,
      largeInsiderTrades: [],
    })
  })

  it('treats successful empty sections as authoritative healthy values', async () => {
    const result = await fetchSlowMarketData()

    expect(result.failedSections).toEqual([])
    expect(mocks.es).toHaveBeenCalledTimes(1)
    expect(mocks.esLegacy).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({
      futures: [],
      sectors: [],
      economicEvents: [],
      marketNews: [],
      earnings: [],
      earningsTotalCount: 0,
      sp500GainerSparklines: [],
      metaSparkline: null,
      largeInsiderTrades: [],
    })
  })

  it('carries an incomplete forex action result as explicit panel failure', async () => {
    mocks.forex.mockResolvedValue({ error: 'Incomplete forex/bonds data' })

    const result = await fetchSlowMarketData()

    expect(result.failedSections).toContain('forexBonds')
    expect(result.data.forexBonds).toEqual([])
  })
})
