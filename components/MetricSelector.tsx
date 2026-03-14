'use client'

import { useState, useRef, useEffect } from 'react'
import type { StatementType } from '@/app/actions/chart-metrics'

type SegmentCategory = 'product' | 'geographic' | 'operating_income' | 'cost_of_sales' | 'revenue_by_country' | 'long_lived_assets'

interface Metric {
  id: string
  label: string
  unit: string
  statement: StatementType
  definition?: string
  segmentCategory?: SegmentCategory
  stock?: string  // Stock symbol this metric belongs to (for segment metrics)
}

interface MetricSelectorProps {
  metrics: readonly Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  onClear: () => void
  maxSelections?: number
  selectedStock?: string  // Currently selected stock symbol for filtering (primary stock)
  selectedStocks?: string[]  // All selected stocks for multi-stock filtering
  layout?: 'horizontal' | 'vertical'  // 'horizontal' = grid-cols-5 (default), 'vertical' = stacked column
  renderChip?: (metricId: string) => React.ReactNode  // Render a chip for a selected metric (shown under its dropdown)
}

const STATEMENT_LABELS: Record<StatementType | 'stock', string> = {
  income: 'Income Statement',
  balance: 'Balance Sheet',
  cashflow: 'Cash Flow',
  ratios: 'Ratios',
  stock: 'Stock Specific',
  price: 'Price', // Not used in dropdown anymore, but kept for type compatibility
}

interface DropdownProps {
  label: string
  metrics: Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  maxSelections: number
  totalSelected: number
}

// Collapsible section within a dropdown
function CollapsibleSection({
  title,
  metrics,
  selectedMetrics,
  onToggle,
  onToggleAll,
  maxSelections,
  totalSelected,
  isExpanded,
  onToggleExpand,
}: {
  title: string
  metrics: Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  onToggleAll: (metricIds: string[], selectAll: boolean) => void
  maxSelections: number
  totalSelected: number
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const selectedInSection = metrics.filter((m) => selectedMetrics.includes(m.id)).length
  const allSelected = selectedInSection === metrics.length && metrics.length > 0
  const someSelected = selectedInSection > 0 && selectedInSection < metrics.length

  // Calculate how many more can be selected
  const remainingSlots = maxSelections - totalSelected
  const unselectedInSection = metrics.filter((m) => !selectedMetrics.includes(m.id))
  const canSelectAll = unselectedInSection.length <= remainingSlots

  const handleToggleAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (allSelected) {
      // Deselect all in this section
      onToggleAll(metrics.map((m) => m.id), false)
    } else {
      // Select all (or as many as possible)
      const toSelect = canSelectAll
        ? unselectedInSection.map((m) => m.id)
        : unselectedInSection.slice(0, remainingSlots).map((m) => m.id)
      onToggleAll(toSelect, true)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-gray-700 hover:bg-gray-150 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[15px] font-medium text-gray-700 dark:text-gray-200">{title}</span>
        {selectedInSection > 0 && (
          <span className="text-sage-600 dark:text-sage-400 text-xs">({selectedInSection})</span>
        )}
      </button>
      {isExpanded && (
        <div className="pl-2">
          {metrics.map((metric) => {
            const isSelected = selectedMetrics.includes(metric.id)
            const isDisabled = !isSelected && totalSelected >= maxSelections

            return (
              <button
                key={metric.id}
                type="button"
                onClick={() => {
                  if (!isDisabled || isSelected) {
                    onToggle(metric.id)
                  }
                }}
                disabled={isDisabled}
                title={metric.definition}
                className={`w-full px-3 py-2 text-left transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed bg-cream-50 dark:bg-gray-800'
                    : 'hover:bg-cream-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className={`text-[13px] font-light truncate ${isSelected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>{metric.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Section configuration for Stock Specific dropdown
const SEGMENT_SECTIONS: { key: SegmentCategory; title: string }[] = [
  { key: 'product', title: 'Revenue by Product' },
  { key: 'geographic', title: 'Revenue by Region' },
  { key: 'operating_income', title: 'Operating Income by Region' },
  { key: 'cost_of_sales', title: 'Cost of Sales' },
  { key: 'revenue_by_country', title: 'Revenue by Country' },
  { key: 'long_lived_assets', title: 'Long-Lived Assets by Country' },
]

// Stock Specific dropdown with collapsible sections for all segment types
function StockSpecificDropdown({
  label,
  metrics,
  selectedMetrics,
  onToggle,
  maxSelections,
  totalSelected,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    product: true,
    geographic: false,
    operating_income: false,
    cost_of_sales: false,
    revenue_by_country: false,
    long_lived_assets: false,
  })
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

  // Close dropdown on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const selectedInThisGroup = metrics.filter((m) => selectedMetrics.includes(m.id)).length

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleToggleAll = (metricIds: string[], selectAll: boolean) => {
    if (selectAll) {
      // Add metrics that aren't already selected
      metricIds.forEach((id) => {
        if (!selectedMetrics.includes(id)) {
          onToggle(id)
        }
      })
    } else {
      // Remove all metrics in the list
      metricIds.forEach((id) => {
        if (selectedMetrics.includes(id)) {
          onToggle(id)
        }
      })
    }
  }

  // Group metrics by segment category
  const metricsByCategory = SEGMENT_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    metrics: metrics.filter((m) => m.segmentCategory === key),
  })).filter((section) => section.metrics.length > 0)

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-cream-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
      >
        <span className="truncate text-left">
          {label}
          {selectedInThisGroup > 0 && (
            <span className="ml-1 text-sage-600 dark:text-sage-400">({selectedInThisGroup})</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full min-w-[280px] mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto">
            {metricsByCategory.map(({ key, title, metrics: sectionMetrics }) => (
              <CollapsibleSection
                key={key}
                title={title}
                metrics={sectionMetrics}
                selectedMetrics={selectedMetrics}
                onToggle={onToggle}
                onToggleAll={handleToggleAll}
                maxSelections={maxSelections}
                totalSelected={totalSelected}
                isExpanded={expandedSections[key]}
                onToggleExpand={() => toggleSection(key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatementDropdown({
  label,
  metrics,
  selectedMetrics,
  onToggle,
  maxSelections,
  totalSelected,
}: DropdownProps) {
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

  // Close dropdown on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const selectedInThisGroup = metrics.filter((m) => selectedMetrics.includes(m.id)).length

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-cream-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
      >
        <span className="truncate text-left">
          {label}
          {selectedInThisGroup > 0 && (
            <span className="ml-1 text-sage-600 dark:text-sage-400">({selectedInThisGroup})</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full min-w-[280px] mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto">
            {metrics.map((metric) => {
              const isSelected = selectedMetrics.includes(metric.id)
              const isDisabled = !isSelected && totalSelected >= maxSelections

              return (
                <button
                  key={metric.id}
                  type="button"
                  onClick={() => {
                    if (!isDisabled || isSelected) {
                      onToggle(metric.id)
                    }
                  }}
                  disabled={isDisabled}
                  title={metric.definition}
                  className={`w-full px-3 py-2 text-left transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed bg-cream-50 dark:bg-gray-800'
                      : 'hover:bg-cream-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`text-[13px] font-light truncate ${isSelected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>{metric.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MetricSelector({
  metrics,
  selectedMetrics,
  onToggle,
  onClear,
  maxSelections = 4,
  selectedStock,
  selectedStocks,
  layout = 'horizontal',
  renderChip,
}: MetricSelectorProps) {
  // Group metrics by statement type
  const incomeMetrics = metrics.filter((m) => m.statement === 'income')
  const balanceMetrics = metrics.filter((m) => m.statement === 'balance')
  const cashflowMetrics = metrics.filter((m) => m.statement === 'cashflow')
  const ratioMetrics = metrics.filter((m) => m.statement === 'ratios')
  // Price metrics are handled separately via checkbox on the charts page
  // Filter stock metrics by selected stock symbol(s)
  // Use selectedStocks array if provided, otherwise fall back to selectedStock
  const activeStocks = selectedStocks ?? (selectedStock ? [selectedStock] : [])
  const stockMetrics = metrics.filter((m) => {
    if (m.statement !== 'stock') return false
    // If no stocks selected, don't show any stock-specific metrics
    if (activeStocks.length === 0) return false
    // If metric has no stock restriction, include it for any selected stock
    if (!m.stock) return true
    // Only include metrics that match any of the selected stocks
    return activeStocks.includes(m.stock)
  })

  const totalSelected = selectedMetrics.length

  const groups: { key: string; metrics: Metric[]; component: 'statement' | 'stock'; label: string }[] = [
    { key: 'income', metrics: incomeMetrics as Metric[], component: 'statement', label: STATEMENT_LABELS.income },
    { key: 'balance', metrics: balanceMetrics as Metric[], component: 'statement', label: STATEMENT_LABELS.balance },
    { key: 'cashflow', metrics: cashflowMetrics as Metric[], component: 'statement', label: STATEMENT_LABELS.cashflow },
    { key: 'ratios', metrics: ratioMetrics as Metric[], component: 'statement', label: STATEMENT_LABELS.ratios },
    { key: 'stock', metrics: stockMetrics as Metric[], component: 'stock', label: STATEMENT_LABELS.stock },
  ]

  return (
    <div>
      <div className={layout === 'vertical' ? 'flex flex-col gap-2' : 'grid grid-cols-5 gap-2'}>
        {groups.map((group) => {
          const selectedInGroup = group.metrics
            .filter((m) => selectedMetrics.includes(m.id))
            .map((m) => m.id)

          return (
            <div key={group.key}>
              {group.component === 'stock' ? (
                <StockSpecificDropdown
                  label={group.label}
                  metrics={group.metrics}
                  selectedMetrics={selectedMetrics}
                  onToggle={onToggle}
                  maxSelections={maxSelections}
                  totalSelected={totalSelected}
                />
              ) : (
                <StatementDropdown
                  label={group.label}
                  metrics={group.metrics}
                  selectedMetrics={selectedMetrics}
                  onToggle={onToggle}
                  maxSelections={maxSelections}
                  totalSelected={totalSelected}
                />
              )}
              {renderChip && selectedInGroup.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedInGroup.map((id) => renderChip(id))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
