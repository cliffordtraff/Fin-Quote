import Navigation from '@/components/Navigation'
import { getInsiderById } from '@/app/actions/insider-trading'
import InsiderTradesTable from '@/components/InsiderTradesTable'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface InsiderPageProps {
  params: Promise<{ id: string }>
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`
  }
  return `$${value.toFixed(2)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function InsiderPage({ params }: InsiderPageProps) {
  const { id } = await params
  const result = await getInsiderById(id)

  if ('error' in result) {
    notFound()
  }

  const { insider, trades } = result

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Back link */}
        <Link
          href="/insiders"
          className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Insider Trading
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {insider.name}
          </h1>
          {insider.cik && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              CIK: {insider.cik}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[rgb(38,38,38)] rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Total Trades
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {insider.totalTrades}
            </div>
          </div>

          <div className="bg-white dark:bg-[rgb(38,38,38)] rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Companies
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {insider.companies.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
              {insider.companies.slice(0, 3).join(', ')}
              {insider.companies.length > 3 && ` +${insider.companies.length - 3}`}
            </div>
          </div>

          <div className="bg-white dark:bg-[rgb(38,38,38)] rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Total Buys
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {insider.totalBuys}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatCurrency(insider.totalBuyValue)}
            </div>
          </div>

          <div className="bg-white dark:bg-[rgb(38,38,38)] rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Total Sells
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {insider.totalSells}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatCurrency(insider.totalSellValue)}
            </div>
          </div>
        </div>

        {/* Date Range */}
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Trading history: {formatDate(insider.firstTradeDate)} – {formatDate(insider.lastTradeDate)}
        </div>

        {/* Trades Table */}
        <div className="bg-white dark:bg-[rgb(38,38,38)] rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Transaction History
          </h2>
          {trades.length > 0 ? (
            <InsiderTradesTable trades={trades} />
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No transactions found.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
