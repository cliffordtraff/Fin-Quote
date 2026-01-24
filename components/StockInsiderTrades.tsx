'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { InsiderTrade } from '@/app/actions/insider-trading'

interface StockInsiderTradesProps {
  symbol: string
  trades: InsiderTrade[]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function formatShares(shares: number): string {
  if (!shares || shares === 0) return '—'
  if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`
  if (shares >= 1_000) return `${(shares / 1_000).toFixed(1)}K`
  return shares.toLocaleString()
}

function formatValue(shares: number, price: number | null): string {
  if (price === null || price === 0 || !shares) return '—'
  const value = shares * price
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return '—'
  return `$${price.toFixed(2)}`
}

function getTransactionLabel(type: string): string {
  if (!type) return '—'
  const letter = type.charAt(0).toUpperCase()
  switch (letter) {
    case 'P': return 'Buy'
    case 'S': return 'Sell'
    case 'A': return 'Award'
    case 'M': return 'Option'
    case 'G': return 'Gift'
    default: return letter
  }
}

function getTransactionColor(type: string): string {
  if (!type) return 'text-gray-500'
  const letter = type.charAt(0).toUpperCase()
  if (letter === 'P') return 'text-green-500'
  if (letter === 'S') return 'text-red-500'
  return 'text-gray-500'
}

export default function StockInsiderTrades({ symbol, trades }: StockInsiderTradesProps) {
  const [showAll, setShowAll] = useState(false)

  // Show first 5 trades, or all if expanded
  const displayTrades = showAll ? trades : trades.slice(0, 5)
  const hasMore = trades.length > 5

  if (trades.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Insider Trading
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No insider trades found for {symbol}.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Insider Trading
        </h3>
        <Link
          href={`/insiders?ticker=${symbol}`}
          className="text-sm text-blue-500 hover:text-blue-400 hover:underline"
        >
          View All
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-200 dark:bg-[rgb(30,30,30)] text-gray-600 dark:text-gray-400 text-xs font-medium">
          <div>Insider</div>
          <div className="text-center">Type</div>
          <div className="text-right">Shares</div>
          <div className="text-right">Price</div>
          <div className="text-right">Value</div>
          <div className="text-right">Date</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-[rgb(38,38,38)]">
          {displayTrades.map((trade, idx) => (
            <div
              key={`${trade.reportingName}-${trade.transactionDate}-${idx}`}
              className="grid grid-cols-6 gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="text-xs truncate" title={trade.reportingName}>
                {trade.insiderId ? (
                  <Link
                    href={`/insider/${trade.insiderId}`}
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    {trade.reportingName}
                  </Link>
                ) : (
                  <span className="text-gray-900 dark:text-white">{trade.reportingName}</span>
                )}
              </div>
              <div className={`text-xs text-center font-medium ${getTransactionColor(trade.transactionType)}`}>
                {getTransactionLabel(trade.transactionType)}
              </div>
              <div className="text-xs text-right text-gray-900 dark:text-white">
                {formatShares(trade.securitiesTransacted)}
              </div>
              <div className="text-xs text-right text-gray-900 dark:text-white">
                {formatPrice(trade.price)}
              </div>
              <div className="text-xs text-right text-gray-900 dark:text-white">
                {formatValue(trade.securitiesTransacted, trade.price)}
              </div>
              <div className="text-xs text-right text-gray-600 dark:text-gray-400">
                {formatDate(trade.transactionDate)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Show More/Less Button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-sm text-blue-500 hover:text-blue-400 hover:underline"
        >
          {showAll ? 'Show Less' : `Show ${trades.length - 5} More`}
        </button>
      )}
    </div>
  )
}
