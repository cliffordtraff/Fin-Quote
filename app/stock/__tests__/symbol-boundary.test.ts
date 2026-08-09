import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(),
  getSymbolValidity: vi.fn(),
  getBoundedStockPageEssentials: vi.fn(),
  getCompanyProfile: vi.fn(),
  getStockOverview: vi.fn(),
  getStockKeyStats: vi.fn(),
  getAllFinancials: vi.fn(),
  getStockNews: vi.fn(),
  getInsiderTradesBySymbol: vi.fn(),
  getDiscoverStocks: vi.fn(),
  getStockWhyMoving: vi.fn(),
  getStockCatalystHistory: vi.fn(),
  stockWhyMovingBanner: vi.fn(() => null),
  asyncStockCatalystHistory: vi.fn<(props: unknown) => null>(() => null),
  getSegmentData: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(loader: T) => loader,
  }
})

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}))

vi.mock('@/lib/symbol-resolver', () => ({
  getSymbolValidity: mocks.getSymbolValidity,
}))

vi.mock('@/lib/stock-page-essential-admission', () => ({
  getBoundedStockPageEssentials: mocks.getBoundedStockPageEssentials,
}))

vi.mock('@/app/actions/stock-overview', () => ({
  getStockOverview: mocks.getStockOverview,
}))
vi.mock('@/app/actions/stock-key-stats', () => ({
  getStockKeyStats: mocks.getStockKeyStats,
}))
vi.mock('@/app/actions/get-all-financials', () => ({
  getAllFinancials: mocks.getAllFinancials,
}))
vi.mock('@/app/actions/get-stock-news', () => ({
  getStockNews: mocks.getStockNews,
}))
vi.mock('@/app/actions/get-company-profile', () => ({
  getCompanyProfile: mocks.getCompanyProfile,
}))
vi.mock('@/app/actions/insider-trading', () => ({
  getInsiderTradesBySymbol: mocks.getInsiderTradesBySymbol,
}))
vi.mock('@/app/actions/discover-stocks', () => ({
  getDiscoverStocks: mocks.getDiscoverStocks,
}))
vi.mock('@/app/actions/stock-why-moving', () => ({
  getStockWhyMoving: mocks.getStockWhyMoving,
}))
vi.mock('@/lib/stock-catalyst-history', () => ({
  getStockCatalystHistory: mocks.getStockCatalystHistory,
}))
vi.mock('@/app/actions/segment-data', () => ({
  getSegmentData: mocks.getSegmentData,
}))

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children?: ReactNode }) => children ?? null,
}))
vi.mock('@/components/Navigation', () => ({ default: () => null }))
vi.mock('@/components/StockPriceHeader', () => ({ default: () => null }))
vi.mock('@/components/EmbedChart', () => ({ default: () => null }))
vi.mock('@/components/FinancialStatementsTabs', () => ({ default: () => null }))
vi.mock('@/components/NewsFeed', () => ({ default: () => null }))
vi.mock('@/components/CompanyDescription', () => ({ default: () => null }))
vi.mock('@/components/StockInsiderTrades', () => ({ default: () => null }))
vi.mock('@/components/StockWhyMovingBanner', () => ({
  default: mocks.stockWhyMovingBanner,
}))
vi.mock('@/components/StockCatalystHistory', () => ({
  default: () => null,
  AsyncStockCatalystHistory: mocks.asyncStockCatalystHistory,
}))
vi.mock('@/components/CompanySegmentsCard', () => ({ default: () => null }))
vi.mock('@/components/DiscoverMoreCarousel', () => ({ default: () => null }))

const pageVariants = [
  {
    name: 'current stock page',
    load: () => import('@/app/stock/[symbol]/page'),
  },
  {
    name: 'stock-v1 page',
    load: () => import('@/app/stock-v1/[symbol]/page'),
  },
] as const

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

const overview = {
  company: {
    name: 'Apple Inc.',
    symbol: 'AAPL',
    sector: 'Technology',
    industry: 'Consumer Electronics',
  },
  currentPrice: 210,
  priceChange: 1,
  priceChangePercent: 0.48,
  marketStatus: 'open' as const,
}

describe.each(pageVariants)('$name symbol boundary', ({ name, load }) => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    mocks.getSymbolValidity.mockResolvedValue('valid')
    mocks.getBoundedStockPageEssentials.mockResolvedValue(null)
    mocks.getCompanyProfile.mockResolvedValue(null)
    mocks.getStockOverview.mockResolvedValue(null)
    mocks.getStockKeyStats.mockResolvedValue(null)
    mocks.getAllFinancials.mockResolvedValue({
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
    })
    mocks.getStockNews.mockResolvedValue([])
    mocks.getInsiderTradesBySymbol.mockResolvedValue({ trades: [] })
    mocks.getDiscoverStocks.mockResolvedValue({ stocks: [] })
    mocks.getStockWhyMoving.mockResolvedValue(null)
    mocks.getStockCatalystHistory.mockResolvedValue({
      status: 'empty',
      items: [],
    })
    mocks.getSegmentData.mockResolvedValue({ data: null })
  })

  it('rejects malformed symbols before database or provider work', async () => {
    const page = await load()
    const params = Promise.resolve({ symbol: '../AAPL' })

    await expect(page.default({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(page.generateMetadata({ params })).resolves.toMatchObject({
      title: expect.stringContaining('Stock - The Intraday'),
    })

    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
  })

  it('rejects quote-compatible futures before registry or provider work', async () => {
    const page = await load()
    const params = Promise.resolve({ symbol: 'ES=F' })

    await expect(page.default({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(page.generateMetadata({ params })).resolves.toEqual({
      title: 'ES=F Stock - The Intraday',
      description: 'Stock data and financials for ES=F',
    })

    expect(mocks.getSymbolValidity).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
  })

  it('starts no provider work while validation is pending or after an authoritative miss', async () => {
    const validityLoad = deferred<'not_found'>()
    mocks.getSymbolValidity.mockReturnValue(validityLoad.promise)
    const page = await load()
    const params = Promise.resolve({ symbol: 'ZZZZ' })
    const pageResult = page.default({ params })
    await flushMicrotasks()

    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockNews).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()

    validityLoad.resolve('not_found')

    await expect(pageResult).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(page.generateMetadata({ params })).resolves.toEqual({
      title: 'ZZZZ Stock - The Intraday',
      description: 'Stock data and financials for ZZZZ',
    })

    expect(mocks.notFound).toHaveBeenCalledTimes(1)
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
  })

  it('uses only the bounded essential lease during registry unavailability', async () => {
    mocks.getSymbolValidity.mockResolvedValue('unavailable')
    const page = await load()
    const params = Promise.resolve({ symbol: 'AAPL' })

    await expect(page.default({ params })).resolves.toBeTruthy()
    await expect(page.generateMetadata({ params })).resolves.toEqual({
      title: 'AAPL Stock - The Intraday',
      description: 'Stock data and financials for AAPL',
    })

    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockNews).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
  })

  it('renders through a bounded outage confirmation and then unlocks heavy loaders', async () => {
    mocks.getSymbolValidity.mockResolvedValue('unavailable')
    const confirmedProfile = {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
    }
    mocks.getBoundedStockPageEssentials.mockResolvedValue({
      overview,
      profile: confirmedProfile,
    })
    const page = await load()
    const params = Promise.resolve({ symbol: 'AAPL' })

    await expect(page.default({ params })).resolves.toBeTruthy()
    await expect(page.generateMetadata({ params })).resolves.toMatchObject({
      title: expect.stringContaining('Apple Inc. (AAPL)'),
    })

    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getBoundedStockPageEssentials).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockKeyStats).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockNews).toHaveBeenCalledWith('AAPL', expect.any(Number))
    if (name === 'current stock page') {
      expect(mocks.getStockCatalystHistory).toHaveBeenCalledWith('AAPL')
    } else {
      expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
    }
  })

  it('does not admit an outage quote without an identity-validated company profile', async () => {
    mocks.getSymbolValidity.mockResolvedValue('unavailable')
    mocks.getBoundedStockPageEssentials.mockResolvedValue({
      overview,
      profile: null,
    })
    const page = await load()

    await expect(page.default({
      params: Promise.resolve({ symbol: 'EURUSD' }),
    })).resolves.toBeTruthy()

    expect(mocks.getBoundedStockPageEssentials).toHaveBeenCalledWith('EURUSD')
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockNews).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it('starts valid essentials only after admission and unlocks heavy work once overview succeeds', async () => {
    const validityLoad = deferred<'valid'>()
    const overviewLoad = deferred<typeof overview>()
    const profileLoad = deferred<null>()
    mocks.getSymbolValidity.mockReturnValue(validityLoad.promise)
    mocks.getStockOverview.mockReturnValue(overviewLoad.promise)
    mocks.getCompanyProfile.mockReturnValue(profileLoad.promise)
    const page = await load()
    const pageResult = page.default({
      params: Promise.resolve({ symbol: 'AAPL' }),
    })
    await flushMicrotasks()

    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()

    validityLoad.resolve('valid')
    await flushMicrotasks()
    expect(mocks.getStockOverview).toHaveBeenCalledWith('AAPL')
    expect(mocks.getCompanyProfile).toHaveBeenCalledWith('AAPL')
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()

    overviewLoad.resolve(overview)
    await flushMicrotasks()
    expect(mocks.getStockKeyStats).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockNews).toHaveBeenCalledWith('AAPL', expect.any(Number))
    if (name === 'current stock page') {
      expect(mocks.getStockCatalystHistory).toHaveBeenCalledWith('AAPL')
    }

    profileLoad.resolve(null)
    await expect(pageResult).resolves.toBeTruthy()
  })

  it('returns transient unavailable immediately for a null valid overview without heavy work', async () => {
    const profileLoad = deferred<null>()
    mocks.getStockOverview.mockResolvedValue(null)
    mocks.getCompanyProfile.mockReturnValue(profileLoad.promise)
    const page = await load()

    await expect(page.default({
      params: Promise.resolve({ symbol: 'AAPL' }),
    })).resolves.toBeTruthy()

    expect(mocks.getStockOverview).toHaveBeenCalledWith('AAPL')
    expect(mocks.getCompanyProfile).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockKeyStats).not.toHaveBeenCalled()
    expect(mocks.getStockNews).not.toHaveBeenCalled()
    expect(mocks.getStockCatalystHistory).not.toHaveBeenCalled()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it.each([
    ['brk-a', 'BRK.A', 'Berkshire Hathaway Inc.'],
    ['bf-b', 'BF.B', 'Brown-Forman Corporation'],
  ])('canonicalizes class-share alias %s across admission and heavy page reads', async (
    rawSymbol,
    canonicalSymbol,
    companyName,
  ) => {
    mocks.getStockOverview.mockResolvedValue({
      ...overview,
      company: { ...overview.company, name: companyName, symbol: canonicalSymbol },
    })
    mocks.getCompanyProfile.mockResolvedValue({
      symbol: canonicalSymbol,
      companyName,
    })
    const page = await load()
    const params = Promise.resolve({ symbol: rawSymbol })

    await expect(page.generateMetadata({ params })).resolves.toMatchObject({
      title: expect.stringContaining(`${companyName} (${canonicalSymbol})`),
    })
    await expect(page.default({ params })).resolves.toBeTruthy()

    expect(mocks.getSymbolValidity).toHaveBeenCalledWith(canonicalSymbol)
    expect(mocks.getCompanyProfile).toHaveBeenCalledWith(canonicalSymbol)
    expect(mocks.getStockOverview).toHaveBeenCalledWith(canonicalSymbol)
    expect(mocks.getStockKeyStats).toHaveBeenCalledWith(canonicalSymbol)
    expect(mocks.getAllFinancials).toHaveBeenCalledWith(canonicalSymbol)
    expect(mocks.getStockNews).toHaveBeenCalledWith(
      canonicalSymbol,
      expect.any(Number),
    )
    expect(mocks.getInsiderTradesBySymbol).toHaveBeenCalledWith(
      canonicalSymbol,
      20,
    )
    expect(mocks.getBoundedStockPageEssentials).not.toHaveBeenCalled()
    if (name === 'current stock page') {
      expect(mocks.getStockCatalystHistory).toHaveBeenCalledWith(canonicalSymbol)
    }
  })

  it('keeps catalyst history unavailability non-fatal after stock admission', async () => {
    if (name !== 'current stock page') return

    mocks.getStockOverview.mockResolvedValue(overview)
    mocks.getStockCatalystHistory.mockRejectedValue(
      new Error('history database unavailable'),
    )
    const page = await load()

    await expect(page.default({
      params: Promise.resolve({ symbol: 'AAPL' }),
    })).resolves.toBeTruthy()

    expect(mocks.getStockCatalystHistory).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockKeyStats).toHaveBeenCalledWith('AAPL')
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it('does not await catalyst history before returning the admitted stock page', async () => {
    if (name !== 'current stock page') return

    const catalystLoad = deferred<never>()
    mocks.getStockOverview.mockResolvedValue(overview)
    mocks.getStockCatalystHistory.mockReturnValue(catalystLoad.promise)
    const page = await load()

    await expect(page.default({
      params: Promise.resolve({ symbol: 'AAPL' }),
    })).resolves.toBeTruthy()

    expect(mocks.getStockCatalystHistory).toHaveBeenCalledWith('AAPL')
    expect(mocks.getStockKeyStats).toHaveBeenCalledWith('AAPL')
  })

  it('preserves current why-moving context when ready history contains only older entries', async () => {
    if (name !== 'current stock page') return

    mocks.getStockOverview.mockResolvedValue(overview)
    mocks.getStockWhyMoving.mockResolvedValue({
      status: 'found',
      displayText: 'Apple moved after reporting quarterly results.',
    })
    mocks.getStockCatalystHistory.mockResolvedValue({
      status: 'ready',
      items: [{ summaryDate: '2026-08-01' }],
    })
    const page = await load()

    const tree = await page.default({
      params: Promise.resolve({ symbol: 'AAPL' }),
    })
    renderToStaticMarkup(tree)

    expect(mocks.stockWhyMovingBanner).toHaveBeenCalledTimes(1)
    expect(mocks.asyncStockCatalystHistory).toHaveBeenCalledTimes(1)
    expect(mocks.asyncStockCatalystHistory.mock.calls[0]?.[0]).toMatchObject({
      currentSummaryText: 'Apple moved after reporting quarterly results.',
    })
  })
})
