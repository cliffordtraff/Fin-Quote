'use client'

import { useState, useRef, useEffect } from 'react'

interface Metric {
  id: string
  label: string
  unit: string
}

interface MetricSelectorProps {
  metrics: readonly Metric[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  onClear: () => void
  maxSelections?: number
}

export default function MetricSelector({
  metrics,
  selectedMetrics,
  onToggle,
  onClear,
  maxSelections = 4,
}: MetricSelectorProps) {
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

  const selectedCount = selectedMetrics.length

  return (
    <div ref={dropdownRef} className="relative">
      {/* Dropdown trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-[rgb(55,55,55)] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[rgb(65,65,65)] transition-colors"
      >
        <span className="text-left">
          {selectedCount === 0
            ? 'Select metrics...'
            : `${selectedCount} metric${selectedCount > 1 ? 's' : ''} selected`}
        </span>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {/* Header with clear button */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-[rgb(40,40,40)] border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Select up to {maxSelections} metrics
            </span>
            {selectedCount > 1 && (
              <button
                type="button"
                onClick={() => {
                  onClear()
                  setIsOpen(false)
                }}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
              >
                Reset
              </button>
            )}
          </div>

          {/* Metric options */}
          <div className="max-h-64 overflow-y-auto">
            {metrics.map((metric) => {
              const isSelected = selectedMetrics.includes(metric.id)
              const isDisabled = !isSelected && selectedCount >= maxSelections

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
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-[rgb(40,40,40)]'
                      : 'hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Label and unit */}
                  <div className="flex-1">
                    <span className="text-gray-900 dark:text-white font-medium">{metric.label}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({metric.unit === 'currency' ? '$' : '#'})
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-[rgb(40,40,40)] border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
