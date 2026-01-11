'use client'

import { useState, useRef, useEffect } from 'react'
import type { StatementType } from '@/app/actions/chart-metrics'

interface Metric {
  id: string
  label: string
  unit: string
  statement: StatementType
  definition?: string
}

interface MetricSelectorProps {
  metrics: readonly Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  onClear: () => void
  maxSelections?: number
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
}: MetricSelectorProps) {
  // Group metrics by statement type
  const incomeMetrics = metrics.filter((m) => m.statement === 'income')
  const balanceMetrics = metrics.filter((m) => m.statement === 'balance')
  const cashflowMetrics = metrics.filter((m) => m.statement === 'cashflow')
  const ratioMetrics = metrics.filter((m) => m.statement === 'ratios')

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
        <StatementDropdown
          label={STATEMENT_LABELS.stock}
          metrics={[]}
          selectedMetrics={selectedMetrics}
          onToggle={onToggle}
          maxSelections={maxSelections}
          totalSelected={totalSelected}
        />
      </div>
    </div>
  )
}
