import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import { getStockOverview } from '@/app/actions/stock-overview';
import { getStockKeyStats } from '@/app/actions/stock-key-stats';
import { getAllFinancials } from '@/app/actions/get-all-financials';
import { getAllMetrics } from '@/app/actions/get-all-metrics';
import { getRecentFilings } from '@/app/actions/filings';

export const metadata = {
  title: 'Apple Inc. (AAPL) Stock - Financial Data, Metrics & AI Analysis | Fin Quote',
  description:
    'Comprehensive financial analysis for Apple Inc. (AAPL). View income statements, balance sheets, cash flow, 139+ financial metrics, SEC filings, and AI-powered insights.',
};

// ISR with 60s revalidation
export const revalidate = 60;

export default async function StockPage() {
  // Parallel data fetching for all sections
  const [overview, keyStats, financials, metrics, filings] = await Promise.all([
    getStockOverview(),
    getStockKeyStats(),
    getAllFinancials(),
    getAllMetrics(),
    getRecentFilings('AAPL', 20),
  ]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Navigation Header */}
      <Navigation />

      {/* Stock Header Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-900 dark:to-blue-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Company Info */}
            <div>
              <h1 className="text-3xl font-bold">{overview.company.name}</h1>
              <p className="mt-1 text-sm text-blue-100">
                {overview.company.symbol} · {overview.company.sector} ·{' '}
                {overview.company.industry}
              </p>
            </div>

            {/* Price Display */}
            <div className="text-right">
              <div className="text-4xl font-bold">
                ${overview.currentPrice.toFixed(2)}
              </div>
              <div
                className={`mt-1 text-lg font-semibold ${
                  overview.priceChange >= 0
                    ? 'text-green-300'
                    : 'text-red-300'
                }`}
              >
                {overview.priceChange >= 0 ? '+' : ''}
                ${overview.priceChange.toFixed(2)} (
                {overview.priceChangePercent.toFixed(2)}%)
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

      {/* Quick Stats Grid Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
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
                <span
                  className={`font-medium ${
                    keyStats.ytdReturn >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {keyStats.ytdReturn.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">1-Year Return</span>
                <span
                  className={`font-medium ${
                    keyStats.oneYearReturn >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
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

      {/* Placeholder sections for other parts */}
      <section className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Price Chart
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Coming soon...
          </p>
        </div>
      </section>

      <section className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Financial Statements
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Financial data loaded: {financials.incomeStatement.length} years
          </p>
        </div>
      </section>

      <section className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Financial Metrics
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Metrics loaded: Valuation ({metrics.valuation.length}), Profitability
            ({metrics.profitability.length}), Leverage ({metrics.leverage.length})
          </p>
        </div>
      </section>

      <section className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            SEC Filings
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Recent filings: {filings.length}
          </p>
        </div>
      </section>
    </div>
  );
}
