'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { StatementType } from '@/app/actions/chart-metrics'

type SegmentCategory = 'product' | 'geographic' | 'operating_income' | 'cost_of_sales' | 'revenue_by_country' | 'long_lived_assets'

interface Metric {
  id: string
  label: string
  unit: string
  statement: StatementType
  definition?: string
  segmentCategory?: SegmentCategory
  stock?: string
}

interface MetricSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  metrics: readonly Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  maxSelections: number
  selectedStock?: string
  selectedStocks?: string[]
}

const STATEMENT_LABELS: Record<StatementType | 'stock', string> = {
  income: 'Income Statement',
  balance: 'Balance Sheet',
  cashflow: 'Cash Flow',
  ratios: 'Ratios',
  stock: 'Stock Specific',
  price: 'Price',
}

const SEGMENT_SECTIONS: { key: SegmentCategory; title: string }[] = [
  { key: 'product', title: 'Revenue by Product' },
  { key: 'geographic', title: 'Revenue by Region' },
  { key: 'operating_income', title: 'Operating Income by Region' },
  { key: 'cost_of_sales', title: 'Cost of Sales' },
  { key: 'revenue_by_country', title: 'Revenue by Country' },
  { key: 'long_lived_assets', title: 'Long-Lived Assets by Country' },
]

export default function MetricSelectorModal({
  isOpen,
  onClose,
  metrics,
  selectedMetrics,
  onToggle,
  maxSelections,
  selectedStock,
  selectedStocks,
}: MetricSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Reset position and search when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition(null)
      setSearchQuery('')
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
      })
    }
  }, [isOpen])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()

    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const currentX = position?.x ?? rect.left
    const currentY = position?.y ?? rect.top

    dragState.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }

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
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  // Filter metrics by search query
  const filteredMetrics = useMemo(() => {
    if (!searchQuery.trim()) return metrics
    const query = searchQuery.toLowerCase().trim()
    return metrics.filter(
      (m) =>
        m.label.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (m.definition && m.definition.toLowerCase().includes(query))
    )
  }, [metrics, searchQuery])

  if (!isOpen) return null

  const totalSelected = selectedMetrics.length
  const isSearching = searchQuery.trim().length > 0

  // Group metrics by statement
  const incomeMetrics = filteredMetrics.filter((m) => m.statement === 'income')
  const balanceMetrics = filteredMetrics.filter((m) => m.statement === 'balance')
  const cashflowMetrics = filteredMetrics.filter((m) => m.statement === 'cashflow')
  const ratioMetrics = filteredMetrics.filter((m) => m.statement === 'ratios')

  // Stock-specific metrics filtered by selected stocks
  const activeStocks = selectedStocks ?? (selectedStock ? [selectedStock] : [])
  const stockMetrics = filteredMetrics.filter((m) => {
    if (m.statement !== 'stock') return false
    if (activeStocks.length === 0) return false
    if (!m.stock) return true
    return activeStocks.includes(m.stock)
  })

  const sections: { key: string; label: string; metrics: readonly Metric[]; isStock?: boolean }[] = [
    { key: 'income', label: STATEMENT_LABELS.income, metrics: incomeMetrics },
    { key: 'balance', label: STATEMENT_LABELS.balance, metrics: balanceMetrics },
    { key: 'cashflow', label: STATEMENT_LABELS.cashflow, metrics: cashflowMetrics },
    { key: 'ratios', label: STATEMENT_LABELS.ratios, metrics: ratioMetrics },
    { key: 'stock', label: STATEMENT_LABELS.stock, metrics: stockMetrics, isStock: true },
  ]

  const stockMetricSections = SEGMENT_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    metrics: stockMetrics.filter((m) => m.segmentCategory === key),
  })).filter((section) => section.metrics.length > 0)

  const visibleSections = isSearching
    ? sections.filter((section) => (section.isStock ? stockMetricSections.length > 0 : section.metrics.length > 0))
    : sections

  const visibleMetricCount =
    incomeMetrics.length +
    balanceMetrics.length +
    cashflowMetrics.length +
    ratioMetrics.length +
    stockMetrics.length

  const cardStyle: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, margin: 0 }
    : {}

  const renderMetricButton = (metric: Metric, paddingClassName = 'px-4') => {
    const isSelected = selectedMetrics.includes(metric.id)
    const isDisabled = !isSelected && totalSelected >= maxSelections

    return (
      <button
        key={metric.id}
        type="button"
        onClick={() => {
          if (!isDisabled || isSelected) onToggle(metric.id)
        }}
        disabled={isDisabled}
        title={metric.definition}
        className={`w-full ${paddingClassName} py-1.5 text-left transition-colors border-b border-gray-200/60 dark:border-gray-700 ${
          isDisabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-cream-50 dark:hover:bg-gray-700'
        }`}
      >
        <span className={`text-[13px] font-light truncate block ${isSelected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
          {metric.label}
        </span>
      </button>
    )
  }

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
        <div
          className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center">
            {totalSelected > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {totalSelected}/{maxSelections} selected
              </span>
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
              placeholder="Search metrics..."
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

        <div className="overflow-y-auto flex-1 min-h-0">
          {visibleSections.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No matches
            </div>
          ) : (
            visibleSections.map((section, index) => (
              <div key={section.key}>
                <div
                  className={`text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-4 py-2.5 bg-gray-100 dark:bg-gray-900/60 ${
                    index > 0 ? 'mt-0.5 border-t-2 border-gray-200 dark:border-gray-600' : ''
                  }`}
                >
                  {section.label}
                </div>

                {section.isStock ? (
                  activeStocks.length === 0 ? (
                    <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      Select a stock first
                    </div>
                  ) : stockMetricSections.length === 0 ? (
                    <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      {isSearching ? 'No matches' : 'No segment data available'}
                    </div>
                  ) : (
                    stockMetricSections.map(({ key, title, metrics: sectionMetrics }) => (
                      <div key={key}>
                        <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {title}
                        </div>
                        {sectionMetrics.map((metric) => renderMetricButton(metric))}
                      </div>
                    ))
                  )
                ) : (
                  section.metrics.map((metric) => renderMetricButton(metric))
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          {isSearching ? `${visibleMetricCount} matching metrics` : `${visibleMetricCount} metrics available`}
        </div>
      </div>
    </div>
  )
}
