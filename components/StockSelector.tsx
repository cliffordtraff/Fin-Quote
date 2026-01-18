'use client'

import { useState, useRef, useEffect, useMemo } from 'react'

interface Stock {
  symbol: string
  name: string
  sector?: string
}

interface StockSelectorProps {
  availableStocks: Stock[]
  selectedStocks: string[]
  onSelect: (symbols: string[]) => void
  allowMultiple?: boolean
  popularStocks?: string[]  // Popular stocks to show at the top
}

export default function StockSelector({
  availableStocks,
  selectedStocks,
  onSelect,
  allowMultiple = false,
  popularStocks = [],
}: StockSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Filter stocks based on search query
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableStocks
    }
    const query = searchQuery.toLowerCase().trim()
    return availableStocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        (stock.sector && stock.sector.toLowerCase().includes(query))
    )
  }, [availableStocks, searchQuery])

  // Organize stocks: popular first (if no search), then rest
  const organizedStocks = useMemo(() => {
    if (searchQuery.trim()) {
      // When searching, just show filtered results
      return filteredStocks
    }

    // When not searching, show popular stocks first
    const popular = popularStocks
      .map((symbol) => availableStocks.find((s) => s.symbol === symbol))
      .filter(Boolean) as Stock[]

    const rest = availableStocks.filter((s) => !popularStocks.includes(s.symbol))

    return [...popular, ...rest]
  }, [availableStocks, filteredStocks, popularStocks, searchQuery])

  const handleStockToggle = (symbol: string) => {
    if (allowMultiple) {
      // Multi-select mode
      if (selectedStocks.includes(symbol)) {
        // Don't allow deselecting if it's the only selected stock
        if (selectedStocks.length > 1) {
          onSelect(selectedStocks.filter((s) => s !== symbol))
        }
      } else {
        onSelect([...selectedStocks, symbol])
      }
    } else {
      // Single-select mode
      onSelect([symbol])
      setIsOpen(false)
      setSearchQuery('')
    }
  }

  // Get display text for button
  const getDisplayText = () => {
    if (selectedStocks.length === 0) {
      return { symbol: 'Select', name: 'Stock' }
    }
    if (selectedStocks.length === 1) {
      const stock = availableStocks.find((s) => s.symbol === selectedStocks[0])
      return { symbol: selectedStocks[0], name: stock?.name || '' }
    }
    // Multiple stocks selected
    return { symbol: selectedStocks.join(', '), name: `${selectedStocks.length} stocks` }
  }

  const displayInfo = getDisplayText()

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {displayInfo.symbol}
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-xs hidden sm:inline max-w-[150px] truncate">
          {displayInfo.name}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search stocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Stock List */}
          <div className="max-h-[500px] overflow-y-auto p-2">
            {!searchQuery && popularStocks.length > 0 && (
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                Popular
              </div>
            )}

            {organizedStocks.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No stocks found
              </div>
            ) : (
              <>
                {organizedStocks.map((stock, index) => {
                  const isSelected = selectedStocks.includes(stock.symbol)
                  const isPopular = popularStocks.includes(stock.symbol)
                  const showRestHeader =
                    !searchQuery &&
                    popularStocks.length > 0 &&
                    !isPopular &&
                    index === popularStocks.length

                  return (
                    <div key={stock.symbol}>
                      {showRestHeader && (
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                          All Stocks
                        </div>
                      )}
                      <button
                        onClick={() => handleStockToggle(stock.symbol)}
                        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {allowMultiple ? (
                          // Checkbox for multi-select
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          // Radio dot for single-select
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isSelected
                                ? 'bg-blue-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                        )}
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{stock.name}</span>
                        </div>
                        {!allowMultiple && isSelected && (
                          <svg
                            className="w-4 h-4 text-blue-500 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Footer with count */}
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            {searchQuery
              ? `${filteredStocks.length} of ${availableStocks.length} stocks`
              : `${availableStocks.length} stocks available`}
          </div>
        </div>
      )}
    </div>
  )
}
