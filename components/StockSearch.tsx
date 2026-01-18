'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  symbol: string
  name: string
}

export default function StockSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const router = useRouter()

  // Debounced search
  useEffect(() => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (query.length < 1) {
      setResults([])
      setIsOpen(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/search-stocks?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Search failed')
        }

        const data = await response.json()

        if (!controller.signal.aborted) {
          setResults(data.results || [])
          setIsOpen(true)
          setHighlightedIndex(-1)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return
        }
        console.error('Search error:', err)
        if (!controller.signal.aborted) {
          setError('Search failed. Please try again.')
          setResults([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 150) // 150ms debounce

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || results.length === 0) {
        if (e.key === 'Escape') {
          setIsOpen(false)
          inputRef.current?.blur()
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            navigateToStock(results[highlightedIndex].symbol)
          } else if (results.length > 0) {
            navigateToStock(results[0].symbol)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          inputRef.current?.blur()
          break
      }
    },
    [isOpen, results, highlightedIndex]
  )

  const navigateToStock = (symbol: string) => {
    setQuery('')
    setIsOpen(false)
    setResults([])
    router.push(`/stock/${symbol}`)
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true)
            }
          }}
          placeholder="Search stocks..."
          className="w-48 sm:w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search stocks"
          aria-expanded={isOpen}
          aria-controls="stock-search-results"
          aria-autocomplete="list"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          id="stock-search-results"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white dark:bg-[rgb(38,38,38)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {error ? (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {query.length > 0 ? 'No stocks found' : 'Start typing to search...'}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.symbol}
                role="option"
                aria-selected={highlightedIndex === index}
                onClick={() => navigateToStock(result.symbol)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  highlightedIndex === index
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : ''
                }`}
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {result.symbol}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 truncate ml-2 max-w-[180px]">
                  {result.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
