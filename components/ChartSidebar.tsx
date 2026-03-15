'use client'

import { useState } from 'react'
import MetricSelectorModal from '@/components/MetricSelectorModal'
import StockSelectorModal from '@/components/StockSelectorModal'
import type { MetricId, StatementType, SegmentCategory } from '@/app/actions/chart-metrics'
import type { Stock } from '@/app/actions/get-stocks'

interface ChartSidebarProps {
  // Stock state
  availableStocks: Stock[]
  addedStocks: string[]
  popularStocks: string[]
  onStockToggle: (symbol: string) => void
  onRemoveStock: (symbol: string) => void
  stockModalOpen: boolean
  onStockModalChange: (open: boolean) => void
  // Metric state
  availableMetrics: readonly { id: MetricId; label: string; unit: string; statement: StatementType; definition: string; segmentCategory?: SegmentCategory; stock?: string }[]
  addedMetrics: MetricId[]
  visibleMetrics: MetricId[]
  customColors: Record<string, string>
  colorPalette: string[]
  defaultMetricColors: Record<string, string>
  onMetricToggle: (metricId: string) => void
  onVisibilityToggle: (metricId: MetricId) => void
  onRemoveMetric: (metricId: MetricId) => void
  onColorChange: (metricId: string, color: string) => void
  metricModalOpen: boolean
  onMetricModalChange: (open: boolean) => void
  selectedStock: string
  selectedStocks: string[]
  // Display state
  periodType: 'annual' | 'quarterly'
  onPeriodTypeChange: (type: 'annual' | 'quarterly') => void
  showStockPrice: boolean
  onShowStockPriceChange: (show: boolean) => void
  // Clear
  onClearAll: () => void
  canClear: boolean
}

export default function ChartSidebar({
  availableStocks,
  addedStocks,
  popularStocks,
  onStockToggle,
  onRemoveStock,
  stockModalOpen,
  onStockModalChange,
  availableMetrics,
  addedMetrics,
  visibleMetrics,
  customColors,
  colorPalette,
  defaultMetricColors,
  onMetricToggle,
  onVisibilityToggle,
  onRemoveMetric,
  onColorChange,
  metricModalOpen,
  onMetricModalChange,
  selectedStock,
  selectedStocks,
  periodType,
  onPeriodTypeChange,
  showStockPrice,
  onShowStockPriceChange,
  onClearAll,
  canClear,
}: ChartSidebarProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)

  return (
    <div className="w-[300px] h-[calc(100vh-64px)] overflow-y-auto bg-white dark:bg-gray-800 border-r border-cream-300 dark:border-gray-700 p-4 space-y-7 select-none">
      {/* Stocks */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Stocks</p>
        <button
          type="button"
          onClick={() => onStockModalChange(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-cream-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-light"
        >
          <span className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-gray-400 dark:text-gray-500">Search stocks...</span>
          </span>
          {addedStocks.length > 0 && (
            <span className="text-sage-600 dark:text-sage-400">({addedStocks.length})</span>
          )}
        </button>
        <StockSelectorModal
          isOpen={stockModalOpen}
          onClose={() => onStockModalChange(false)}
          availableStocks={availableStocks}
          selectedStocks={addedStocks}
          onToggle={onStockToggle}
          popularStocks={popularStocks}
        />
        {/* Added stock chips */}
        {addedStocks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {addedStocks.map((symbol) => {
              const stock = availableStocks.find((s) => s.symbol === symbol)
              return (
                <div
                  key={symbol}
                  className="inline-flex items-center gap-1.5 bg-cream-100 dark:bg-gray-700/60 px-2.5 py-1 rounded"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">{stock?.name}</span>
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{symbol}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveStock(symbol)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove stock"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Metrics */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Metrics</p>
        <button
          type="button"
          onClick={() => onMetricModalChange(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-cream-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-light"
        >
          <span className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-gray-400 dark:text-gray-500">Search metrics...</span>
          </span>
          {addedMetrics.length > 0 && (
            <span className="text-sage-600 dark:text-sage-400">({addedMetrics.length})</span>
          )}
        </button>
        <MetricSelectorModal
          isOpen={metricModalOpen}
          onClose={() => onMetricModalChange(false)}
          metrics={availableMetrics}
          selectedMetrics={addedMetrics}
          onToggle={onMetricToggle}
          maxSelections={10}
          selectedStock={selectedStock}
          selectedStocks={selectedStocks}
        />
        {/* Metric chips */}
        {addedMetrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {addedMetrics.map((metricId) => {
              const metric = availableMetrics.find((m) => m.id === metricId)
              const isVisible = visibleMetrics.includes(metricId as MetricId)
              const currentColor = customColors[metricId] ?? defaultMetricColors[metricId as string] ?? '#3b82f6'

              return (
                <div
                  key={metricId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded relative transition-opacity ${isVisible ? 'bg-cream-100 dark:bg-gray-700/60' : 'bg-cream-100/50 dark:bg-gray-700/30 opacity-50'}`}
                  title={metric?.definition}
                >
                  <button
                    type="button"
                    onClick={() => setColorPickerOpen(colorPickerOpen === metricId ? null : metricId)}
                    className="w-3 h-3 rounded-sm border border-gray-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: currentColor }}
                    title="Change color"
                  />
                  {colorPickerOpen === metricId && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
                      <div className="grid grid-cols-4 gap-1">
                        {colorPalette.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              onColorChange(metricId, color)
                              setColorPickerOpen(null)
                            }}
                            className={`w-6 h-6 rounded border-2 ${currentColor === color ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <span className={`text-sm font-medium truncate ${isVisible ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
                    {metric?.label}
                  </span>
                  {/* Hide/Show toggle */}
                  <button
                    type="button"
                    onClick={() => onVisibilityToggle(metricId as MetricId)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                    title={isVisible ? 'Hide from chart' : 'Show on chart'}
                  >
                    {isVisible ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => onRemoveMetric(metricId as MetricId)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove metric"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Display */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Display</p>
        <div className="space-y-3">
          {/* Period Toggle */}
          <div className="flex items-center gap-1 bg-cream-50 dark:bg-gray-700 rounded-md p-1">
            <button
              type="button"
              onClick={() => onPeriodTypeChange('annual')}
              className={`flex-1 px-3 py-1 text-sm font-medium rounded transition-colors ${
                periodType === 'annual'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Annual
            </button>
            <button
              type="button"
              onClick={() => onPeriodTypeChange('quarterly')}
              className={`flex-1 px-3 py-1 text-sm font-medium rounded transition-colors ${
                periodType === 'quarterly'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Quarterly
            </button>
          </div>
          {/* Stock Price Toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-cream-50 dark:bg-gray-700 rounded-md px-3 py-1.5">
            <input
              type="checkbox"
              checked={showStockPrice}
              onChange={(e) => onShowStockPriceChange(e.target.checked)}
              className="w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-0"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Stock Price</span>
          </label>
        </div>
      </div>

      {/* Clear All */}
      <button
        type="button"
        onClick={onClearAll}
        disabled={!canClear}
        className="w-full px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
      >
        Clear All
      </button>
    </div>
  )
}
