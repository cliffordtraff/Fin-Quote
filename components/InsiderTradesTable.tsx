'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import type { InsiderTrade } from '@/app/actions/insider-trading'

type SortField = 'symbol' | 'transactionDate' | 'securitiesTransacted' | 'price' | 'value'
type SortDir = 'asc' | 'desc'

interface InsiderTradesTableProps {
  trades: InsiderTrade[]
  defaultSortByValue?: boolean
}

export default function InsiderTradesTable({ trades, defaultSortByValue = false }: InsiderTradesTableProps) {
  const [sortField, setSortField] = useState<SortField>(defaultSortByValue ? 'value' : 'transactionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Reset sort when defaultSortByValue changes (e.g., switching tabs)
  useEffect(() => {
    setSortField(defaultSortByValue ? 'value' : 'transactionDate')
    setSortDir('desc')
  }, [defaultSortByValue])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortField) {
        case 'symbol':
          aVal = a.symbol || ''
          bVal = b.symbol || ''
          break
        case 'transactionDate':
          aVal = new Date(a.transactionDate || 0).getTime()
          bVal = new Date(b.transactionDate || 0).getTime()
          break
        case 'securitiesTransacted':
          aVal = a.securitiesTransacted || 0
          bVal = b.securitiesTransacted || 0
          break
        case 'price':
          aVal = a.price || 0
          bVal = b.price || 0
          break
        case 'value':
          aVal = (a.securitiesTransacted || 0) * (a.price || 0)
          bVal = (b.securitiesTransacted || 0) * (b.price || 0)
          break
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
  }, [trades, sortField, sortDir])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return '—'
    return `$${price.toFixed(2)}`
  }

  const formatShares = (shares: number) => {
    if (!shares || shares === 0) return '—'
    if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`
    if (shares >= 1_000) return `${(shares / 1_000).toFixed(1)}K`
    return shares.toLocaleString()
  }

  const formatValue = (shares: number, price: number | null) => {
    if (price === null || price === 0 || !shares) return '—'
    const value = shares * price
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const getTransactionLetter = (type: string) => {
    if (!type) return '—'
    return type.charAt(0)
  }

  const getTransactionColor = (type: string) => {
    if (!type) return 'text-gray-500 dark:text-gray-400'
    const letter = type.charAt(0).toUpperCase()
    if (letter === 'P') return 'text-green-500'
    if (letter === 'S') return 'text-red-500'
    return 'text-gray-500 dark:text-gray-400'
  }

  const formatTitle = (typeOfOwner: string) => {
    if (!typeOfOwner) return '—'
    return typeOfOwner.length > 20 ? typeOfOwner.slice(0, 20) + '...' : typeOfOwner
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-400">↕</span>
    }
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (trades.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center text-gray-500 dark:text-gray-400">
            No trades found
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-8 gap-2 px-4 py-2 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold">
          <button
            onClick={() => handleSort('symbol')}
            className="text-left hover:text-blue-500 transition-colors flex items-center"
          >
            Symbol<SortIcon field="symbol" />
          </button>
          <div>Insider</div>
          <div>Title</div>
          <div className="text-center">Type</div>
          <button
            onClick={() => handleSort('securitiesTransacted')}
            className="text-right hover:text-blue-500 transition-colors flex items-center justify-end"
          >
            Shares<SortIcon field="securitiesTransacted" />
          </button>
          <button
            onClick={() => handleSort('price')}
            className="text-right hover:text-blue-500 transition-colors flex items-center justify-end"
          >
            Price<SortIcon field="price" />
          </button>
          <button
            onClick={() => handleSort('value')}
            className="text-right hover:text-blue-500 transition-colors flex items-center justify-end"
          >
            Value<SortIcon field="value" />
          </button>
          <button
            onClick={() => handleSort('transactionDate')}
            className="text-right hover:text-blue-500 transition-colors flex items-center justify-end"
          >
            Date<SortIcon field="transactionDate" />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {sortedTrades.map((trade, idx) => (
            <div
              key={`${trade.symbol}-${trade.filingDate}-${idx}`}
              className="grid grid-cols-8 gap-2 px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="text-xs">
                <Link
                  href={`/stock/${trade.symbol}`}
                  className="text-blue-400 hover:text-blue-300 font-medium hover:underline"
                >
                  {trade.symbol}
                </Link>
              </div>
              <div className="text-xs text-gray-900 dark:text-white truncate" title={trade.reportingName}>
                {trade.reportingName}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 truncate" title={trade.typeOfOwner}>
                {formatTitle(trade.typeOfOwner)}
              </div>
              <div className={`text-xs text-center font-semibold ${getTransactionColor(trade.transactionType)}`}>
                {getTransactionLetter(trade.transactionType)}
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
    </div>
  )
}
