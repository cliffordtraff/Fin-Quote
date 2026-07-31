'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  dispatchNativeTickerSearchClose,
  dispatchNativeTickerSearchOpen,
  NATIVE_TICKER_SEARCH_STATE_EVENT,
  type NativeTickerSearchStateDetail,
} from '@/lib/native-ticker-search'

interface StockSearchProps {
  pathname?: string | null
}

interface StockSearchResult {
  symbol: string
  name: string
}

const SEARCH_DEBOUNCE_MS = 150

function normalizeQuery(value: string): string {
  return value.trim().toUpperCase()
}

function isPrintableSearchKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

function shouldIgnoreGlobalShortcutTarget(target: EventTarget | null, launcher: HTMLInputElement | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target === launcher) return true
  if (target.isContentEditable) return true

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'textarea' || tagName === 'select') return true
  if (tagName !== 'input') return false

  const type = (target.getAttribute('type') || (target as HTMLInputElement).type || '').toLowerCase()
  return type !== 'range'
}

export default function StockSearch({ pathname }: StockSearchProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRequestRef = useRef<AbortController | null>(null)
  const listboxId = useId()
  const [isNativeSearchOpen, setIsNativeSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const nativeSearchConfigured = Boolean(process.env.NEXT_PUBLIC_CHARTING_URL?.trim())
  const isWorkspaceSearch = Boolean(pathname?.startsWith('/workspace/'))
  const isConfigured = isWorkspaceSearch ? nativeSearchConfigured : true
  const enableGlobalTypeShortcut = Boolean(pathname?.startsWith('/stock/'))
  const isSearchOpen = isWorkspaceSearch ? isNativeSearchOpen : isDropdownOpen

  const closeDropdown = () => {
    setIsDropdownOpen(false)
    setHighlightedIndex(-1)
  }

  const resetDropdown = () => {
    setQuery('')
    setResults([])
    setIsLoading(false)
    closeDropdown()
  }

  useEffect(() => {
    const handleSearchState = (event: Event) => {
      const detail = (event as CustomEvent<NativeTickerSearchStateDetail>).detail
      setIsNativeSearchOpen(Boolean(detail?.open))
    }

    window.addEventListener(NATIVE_TICKER_SEARCH_STATE_EVENT, handleSearchState)
    return () => window.removeEventListener(NATIVE_TICKER_SEARCH_STATE_EVENT, handleSearchState)
  }, [])

  const openNativeSearch = (query?: string) => {
    if (!isWorkspaceSearch || !isConfigured) return
    dispatchNativeTickerSearchOpen(query ? { query: normalizeQuery(query) } : {})
    window.requestAnimationFrame(() => inputRef.current?.blur())
  }

  useEffect(() => {
    if (!enableGlobalTypeShortcut) return

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isSearchOpen) return
      if (event.defaultPrevented) return
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
      if (!/[a-z0-9]/i.test(event.key)) return
      if (shouldIgnoreGlobalShortcutTarget(event.target, inputRef.current)) return

      event.preventDefault()
      if (isWorkspaceSearch) {
        openNativeSearch(event.key)
        return
      }

      const seededQuery = normalizeQuery(event.key)
      setQuery(seededQuery)
      setIsDropdownOpen(true)
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(seededQuery.length, seededQuery.length)
      })
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [enableGlobalTypeShortcut, isSearchOpen, isWorkspaceSearch])

  useEffect(() => {
    if (isWorkspaceSearch) return

    const normalizedQuery = normalizeQuery(query)
    if (!normalizedQuery) {
      searchRequestRef.current?.abort()
      setResults([])
      setIsLoading(false)
      setHighlightedIndex(-1)
      return
    }

    const controller = new AbortController()
    searchRequestRef.current?.abort()
    searchRequestRef.current = controller
    setIsLoading(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-stocks?q=${encodeURIComponent(normalizedQuery)}`, {
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          setResults([])
          return
        }

        const nextResults = Array.isArray(payload.results) ? payload.results as StockSearchResult[] : []
        setResults(nextResults)
        setHighlightedIndex(nextResults.length > 0 ? 0 : -1)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setResults([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [isWorkspaceSearch, query])

  useEffect(() => {
    if (isWorkspaceSearch) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isWorkspaceSearch])

  const handleResultSelection = (symbol: string) => {
    resetDropdown()
    inputRef.current?.blur()
    router.push(`/stock/${encodeURIComponent(symbol)}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
        ref={inputRef}
        type="text"
        name="ticker-search"
        readOnly={isWorkspaceSearch}
        disabled={!isConfigured}
        value={isWorkspaceSearch ? '' : query}
        onFocus={() => {
          if (isWorkspaceSearch && !isSearchOpen) {
            openNativeSearch()
            return
          }

          if (!isWorkspaceSearch && (query || results.length > 0)) {
            setIsDropdownOpen(true)
          }
        }}
        onChange={(event) => {
          if (isWorkspaceSearch) return

          const nextQuery = normalizeQuery(event.target.value)
          setQuery(nextQuery)
          setIsDropdownOpen(Boolean(nextQuery))
        }}
        onKeyDown={(event) => {
          if (!isConfigured) return

          if (event.key === 'Escape') {
            event.preventDefault()
            if (isWorkspaceSearch) {
              dispatchNativeTickerSearchClose({ reason: 'host' })
            } else {
              closeDropdown()
            }
            inputRef.current?.blur()
            return
          }

          if (!isWorkspaceSearch) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (!results.length) return
              setIsDropdownOpen(true)
              setHighlightedIndex((current) => {
                const nextIndex = current < 0 ? 0 : Math.min(current + 1, results.length - 1)
                return nextIndex
              })
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (!results.length) return
              setIsDropdownOpen(true)
              setHighlightedIndex((current) => {
                const nextIndex = current <= 0 ? 0 : current - 1
                return nextIndex
              })
              return
            }

            if (event.key === 'Enter') {
              const selectedResult = highlightedIndex >= 0 ? results[highlightedIndex] : results[0]
              if (!selectedResult) return

              event.preventDefault()
              handleResultSelection(selectedResult.symbol)
              return
            }

            return
          }

          if (!isPrintableSearchKey(event)) return

          event.preventDefault()
          openNativeSearch(event.key)
        }}
        onPaste={(event) => {
          if (!isConfigured) return

          if (!isWorkspaceSearch) {
            const nextQuery = normalizeQuery(event.clipboardData.getData('text'))
            if (!nextQuery) return
            event.preventDefault()
            setQuery(nextQuery)
            setIsDropdownOpen(true)
            return
          }

          event.preventDefault()
          const query = normalizeQuery(event.clipboardData.getData('text'))
          openNativeSearch(query)
        }}
        placeholder={isConfigured ? 'Search ticker or company...' : 'Search unavailable'}
        className={`w-56 sm:w-72 rounded-xl border py-2 pl-9 pr-4 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent ${
          isConfigured
            ? isSearchOpen
              ? 'border-sage-500 bg-white text-gray-900 dark:border-sage-400 dark:bg-gray-800 dark:text-white'
              : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400'
            : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-500'
        }`}
        aria-label="Search ticker symbols"
        aria-haspopup={isWorkspaceSearch ? 'dialog' : 'listbox'}
        aria-expanded={isSearchOpen}
        aria-controls={!isWorkspaceSearch && isDropdownOpen ? listboxId : undefined}
        aria-activedescendant={!isWorkspaceSearch && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined}
      />

      {!isWorkspaceSearch && isDropdownOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Searching...
            </div>
          ) : results.length > 0 ? (
            <ul id={listboxId} role="listbox" className="max-h-80 overflow-y-auto py-1">
              {results.map((result, index) => {
                const isActive = index === highlightedIndex

                return (
                  <li key={result.symbol} role="presentation">
                    <button
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition ${
                        isActive
                          ? 'bg-sage-500/10 text-gray-900 dark:bg-sage-500/20 dark:text-white'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                      }`}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleResultSelection(result.symbol)}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{result.symbol}</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{result.name}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              No matches found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
