'use client'

import { useState, useRef, useEffect } from 'react'

interface Stock {
  symbol: string
  name: string
}

interface StockSelectorProps {
  availableStocks: Stock[]
  selectedStock: string
  onSelect: (symbol: string) => void
}

export default function StockSelector({
  availableStocks,
  selectedStock,
  onSelect,
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

  const selectedStockData = availableStocks.find((s) => s.symbol === selectedStock)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {selectedStock}
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-xs hidden sm:inline">
          {selectedStockData?.name}
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
              Select Stock
            </div>
            {availableStocks.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => {
                  onSelect(stock.symbol)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors ${
                  selectedStock === stock.symbol
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    selectedStock === stock.symbol
                      ? 'bg-blue-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
                <div>
                  <div className="font-semibold text-sm">{stock.symbol}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{stock.name}</div>
                </div>
                {selectedStock === stock.symbol && (
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
