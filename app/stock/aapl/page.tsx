import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import StockPriceChart from '@/components/StockPriceChart';
import { getStockOverview } from '@/app/actions/stock-overview';
import { getStockKeyStats } from '@/app/actions/stock-key-stats';
import { getAllFinancials } from '@/app/actions/get-all-financials';
import { getAllMetrics } from '@/app/actions/get-all-metrics';
import { getRecentFilings } from '@/app/actions/filings';
import { formatExtendedMetricName } from '@/lib/chart-helpers';

export const metadata = {
  title: 'Apple Inc. (AAPL) Stock - Financial Data, Metrics & AI Analysis | Fin Quote',
  description:
    'Comprehensive financial analysis for Apple Inc. (AAPL). View income statements, balance sheets, cash flow, 139+ financial metrics, SEC filings, and AI-powered insights.',
};

// ISR with 60s revalidation
export const revalidate = 60;

// Helper function to format values, showing N/A only for truly missing data
// Only show N/A if value is null, undefined, or exactly 0 (for metrics that can't be 0)
function formatMetric(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  // For ratios and metrics, 0 might be valid, so only show N/A if truly missing
  if (value === 0) {
    return 'N/A'
  }
  return value.toFixed(decimals)
}

// Helper for percentage values
// For returns/CAGR, 0 usually means missing data, so show N/A
// For margins/yields, 0% might be valid, so we check context
function formatPercentage(value: number | null | undefined, decimals: number = 2, allowZero: boolean = false): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  // For returns and growth metrics, 0 usually means missing
  if (!allowZero && value === 0) {
    return 'N/A'
  }
  return `${value.toFixed(decimals)}%`
}

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
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
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
      <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[rgb(45,45,45)]">
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
                  {formatMetric(keyStats.forwardPE)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">PEG Ratio</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatMetric(keyStats.pegRatio)}
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
                    keyStats.ytdReturn === 0 || keyStats.ytdReturn === null || keyStats.ytdReturn === undefined
                      ? 'text-gray-500 dark:text-gray-400'
                      : keyStats.ytdReturn >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}
                >
                  {formatPercentage(keyStats.ytdReturn, 2, false)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">1-Year Return</span>
                <span
                  className={`font-medium ${
                    keyStats.oneYearReturn === 0 || keyStats.oneYearReturn === null || keyStats.oneYearReturn === undefined
                      ? 'text-gray-500 dark:text-gray-400'
                      : keyStats.oneYearReturn >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}
                >
                  {formatPercentage(keyStats.oneYearReturn, 2, false)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">3-Year CAGR</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatPercentage(keyStats.threeYearCAGR, 2, false)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">5-Year CAGR</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatPercentage(keyStats.fiveYearCAGR, 2, false)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Beta</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatMetric(keyStats.beta)}
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
                  {formatPercentage(keyStats.operatingMargin, 2, true)}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Net Margin</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatPercentage(keyStats.netMargin, 2, true)}
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
                  {formatMetric(keyStats.debtToEquity)}
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
                  {formatPercentage(keyStats.dividendYield, 2, false)}
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

      {/* Price Chart Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Price Chart
          </h2>
          <StockPriceChart initialRange="365d" />
        </div>
      </section>

      {/* Financial Statements Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Financial Statements
          </h2>

          {(() => {
            // Helper to format large numbers
            const formatCurrency = (value: number): string => {
              if (value === 0 || value === null || value === undefined) return 'N/A'
              const absValue = Math.abs(value)
              if (absValue >= 1e12) return `$${(value / 1e12).toFixed(2)}T`
              if (absValue >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
              if (absValue >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
              if (absValue >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
              return `$${value.toFixed(2)}`
            }

            const formatPercentage = (value: number): string => {
              if (value === null || value === undefined) return 'N/A'
              return `${value.toFixed(2)}%`
            }

            const formatRatio = (value: number): string => {
              if (value === null || value === undefined || value === 0) return 'N/A'
              return value.toFixed(2)
            }

            // Get years from income statement (they should all have the same years)
            const years = financials.incomeStatement.map(f => f.year).sort((a, b) => b - a)

            // Financial Statement Table Component
            const FinancialTable = ({ 
              title, 
              rows 
            }: { 
              title: string
              rows: Array<{ label: string; values: (number | null)[]; format: 'currency' | 'percentage' | 'ratio' | 'eps' }>
            }) => {
              if (years.length === 0) return null

              return (
                <div className="mb-12">
                  <h3 className="mb-4 text-xl font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Metric
                          </th>
                          {years.map(year => (
                            <th key={year} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                              FY {year}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-[rgb(45,45,45)]">
                        {rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {row.label}
                            </td>
                            {row.values.map((value, yearIdx) => (
                              <td key={yearIdx} className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                                {row.format === 'currency' && formatCurrency(value ?? 0)}
                                {row.format === 'percentage' && formatPercentage(value ?? 0)}
                                {row.format === 'ratio' && formatRatio(value ?? 0)}
                                {row.format === 'eps' && (value ? `$${value.toFixed(2)}` : 'N/A')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }

            return (
              <div className="space-y-8">
                {/* Income Statement */}
                <FinancialTable
                  title="Income Statement"
                  rows={[
                    {
                      label: 'Revenue',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.revenue ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Cost of Revenue',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.costOfRevenue ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Gross Profit',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.grossProfit ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Gross Margin',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.grossMargin ?? null
                      }),
                      format: 'percentage'
                    },
                    {
                      label: 'Operating Expenses',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.operatingExpenses ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Operating Income',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.operatingIncome ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Operating Margin',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.operatingMargin ?? null
                      }),
                      format: 'percentage'
                    },
                    {
                      label: 'Net Income',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.netIncome ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Net Margin',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.netMargin ?? null
                      }),
                      format: 'percentage'
                    },
                    {
                      label: 'EPS (Basic)',
                      values: years.map(year => {
                        const data = financials.incomeStatement.find(f => f.year === year)
                        return data?.eps ?? null
                      }),
                      format: 'eps'
                    }
                  ]}
                />

                {/* Balance Sheet */}
                <FinancialTable
                  title="Balance Sheet"
                  rows={[
                    {
                      label: 'Total Assets',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.totalAssets ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Current Assets',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.currentAssets ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Cash & Equivalents',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.cashAndEquivalents ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Total Liabilities',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.totalLiabilities ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Current Liabilities',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.currentLiabilities ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Long-Term Debt',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.longTermDebt ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: "Shareholders' Equity",
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.shareholdersEquity ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Debt-to-Equity',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.debtToEquity ?? null
                      }),
                      format: 'ratio'
                    },
                    {
                      label: 'Current Ratio',
                      values: years.map(year => {
                        const data = financials.balanceSheet.find(f => f.year === year)
                        return data?.currentRatio ?? null
                      }),
                      format: 'ratio'
                    }
                  ]}
                />

                {/* Cash Flow Statement */}
                <FinancialTable
                  title="Cash Flow Statement"
                  rows={[
                    {
                      label: 'Operating Cash Flow',
                      values: years.map(year => {
                        const data = financials.cashFlow.find(f => f.year === year)
                        return data?.operatingCashFlow ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Investing Cash Flow',
                      values: years.map(year => {
                        const data = financials.cashFlow.find(f => f.year === year)
                        return data?.investingCashFlow ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Financing Cash Flow',
                      values: years.map(year => {
                        const data = financials.cashFlow.find(f => f.year === year)
                        return data?.financingCashFlow ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Capital Expenditures',
                      values: years.map(year => {
                        const data = financials.cashFlow.find(f => f.year === year)
                        return data?.capitalExpenditures ?? null
                      }),
                      format: 'currency'
                    },
                    {
                      label: 'Free Cash Flow',
                      values: years.map(year => {
                        const data = financials.cashFlow.find(f => f.year === year)
                        return data?.freeCashFlow ?? null
                      }),
                      format: 'currency'
                    }
                  ]}
                />
              </div>
            )
          })()}
        </div>
      </section>

      {/* Financial Metrics Section */}
      <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[rgb(45,45,45)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Financial Metrics
          </h2>

          {/* Metrics Display */}
          {(() => {

            const formatMetricValue = (value: number, metricName: string): string => {
              if (value === 0 || value === null || value === undefined) return 'N/A'
              
              // Check if it's a percentage metric
              const lowerName = metricName.toLowerCase()
              if (lowerName.includes('ratio') && !lowerName.includes('turnover') && !lowerName.includes('multiple')) {
                return value.toFixed(2)
              }
              if (lowerName.includes('margin') || lowerName.includes('yield') || lowerName.includes('growth') || lowerName.includes('return')) {
                return `${value.toFixed(2)}%`
              }
              if (lowerName.includes('turnover') || lowerName.includes('multiple')) {
                return value.toFixed(2)
              }
              if (lowerName.includes('days') || lowerName.includes('cycle')) {
                return value.toFixed(0)
              }
              if (lowerName.includes('per share') || lowerName.includes('pershare')) {
                return `$${value.toFixed(2)}`
              }
              if (lowerName.includes('capitalization') || lowerName.includes('value') || lowerName.includes('expenditure') || lowerName.includes('shares')) {
                if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
                if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
                if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
                return `$${value.toFixed(2)}`
              }
              return value.toFixed(2)
            }

            const MetricCategory = ({ title, metrics }: { title: string; metrics: typeof metrics.valuation }) => {
              if (metrics.length === 0) return null

              return (
                <div className="mb-8">
                  <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Metric
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Current
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            1Y Ago
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            3Y Ago
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            5Y Ago
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-[rgb(45,45,45)]">
                        {metrics.map((metric) => (
                          <tr key={metric.metricName} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {formatExtendedMetricName(metric.metricName)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                              {formatMetricValue(metric.current, metric.metricName)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                              {formatMetricValue(metric.oneYearAgo, metric.metricName)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                              {formatMetricValue(metric.threeYearsAgo, metric.metricName)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                              {formatMetricValue(metric.fiveYearsAgo, metric.metricName)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }

            return (
              <div className="space-y-8">
                <MetricCategory title="Valuation Metrics" metrics={metrics.valuation} />
                <MetricCategory title="Profitability & Returns" metrics={metrics.profitability} />
                <MetricCategory title="Leverage & Solvency" metrics={metrics.leverage} />
                <MetricCategory title="Efficiency & Working Capital" metrics={metrics.efficiency} />
                <MetricCategory title="Growth Metrics" metrics={metrics.growth} />
                <MetricCategory title="Per-Share Metrics" metrics={metrics.perShare} />
                <MetricCategory title="Capital Returns & Distribution" metrics={metrics.capitalReturns} />
              </div>
            )
          })()}
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
