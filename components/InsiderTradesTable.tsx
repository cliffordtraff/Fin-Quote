'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { InsiderTrade } from '@/app/actions/insider-trading'

export type InsiderTradeSortField = 'symbol' | 'transactionDate' | 'securitiesTransacted' | 'price' | 'value'
export type InsiderTradeSortDirection = 'asc' | 'desc'

export interface InsiderTradeSort {
  field: InsiderTradeSortField
  direction: InsiderTradeSortDirection
}

interface InsiderTradesTableProps {
  trades: InsiderTrade[]
  defaultSortByValue?: boolean
  sort?: InsiderTradeSort
  onSortChange?: (sort: InsiderTradeSort) => void
}

const SORT_LABELS: Record<InsiderTradeSortField, string> = {
  symbol: 'Symbol',
  transactionDate: 'Date',
  securitiesTransacted: 'Shares',
  price: 'Price',
  value: 'Value',
}

const TRANSACTION_LABELS: Record<string, string> = {
  A: 'Award',
  C: 'Conversion',
  D: 'Sale to issuer',
  F: 'Tax payment',
  G: 'Gift',
  J: 'Other acquisition',
  M: 'Option exercise',
  P: 'Purchase',
  S: 'Sale',
  U: 'Tender',
  W: 'Will or trust',
  X: 'Option exercise',
}

export function sortInsiderTrades(
  trades: InsiderTrade[],
  sort: InsiderTradeSort,
): InsiderTrade[] {
  return [...trades].sort((a, b) => {
    let aVal: number | string = 0
    let bVal: number | string = 0

    switch (sort.field) {
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
      return sort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sort.direction === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })
}

export default function InsiderTradesTable({
  trades,
  defaultSortByValue = false,
  sort,
  onSortChange,
}: InsiderTradesTableProps) {
  const [internalSort, setInternalSort] = useState<InsiderTradeSort>({
    field: defaultSortByValue ? 'value' : 'transactionDate',
    direction: 'desc',
  })
  const activeSort = sort ?? internalSort

  useEffect(() => {
    if (sort) return

    setInternalSort({
      field: defaultSortByValue ? 'value' : 'transactionDate',
      direction: 'desc',
    })
  }, [defaultSortByValue, sort])

  const updateSort = (nextSort: InsiderTradeSort) => {
    if (onSortChange) {
      onSortChange(nextSort)
      return
    }

    setInternalSort(nextSort)
  }

  const handleSort = (field: InsiderTradeSortField) => {
    updateSort({
      field,
      direction: activeSort.field === field && activeSort.direction === 'desc' ? 'asc' : 'desc',
    })
  }

  const sortedTrades = useMemo(() => {
    return sortInsiderTrades(trades, activeSort)
  }, [trades, activeSort])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const date = new Date(`${dateStr.split('T')[0]}T12:00:00Z`)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      timeZone: 'UTC',
    })
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return '—'
    return `$${price.toFixed(2)}`
  }

  const formatShares = (shares: number) => {
    if (!shares || shares === 0) return '—'
    if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`
    if (shares >= 1_000) return `${(shares / 1_000).toFixed(1)}K`
    return shares.toLocaleString('en-US')
  }

  const formatValue = (shares: number, price: number | null) => {
    if (price === null || price === 0 || !shares) return '—'
    const value = shares * price
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const getTransactionCode = (type: string) => type?.trim().charAt(0).toUpperCase() || ''

  const getTransactionLabel = (type: string) => {
    const code = getTransactionCode(type)
    if (!code) return 'Unknown transaction'
    return TRANSACTION_LABELS[code] || `Transaction code ${code}`
  }

  const getTransactionColor = (type: string) => {
    const code = getTransactionCode(type)
    if (code === 'P') {
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    }
    if (code === 'S') {
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
    }
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
  }

  const SortIcon = ({ field }: { field: InsiderTradeSortField }) => {
    if (activeSort.field !== field) {
      return <span aria-hidden="true" className="ml-1 text-gray-400">↕</span>
    }
    return <span aria-hidden="true" className="ml-1">{activeSort.direction === 'asc' ? '↑' : '↓'}</span>
  }

  const sortAriaLabel = (field: InsiderTradeSortField) => {
    const current = activeSort.field === field ? `, currently ${activeSort.direction === 'asc' ? 'ascending' : 'descending'}` : ''
    return `Sort by ${SORT_LABELS[field]}${current}`
  }

  const ariaSort = (field: InsiderTradeSortField): 'ascending' | 'descending' | 'none' => {
    if (activeSort.field !== field) return 'none'
    return activeSort.direction === 'asc' ? 'ascending' : 'descending'
  }

  if (trades.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-lg border border-cream-300 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-center text-gray-500 dark:text-gray-400">
            No trades found
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-end gap-3 lg:hidden">
        <label className="min-w-0 flex-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="mb-1 block">Sort trades by</span>
          <select
            aria-label="Sort insider trades by"
            value={activeSort.field}
            onChange={(event) => updateSort({
              field: event.target.value as InsiderTradeSortField,
              direction: activeSort.direction,
            })}
            className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="transactionDate">Date</option>
            <option value="value">Value</option>
            <option value="securitiesTransacted">Shares</option>
            <option value="price">Price</option>
            <option value="symbol">Symbol</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => updateSort({
            ...activeSort,
            direction: activeSort.direction === 'asc' ? 'desc' : 'asc',
          })}
          aria-label={`Change sort direction to ${activeSort.direction === 'asc' ? 'descending' : 'ascending'}`}
          className="min-h-11 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-cream-50 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {activeSort.direction === 'asc' ? 'Ascending' : 'Descending'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="block w-full lg:table lg:table-fixed">
          <caption className="sr-only">
            Insider transactions. Use the column headings or mobile sort controls to reorder the results.
          </caption>
          <thead className="hidden bg-cream-50 text-xs font-semibold text-gray-700 dark:bg-gray-800/50 dark:text-gray-300 lg:table-header-group">
            <tr>
              <th scope="col" aria-sort={ariaSort('symbol')} className="px-4 py-1 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('symbol')}
                  aria-label={sortAriaLabel('symbol')}
                  className="flex min-h-10 w-full items-center text-left transition-colors hover:text-sage-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  Symbol<SortIcon field="symbol" />
                </button>
              </th>
              <th scope="col" className="px-2 py-1 text-left">Insider</th>
              <th scope="col" className="px-2 py-1 text-left">Title</th>
              <th scope="col" className="px-2 py-1 text-left">Type</th>
              <th scope="col" aria-sort={ariaSort('securitiesTransacted')} className="px-2 py-1 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('securitiesTransacted')}
                  aria-label={sortAriaLabel('securitiesTransacted')}
                  className="flex min-h-10 w-full items-center justify-end transition-colors hover:text-sage-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  Shares<SortIcon field="securitiesTransacted" />
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort('price')} className="px-2 py-1 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('price')}
                  aria-label={sortAriaLabel('price')}
                  className="flex min-h-10 w-full items-center justify-end transition-colors hover:text-sage-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  Price<SortIcon field="price" />
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort('value')} className="px-2 py-1 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('value')}
                  aria-label={sortAriaLabel('value')}
                  className="flex min-h-10 w-full items-center justify-end transition-colors hover:text-sage-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  Value<SortIcon field="value" />
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort('transactionDate')} className="px-2 py-1 pr-4 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('transactionDate')}
                  aria-label={sortAriaLabel('transactionDate')}
                  className="flex min-h-10 w-full items-center justify-end transition-colors hover:text-sage-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
                >
                  Date<SortIcon field="transactionDate" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="block divide-y divide-cream-200 dark:divide-gray-700 lg:table-row-group">
            {sortedTrades.map((trade, index) => (
              <tr
                key={`${trade.symbol}-${trade.filingDate}-${trade.insiderId || trade.reportingName}-${index}`}
                className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 transition-colors hover:bg-cream-50 dark:hover:bg-gray-800 lg:table-row lg:p-0"
              >
                <td className="order-1 min-w-0 text-sm lg:table-cell lg:px-4 lg:py-3 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Symbol</span>
                  <Link
                    href={`/stock/${trade.symbol}`}
                    className="font-semibold text-sage-600 hover:text-sage-700 hover:underline dark:text-sage-400 dark:hover:text-sage-300"
                  >
                    {trade.symbol}
                  </Link>
                </td>
                <td className="order-3 col-span-2 min-w-0 text-sm text-gray-900 dark:text-white lg:table-cell lg:max-w-48 lg:px-2 lg:py-3 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Insider</span>
                  {trade.insiderId ? (
                    <Link
                      href={`/insider/${trade.insiderId}`}
                      className="break-words font-medium text-sage-600 hover:text-sage-700 hover:underline dark:text-sage-400 dark:hover:text-sage-300 lg:block lg:truncate"
                      title={trade.reportingName}
                    >
                      {trade.reportingName}
                    </Link>
                  ) : (
                    <span className="break-words lg:block lg:truncate" title={trade.reportingName}>{trade.reportingName}</span>
                  )}
                </td>
                <td className="order-4 col-span-2 min-w-0 text-sm text-gray-600 dark:text-gray-400 lg:table-cell lg:max-w-40 lg:px-2 lg:py-3 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Title</span>
                  <span className="break-words lg:block lg:truncate" title={trade.typeOfOwner}>{trade.typeOfOwner || '—'}</span>
                </td>
                <td className="order-5 min-w-0 text-sm lg:table-cell lg:px-2 lg:py-3 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Transaction</span>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getTransactionColor(trade.transactionType)}`}>
                    {getTransactionLabel(trade.transactionType)}
                  </span>
                </td>
                <td className="order-6 min-w-0 text-right text-sm text-gray-900 dark:text-white lg:table-cell lg:px-2 lg:py-3 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Shares</span>
                  {formatShares(trade.securitiesTransacted)}
                </td>
                <td className="order-7 min-w-0 text-sm text-gray-900 dark:text-white lg:table-cell lg:px-2 lg:py-3 lg:text-right lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Price</span>
                  {formatPrice(trade.price)}
                </td>
                <td className="order-8 min-w-0 text-right text-sm font-semibold text-gray-900 dark:text-white lg:table-cell lg:px-2 lg:py-3 lg:text-xs lg:font-normal">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Value</span>
                  {formatValue(trade.securitiesTransacted, trade.price)}
                </td>
                <td className="order-2 min-w-0 text-right text-sm text-gray-600 dark:text-gray-400 lg:table-cell lg:px-2 lg:py-3 lg:pr-4 lg:text-xs">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 lg:hidden">Date</span>
                  {formatDate(trade.transactionDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
