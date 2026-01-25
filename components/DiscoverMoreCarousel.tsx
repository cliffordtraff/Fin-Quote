'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface DiscoverStock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

interface DiscoverMoreCarouselProps {
  stocks: DiscoverStock[]
}

// Generate a consistent color based on symbol
function getSymbolColor(symbol: string): string {
  const colors = [
    'bg-blue-800',
    'bg-emerald-700',
    'bg-violet-700',
    'bg-rose-700',
    'bg-amber-600',
    'bg-teal-700',
    'bg-indigo-700',
    'bg-fuchsia-700',
    'bg-cyan-700',
    'bg-orange-600',
  ]
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Inline SVG icons
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function PlusCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v8m-4-4h8" />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-4m0-4h.01" />
    </svg>
  )
}

function StockCard({ stock }: { stock: DiscoverStock }) {
  const isPositive = stock.changePercent >= 0

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="flex-shrink-0 w-[170px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(45,45,45)] p-4 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Symbol Badge */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`${getSymbolColor(stock.symbol)} text-white text-[11px] font-semibold px-2.5 py-1 rounded-md`}
        >
          {stock.symbol}
        </span>
        <button
          className="text-gray-300 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <PlusCircleIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Company Name */}
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 line-clamp-2 min-h-[40px]">
        {stock.name}
      </p>

      {/* Price */}
      <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">
        ${stock.price.toFixed(2)}
      </p>

      {/* Change Badge */}
      <span
        className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
          isPositive
            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        }`}
      >
        {isPositive ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
      </span>
    </Link>
  )
}

export default function DiscoverMoreCarousel({
  stocks,
}: DiscoverMoreCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScrollButtons = () => {
    const container = scrollContainerRef.current
    if (!container) return

    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    )
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    checkScrollButtons()
    container.addEventListener('scroll', checkScrollButtons)
    window.addEventListener('resize', checkScrollButtons)

    return () => {
      container.removeEventListener('scroll', checkScrollButtons)
      window.removeEventListener('resize', checkScrollButtons)
    }
  }, [stocks])

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return

    const cardWidth = 186 // 170px card + 16px gap
    const scrollAmount = cardWidth * 3

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (stocks.length === 0) {
    return null
  }

  return (
    <section className="bg-white dark:bg-[rgb(45,45,45)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
              Discover more
            </h2>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <span>You may be interested in</span>
              <InfoIcon className="w-4 h-4" />
            </div>
          </div>

          {/* Navigation Arrow */}
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${
              canScrollRight
                ? 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            } transition-colors bg-white dark:bg-transparent`}
            aria-label="Scroll right"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Carousel Container */}
        <div className="relative">
          {/* Left scroll button - only show when can scroll left */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 flex items-center justify-center rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-[rgb(45,45,45)] hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-md transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}

          {/* Cards */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {stocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
