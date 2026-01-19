'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Navigation from '@/components/Navigation'
import MetricSelector from '@/components/MetricSelector'
import StockSelector, { type StockSelectorHandle } from '@/components/StockSelector'
import MultiMetricChart, { getMetricColors } from '@/components/MultiMetricChart'
import { getMultipleMetrics, getAvailableMetrics, type MetricData, type MetricId, type PeriodType } from '@/app/actions/chart-metrics'
import { getAvailableStocks, type Stock } from '@/app/actions/get-stocks'
import { getChartPriceData, getMonthlyChartPriceData } from '@/app/actions/chart-price'
import { isPriceMetric } from '@/lib/price-matcher'
import { useTheme } from '@/components/ThemeProvider'

// Popular/commonly searched stocks for quick access
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'V',
  'UNH', 'XOM', 'MA', 'JNJ', 'PG', 'HD', 'AVGO', 'CVX', 'MRK', 'COST',
]

// Stock-specific color families for multi-stock comparison
// AAPL: Blue family, GOOGL: Green/Teal family
const STOCK_COLOR_FAMILIES_LIGHT: Record<string, string[]> = {
  AAPL: [
    '#1a3a5c', // Dark navy blue
    '#2a4a6c', // Navy blue
    '#3a5a7c', // Medium blue
    '#4a6a8c', // Steel blue
    '#5a7a9c', // Light steel blue
    '#6a8aac', // Soft blue
  ],
  GOOGL: [
    '#1a4a3a', // Dark teal
    '#2a5a4a', // Forest teal
    '#3a6a5a', // Medium teal
    '#4a7a6a', // Sea green
    '#5a8a7a', // Sage
    '#6a9a8a', // Light sage
  ],
}

const STOCK_COLOR_FAMILIES_DARK: Record<string, string[]> = {
  AAPL: [
    '#6b8cce', // Soft blue
    '#7b9cde', // Light blue
    '#8bacee', // Sky blue
    '#5b7cbe', // Medium blue
    '#4b6cae', // Steel blue
    '#9bbcfe', // Pale blue
  ],
  GOOGL: [
    '#7ab08a', // Sage green
    '#8ac09a', // Light sage
    '#9ad0aa', // Pale green
    '#6aa07a', // Medium green
    '#5a906a', // Forest green
    '#aae0ba', // Mint
  ],
}

// Dual color palettes for light/dark mode
const COLOR_PALETTE_LIGHT = [
  '#1a1a2e', // Near black (primary)
  '#2d4a3e', // Dark forest (profits)
  '#4a2c2c', // Dark burgundy (liabilities)
  '#3d3520', // Dark bronze (value)
  '#1a3a3a', // Dark teal (cash flow)
  '#2e2640', // Dark purple (equity)
  '#2a3540', // Dark blue-gray (neutral)
  '#3a3028', // Dark taupe (secondary)
  '#1a3a2a', // Dark eucalyptus (margins)
  '#3a2a30', // Dark plum (alternative)
  '#3a3a20', // Dark olive (operating)
  '#2a2a3a', // Dark slate (tertiary)
]

const COLOR_PALETTE_DARK = [
  '#6b8cce', // Soft blue (primary)
  '#7ab08a', // Sage green (profits)
  '#c27878', // Dusty rose (liabilities)
  '#b8a870', // Khaki gold (value)
  '#78a8a8', // Light teal (cash flow)
  '#9888b8', // Lavender (equity)
  '#8898a8', // Light blue-gray (neutral)
  '#a89888', // Light taupe (secondary)
  '#78a888', // Light eucalyptus (margins)
  '#a88898', // Light plum (alternative)
  '#a8a878', // Light olive (operating)
  '#8888a8', // Light slate (tertiary)
]

export default function ChartsPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const COLOR_PALETTE = isDark ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT
  const DEFAULT_METRIC_COLORS = getMetricColors(isDark)

  const [availableMetrics, setAvailableMetrics] = useState<{ id: MetricId; label: string; unit: string; definition: string; stock?: string }[]>([])
  // Available stocks from database
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([])
  // Stocks added to the page (from dropdown)
  const [addedStocks, setAddedStocks] = useState<string[]>([])
  // Stocks visible on chart (subset of addedStocks, controlled by checkboxes)
  const [visibleStocks, setVisibleStocks] = useState<string[]>([])
  // Selected stock symbols for backward compatibility (derived from visibleStocks)
  const selectedStocks = visibleStocks
  // Helper to get primary stock for filtering segment metrics
  const selectedStock = selectedStocks[0] || ''
  // Metrics added to the page (from dropdown)
  const [addedMetrics, setAddedMetrics] = useState<MetricId[]>([])
  // Metrics visible on chart (subset of addedMetrics, controlled by checkboxes)
  const [visibleMetrics, setVisibleMetrics] = useState<MetricId[]>([])
  // Period type: annual or quarterly
  const [periodType, setPeriodType] = useState<'annual' | 'quarterly'>('annual')
  // Stock price toggle (separate from metric dropdowns)
  const [showStockPrice, setShowStockPrice] = useState(false)
  const [metricsData, setMetricsData] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const DEFAULT_MIN_YEAR = 2018
  const [minYear, setMinYear] = useState<number | null>(null)
  const [maxYear, setMaxYear] = useState<number | null>(null)
  const [yearBounds, setYearBounds] = useState<{ min: number; max: number } | null>(null)
  const [initialRangeSet, setInitialRangeSet] = useState(false)
  const [sliderWidth, setSliderWidth] = useState(0)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const stockSelectorRef = useRef<StockSelectorHandle>(null)
  const thumbEffectivePx = 24 // matches CSS width + borders + shadow
  // Custom colors for metrics (overrides default colors)
  const [customColors, setCustomColors] = useState<Record<string, string>>({})
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)

  // Load available metrics and stocks on mount
  useEffect(() => {
    async function loadData() {
      const [metrics, stocksResult] = await Promise.all([
        getAvailableMetrics(),
        getAvailableStocks(),
      ])
      setAvailableMetrics(metrics)
      if (stocksResult.data) {
        setAvailableStocks(stocksResult.data)
      }
    }
    loadData()
  }, [])

  // Keyboard shortcut: '/' to focus stock search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore if user is typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        stockSelectorRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset year bounds and initial range when period type changes
  // (Don't reset on stock changes to avoid slider flashing)
  useEffect(() => {
    setYearBounds(null)
    setInitialRangeSet(false)
  }, [periodType])

  // Remove segment metrics that don't match any selected stock when stocks change
  useEffect(() => {
    if (availableMetrics.length === 0) return

    // Find metrics that belong to a stock not in selectedStocks
    const incompatibleMetrics = addedMetrics.filter((metricId) => {
      const metric = availableMetrics.find((m) => m.id === metricId)
      // If metric has a stock restriction and that stock isn't selected, it's incompatible
      return metric?.stock && !selectedStocks.includes(metric.stock)
    })

    if (incompatibleMetrics.length > 0) {
      // Remove incompatible metrics from added and visible
      setAddedMetrics((prev) => prev.filter((m) => !incompatibleMetrics.includes(m)))
      setVisibleMetrics((prev) => prev.filter((m) => !incompatibleMetrics.includes(m)))
      // Clean up custom colors for removed metrics
      setCustomColors((prev) => {
        const next = { ...prev }
        incompatibleMetrics.forEach((m) => delete next[m])
        return next
      })
    }
  }, [selectedStocks, availableMetrics])

  useEffect(() => {
    if (!yearBounds) return
    const nextMin = minYear ?? yearBounds.min
    const nextMax = maxYear ?? yearBounds.max
    const clampedMin = Math.min(Math.max(nextMin, yearBounds.min), yearBounds.max)
    const clampedMax = Math.min(Math.max(nextMax, yearBounds.min), yearBounds.max)

    if (clampedMin !== minYear || clampedMax !== maxYear) {
      updateRange(clampedMin, clampedMax)
    }
  }, [yearBounds, minYear, maxYear])

  // Fetch data when visible metrics or year range changes
  const fetchData = useCallback(async () => {
    // Need at least one metric OR stock price enabled, and at least one stock
    if ((visibleMetrics.length === 0 && !showStockPrice) || selectedStocks.length === 0) {
      setMetricsData([])
      return
    }

    let minYearParam: number | undefined
    let maxYearParam: number | undefined

    if (yearBounds) {
      const clampYear = (value: number) => Math.min(Math.max(value, yearBounds.min), yearBounds.max)
      const resolvedMin = minYear ?? yearBounds.min
      const resolvedMax = maxYear ?? yearBounds.max
      minYearParam = clampYear(resolvedMin)
      maxYearParam = clampYear(resolvedMax)
    } else {
      minYearParam = minYear ?? undefined
      maxYearParam = maxYear ?? undefined
    }

    if (typeof minYearParam === 'number' && typeof maxYearParam === 'number' && minYearParam > maxYearParam) {
      const correctedMin = Math.min(minYearParam, maxYearParam)
      const correctedMax = Math.max(minYearParam, maxYearParam)
      updateRange(correctedMin, correctedMax)
      minYearParam = correctedMin
      maxYearParam = correctedMax
    }

    setLoading(true)
    setError(null)

    try {
      // All visible metrics (price is handled separately via showStockPrice toggle)
      const otherMetrics = visibleMetrics.filter(m => !isPriceMetric(m))

      // Fetch non-price data for all selected stocks
      const fetchPromises = selectedStocks.map((symbol) =>
        otherMetrics.length > 0
          ? getMultipleMetrics({
              symbol,
              metrics: otherMetrics,
              minYear: minYearParam,
              maxYear: maxYearParam,
              period: periodType,
            })
          : Promise.resolve({ data: [], error: null, yearBounds: null })
      )

      const results = await Promise.all(fetchPromises)

      // Merge data from all stocks
      const mergedData: MetricData[] = []
      let combinedBounds: { min: number; max: number } | null = null
      let firstError: string | null = null

      // Collect period_end_dates from financial data for price matching
      const periodEndDatesByStock: Record<string, Array<{ date: string; year: number; fiscal_quarter?: number | null; fiscal_label?: string | null }>> = {}

      results.forEach((result, index) => {
        const symbol = selectedStocks[index]

        if (result.error && !firstError) {
          firstError = result.error
        }

        if (result.data) {
          result.data.forEach((metricData) => {
            // For multi-stock, prefix metric ID with stock symbol
            const prefixedId = selectedStocks.length > 1 ? `${symbol}:${metricData.metric}` : metricData.metric
            // Use stock symbol (AAPL, GOOGL) as prefix for cleaner labels
            const prefixedLabel = selectedStocks.length > 1 ? `${symbol} ${metricData.label}` : metricData.label

            mergedData.push({
              ...metricData,
              metric: prefixedId as MetricId,
              label: prefixedLabel,
            })

            // Collect period_end_dates for price matching (use first metric with dates)
            if (!periodEndDatesByStock[symbol] && metricData.data.length > 0) {
              periodEndDatesByStock[symbol] = metricData.data
                .filter(d => d.date)
                .map(d => ({
                  date: d.date!,
                  year: d.year,
                  fiscal_quarter: d.fiscal_quarter,
                  fiscal_label: d.fiscal_label,
                }))
            }
          })
        }

        if (result.yearBounds) {
          if (!combinedBounds) {
            combinedBounds = { ...result.yearBounds }
          } else {
            // Combine bounds across all stocks (use intersection for tighter range)
            combinedBounds.min = Math.max(combinedBounds.min, result.yearBounds.min)
            combinedBounds.max = Math.min(combinedBounds.max, result.yearBounds.max)
          }
        }
      })

      // Fetch price data if stock price toggle is enabled
      // For annual mode, use monthly data for smooth line visualization
      // For quarterly mode, use period-aligned data (quarterly granularity)
      if (showStockPrice) {
        const priceFetchPromises = selectedStocks.map(async (symbol) => {
          // For annual mode, use monthly price data for smooth line
          // For quarterly mode, align with fiscal quarters
          if (periodType === 'annual') {
            const priceResult = await getMonthlyChartPriceData({
              symbol,
              minYear: minYearParam,
              maxYear: maxYearParam,
            })

            if (priceResult.data) {
              // For multi-stock, prefix metric ID and label with stock symbol
              const prefixedId = selectedStocks.length > 1 ? `${symbol}:stock_price` : 'stock_price'
              const prefixedLabel = selectedStocks.length > 1 ? `${symbol} Stock Price` : 'Stock Price'

              return {
                ...priceResult.data,
                metric: prefixedId as MetricId,
                label: prefixedLabel,
              }
            }
          } else {
            // Quarterly mode: use period-aligned data
            const periodEndDates = periodEndDatesByStock[symbol]
            const priceResult = await getChartPriceData({
              symbol,
              periodEndDates,
              periodType: periodType as PeriodType,
              minYear: minYearParam,
              maxYear: maxYearParam,
            })

            if (priceResult.data) {
              // For multi-stock, prefix metric ID and label with stock symbol
              const prefixedId = selectedStocks.length > 1 ? `${symbol}:stock_price` : 'stock_price'
              const prefixedLabel = selectedStocks.length > 1 ? `${symbol} Stock Price` : 'Stock Price'

              return {
                ...priceResult.data,
                metric: prefixedId as MetricId,
                label: prefixedLabel,
              }
            }
          }
          return null
        })

        const priceResults = await Promise.all(priceFetchPromises)

        // Add price data to merged results
        priceResults.forEach(priceData => {
          if (priceData) {
            mergedData.push(priceData)
          }
        })
      }

      if (firstError && mergedData.length === 0) {
        setError(firstError)
        setMetricsData([])
      } else {
        setMetricsData(mergedData)
      }

      // Set up year bounds - either from financial data or use defaults for price-only
      if (combinedBounds) {
        setYearBounds((prev) => {
          if (prev && prev.min === combinedBounds!.min && prev.max === combinedBounds!.max) return prev
          return combinedBounds
        })
        // Set initial range to DEFAULT_MIN_YEAR-present on first load
        if (!initialRangeSet) {
          const effectiveMin = Math.max(combinedBounds.min, DEFAULT_MIN_YEAR)
          setMinYear(effectiveMin)
          setMaxYear(combinedBounds.max)
          setInitialRangeSet(true)
        }
      } else if (showStockPrice && visibleMetrics.length === 0 && !initialRangeSet) {
        // Price-only mode with no financial metrics - set default year bounds
        const currentYear = new Date().getFullYear()
        const defaultBounds = { min: 2006, max: currentYear }
        setYearBounds(defaultBounds)
        setMinYear(DEFAULT_MIN_YEAR)
        setMaxYear(currentYear)
        setInitialRangeSet(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setMetricsData([])
    } finally {
      setLoading(false)
    }
  }, [visibleMetrics, minYear, maxYear, yearBounds, periodType, selectedStocks, showStockPrice])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const handleResize = () => {
      if (sliderRef.current) {
        setSliderWidth(sliderRef.current.clientWidth)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const updateRange = (nextMin: number, nextMax: number) => {
    setMinYear(nextMin)
    setMaxYear(nextMax)
  }

  const clampToBounds = (value: number) => {
    if (!yearBounds) return value
    return Math.min(Math.max(value, yearBounds.min), yearBounds.max)
  }

  // Get the next available color that's not already in use
  const getNextAvailableColor = (currentColors: Record<string, string>, metricsInUse: MetricId[]): string => {
    const usedColors = new Set(metricsInUse.map(m => currentColors[m] || DEFAULT_METRIC_COLORS[m]))
    for (const color of COLOR_PALETTE) {
      if (!usedColors.has(color)) {
        return color
      }
    }
    // If all colors are used, cycle through palette
    return COLOR_PALETTE[metricsInUse.length % COLOR_PALETTE.length]
  }

  // Handle stock selection from dropdown (add to page)
  const handleStockSelect = (symbols: string[]) => {
    // Find newly added stocks (in symbols but not in addedStocks)
    const newStocks = symbols.filter((s) => !addedStocks.includes(s))
    // Find removed stocks (in addedStocks but not in symbols)
    const removedStocks = addedStocks.filter((s) => !symbols.includes(s))

    if (newStocks.length > 0) {
      // Add new stocks to both added and visible
      setAddedStocks((prev) => [...prev, ...newStocks])
      setVisibleStocks((prev) => [...prev, ...newStocks])
    }

    if (removedStocks.length > 0) {
      // Remove stocks from both added and visible
      setAddedStocks((prev) => prev.filter((s) => !removedStocks.includes(s)))
      setVisibleStocks((prev) => prev.filter((s) => !removedStocks.includes(s)))
    }
  }

  // Toggle stock visibility on chart (checkbox)
  const handleStockVisibilityToggle = (symbol: string) => {
    setVisibleStocks((prev) => {
      if (prev.includes(symbol)) {
        return prev.filter((s) => s !== symbol)
      } else {
        return [...prev, symbol]
      }
    })
  }

  // Remove stock from page entirely (X button)
  const handleRemoveStock = (symbol: string) => {
    setAddedStocks((prev) => prev.filter((s) => s !== symbol))
    setVisibleStocks((prev) => prev.filter((s) => s !== symbol))
  }

  // Toggle metric from dropdown (add/remove from page)
  const handleMetricToggle = (metricId: string) => {
    const id = metricId as MetricId
    setAddedMetrics((prev) => {
      if (prev.includes(id)) {
        // Remove from added - also remove from visible and clear custom color
        setVisibleMetrics((v) => v.filter((m) => m !== id))
        setCustomColors((colors) => {
          const { [id]: _, ...rest } = colors
          return rest
        })
        return prev.filter((m) => m !== id)
      } else {
        // Add to existing metrics with next available color
        setCustomColors((colors) => {
          const nextColor = getNextAvailableColor(colors, prev)
          return { ...colors, [id]: nextColor }
        })
        setVisibleMetrics((v) => [...v, id])
        return [...prev, id]
      }
    })
  }

  // Toggle visibility on chart (checkbox)
  const handleVisibilityToggle = (metricId: MetricId) => {
    setVisibleMetrics((prev) => {
      if (prev.includes(metricId)) {
        // Uncheck - remove from chart
        return prev.filter((m) => m !== metricId)
      } else {
        // Check - add to chart
        return [...prev, metricId]
      }
    })
  }

  // Remove metric from page entirely (X button)
  const handleRemoveMetric = (metricId: MetricId) => {
    setAddedMetrics((prev) => prev.filter((m) => m !== metricId))
    setVisibleMetrics((prev) => prev.filter((m) => m !== metricId))
  }

  const handleClearAll = () => {
    setAddedMetrics([])
    setVisibleMetrics([])
  }

  // Preset configurations for quick start
  const CHART_PRESETS = [
    {
      label: 'AAPL Revenue and Net Income',
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'] as MetricId[],
    },
    {
      label: 'AAPL Profitability Ratios',
      stocks: ['AAPL'],
      metrics: ['gross_margin', 'operating_margin', 'roe'] as MetricId[],
    },
    {
      label: 'AAPL vs MSFT Revenue',
      stocks: ['AAPL', 'MSFT'],
      metrics: ['revenue'] as MetricId[],
    },
    {
      label: 'NVDA Valuation Ratios',
      stocks: ['NVDA'],
      metrics: ['pe_ratio', 'pb_ratio', 'ev_ebitda'] as MetricId[],
    },
  ]

  // Apply a preset configuration
  const handleApplyPreset = (preset: { stocks: string[]; metrics: MetricId[] }) => {
    // Set stocks
    setAddedStocks(preset.stocks)
    setVisibleStocks(preset.stocks)
    // Set metrics with colors
    const newColors: Record<string, string> = {}
    preset.metrics.forEach((metricId, index) => {
      newColors[metricId] = COLOR_PALETTE[index % COLOR_PALETTE.length]
    })
    setCustomColors(newColors)
    setAddedMetrics(preset.metrics)
    setVisibleMetrics(preset.metrics)
  }

  // Reset everything to default state
  const handleReset = () => {
    setAddedMetrics([])
    setVisibleMetrics([])
    setCustomColors({})
    // Reset year range to full bounds
    if (yearBounds) {
      setMinYear(yearBounds.min)
      setMaxYear(yearBounds.max)
    }
  }

  const handleSliderMinChange = (value: number) => {
    const nextMin = clampToBounds(value)
    const currentMax = maxYear ?? yearBounds?.max ?? nextMin
    const nextMax = Math.max(currentMax, nextMin)

    updateRange(nextMin, nextMax)
  }

  const handleSliderMaxChange = (value: number) => {
    const nextMax = clampToBounds(value)
    const currentMin = minYear ?? yearBounds?.min ?? nextMax
    const nextMin = Math.min(currentMin, nextMax)

    updateRange(nextMin, nextMax)
  }

  const sliderYears = yearBounds
    ? Array.from({ length: yearBounds.max - yearBounds.min + 1 }, (_, index) => yearBounds.min + index)
    : []
  const minSliderValue = minYear ?? yearBounds?.min ?? 0
  const maxSliderValue = maxYear ?? yearBounds?.max ?? 0
  const sliderSpan = yearBounds ? Math.max(yearBounds.max - yearBounds.min, 1) : 1
  const minPercent = yearBounds ? ((minSliderValue - yearBounds.min) / sliderSpan) * 100 : 0
  const maxPercent = yearBounds ? ((maxSliderValue - yearBounds.min) / sliderSpan) * 100 : 0
  const minThumbOnTop = minSliderValue >= maxSliderValue - 1
  const getYearPercent = (year: number) => {
    if (!yearBounds) return 0
    return ((year - yearBounds.min) / sliderSpan) * 100
  }
  const getYearPositionPx = (year: number) => {
    if (!yearBounds || sliderWidth <= 0) return 0
    const percent = (year - yearBounds.min) / sliderSpan
    const trackWidth = Math.max(sliderWidth - thumbEffectivePx, 0)
    return percent * trackWidth + thumbEffectivePx / 2
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="bg-white dark:bg-[rgb(45,45,45)] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Controls */}
          <div className="px-4 py-2">
          {/* Stock Selector + Metric Selectors */}
          <div className="flex items-center gap-4">
            {/* Stock Selector - wider */}
            <div className="relative w-72">
              {addedStocks.length === 0 && (
                <div className="absolute inset-0 ring-2 ring-blue-400 dark:ring-blue-500 rounded-lg animate-pulse-subtle pointer-events-none z-10" />
              )}
              <StockSelector
                ref={stockSelectorRef}
                availableStocks={availableStocks}
                selectedStocks={addedStocks}
                onSelect={handleStockSelect}
                allowMultiple={true}
                popularStocks={POPULAR_STOCKS}
                autoFocus={true}
              />
            </div>
            {/* Metric Selector */}
            <div className="relative flex-1">
              {addedStocks.length > 0 && addedMetrics.length === 0 && (
                <div className="absolute inset-0 ring-2 ring-blue-400 dark:ring-blue-500 rounded-lg animate-pulse-subtle pointer-events-none" />
              )}
              <MetricSelector
                metrics={availableMetrics}
                selectedMetrics={addedMetrics}
                onToggle={handleMetricToggle}
                onClear={handleClearAll}
                maxSelections={10}
                selectedStock={selectedStock}
                selectedStocks={selectedStocks}
              />
            </div>
          </div>

          {/* Stock and metric checkboxes + Time Range Slider - same row */}
          <div className="flex items-start gap-6 mt-2">
            {/* Stock and Metric checkboxes - left half */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Stock checkboxes */}
              {addedStocks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {addedStocks.map((symbol) => {
                    const stock = availableStocks.find((s) => s.symbol === symbol)
                    const isVisible = visibleStocks.includes(symbol)

                    return (
                      <div
                        key={symbol}
                        className="inline-flex items-center gap-2 bg-gray-100 dark:bg-[rgb(55,55,55)] px-2 py-1 rounded-md h-[32px]"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => handleStockVisibilityToggle(symbol)}
                          title={`Toggle ${symbol} visibility`}
                          className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2 flex-shrink-0"
                        />
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{symbol}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{stock?.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStock(symbol)}
                          className="ml-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                          title="Remove stock"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Metric checkboxes */}
              <div className="grid grid-cols-4 gap-2 min-h-[32px]">
                {addedMetrics.map((metricId) => {
                  const metric = availableMetrics.find((m) => m.id === metricId)
                  const isVisible = visibleMetrics.includes(metricId)
                  const isOnlyVisible = visibleMetrics.length === 1 && isVisible
                  const currentColor = customColors[metricId] ?? DEFAULT_METRIC_COLORS[metricId] ?? '#3b82f6'

                  return (
                    <div
                      key={metricId}
                      className="inline-flex items-center gap-2 bg-gray-100 dark:bg-[rgb(55,55,55)] px-2 py-1 rounded-md relative h-[32px]"
                      title={metric?.definition}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => handleVisibilityToggle(metricId)}
                        disabled={isOnlyVisible}
                        title={isOnlyVisible ? 'At least one metric must be visible' : metric?.definition}
                        className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2 flex-shrink-0"
                      />
                      {/* Color swatch button */}
                      <button
                        type="button"
                        onClick={() => setColorPickerOpen(colorPickerOpen === metricId ? null : metricId)}
                        className="w-4 h-4 rounded border border-gray-300 dark:border-gray-500 flex-shrink-0"
                        style={{ backgroundColor: currentColor }}
                        title="Change color"
                      />
                      {/* Color picker dropdown */}
                      {colorPickerOpen === metricId && (
                        <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                          <div className="grid grid-cols-4 gap-1">
                            {COLOR_PALETTE.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => {
                                  setCustomColors((prev) => ({ ...prev, [metricId]: color }))
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
                      <span className="text-sm text-gray-900 dark:text-white font-medium truncate">
                        {metric?.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMetric(metricId)}
                        className="ml-auto text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove metric"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Period Toggle + Stock Price + Time Range Slider - right half */}
            <div className="flex items-start gap-4 flex-shrink-0">
              {/* Period Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-[rgb(55,55,55)] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setPeriodType('annual')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    periodType === 'annual'
                      ? 'bg-white dark:bg-[rgb(70,70,70)] text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Annual
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodType('quarterly')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    periodType === 'quarterly'
                      ? 'bg-white dark:bg-[rgb(70,70,70)] text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Quarterly
                </button>
              </div>
              {/* Stock Price Toggle */}
              <label className="flex items-center gap-2 cursor-pointer bg-gray-100 dark:bg-[rgb(55,55,55)] rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={showStockPrice}
                  onChange={(e) => setShowStockPrice(e.target.checked)}
                  className="w-4 h-4 text-green-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-green-500 focus:ring-2"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Stock Price</span>
              </label>
              {/* Time Range Slider */}
              <div className="w-[550px] space-y-2 range-slider-wrap">
              <div className="range-slider" ref={sliderRef}>
                <div className="range-slider-track" />
                <div
                  className="range-slider-range"
                  style={{
                    left: `${Math.min(minPercent, maxPercent)}%`,
                    width: `${Math.max(maxPercent - minPercent, 0)}%`,
                  }}
                />
                <input
                  type="range"
                  min={yearBounds?.min ?? 0}
                  max={yearBounds?.max ?? 0}
                  step={1}
                  value={minSliderValue}
                  onChange={(e) => handleSliderMinChange(Number(e.target.value))}
                  disabled={!yearBounds}
                  className="range-slider-input"
                  style={{ zIndex: minThumbOnTop ? 5 : 4 }}
                />
                <input
                  type="range"
                  min={yearBounds?.min ?? 0}
                  max={yearBounds?.max ?? 0}
                  step={1}
                  value={maxSliderValue}
                  onChange={(e) => handleSliderMaxChange(Number(e.target.value))}
                  disabled={!yearBounds}
                  className="range-slider-input"
                  style={{ zIndex: minThumbOnTop ? 4 : 5 }}
                />
              </div>
              {yearBounds && sliderYears.length > 0 && (
                <div className="range-slider-scale relative h-2">
                  {sliderYears.map((year) => (
                    <span
                      key={`tick-${year}`}
                      className="absolute -translate-x-1/2 h-2 w-px bg-gray-400/70 dark:bg-gray-500/70"
                      style={{ left: sliderWidth ? `${getYearPositionPx(year)}px` : `${getYearPercent(year)}%` }}
                    />
                  ))}
                </div>
              )}
              {yearBounds && sliderYears.length > 0 && (
                <div className="range-slider-scale relative h-4 text-[10px] text-gray-500 dark:text-gray-400 leading-none mt-1">
                  {sliderYears.map((year) => (
                    <span
                      key={year}
                      className="absolute -translate-x-1/2 whitespace-nowrap"
                      style={{ left: sliderWidth ? `${getYearPositionPx(year)}px` : `${getYearPercent(year)}%` }}
                    >
                      {year}
                    </span>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
          </div>

          {/* Chart */}
          <div className="p-4 pb-2">
            <div className="relative min-h-[650px]">
            {/* Chart content */}
            {error ? (
              <div className="h-[650px] flex items-center justify-center">
                <div className="text-center">
                  <p className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading data</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{error}</p>
                  <button
                    onClick={fetchData}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : metricsData.length > 0 ? (
              <MultiMetricChart
                data={metricsData}
                metrics={metricsData.map(d => d.metric)}
                customColors={
                  // Use stock-based color families for multi-stock comparison
                  selectedStocks.length > 1
                    ? Object.fromEntries(
                        (() => {
                          // Track metric index per stock for color assignment
                          const stockMetricIndex: Record<string, number> = {}
                          const stockColorFamilies = isDark ? STOCK_COLOR_FAMILIES_DARK : STOCK_COLOR_FAMILIES_LIGHT

                          return metricsData.map((d) => {
                            // Extract stock symbol from prefixed ID (e.g., "AAPL:revenue" -> "AAPL")
                            const stockSymbol = d.metric.includes(':') ? d.metric.split(':')[0] : selectedStocks[0]

                            // Get the color family for this stock
                            const colorFamily = stockColorFamilies[stockSymbol] ?? COLOR_PALETTE

                            // Get the next color index for this stock
                            const metricIndex = stockMetricIndex[stockSymbol] ?? 0
                            stockMetricIndex[stockSymbol] = metricIndex + 1

                            // Assign color from the stock's color family
                            const color = colorFamily[metricIndex % colorFamily.length]
                            return [d.metric, color]
                          })
                        })()
                      )
                    : customColors
                }
                onReset={handleReset}
              />
            ) : (
              <div className="h-[650px] flex items-start justify-center pt-24">
                <div className="text-center max-w-lg">
                  {/* Guided steps */}
                  {addedStocks.length === 0 ? (
                    <>
                      <div className="mb-8">
                        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Pick a stock</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Use the dropdown above to select a stock</p>
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">try a preset</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                      </div>

                      {/* Preset buttons */}
                      <div className="flex flex-wrap justify-center gap-2">
                        {CHART_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            onClick={() => handleApplyPreset(preset)}
                            className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-700 dark:hover:text-blue-300 transition-colors border border-gray-200 dark:border-gray-700"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Choose metrics to compare</p>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Use the metrics dropdown to add data to your chart</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
