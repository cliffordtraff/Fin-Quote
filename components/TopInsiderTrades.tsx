'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { LargeInsiderTrade } from '@/app/actions/insider-trading'

interface TopInsiderTradesProps {
  trades: LargeInsiderTrade[]
}

function formatValue(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
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

const tableGridStyle: CSSProperties = {
  gridTemplateColumns: '48px minmax(0, 1.2fr) 50px minmax(84px, 0.7fr) minmax(116px, 0.95fr)',
}

export default function TopInsiderTrades({ trades }: TopInsiderTradesProps) {
  const rankedTrades = [...trades].sort((left, right) => right.value - left.value)

  const saleTrades = rankedTrades
    .filter((trade) => {
      const { label } = getTransactionLabel(
        trade.transactionCode,
        trade.acquisitionDisposition,
        trade.formType
      )

      return label === 'Sell' || label === 'Proposed Sale'
    })
    .slice(0, 4)

  const buyTrades = rankedTrades
    .filter((trade) => {
      const { label } = getTransactionLabel(
        trade.transactionCode,
        trade.acquisitionDisposition,
        trade.formType
      )

      return label === 'Buy'
    })
    .slice(0, 3)

  const visibleTrades = [...saleTrades, ...buyTrades]

  if (visibleTrades.length === 0) {
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
      <div className="px-4 py-3 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800">
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Largest Insider Trades
        </h2>
      </div>

      {/* Column Headers */}
      <div
        className="grid items-center gap-1.5 px-2.5 py-2 bg-cream-50 dark:bg-gray-800/60 border-b border-cream-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-white whitespace-nowrap"
        style={tableGridStyle}
      >
        <div>Ticker</div>
        <div>Insider</div>
        <div>Date</div>
        <div>Transaction</div>
        <div className="text-right">Value</div>
      </div>

      {/* Trades List */}
      <div className="divide-y divide-cream-200 dark:divide-gray-800">
        {visibleTrades.map((trade, index) => {
          const { label: txLabel, color: txColor } = getTransactionLabel(
            trade.transactionCode,
            trade.acquisitionDisposition,
            trade.formType
          )

          return (
            <div
              key={`${trade.symbol}-${trade.reportingName}-${index}`}
              className="grid items-center gap-1.5 px-2.5 py-2.5 hover:bg-cream-50 dark:hover:bg-gray-800/50 whitespace-nowrap"
              style={tableGridStyle}
            >
              <Link
                href={`/stock/${trade.symbol}`}
                className="truncate text-xs font-semibold text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 transition-colors"
              >
                {trade.symbol}
              </Link>

              <span className="min-w-0 truncate whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                {trade.reportingName}
              </span>

              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatDate(trade.transactionDate)}
              </span>

              <span className={`truncate whitespace-nowrap text-xs font-medium ${txColor}`}>
                {txLabel}
              </span>

              <span className="text-right text-xs font-medium tabular-nums text-gray-900 dark:text-gray-100">
                {formatValue(trade.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
