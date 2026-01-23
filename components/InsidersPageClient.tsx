'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { InsiderTrade } from '@/app/actions/insider-trading'
import { getInsiderTradesBySymbol, getLatestInsiderTrades } from '@/app/actions/insider-trading'
import InsiderTradesTable from './InsiderTradesTable'

type ViewType = 'latest' | 'top' | 'ticker' | 'insider'

interface InsidersPageClientProps {
  initialTrades: InsiderTrade[]
}

export default function InsidersPageClient({ initialTrades }: InsidersPageClientProps) {
  // View state
  const [activeView, setActiveView] = useState<ViewType>('latest')
  const [trades, setTrades] = useState<InsiderTrade[]>(initialTrades)
  const [isLoading, setIsLoading] = useState(false)

  // Search state
  const [tickerQuery, setTickerQuery] = useState('')
  const [insiderQuery, setInsiderQuery] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Filter state
  const [transactionFilter, setTransactionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  // Pagination state
  const [page, setPage] = useState(1)
  const ROWS_PER_PAGE = 50

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [transactionFilter, dateFilter, activeView, tickerQuery, insiderQuery])

  // Debounced ticker search
  useEffect(() => {
    if (activeView !== 'ticker') return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (tickerQuery.length < 1) {
      setTrades([])
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await getInsiderTradesBySymbol(tickerQuery.toUpperCase(), 200)
        if (!controller.signal.aborted) {
          if ('trades' in result) {
            setTrades(result.trades)
          } else {
            setTrades([])
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setTrades([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [tickerQuery, activeView])

  // Handle view change
  const handleViewChange = async (view: ViewType) => {
    setActiveView(view)
    setTickerQuery('')
    setInsiderQuery('')

    if (view === 'latest') {
      setIsLoading(true)
      const result = await getLatestInsiderTrades(200)
      if ('trades' in result) {
        setTrades(result.trades)
      }
      setIsLoading(false)
    } else if (view === 'top') {
      // Fetch more trades for top weekly view
      setIsLoading(true)
      const result = await getLatestInsiderTrades(500)
      if ('trades' in result) {
        setTrades(result.trades)
      }
      setIsLoading(false)
    } else if (view === 'ticker' || view === 'insider') {
      // For search views, start with initial trades (all latest)
      setTrades(initialTrades)
    }
  }

  // Client-side filtering
  const filteredTrades = useMemo(() => {
    let result = trades

    // For "Top Trades" view: filter to past 7 days, with price > 0, sort by value
    if (activeView === 'top') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      result = result
        .filter(trade => {
          const tradeDate = new Date(trade.transactionDate).getTime()
          const hasValue = trade.price && trade.price > 0 && trade.securitiesTransacted > 0
          return tradeDate >= sevenDaysAgo && hasValue
        })
        .sort((a, b) => {
          const aValue = (a.securitiesTransacted || 0) * (a.price || 0)
          const bValue = (b.securitiesTransacted || 0) * (b.price || 0)
          return bValue - aValue
        })
    }

    // Insider name filter (for insider search tab)
    if (activeView === 'insider' && insiderQuery.trim()) {
      const query = insiderQuery.toLowerCase().trim()
      result = result.filter(trade =>
        trade.reportingName?.toLowerCase().includes(query)
      )
    }

    // Transaction type filter
    if (transactionFilter !== 'all') {
      const typeMap: Record<string, string> = {
        purchase: 'P',
        sale: 'S',
        option: 'M',
        award: 'A',
        gift: 'G',
      }
      result = result.filter(trade =>
        trade.transactionType?.charAt(0).toUpperCase() === typeMap[transactionFilter]
      )
    }

    // Date range filter (not applied to "top" view which has its own date logic)
    if (dateFilter !== 'all' && activeView !== 'top') {
      const days: Record<string, number> = {
        week: 7,
        month: 30,
        quarter: 90,
        year: 365,
      }
      const maxDays = days[dateFilter]
      const now = Date.now()
      result = result.filter(trade => {
        const tradeDate = new Date(trade.transactionDate)
        const daysDiff = (now - tradeDate.getTime()) / (1000 * 60 * 60 * 24)
        return daysDiff <= maxDays
      })
    }

    return result
  }, [trades, transactionFilter, dateFilter, activeView, insiderQuery])

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / ROWS_PER_PAGE)
  const paginatedTrades = filteredTrades.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  )

  const tabs = [
    { id: 'latest' as ViewType, label: 'Latest Trades' },
    { id: 'top' as ViewType, label: 'Top Trades (Week)' },
    { id: 'ticker' as ViewType, label: 'By Ticker' },
    { id: 'insider' as ViewType, label: 'By Insider' },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4" aria-label="Insider Trading Views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleViewChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeView === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters and Search Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Transaction Type Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400">Type:</label>
          <select
            value={transactionFilter}
            onChange={(e) => setTransactionFilter(e.target.value)}
            className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="purchase">Purchase</option>
            <option value="sale">Sale</option>
            <option value="option">Option Exercise</option>
            <option value="award">Award</option>
            <option value="gift">Gift</option>
          </select>
        </div>

        {/* Date Range Filter - hidden for "top" view */}
        {activeView !== 'top' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 dark:text-gray-400">Date:</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
              <option value="quarter">Past Quarter</option>
              <option value="year">Past Year</option>
            </select>
          </div>
        )}

        {/* Top Trades indicator */}
        {activeView === 'top' && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic">
            Showing highest value trades from past 7 days
          </div>
        )}

        {/* Search Input - Ticker */}
        {activeView === 'ticker' && (
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="text"
              value={tickerQuery}
              onChange={(e) => setTickerQuery(e.target.value.toUpperCase())}
              placeholder="Enter symbol (e.g., AAPL)"
              className="text-xs px-3 py-1.5 w-48 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {isLoading && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}

        {/* Search Input - Insider */}
        {activeView === 'insider' && (
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="text"
              value={insiderQuery}
              onChange={(e) => setInsiderQuery(e.target.value)}
              placeholder="Search insider name..."
              className="text-xs px-3 py-1.5 w-48 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {isLoading ? (
          'Loading...'
        ) : (
          `Showing ${paginatedTrades.length} of ${filteredTrades.length} trades`
        )}
      </div>

      {/* Table */}
      <InsiderTradesTable trades={paginatedTrades} defaultSortByValue={activeView === 'top'} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[rgb(38,38,38)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
