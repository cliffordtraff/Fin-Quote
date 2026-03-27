'use client'

import Link from 'next/link'
import type { LargeInsiderTrade } from '@/app/actions/insider-trading'

interface TopInsiderTradesProps {
  trades: LargeInsiderTrade[]
}

const tableColumnClasses = 'grid-cols-[72px_minmax(0,1fr)_88px_136px_150px]'

function formatValue(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getTransactionLabel(code: string, acqDisp: string, formType: string): { label: string; color: string } {
  if (formType === '144' || formType === '144/A') {
    return { label: 'Proposed Sale', color: 'text-red-500' }
  }

  const transactionCode = code.trim().charAt(0).toUpperCase()
  const acquisitionDisposition = acqDisp.trim().charAt(0).toUpperCase()

  if (transactionCode === 'P') {
    return { label: 'Buy', color: 'text-green-500' }
  }

  if (transactionCode === 'S') {
    return { label: 'Sell', color: 'text-red-500' }
  }

  if (acquisitionDisposition === 'A') {
    return { label: 'Buy', color: 'text-green-500' }
  }

  if (acquisitionDisposition === 'D') {
    return { label: 'Sell', color: 'text-red-500' }
  }

  if (transactionCode === 'A' || transactionCode === 'M') {
    return { label: 'Award', color: 'text-sage-600 dark:text-sage-400' }
  }

  return { label: transactionCode || '-', color: 'text-gray-400' }
}

export default function TopInsiderTrades({ trades }: TopInsiderTradesProps) {
  if (trades.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-cream-300 dark:border-gray-700 p-4">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            No insider trades found...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 dark:text-gray-300 text-[10px]">
          Largest Insider Trades
        </h2>
        <Link
          href="/insiders"
          className="text-[9px] text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 transition-colors"
        >
          View All →
        </Link>
      </div>

      {/* Column Headers */}
      <div className={`grid ${tableColumnClasses} gap-3 px-4 py-2 bg-cream-50 dark:bg-gray-800/60 border-b border-cream-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-100`}>
        <div>Ticker</div>
        <div>Insider</div>
        <div>Date</div>
        <div>Transaction</div>
        <div className="text-right">Value($)</div>
      </div>

      {/* Trades List */}
      <div className="divide-y divide-cream-200 dark:divide-gray-800">
        {trades.map((trade, index) => {
          const { label: txLabel, color: txColor } = getTransactionLabel(
            trade.transactionCode,
            trade.acquisitionDisposition,
            trade.formType
          )

          return (
            <div
              key={`${trade.symbol}-${trade.reportingName}-${index}`}
              className={`grid ${tableColumnClasses} gap-3 items-center px-4 py-2 hover:bg-cream-50 dark:hover:bg-gray-800/50`}
            >
              {/* Symbol */}
              <Link
                href={`/stock/${trade.symbol}`}
                className="text-[10px] font-semibold text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 transition-colors"
              >
                {trade.symbol}
              </Link>

              {/* Insider Name (truncated) */}
              <span className="min-w-0 truncate text-[10px] text-gray-900 dark:text-gray-100">
                {trade.reportingName}
              </span>

              {/* Date */}
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {formatDate(trade.transactionDate)}
              </span>

              {/* Transaction Type */}
              <span className={`truncate text-[10px] font-medium ${txColor}`}>
                {txLabel}
              </span>

              {/* Value */}
              <span className="text-right text-[10px] font-medium tabular-nums text-gray-900 dark:text-gray-100">
                {formatValue(trade.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
