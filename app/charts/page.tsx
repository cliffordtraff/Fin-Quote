'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Navigation from '@/components/Navigation'
import MetricSelector from '@/components/MetricSelector'
import MultiMetricChart, { getMetricColors } from '@/components/MultiMetricChart'
import { getMultipleMetrics, getAvailableMetrics, type MetricData, type MetricId } from '@/app/actions/chart-metrics'
import { useTheme } from '@/components/ThemeProvider'

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

  const [availableMetrics, setAvailableMetrics] = useState<{ id: MetricId; label: string; unit: string; definition: string }[]>([])
  // Metrics added to the page (from dropdown)
  const [addedMetrics, setAddedMetrics] = useState<MetricId[]>([])
  // Metrics visible on chart (subset of addedMetrics, controlled by checkboxes)
  const [visibleMetrics, setVisibleMetrics] = useState<MetricId[]>([])
  // Period type: annual or quarterly
  const [periodType, setPeriodType] = useState<'annual' | 'quarterly'>('annual')
  const [metricsData, setMetricsData] = useState<MetricData[]>([])
  const [fullMetricsData, setFullMetricsData] = useState<MetricData[]>([]) // Store ALL data, filter client-side
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const DEFAULT_MIN_YEAR = 2018
  const [minYear, setMinYear] = useState<number | null>(null)
  const [maxYear, setMaxYear] = useState<number | null>(null)
  const [yearBounds, setYearBounds] = useState<{ min: number; max: number } | null>(null)
  const [initialRangeSet, setInitialRangeSet] = useState(false)
  const [sliderWidth, setSliderWidth] = useState(0)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const thumbEffectivePx = 24 // matches CSS width + borders + shadow
  // Custom colors for metrics (overrides default colors)
  const [customColors, setCustomColors] = useState<Record<string, string>>({})
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null)

  // Load available metrics on mount
  useEffect(() => {
    async function loadMetrics() {
      const metrics = await getAvailableMetrics()
      setAvailableMetrics(metrics)
    }
    loadMetrics()
  }, [])

  // Reset year bounds and initial range when period type changes
  useEffect(() => {
    setYearBounds(null)
    setInitialRangeSet(false)
  }, [periodType])

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

  // Filter data client-side when year range changes (instant, no network)
  const filterDataByYearRange = useCallback((data: MetricData[], min: number | null, max: number | null): MetricData[] => {
    if (!min && !max) return data
    return data.map(metric => ({
      ...metric,
      data: metric.data.filter(point => {
        const year = point.year
        if (min && year < min) return false
        if (max && year > max) return false
        return true
      })
    }))
  }, [])

  // Fetch ALL data when visible metrics or period type changes (not year range)
  const fetchData = useCallback(async () => {
    if (visibleMetrics.length === 0) {
      setMetricsData([])
      setFullMetricsData([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch ALL data without year filters - we'll filter client-side
      const { data, error: fetchError, yearBounds: bounds } = await getMultipleMetrics({
        metrics: visibleMetrics,
        period: periodType,
        // No minYear/maxYear - fetch everything
      })

      if (fetchError) {
        setError(fetchError)
        setMetricsData([])
        setFullMetricsData([])
      } else if (data) {
        setFullMetricsData(data) // Store full data
        // Apply current filter
        const filteredData = filterDataByYearRange(data, minYear, maxYear)
        setMetricsData(filteredData)
      }

      if (bounds) {
        setYearBounds((prev) => {
          if (prev && prev.min === bounds.min && prev.max === bounds.max) return prev
          return bounds
        })
        // Set initial range to DEFAULT_MIN_YEAR-present on first load
        if (!initialRangeSet) {
          const effectiveMin = Math.max(bounds.min, DEFAULT_MIN_YEAR)
          setMinYear(effectiveMin)
          setMaxYear(bounds.max)
          setInitialRangeSet(true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setMetricsData([])
      setFullMetricsData([])
    } finally {
      setLoading(false)
    }
  }, [visibleMetrics, periodType, filterDataByYearRange, initialRangeSet]) // Only refetch when metrics or period changes, NOT year range

  // When year range changes, filter existing data client-side (instant)
  useEffect(() => {
    if (fullMetricsData.length > 0) {
      const filteredData = filterDataByYearRange(fullMetricsData, minYear, maxYear)
      setMetricsData(filteredData)
    }
  }, [minYear, maxYear, fullMetricsData, filterDataByYearRange])

  // Fetch data when metrics or period changes
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
          {/* Period Toggle + Metric Selectors */}
          <div className="flex items-center gap-4">
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
            {/* Metric Selector */}
            <div className="flex-1">
            <MetricSelector
              metrics={availableMetrics}
              selectedMetrics={addedMetrics}
              onToggle={handleMetricToggle}
              onClear={handleClearAll}
              maxSelections={10}
            />
            </div>
          </div>

          {/* Enabled metrics and Time Range Slider - same row */}
          <div className="flex items-start gap-6 mt-2">
            {/* Metric checkboxes - left half */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-4 gap-2 h-[32px]">
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

            {/* Time Range Slider - right half */}
            <div className="w-[700px] flex-shrink-0 space-y-2 range-slider-wrap">
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
              <MultiMetricChart data={metricsData} metrics={visibleMetrics} customColors={customColors} onReset={handleReset} />
            ) : (
              <div className="h-[650px] flex items-center justify-center">
                <p className="text-gray-600 dark:text-gray-400">Select at least one metric to display</p>
              </div>
            )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
