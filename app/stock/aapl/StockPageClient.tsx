'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import FinancialStatementsTabs from '@/components/FinancialStatementsTabs'
import Sidebar from '@/components/Sidebar'
import { useSidebar } from '@/components/SidebarProvider'

// Dynamically import both the chart and provider together
const TradingViewChartWithProvider = dynamic(
  () => import('./ChartWithProvider'),
  { ssr: false }
)

// Import types
type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

interface StockOverview {
  company: {
    name: string
    symbol: string
    sector: string
    industry: string
  }
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  marketStatus: string
}

interface KeyStats {
  marketCap: number
  enterpriseValue: number
  peRatio: number
  forwardPE: number
  pegRatio: number
  priceToSales: number
  priceToBook: number
  priceToCashFlow: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  ytdReturn: number
  oneYearReturn: number
  threeYearCAGR: number
  fiveYearCAGR: number
  beta: number
  avgVolume: number
  grossMargin: number
  operatingMargin: number
  netMargin: number
  roe: number
  roa: number
  roic: number
  revenue: number
  netIncome: number
  debtToEquity: number
  currentRatio: number
  quickRatio: number
  operatingCashFlow: number
  freeCashFlow: number
  dividendYield: number
  payoutRatio: number
  eps: number
}

interface FinancialYear {
  year: number
  revenue: number
  costOfRevenue: number
  grossProfit: number
  grossMargin: number
  operatingExpenses: number
  operatingIncome: number
  operatingMargin: number
  netIncome: number
  netMargin: number
  eps: number
}

interface BalanceSheetYear {
  year: number
  totalAssets: number
  currentAssets: number
  cashAndEquivalents: number
  totalLiabilities: number
  currentLiabilities: number
  longTermDebt: number
  shareholdersEquity: number
  debtToEquity: number
  currentRatio: number
}

interface CashFlowYear {
  year: number
  operatingCashFlow: number
  investingCashFlow: number
  financingCashFlow: number
  freeCashFlow: number
  capitalExpenditures: number
}

interface AllFinancials {
  incomeStatement: FinancialYear[]
  balanceSheet: BalanceSheetYear[]
  cashFlow: CashFlowYear[]
}

interface Props {
  overview: StockOverview
  keyStats: KeyStats
  financials: AllFinancials
  metrics: any
  filings: any[]
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

export default function StockPageClient({
  overview,
  keyStats,
  financials,
  metrics,
  filings,
}: Props) {
  const { sidebarOpen } = useSidebar()
  const [timeframe, setTimeframe] = useState<Timeframe>('1d')
  const [showSMA20, setShowSMA20] = useState(false)
  const [showSMA50, setShowSMA50] = useState(false)
  const [showSMA200, setShowSMA200] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <Sidebar>
        {/* Empty sidebar for financials page - just shows/hides based on route */}
        <div />
      </Sidebar>
      <div data-scalable-content>
      {/* Stock Header Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Company Info */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{overview.company.name}</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {overview.company.symbol} · {overview.company.sector} · {overview.company.industry}
              </p>
            </div>

            {/* Price Display */}
            <div className="text-right">
              <div className="text-4xl font-bold text-gray-900 dark:text-white">
                ${overview.currentPrice.toFixed(2)}
              </div>
              <div
                className={`mt-1 text-lg font-semibold ${
                  overview.priceChange >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {overview.priceChange >= 0 ? '+' : ''}
                ${overview.priceChange.toFixed(2)} ({overview.priceChangePercent.toFixed(2)}%)
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                    overview.marketStatus === 'open'
                      ? 'bg-green-600 text-white'
                      : overview.marketStatus === 'closed'
                        ? 'bg-gray-600 text-white'
                        : 'bg-yellow-600 text-white'
                  }`}
                >
                  {overview.marketStatus === 'open' && 'Market Open'}
                  {overview.marketStatus === 'closed' && 'Market Closed'}
                  {overview.marketStatus === 'premarket' && 'Pre-Market'}
                  {overview.marketStatus === 'afterhours' && 'After Hours'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Price Chart Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex justify-end">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {/* Timeframe Selector */}
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-[rgb(45,45,45)] p-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      timeframe === tf
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[rgb(55,55,55)]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              {/* SMA Toggles */}
              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSMA20}
                    onChange={(e) => setShowSMA20(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-400 dark:text-gray-300">SMA 20</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSMA50}
                    onChange={(e) => setShowSMA50(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-blue-900 dark:text-blue-400">SMA 50</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSMA200}
                    onChange={(e) => setShowSMA200(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-red-600 dark:text-red-400">SMA 200</span>
                </label>
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={() => setIsFullscreen(true)}
                className="flex items-center justify-center p-2 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
                title="Fullscreen"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>

          {/* TradingView Chart */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <TradingViewChartWithProvider
              symbol="AAPL"
              timeframe={timeframe}
              height={600}
              showSMA20={showSMA20}
              showSMA50={showSMA50}
              showSMA200={showSMA200}
            />
          </div>
        </div>
      </section>

      {/* Quick Stats Grid Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Key Statistics
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {/* Valuation Column */}
            <div className="space-y-2">
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Market Cap</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.marketCap / 1e12).toFixed(2)}T
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Enterprise Value</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.enterpriseValue / 1e12).toFixed(2)}T
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">P/E Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.peRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Forward P/E</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.forwardPE.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">PEG Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.pegRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">P/S Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.priceToSales.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">P/B Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.priceToBook.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">P/CF Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.priceToCashFlow.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Performance Column */}
            <div className="space-y-2">
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">52-Week High</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${keyStats.fiftyTwoWeekHigh.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">52-Week Low</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${keyStats.fiftyTwoWeekLow.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">YTD Return</span>
                <span className={`font-medium ${keyStats.ytdReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {keyStats.ytdReturn.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">1-Year Return</span>
                <span className={`font-medium ${keyStats.oneYearReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {keyStats.oneYearReturn.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">3-Year CAGR</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.threeYearCAGR.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">5-Year CAGR</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.fiveYearCAGR.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Beta</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.beta.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Avg Volume</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {(keyStats.avgVolume / 1e6).toFixed(1)}M
                </span>
              </div>
            </div>

            {/* Profitability Column */}
            <div className="space-y-2">
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Gross Margin</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.grossMargin.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Operating Margin</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.operatingMargin.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Net Margin</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.netMargin.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">ROE</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.roe.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">ROA</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.roa.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">ROIC</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.roic.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Revenue (TTM)</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.revenue / 1e9).toFixed(1)}B
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Net Income (TTM)</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.netIncome / 1e9).toFixed(1)}B
                </span>
              </div>
            </div>

            {/* Financial Health Column */}
            <div className="space-y-2">
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Debt-to-Equity</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.debtToEquity.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Current Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.currentRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Quick Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.quickRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Operating CF</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.operatingCashFlow / 1e9).toFixed(1)}B
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Free Cash Flow</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${(keyStats.freeCashFlow / 1e9).toFixed(1)}B
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Dividend Yield</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.dividendYield.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Payout Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {keyStats.payoutRatio.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">EPS (TTM)</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${keyStats.eps.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Financial Statements Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-white">
            Financial Statements
          </h2>
          <FinancialStatementsTabs
            incomeStatement={financials.incomeStatement}
            balanceSheet={financials.balanceSheet}
            cashFlow={financials.cashFlow}
          />
        </div>
      </section>

      {/* Placeholder sections */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Financial Metrics
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Metrics loaded: Valuation ({metrics.valuation.length}), Profitability (
            {metrics.profitability.length}), Leverage ({metrics.leverage.length})
          </p>
        </div>
      </section>

      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[rgb(33,33,33)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">SEC Filings</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Recent filings: {filings.length}</p>
        </div>
      </section>

      {/* Fullscreen Chart Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="relative w-full h-full max-w-[95vw] max-h-[95vh] bg-gray-50 dark:bg-[rgb(33,33,33)] rounded-lg shadow-2xl m-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {overview.company.name} - Price Chart
                </h3>

                {/* Timeframe Selector in Modal */}
                <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-[rgb(45,45,45)] p-1">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        timeframe === tf
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-[rgb(55,55,55)]'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* SMA Toggles in Modal */}
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSMA20}
                      onChange={(e) => setShowSMA20(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-gray-400 dark:text-gray-300">SMA 20</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSMA50}
                      onChange={(e) => setShowSMA50(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-blue-900 dark:text-blue-400">SMA 50</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSMA200}
                      onChange={(e) => setShowSMA200(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-red-600 dark:text-red-400">SMA 200</span>
                  </label>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setIsFullscreen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-[rgb(45,45,45)] dark:hover:text-gray-200"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Chart */}
            <div className="p-4 h-[calc(100%-80px)]">
              <TradingViewChartWithProvider
                symbol="AAPL"
                timeframe={timeframe}
                height={window.innerHeight * 0.8}
                showSMA20={showSMA20}
                showSMA50={showSMA50}
                showSMA200={showSMA200}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
