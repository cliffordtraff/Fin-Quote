'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  dispatchNativeTickerSearchClose,
  dispatchNativeTickerSearchOpen,
  NATIVE_TICKER_SEARCH_STATE_EVENT,
  type NativeTickerSearchStateDetail,
} from '@/lib/native-ticker-search'

interface StockSearchProps {
  pathname?: string | null
}

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const isConfigured = Boolean(process.env.NEXT_PUBLIC_CHARTING_URL?.trim())
  const enableGlobalTypeShortcut = Boolean(pathname?.startsWith('/stock/'))

  useEffect(() => {
    const handleSearchState = (event: Event) => {
      const detail = (event as CustomEvent<NativeTickerSearchStateDetail>).detail
      setIsSearchOpen(Boolean(detail?.open))
    }

    window.addEventListener(NATIVE_TICKER_SEARCH_STATE_EVENT, handleSearchState)
    return () => window.removeEventListener(NATIVE_TICKER_SEARCH_STATE_EVENT, handleSearchState)
  }, [])

  const openNativeSearch = (query?: string) => {
    if (!isConfigured) return
    dispatchNativeTickerSearchOpen(query ? { query: normalizeQuery(query) } : {})
    window.requestAnimationFrame(() => inputRef.current?.blur())
  }

  useEffect(() => {
    if (!isConfigured || !enableGlobalTypeShortcut) return

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isSearchOpen) return
      if (event.defaultPrevented) return
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
      if (!/[a-z0-9]/i.test(event.key)) return
      if (shouldIgnoreGlobalShortcutTarget(event.target, inputRef.current)) return

      event.preventDefault()
      openNativeSearch(event.key)
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [enableGlobalTypeShortcut, isConfigured, isSearchOpen])

  return (
    <div className="relative">
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
        readOnly
        disabled={!isConfigured}
        value=""
        onFocus={() => {
          if (!isSearchOpen) {
            openNativeSearch()
          }
        }}
        onKeyDown={(event) => {
          if (!isConfigured) return

          if (event.key === 'Escape') {
            event.preventDefault()
            dispatchNativeTickerSearchClose({ reason: 'host' })
            inputRef.current?.blur()
            return
          }

          if (!isPrintableSearchKey(event)) return

          event.preventDefault()
          openNativeSearch(event.key)
        }}
        onPaste={(event) => {
          if (!isConfigured) return
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
        aria-haspopup="dialog"
        aria-expanded={isSearchOpen}
      />
    </div>
  )
}
