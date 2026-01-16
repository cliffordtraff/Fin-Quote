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
}

const STATEMENT_LABELS: Record<StatementType | 'stock', string> = {
  income: 'Income Statement',
  balance: 'Balance Sheet',
  cashflow: 'Cash Flow',
  ratios: 'Ratios',
  stock: 'Stock Specific',
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
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-[rgb(50,50,50)] hover:bg-gray-150 dark:hover:bg-[rgb(55,55,55)] transition-colors">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-1 text-left text-sm font-medium"
        >
          <svg
            className={`w-3 h-3 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-200">{title}</span>
          {selectedInSection > 0 && (
            <span className="text-blue-600 dark:text-blue-400 text-xs">({selectedInSection})</span>
          )}
        </button>
        <button
          type="button"
          onClick={handleToggleAll}
          className="flex-shrink-0"
          title={allSelected ? 'Deselect all' : 'Select all'}
        >
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              allSelected
                ? 'bg-blue-600 border-blue-600'
                : someSelected
                ? 'bg-blue-300 border-blue-400'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {(allSelected || someSelected) && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {allSelected ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
                )}
              </svg>
            )}
          </div>
        </button>
      </div>
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
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors text-sm ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-[rgb(40,40,40)]'
                    : 'hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-gray-900 dark:text-white truncate">{metric.label}</span>
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
        className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-[rgb(55,55,55)] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[rgb(65,65,65)] transition-colors text-sm"
      >
        <span className="truncate text-left">
          {label}
          {selectedInThisGroup > 0 && (
            <span className="ml-1 text-blue-600 dark:text-blue-400">({selectedInThisGroup})</span>
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
        <div className="absolute z-50 w-full min-w-[280px] mt-1 bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
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
        className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-[rgb(55,55,55)] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[rgb(65,65,65)] transition-colors text-sm"
      >
        <span className="truncate text-left">
          {label}
          {selectedInThisGroup > 0 && (
            <span className="ml-1 text-blue-600 dark:text-blue-400">({selectedInThisGroup})</span>
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
        <div className="absolute z-50 w-full min-w-[200px] mt-1 bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
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
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors text-sm ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-[rgb(40,40,40)]'
                      : 'hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-gray-900 dark:text-white truncate">{metric.label}</span>
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
}: MetricSelectorProps) {
  // Group metrics by statement type
  const incomeMetrics = metrics.filter((m) => m.statement === 'income')
  const balanceMetrics = metrics.filter((m) => m.statement === 'balance')
  const cashflowMetrics = metrics.filter((m) => m.statement === 'cashflow')
  const ratioMetrics = metrics.filter((m) => m.statement === 'ratios')
  // Filter stock metrics by selected stock symbol(s)
  // Use selectedStocks array if provided, otherwise fall back to selectedStock
  const activeStocks = selectedStocks ?? (selectedStock ? [selectedStock] : [])
  const stockMetrics = metrics.filter((m) => {
    if (m.statement !== 'stock') return false
    // If no stock filter or metric has no stock restriction, include it
    if (activeStocks.length === 0 || !m.stock) return true
    // Only include metrics that match any of the selected stocks
    return activeStocks.includes(m.stock)
  })

  const totalSelected = selectedMetrics.length

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        <StatementDropdown
          label={STATEMENT_LABELS.income}
          metrics={incomeMetrics as Metric[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
        <StatementDropdown
          label={STATEMENT_LABELS.balance}
          metrics={balanceMetrics as Metric[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
        <StatementDropdown
          label={STATEMENT_LABELS.cashflow}
          metrics={cashflowMetrics as Metric[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
        <StatementDropdown
          label={STATEMENT_LABELS.ratios}
          metrics={ratioMetrics as Metric[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
        <StockSpecificDropdown
          label={STATEMENT_LABELS.stock}
          metrics={stockMetrics as Metric[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
      </div>
    </div>
  )
}
