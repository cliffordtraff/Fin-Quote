import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Navigation from '@/components/Navigation'
import StockPriceHeader from '@/components/StockPriceHeader'
import StockPriceChart from '@/components/StockPriceChart'
import FinancialStatementsTabs from '@/components/FinancialStatementsTabs'
import NewsFeed from '@/components/NewsFeed'
import CompanyDescription from '@/components/CompanyDescription'
import StockInsiderTrades from '@/components/StockInsiderTrades'
import { getStockOverview } from '@/app/actions/stock-overview'
import { getStockKeyStats } from '@/app/actions/stock-key-stats'
import { getAllFinancials } from '@/app/actions/get-all-financials'
import { getStockNews } from '@/app/actions/get-stock-news'
import { getCompanyProfile } from '@/app/actions/get-company-profile'
import { getInsiderTradesBySymbol } from '@/app/actions/insider-trading'
import { getDiscoverStocks } from '@/app/actions/discover-stocks'
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

// ISR with 60s revalidation
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
  const [overview, keyStats, financials, news, profile, insiderResult, discoverResult] = await Promise.all([
    getStockOverview(normalizedSymbol).catch(() => null),
    getStockKeyStats(normalizedSymbol).catch(() => null),
    getAllFinancials(normalizedSymbol).catch(() => ({ incomeStatement: [], balanceSheet: [], cashFlow: [] })),
    getStockNews(normalizedSymbol, 30).catch(() => []),
    getCachedProfile(normalizedSymbol).catch(() => null),
    getInsiderTradesBySymbol(normalizedSymbol, 20).catch(() => ({ trades: [] })),
    getDiscoverStocks(normalizedSymbol, 12).catch(() => ({ stocks: [] })),
  ])

  // Extract insider trades from result
  const insiderTrades = 'trades' in insiderResult ? insiderResult.trades : []
  const discoverStocks = 'stocks' in discoverResult ? discoverResult.stocks : []

  // If we couldn't get basic overview data, show a message
  if (!overview || !keyStats) {
    return (
      <div className="min-h-screen bg-white dark:bg-[rgb(45,45,45)]">
        <Navigation />
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {normalizedSymbol}
          </h1>
          <p className="text-amber-600 dark:text-amber-400">
            Data for {normalizedSymbol} is currently being loaded. Please check back soon!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[rgb(45,45,45)]">
      {/* Navigation Header */}
      <Navigation />

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

      {/* Price Chart Section */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 pt-0 pb-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
            <StockPriceChart symbol={normalizedSymbol} initialRange="365d" />
          </div>
        </div>
      </section>

      {/* Quick Stats Grid Section - Finviz Style */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
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
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Book/sh</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.bookValuePerShare)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Cash/sh</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.cashPerShare)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Dividend TTM</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.dividendTTM)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Payout</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.payoutRatio.toFixed(2)}%
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
                  <span className="text-gray-600 dark:text-gray-400">P/FCF</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.priceToFreeCashFlow)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">EV/EBITDA</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.evToEbitda)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">EV/Sales</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.evToSales)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Quick Ratio</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.quickRatio)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Current Ratio</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.currentRatio)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Beta</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.beta)}
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
                  <span className="text-gray-600 dark:text-gray-400">EPS Surpr.</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.epsSurprise)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Sales Surpr.</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.salesSurprise)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">ROA</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.roa, 2, true)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">ROE</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.roe, 2, true)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">ROIC</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.roic, 2, true)}
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

              {/* Column 4: Technical Indicators */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">SMA20</span>
                  <span
                    className={`font-medium ${keyStats.sma20 !== null && keyStats.sma20 < 0 ? 'text-red-600' : keyStats.sma20 !== null && keyStats.sma20 > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.sma20)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">SMA50</span>
                  <span
                    className={`font-medium ${keyStats.sma50 !== null && keyStats.sma50 < 0 ? 'text-red-600' : keyStats.sma50 !== null && keyStats.sma50 > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.sma50)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">SMA200</span>
                  <span
                    className={`font-medium ${keyStats.sma200 !== null && keyStats.sma200 < 0 ? 'text-red-600' : keyStats.sma200 !== null && keyStats.sma200 > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.sma200)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">52W High</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${keyStats.fiftyTwoWeekHigh.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">52W Low</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${keyStats.fiftyTwoWeekLow.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">RSI (14)</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.rsi14)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Rel Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMetric(keyStats.relVolume)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Avg Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(keyStats.avgVolume / 1e6).toFixed(2)}M
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.volume ? `${(keyStats.volume / 1e6).toFixed(2)}M` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Shs Outstand</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.sharesOutstanding
                      ? `${(keyStats.sharesOutstanding / 1e9).toFixed(2)}B`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Column 5: Performance */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf Week</span>
                  <span
                    className={`font-medium ${keyStats.perfWeek !== null && keyStats.perfWeek < 0 ? 'text-red-600' : keyStats.perfWeek !== null && keyStats.perfWeek > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfWeek)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf Month</span>
                  <span
                    className={`font-medium ${keyStats.perfMonth !== null && keyStats.perfMonth < 0 ? 'text-red-600' : keyStats.perfMonth !== null && keyStats.perfMonth > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfMonth)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf Quarter</span>
                  <span
                    className={`font-medium ${keyStats.perfQuarter !== null && keyStats.perfQuarter < 0 ? 'text-red-600' : keyStats.perfQuarter !== null && keyStats.perfQuarter > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfQuarter)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Perf Half Y</span>
                  <span
                    className={`font-medium ${keyStats.perfHalfY !== null && keyStats.perfHalfY < 0 ? 'text-red-600' : keyStats.perfHalfY !== null && keyStats.perfHalfY > 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}
                  >
                    {formatPercentage(keyStats.perfHalfY)}
                  </span>
                </div>
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

              {/* Column 6: Price Info */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Price</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.price ? `$${keyStats.price.toFixed(2)}` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Prev Close</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.prevClose ? `$${keyStats.prevClose.toFixed(2)}` : 'N/A'}
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
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Dividend Ex-Date</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {keyStats.dividendExDate || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Dividend Gr. 3/5Y</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPercentage(keyStats.dividendGrowth3Y5Y)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Trades</span>
                  <span className="font-medium text-gray-900 dark:text-white">N/A</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* News Section */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
            <NewsFeed news={news} />
          </div>
        </div>
      </section>

      {/* Insider Trading Section */}
      <section className="bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
            <StockInsiderTrades symbol={normalizedSymbol} trades={insiderTrades} />
          </div>
        </div>
      </section>

      {/* Company Description Section */}
      {profile && (
        <section className="bg-white dark:bg-[rgb(45,45,45)]">
          <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
            <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
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
      <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
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

      {/* Footer */}
      <footer className="bg-white dark:bg-[rgb(45,45,45)] border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
