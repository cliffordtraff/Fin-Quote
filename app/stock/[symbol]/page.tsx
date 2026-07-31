import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import StockPriceHeader from '@/components/StockPriceHeader'
import EmbedChart from '@/components/EmbedChart'
import FinancialStatementsTabs from '@/components/FinancialStatementsTabs'
import NewsFeed from '@/components/NewsFeed'
import CompanyDescription from '@/components/CompanyDescription'
import StockInsiderTrades from '@/components/StockInsiderTrades'
import StockWhyMovingBanner from '@/components/StockWhyMovingBanner'
// CompanySegmentsCard removed — backup preserved in /stock-v1
import { getStockOverview } from '@/app/actions/stock-overview'
import { getStockKeyStats } from '@/app/actions/stock-key-stats'
import { getAllFinancials } from '@/app/actions/get-all-financials'
import { getStockNews } from '@/app/actions/get-stock-news'
import { getCompanyProfile } from '@/app/actions/get-company-profile'
// getSegmentData removed — backup preserved in /stock-v1
import { getInsiderTradesBySymbol } from '@/app/actions/insider-trading'
import { getDiscoverStocks } from '@/app/actions/discover-stocks'
import { getStockWhyMoving } from '@/app/actions/stock-why-moving'
import { isValidSymbol } from '@/lib/symbol-resolver'
import DiscoverMoreCarousel from '@/components/DiscoverMoreCarousel'

interface PageProps {
  params: Promise<{ symbol: string }>
}

// Cached profile loader - shared between metadata and page
const getCachedProfile = cache(async (symbol: string) => {
  return getCompanyProfile(symbol)
})

// Dynamic metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  try {
    const profile = await getCachedProfile(normalizedSymbol)
    if (!profile) {
      return {
        title: `${normalizedSymbol} Stock - The Intraday`,
        description: `Stock data and financials for ${normalizedSymbol}`,
      }
    }
    return {
      title: `${profile.companyName} (${normalizedSymbol}) Stock - Financial Data & Analysis | The Intraday`,
      description: `Comprehensive financial analysis for ${profile.companyName} (${normalizedSymbol}). View income statements, balance sheets, cash flow, 139+ financial metrics, SEC filings, and AI-powered insights.`,
    }
  } catch {
    return {
      title: `${normalizedSymbol} Stock - The Intraday`,
      description: `Stock data and financials for ${normalizedSymbol}`,
    }
  }
}

// Public market data only: render on demand, then serve through ISR.
export const dynamic = 'force-static'
export const revalidate = 60

// Helper function to format values
function formatMetric(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  if (value === 0) {
    return 'N/A'
  }
  return value.toFixed(decimals)
}

// Helper for percentage values
function formatPercentage(
  value: number | null | undefined,
  decimals: number = 2,
  allowZero: boolean = false
): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  if (!allowZero && value === 0) {
    return 'N/A'
  }
  return `${value.toFixed(decimals)}%`
}

export default async function StockPage({ params }: PageProps) {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  // Validate symbol exists
  const valid = await isValidSymbol(normalizedSymbol)
  if (!valid) {
    notFound()
  }

  // Parallel data fetching for all sections
  const [overview, keyStats, financials, news, profile, insiderResult, discoverResult, whyMoving] = await Promise.all([
    getStockOverview(normalizedSymbol).catch(() => null),
    getStockKeyStats(normalizedSymbol).catch(() => null),
    getAllFinancials(normalizedSymbol).catch(() => ({ incomeStatement: [], balanceSheet: [], cashFlow: [] })),
    getStockNews(normalizedSymbol, 30).catch(() => []),
    getCachedProfile(normalizedSymbol).catch(() => null),
    getInsiderTradesBySymbol(normalizedSymbol, 20).catch(() => ({ trades: [] })),
    getDiscoverStocks(normalizedSymbol, 12).catch(() => ({ stocks: [] })),
    getStockWhyMoving(normalizedSymbol).catch(() => null),
  ])

  // Extract insider trades from result
  const insiderTrades = 'trades' in insiderResult ? insiderResult.trades : []
  const discoverStocks = 'stocks' in discoverResult ? discoverResult.stocks : []

  // If we couldn't get basic overview data, show a message
  if (!overview || !keyStats) {
    return (
      <AppShell mainClassName="mx-auto w-full max-w-[1500px] min-w-0 flex-1 px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-semibold text-gray-950 dark:text-white">
          {normalizedSymbol}
        </h1>
        <p className="text-amber-600 dark:text-amber-400">
          Data for {normalizedSymbol} is currently unavailable. Please try again shortly.
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell showFooter mainClassName="min-w-0 flex-1">
      {/* Stock Header Section - Sticky with Client-Side Polling */}
      <StockPriceHeader
        symbol={normalizedSymbol}
        companyName={overview.company.name}
        sector={overview.company.sector}
        initialPrice={overview.currentPrice}
        initialPriceChange={overview.priceChange}
        initialPriceChangePercent={overview.priceChangePercent}
        initialMarketStatus={overview.marketStatus}
      />

      {whyMoving?.status === 'found' && whyMoving.displayText && (
        <section className="bg-cream-100 dark:bg-gray-900">
          <div className="mx-auto max-w-[1500px] px-4 pt-2 pb-0 sm:px-6 lg:px-8">
            <StockWhyMovingBanner whyMoving={whyMoving} />
          </div>
        </section>
      )}

      {/* Price Chart Section */}
      <section className="bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1500px] px-4 pt-0 pb-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-cream-100 dark:bg-gray-900 border border-cream-300 dark:border-gray-700 overflow-hidden">
            <EmbedChart symbol={normalizedSymbol} />
          </div>
        </div>
      </section>

      {/* Quick Stats Grid Section - Finviz Style */}
      <section className="bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 p-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
              {/* Column 1: Company Info */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Index</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.index || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Market Cap</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.marketCap >= 1e12
                      ? `${(keyStats.marketCap / 1e12).toFixed(2)}T`
                      : `${(keyStats.marketCap / 1e9).toFixed(2)}B`}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Enterprise Value</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.enterpriseValue >= 1e12
                      ? `${(keyStats.enterpriseValue / 1e12).toFixed(2)}T`
                      : `${(keyStats.enterpriseValue / 1e9).toFixed(2)}B`}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Income</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${(keyStats.income / 1e9).toFixed(2)}B
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Sales</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${(keyStats.sales / 1e9).toFixed(2)}B
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Employees</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.employees?.toLocaleString() || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Column 2: Valuation Ratios */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">P/E</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.peRatio)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">P/S</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.priceToSales)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">P/B</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.priceToBook)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">P/C</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.priceToCashFlow)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">EV/EBITDA</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.evToEbitda)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">EV/Sales</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.evToSales)}
                  </span>
                </div>
              </div>

              {/* Column 3: EPS & Margins */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">EPS (ttm)</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.eps)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Earnings</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.earningsDate || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Gross Margin</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.grossMargin, 2, true)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Oper. Margin</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.operatingMargin, 2, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Profit Margin</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.netMargin, 2, true)}
                  </span>
                </div>
              </div>

              {/* Column 4: Market Data */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.volume ? `${(keyStats.volume / 1e6).toFixed(2)}M` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Shs Outstand</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.sharesOutstanding
                      ? `${(keyStats.sharesOutstanding / 1e9).toFixed(2)}B`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Change</span>
                  <span
                    className={`font-medium ${keyStats.change !== null && keyStats.change < 0 ? 'text-red-600' : keyStats.change !== null && keyStats.change > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.change)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Dividend Est.</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.dividendEst)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Dividend Ex-Date</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.dividendExDate || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Column 5: Performance */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf YTD</span>
                  <span
                    className={`font-medium ${keyStats.perfYTD !== null && keyStats.perfYTD < 0 ? 'text-red-600' : keyStats.perfYTD !== null && keyStats.perfYTD > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfYTD)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf Year</span>
                  <span
                    className={`font-medium ${keyStats.perfYear !== null && keyStats.perfYear < 0 ? 'text-red-600' : keyStats.perfYear !== null && keyStats.perfYear > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfYear)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf 3Y</span>
                  <span
                    className={`font-medium ${keyStats.perf3Y !== null && keyStats.perf3Y < 0 ? 'text-red-600' : keyStats.perf3Y !== null && keyStats.perf3Y > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perf3Y)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf 5Y</span>
                  <span
                    className={`font-medium ${keyStats.perf5Y !== null && keyStats.perf5Y < 0 ? 'text-red-600' : keyStats.perf5Y !== null && keyStats.perf5Y > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perf5Y)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf 10Y</span>
                  <span
                    className={`font-medium ${keyStats.perf10Y !== null && keyStats.perf10Y < 0 ? 'text-red-600' : keyStats.perf10Y !== null && keyStats.perf10Y > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perf10Y)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">IPO</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.ipoDate || 'N/A'}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* News Section */}
      <section className="bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 p-6">
            <NewsFeed news={news} />
          </div>
        </div>
      </section>

      {/* Insider Trading Section */}
      <section className="bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 p-6">
            <StockInsiderTrades symbol={normalizedSymbol} trades={insiderTrades} />
          </div>
        </div>
      </section>

      {/* Company Description Section */}
      {profile && (
        <section className="bg-cream-100 dark:bg-gray-900">
          <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
            <div className="rounded-lg bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 p-6">
              <CompanyDescription
                description={profile.description}
                ceo={profile.ceo}
                fullTimeEmployees={profile.fullTimeEmployees}
                website={profile.website}
              />
            </div>
          </div>
        </section>
      )}

      {/* Financial Statements Section */}
      <section className="border-b border-cream-300 dark:border-gray-700 bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 p-6">
            {financials.incomeStatement.length > 0 ||
            financials.balanceSheet.length > 0 ||
            financials.cashFlow.length > 0 ? (
              <FinancialStatementsTabs
                incomeStatement={financials.incomeStatement}
                balanceSheet={financials.balanceSheet}
                cashFlow={financials.cashFlow}
              />
            ) : (
              <div className="text-amber-600 dark:text-amber-400 text-center py-8">
                Financial statements for {normalizedSymbol} are not yet available.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Discover More Carousel */}
      {discoverStocks.length > 0 && (
        <DiscoverMoreCarousel stocks={discoverStocks} />
      )}

    </AppShell>
  )
}
