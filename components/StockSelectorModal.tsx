'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

interface Stock {
  symbol: string
  name: string
  sector?: string
}

interface StockSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  availableStocks: Stock[]
  selectedStocks: string[]
  onToggle: (symbol: string) => void
  popularStocks?: string[]
}

export default function StockSelectorModal({
  isOpen,
  onClose,
  availableStocks,
  selectedStocks,
  onToggle,
  popularStocks = [],
}: StockSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  // Auto-focus search input and clear query when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setPosition(null)
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
      })
    }
  }, [isOpen])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Don't drag from interactive elements
    if ((e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()

    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const currentX = position?.x ?? rect.left
    const currentY = position?.y ?? rect.top

    dragState.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }

    // Set initial position if not yet set (first drag)
    if (!position) {
      setPosition({ x: rect.left, y: rect.top })
      dragState.current.origX = rect.left
      dragState.current.origY = rect.top
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const dx = ev.clientX - dragState.current.startX
      const dy = ev.clientY - dragState.current.startY
      setPosition({
        x: dragState.current.origX + dx,
        y: dragState.current.origY + dy,
      })
    }

    const handleMouseUp = () => {
      dragState.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [position])

  // Filter stocks based on search query
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) return availableStocks
    const query = searchQuery.toLowerCase().trim()
    return availableStocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        (stock.sector && stock.sector.toLowerCase().includes(query))
    )
  }, [availableStocks, searchQuery])

  // Organize: popular first when not searching, then alphabetical rest
  const organizedStocks = useMemo(() => {
    if (searchQuery.trim()) return filteredStocks

    const popular = popularStocks
      .map((symbol) => availableStocks.find((s) => s.symbol === symbol))
      .filter(Boolean) as Stock[]

    const rest = availableStocks.filter((s) => !popularStocks.includes(s.symbol))
    return [...popular, ...rest]
  }, [availableStocks, filteredStocks, popularStocks, searchQuery])

  if (!isOpen) return null

  const totalSelected = selectedStocks.length

  const cardStyle: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, margin: 0 }
    : {}

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh] p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        {/* Drag handle header */}
        <div
          className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center">
            {totalSelected > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{totalSelected} selected</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-cream-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent text-gray-900 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body — stock list */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {!searchQuery && popularStocks.length > 0 && (
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-2">
              Popular
            </div>
          )}

          {organizedStocks.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No stocks found
            </div>
          ) : (
            organizedStocks.map((stock, index) => {
              const isSelected = selectedStocks.includes(stock.symbol)
              const isPopular = popularStocks.includes(stock.symbol)
              const showAllHeader =
                !searchQuery &&
                popularStocks.length > 0 &&
                !isPopular &&
                index === popularStocks.length

              return (
                <div key={stock.symbol}>
                  {showAllHeader && (
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-2 mt-1 border-t border-gray-200 dark:border-gray-700">
                      All Stocks
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggle(stock.symbol)}
                    className="w-full flex items-center justify-between px-4 py-1.5 text-left transition-colors hover:bg-cream-50 dark:hover:bg-gray-700 border-b border-gray-200/60 dark:border-gray-700"
                  >
                    <span className={`text-[13px] font-light truncate ${isSelected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                      {stock.name}
                    </span>
                    <span className={`text-[13px] font-light flex-shrink-0 ml-3 ${isSelected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                      {stock.symbol}
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          {searchQuery
            ? `${filteredStocks.length} of ${availableStocks.length} stocks`
            : `${availableStocks.length} stocks available`}
        </div>
      </div>
    </div>
  )
}
