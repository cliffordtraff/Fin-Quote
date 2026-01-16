'use client'

import { useState, useRef, useEffect } from 'react'

interface Stock {
  symbol: string
  name: string
}

interface StockSelectorProps {
  availableStocks: Stock[]
  selectedStocks: string[]
  onSelect: (symbols: string[]) => void
  allowMultiple?: boolean
}

export default function StockSelector({
  availableStocks,
  selectedStocks,
  onSelect,
  allowMultiple = false,
}: StockSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
        <span className="text-gray-500 dark:text-gray-400 text-xs hidden sm:inline">
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
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="p-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
              {allowMultiple ? 'Select Stocks' : 'Select Stock'}
            </div>
            {availableStocks.map((stock) => {
              const isSelected = selectedStocks.includes(stock.symbol)
              return (
                <button
                  key={stock.symbol}
                  onClick={() => handleStockToggle(stock.symbol)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {allowMultiple ? (
                    // Checkbox for multi-select
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
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
                      className={`w-2 h-2 rounded-full ${
                        isSelected
                          ? 'bg-blue-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                  )}
                  <div>
                    <div className="font-semibold text-sm">{stock.symbol}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{stock.name}</div>
                  </div>
                  {!allowMultiple && isSelected && (
                    <svg
                      className="w-4 h-4 ml-auto text-blue-500"
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
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
