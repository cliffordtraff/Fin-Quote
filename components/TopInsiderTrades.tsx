'use client'

import Link from 'next/link'
import type { LargeInsiderTrade } from '@/app/actions/insider-trading'

interface TopInsiderTradesProps {
  trades: LargeInsiderTrade[]
}

function formatValue(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getTransactionLabel(code: string, acqDisp: string): { label: string; color: string } {
  // Acquisition = Buy, Disposition = Sell
  if (acqDisp === 'A' || code === 'P') {
    return { label: 'Buy', color: 'text-green-500' }
  }
  if (acqDisp === 'D' || code === 'S') {
    return { label: 'Sell', color: 'text-red-500' }
  }
  // Award, exercise, gift, etc.
  if (code === 'A' || code === 'M') {
    return { label: 'Award', color: 'text-blue-400' }
  }
  return { label: code || '-', color: 'text-gray-400' }
}

export default function TopInsiderTrades({ trades }: TopInsiderTradesProps) {
  if (trades.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            No insider trades found...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 dark:text-gray-300 text-[10px]">
          Largest Insider Trades
        </h2>
        <Link
          href="/insiders"
          className="text-[9px] text-blue-500 hover:text-blue-400 transition-colors"
        >
          View All →
        </Link>
      </div>

      {/* Trades List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {trades.map((trade, index) => {
          const { label: txLabel, color: txColor } = getTransactionLabel(trade.transactionCode, trade.acquisitionDisposition)

          return (
            <div
              key={`${trade.symbol}-${trade.reportingName}-${index}`}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              {/* Symbol */}
              <Link
                href={`/stock/${trade.symbol}`}
                className="w-11 text-[10px] font-semibold text-blue-500 hover:text-blue-400 transition-colors shrink-0"
              >
                {trade.symbol}
              </Link>

              {/* Insider Name (truncated) */}
              <span className="flex-1 text-[10px] text-gray-900 dark:text-gray-100 truncate min-w-0">
                {trade.reportingName}
              </span>

              {/* Date */}
              <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                {formatDate(trade.transactionDate)}
              </span>

              {/* Transaction Type */}
              <span className={`w-8 text-[10px] font-medium ${txColor} text-center shrink-0`}>
                {txLabel}
              </span>

              {/* Value */}
              <span className="w-14 text-right text-[10px] font-medium text-gray-900 dark:text-gray-100 shrink-0">
                {formatValue(trade.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
