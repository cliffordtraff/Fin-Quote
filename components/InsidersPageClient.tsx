'use client'

import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from 'react'
import type { InsiderTrade } from '@/app/actions/insider-trading'
import {
  getInsiderTradesBySymbol,
  getLatestInsiderTrades,
  getTopInsiderTrades,
  searchInsiderTradesByName
} from '@/app/actions/insider-trading'
import InsiderTradesTable, {
  sortInsiderTrades,
  type InsiderTradeSort,
} from './InsiderTradesTable'

type ViewType = 'latest' | 'top' | 'ticker' | 'insider'

interface InsidersPageClientProps {
  initialTrades: InsiderTrade[]
}

export default function InsidersPageClient({ initialTrades }: InsidersPageClientProps) {
  // View state
  const [activeView, setActiveView] = useState<ViewType>('latest')
  const [trades, setTrades] = useState<InsiderTrade[]>(initialTrades)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Search state
  const [tickerQuery, setTickerQuery] = useState('')
  const [insiderQuery, setInsiderQuery] = useState('')
  const [searchRequestVersion, setSearchRequestVersion] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const viewRequestIdRef = useRef(0)

  // Filter state
  const [transactionFilter, setTransactionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sort, setSort] = useState<InsiderTradeSort>({
    field: 'transactionDate',
    direction: 'desc',
  })

  // Pagination state
  const [page, setPage] = useState(1)
  const ROWS_PER_PAGE = 50

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [transactionFilter, dateFilter, activeView, tickerQuery, insiderQuery])

  const defaultSortByValue = activeView === 'top'

  useEffect(() => {
    setSort({
      field: defaultSortByValue ? 'value' : 'transactionDate',
      direction: 'desc',
    })
  }, [defaultSortByValue])

  // Debounced ticker search
  useEffect(() => {
    if (activeView !== 'ticker') return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsLoading(false)
    setErrorMessage(null)

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
            setErrorMessage(result.error)
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setTrades([])
          setErrorMessage('Unable to search insider trades right now. Please try again.')
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
  }, [tickerQuery, activeView, searchRequestVersion])

  // Debounced insider name search
  useEffect(() => {
    if (activeView !== 'insider') return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsLoading(false)
    setErrorMessage(null)

    if (insiderQuery.trim().length < 2) {
      // Show all trades if query is too short
      if (insiderQuery.trim().length === 0) {
        setTrades(initialTrades)
      } else {
        setTrades([])
      }
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      try {
        const result = await searchInsiderTradesByName(insiderQuery.trim(), 200)
        if (!controller.signal.aborted) {
          if ('trades' in result) {
            setTrades(result.trades)
          } else {
            setTrades([])
            setErrorMessage(result.error)
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setTrades([])
          setErrorMessage('Unable to search insider trades right now. Please try again.')
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
  }, [insiderQuery, activeView, initialTrades, searchRequestVersion])

  // Handle view change
  const handleViewChange = async (view: ViewType) => {
    const requestId = viewRequestIdRef.current + 1
    viewRequestIdRef.current = requestId
    abortControllerRef.current?.abort()
    setActiveView(view)
    setTickerQuery('')
    setInsiderQuery('')
    setErrorMessage(null)
    setIsLoading(false)

    if (view === 'latest') {
      setIsLoading(true)
      try {
        const result = await getLatestInsiderTrades(200)
        if (viewRequestIdRef.current !== requestId) return
        if ('trades' in result) {
          setTrades(result.trades)
        } else {
          setTrades([])
          setErrorMessage(result.error)
        }
      } catch {
        if (viewRequestIdRef.current === requestId) {
          setTrades([])
          setErrorMessage('Unable to load the latest insider trades. Please try again.')
        }
      } finally {
        if (viewRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    } else if (view === 'top') {
      // Use dedicated server action for top trades (already sorted by value)
      setIsLoading(true)
      try {
        const result = await getTopInsiderTrades(7, 200)
        if (viewRequestIdRef.current !== requestId) return
        if ('trades' in result) {
          setTrades(result.trades)
        } else {
          setTrades([])
          setErrorMessage(result.error)
        }
      } catch {
        if (viewRequestIdRef.current === requestId) {
          setTrades([])
          setErrorMessage('Unable to load the top insider trades. Please try again.')
        }
      } finally {
        if (viewRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    } else if (view === 'ticker') {
      // Clear trades for ticker search, user needs to enter a symbol
      setTrades([])
    } else if (view === 'insider') {
      // Show initial trades for insider search
      setTrades(initialTrades)
    }
  }

  const retryCurrentView = () => {
    if (activeView === 'latest' || activeView === 'top') {
      void handleViewChange(activeView)
      return
    }

    setSearchRequestVersion((version) => version + 1)
  }

  // Client-side filtering
  const filteredTrades = useMemo(() => {
    let result = trades

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

    // Date range filter (not applied to "top" view which already filters by date on server)
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
  }, [trades, transactionFilter, dateFilter, activeView])

  const sortedTrades = useMemo(
    () => sortInsiderTrades(filteredTrades, sort),
    [filteredTrades, sort],
  )

  // Pagination happens after sorting so every control orders the full result set.
  const totalPages = Math.ceil(sortedTrades.length / ROWS_PER_PAGE)
  const paginatedTrades = sortedTrades.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  )

  const handleSortChange = (nextSort: InsiderTradeSort) => {
    setSort(nextSort)
    setPage(1)
  }

  const tabs = [
    { id: 'latest' as ViewType, label: 'Latest Trades' },
    { id: 'top' as ViewType, label: 'Top Trades (Week)' },
    { id: 'ticker' as ViewType, label: 'By Ticker' },
    { id: 'insider' as ViewType, label: 'By Insider' },
  ]

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (tabIndex + 1) % tabs.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (tabIndex - 1 + tabs.length) % tabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    }

    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    document.getElementById(`insiders-tab-${nextTab.id}`)?.focus()
    void handleViewChange(nextTab.id)
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="rounded-lg bg-cream-100 p-1 dark:bg-gray-800 sm:rounded-none sm:border-b sm:border-gray-200 sm:bg-transparent sm:p-0 dark:sm:border-gray-700 dark:sm:bg-transparent">
        <nav
          className="grid grid-cols-2 gap-1 sm:flex sm:gap-1"
          aria-label="Insider trading views"
          role="tablist"
        >
          {tabs.map((tab, tabIndex) => (
            <button
              key={tab.id}
              id={`insiders-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeView === tab.id}
              aria-controls="insiders-results-panel"
              tabIndex={activeView === tab.id ? 0 : -1}
              onClick={() => void handleViewChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
              className={`min-h-11 rounded-md border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 sm:rounded-none sm:px-4 ${
                activeView === tab.id
                  ? 'border-sage-500 bg-white text-sage-700 shadow-sm dark:bg-gray-700 dark:text-sage-300 sm:bg-transparent sm:shadow-none dark:sm:bg-transparent'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white sm:hover:bg-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <section
        id="insiders-results-panel"
        role="tabpanel"
        aria-labelledby={`insiders-tab-${activeView}`}
        aria-busy={isLoading}
        tabIndex={0}
        className="space-y-4 focus:outline-none"
      >
      {/* Filters and Search Row */}
      <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:gap-4">
        {/* Transaction Type Filter */}
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="insider-transaction-filter" className="text-xs text-gray-600 dark:text-gray-400">Type:</label>
          <select
            id="insider-transaction-filter"
            name="transactionType"
            value={transactionFilter}
            onChange={(e) => setTransactionFilter(e.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:flex-none"
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
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="insider-date-filter" className="text-xs text-gray-600 dark:text-gray-400">Date:</label>
            <select
              id="insider-date-filter"
              name="dateRange"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="min-h-10 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:flex-none"
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
          <div className="text-xs italic text-gray-500 dark:text-gray-400 sm:col-auto">
            Showing highest value trades from past 7 days
          </div>
        )}

        {/* Search Input - Ticker */}
        {activeView === 'ticker' && (
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:ml-auto">
            <input
              type="text"
              name="tickerSearch"
              aria-label="Search insider trades by ticker"
              value={tickerQuery}
              onChange={(e) => setTickerQuery(e.target.value.toUpperCase())}
              placeholder="Enter symbol (e.g., AAPL)"
              className="min-h-11 min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 sm:w-56 sm:flex-none"
            />
            {isLoading && (
              <div aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sage-500 border-t-transparent motion-reduce:animate-none" />
            )}
          </div>
        )}

        {/* Search Input - Insider */}
        {activeView === 'insider' && (
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:ml-auto">
            <input
              type="text"
              name="insiderSearch"
              aria-label="Search insider trades by name"
              value={insiderQuery}
              onChange={(e) => setInsiderQuery(e.target.value)}
              placeholder="Search insider name..."
              aria-describedby="insider-search-hint"
              className="min-h-11 min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 sm:w-56 sm:flex-none"
            />
            {isLoading && (
              <div aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sage-500 border-t-transparent motion-reduce:animate-none" />
            )}
            <span id="insider-search-hint" className="sr-only">Enter at least two characters to search by name.</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={retryCurrentView}
            className="min-h-10 self-start rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-800 hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100 dark:hover:bg-rose-900 sm:self-auto"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results Count */}
      <div role="status" aria-live="polite" aria-atomic="true" className="text-xs text-gray-500 dark:text-gray-400">
        {isLoading ? (
          'Loading insider trades…'
        ) : errorMessage ? (
          'The results could not be updated.'
        ) : activeView === 'ticker' && tickerQuery.length === 0 ? (
          'Enter a ticker symbol to find insider trades.'
        ) : activeView === 'insider' && insiderQuery.trim().length === 1 ? (
          'Enter at least two characters to search by name.'
        ) : (
          `Showing ${paginatedTrades.length} of ${filteredTrades.length} trades`
        )}
      </div>

      {/* Table */}
      <InsiderTradesTable
        trades={paginatedTrades}
        defaultSortByValue={defaultSortByValue}
        sort={sort}
        onSortChange={handleSortChange}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-11 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-11 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </section>
    </div>
  )
}
