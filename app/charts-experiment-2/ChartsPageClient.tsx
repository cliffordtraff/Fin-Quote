'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Navigation from '@/components/Navigation'
import ChartSidebar from '@/components/ChartSidebar'
import MultiMetricChart, { getMetricColors } from '@/components/MultiMetricChart'
import { getMultipleMetrics, prewarmStockCaches, type MetricData, type MetricId, type StatementType, type SegmentCategory } from '@/app/actions/chart-metrics'
import type { Stock } from '@/app/actions/get-stocks'
import { getMonthlyChartPriceData } from '@/app/actions/chart-price'
import { isPriceMetric } from '@/lib/price-matcher'
import { useTheme } from '@/components/ThemeProvider'
import { buildExportUrl, parseSpecFromParams } from '@/lib/chart-export'
import type { ChartExportSpec } from '@/types/chart-export'

// Popular/commonly searched stocks for quick access
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'V',
  'UNH', 'XOM', 'MA', 'JNJ', 'PG', 'HD', 'AVGO', 'CVX', 'MRK', 'COST',
]

// Generate a deterministic hue from a stock symbol string
function symbolToHue(symbol: string): number {
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ((hash % 360) + 360) % 360
}

// HSL to hex conversion
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Generate a color family for any stock symbol
function generateColorFamily(symbol: string, isDark: boolean, count: number = 6): string[] {
  const hue = symbolToHue(symbol)
  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    if (isDark) {
      // Dark mode: lighter, softer colors (high lightness, moderate saturation)
      const lightness = 0.62 + i * 0.04
      const saturation = 0.45 - i * 0.03
      colors.push(hslToHex(hue, saturation, lightness))
    } else {
      // Light mode: darker, bolder colors (low lightness, moderate saturation)
      const lightness = 0.22 + i * 0.05
      const saturation = 0.40 - i * 0.02
      colors.push(hslToHex(hue, saturation, lightness))
    }
  }
  return colors
}

// Spread hues apart for multi-stock so adjacent stocks don't look similar
function getSpreadHues(symbols: string[], count: number): Map<string, number> {
  const baseHues = symbols.map((s) => ({ symbol: s, hue: symbolToHue(s) }))
  // Use golden angle spacing to spread hues evenly
  const hueMap = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const spreadHue = (i * 137.508) % 360 // golden angle
    hueMap.set(baseHues[i].symbol, spreadHue)
  }
  return hueMap
}

function generateStockColorFamilies(symbols: string[], isDark: boolean): Record<string, string[]> {
  if (symbols.length <= 1) {
    const result: Record<string, string[]> = {}
    symbols.forEach((s) => { result[s] = generateColorFamily(s, isDark) })
    return result
  }
  // Spread hues apart for multi-stock charts
  const hueMap = getSpreadHues(symbols, symbols.length)
  const result: Record<string, string[]> = {}
  hueMap.forEach((hue, symbol) => {
    const colors: string[] = []
    for (let i = 0; i < 6; i++) {
      if (isDark) {
        colors.push(hslToHex(hue, 0.45 - i * 0.03, 0.62 + i * 0.04))
      } else {
        colors.push(hslToHex(hue, 0.40 - i * 0.02, 0.22 + i * 0.05))
      }
    }
    result[symbol] = colors
  })
  return result
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

type AvailableMetric = {
  id: MetricId
  label: string
  unit: string
  statement: StatementType
  definition: string
  segmentCategory?: SegmentCategory
  stock?: string
}

interface ChartsPageClientProps {
  initialAvailableMetrics: AvailableMetric[]
  initialAvailableStocks: Stock[]
}

function getMetricCacheKey(periodType: 'annual' | 'quarterly', symbol: string, metricId: string) {
  return `${periodType}:${symbol}:${metricId}`
}

function getPriceCacheKey(periodType: 'annual' | 'quarterly', symbol: string) {
  return `${periodType}:${symbol}:stock_price`
}

export default function ChartsPageClient({
  initialAvailableMetrics,
  initialAvailableStocks,
}: ChartsPageClientProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const COLOR_PALETTE = isDark ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT
  const DEFAULT_METRIC_COLORS = getMetricColors(isDark)

  const [availableMetrics] = useState<AvailableMetric[]>(initialAvailableMetrics)
  // Available stocks from database
  const [availableStocks] = useState<Stock[]>(initialAvailableStocks)
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
  const [initialChartType, setInitialChartType] = useState<'bar' | 'line' | 'area' | undefined>(undefined)
  const [fullData, setFullData] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const DEFAULT_MIN_YEAR = 2018
  const DEFAULT_PRICE_MIN_YEAR = 2006
  const [minYear, setMinYear] = useState<number | null>(null)
  const [maxYear, setMaxYear] = useState<number | null>(null)
  const [yearBounds, setYearBounds] = useState<{ min: number; max: number } | null>(null)
  const initialRangeSetRef = useRef(false)
  const [sliderWidth, setSliderWidth] = useState(0)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const thumbEffectivePx = 18 // matches CSS --thumb-width (border-box)
  // Custom colors for metrics (overrides default colors)
  const [customColors, setCustomColors] = useState<Record<string, string>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [metricModalOpen, setMetricModalOpen] = useState(false)
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const metricCacheRef = useRef<Record<string, MetricData>>({})
  const priceCacheRef = useRef<Record<string, MetricData>>({})
  const fetchRequestRef = useRef(0)

  // Track whether URL params have been applied
  const [urlParamsApplied, setUrlParamsApplied] = useState(false)

  // Initialize from URL params (e.g., ?stocks=AAPL&metrics=revenue,net_income or ?spec=<base64>)
  useEffect(() => {
    if (urlParamsApplied || availableMetrics.length === 0) return

    const params = new URLSearchParams(window.location.search)
    if (params.toString() === '') {
      setUrlParamsApplied(true)
      return
    }

    const spec = parseSpecFromParams(params)
    if (!spec) {
      setUrlParamsApplied(true)
      return
    }

    // Apply stocks
    setAddedStocks(spec.stocks)
    setVisibleStocks(spec.stocks)

    // Apply metrics with colors
    const validMetrics = spec.metrics.filter(m =>
      availableMetrics.some(am => am.id === m)
    ) as MetricId[]

    if (validMetrics.length > 0) {
      const newColors: Record<string, string> = {}
      validMetrics.forEach((metricId, index) => {
        newColors[metricId] = spec.colors?.[metricId] ?? COLOR_PALETTE[index % COLOR_PALETTE.length]
      })
      setCustomColors(newColors)
      setAddedMetrics(validMetrics)
      setVisibleMetrics(validMetrics)
    }

    // Apply period type
    if (spec.periodType) setPeriodType(spec.periodType)

    // Apply year range
    if (spec.minYear) setMinYear(spec.minYear)
    if (spec.maxYear) setMaxYear(spec.maxYear)

    // Apply stock price toggle
    if (spec.showStockPrice) setShowStockPrice(true)

    // Apply chart type (bar, line, area)
    if (spec.chartType) setInitialChartType(spec.chartType)

    setUrlParamsApplied(true)
  }, [availableMetrics, urlParamsApplied]) // eslint-disable-line react-hooks/exhaustive-deps -- one-time URL init

  // Keyboard shortcut: '/' to open stock selector modal
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore if user is typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        setStockModalOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset year bounds and initial range when period type changes
  // (Don't reset on stock changes to avoid slider flashing)
  useEffect(() => {
    setYearBounds(null)
    initialRangeSetRef.current = false
  }, [periodType])

  // Prewarm all three Supabase caches in parallel when a stock is added.
  // This fires std + ext + segment concurrently so the cache is warm
  // by the time the user picks a metric (~3-5s later).
  useEffect(() => {
    if (addedStocks.length === 0) return
    addedStocks.forEach((symbol) => {
      prewarmStockCaches(symbol, periodType).catch(() => {})
    })
  }, [addedStocks, periodType])

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

  const metricsData = useMemo(() => {
    if (fullData.length === 0) return []

    const resolvedMin = minYear ?? yearBounds?.min ?? Number.NEGATIVE_INFINITY
    const resolvedMax = maxYear ?? yearBounds?.max ?? Number.POSITIVE_INFINITY

    return fullData
      .map((metric) => ({
        ...metric,
        data: metric.data.filter((point) => {
          if (metric.unit === 'price' && point.date) {
            const pointYear = new Date(point.date).getFullYear()
            return pointYear >= resolvedMin && pointYear <= resolvedMax
          }
          return point.year >= resolvedMin && point.year <= resolvedMax
        }),
      }))
      .filter((metric) => metric.data.length > 0)
  }, [fullData, minYear, maxYear, yearBounds])

  // Fetch data when visible metrics, stocks, period type, or price toggle changes
  const fetchData = useCallback(async () => {
    // Need at least one metric OR stock price enabled, and at least one stock
    if ((visibleMetrics.length === 0 && !showStockPrice) || selectedStocks.length === 0) {
      setFullData([])
      setError(null)
      setLoading(false)
      return
    }

    const requestId = ++fetchRequestRef.current
    setError(null)

    try {
      const currentYear = new Date().getFullYear()
      const fetchMinYear = DEFAULT_PRICE_MIN_YEAR
      const fetchMaxYear = currentYear

      // All visible metrics (price is handled separately via showStockPrice toggle)
      const otherMetrics = visibleMetrics.filter(m => !isPriceMetric(m))

      const prefixMetricData = (metricData: MetricData, symbol: string): MetricData => {
        const prefixedId = selectedStocks.length > 1 ? `${symbol}:${metricData.metric}` : metricData.metric
        const prefixedLabel = selectedStocks.length > 1 ? `${symbol} ${metricData.label}` : metricData.label

        return {
          ...metricData,
          metric: prefixedId as MetricId,
          label: prefixedLabel,
        }
      }

      const buildCombinedBounds = (
        dataByStock: Record<string, MetricData[]>
      ): { min: number; max: number } | null => {
        let combinedBounds: { min: number; max: number } | null = null

        selectedStocks.forEach((symbol) => {
          const stockData = dataByStock[symbol] ?? []
          const years = stockData.flatMap((metricData) => metricData.data.map((point) => point.year))

          if (years.length === 0) return

          const stockBounds = {
            min: Math.min(...years),
            max: Math.max(...years),
          }

          if (!combinedBounds) {
            combinedBounds = stockBounds
          } else {
            combinedBounds.min = Math.max(combinedBounds.min, stockBounds.min)
            combinedBounds.max = Math.min(combinedBounds.max, stockBounds.max)
          }
        })

        return combinedBounds
      }

      const buildFullDataFromCache = () => {
        const mergedData: MetricData[] = []
        const financialDataByStock: Record<string, MetricData[]> = {}

        selectedStocks.forEach((symbol) => {
          const stockMetricData = otherMetrics
            .map((metricId) => metricCacheRef.current[getMetricCacheKey(periodType, symbol, metricId)])
            .filter((metricData): metricData is MetricData => Boolean(metricData))

          financialDataByStock[symbol] = stockMetricData
          stockMetricData.forEach((metricData) => {
            mergedData.push(prefixMetricData(metricData, symbol))
          })
        })

        if (showStockPrice) {
          selectedStocks.forEach((symbol) => {
            const priceData = priceCacheRef.current[getPriceCacheKey(periodType, symbol)]
            if (priceData) {
              mergedData.push(prefixMetricData(priceData, symbol))
            }
          })
        }

        return {
          mergedData,
          combinedBounds: buildCombinedBounds(financialDataByStock),
        }
      }

      const missingMetricsByStock = selectedStocks
        .map((symbol) => ({
          symbol,
          metrics: otherMetrics.filter(
            (metricId) => !metricCacheRef.current[getMetricCacheKey(periodType, symbol, metricId)]
          ),
        }))
        .filter((entry) => entry.metrics.length > 0)

      const missingPriceSymbols = showStockPrice
        ? selectedStocks.filter((symbol) => !priceCacheRef.current[getPriceCacheKey(periodType, symbol)])
        : []

      if (missingMetricsByStock.length === 0 && missingPriceSymbols.length === 0) {
        if (requestId !== fetchRequestRef.current) return

        const { mergedData, combinedBounds } = buildFullDataFromCache()

        setError(null)
        setFullData(mergedData)
        setLoading(false)

        if (combinedBounds) {
          setYearBounds((prev) => {
            if (prev && prev.min === combinedBounds.min && prev.max === combinedBounds.max) return prev
            return combinedBounds
          })
          if (!initialRangeSetRef.current) {
            const effectiveMin = Math.max(combinedBounds.min, DEFAULT_MIN_YEAR)
            setMinYear(effectiveMin)
            setMaxYear(combinedBounds.max)
            initialRangeSetRef.current = true
          }
        } else if (showStockPrice && otherMetrics.length === 0) {
          const defaultBounds = { min: DEFAULT_PRICE_MIN_YEAR, max: currentYear }
          setYearBounds((prev) => {
            if (prev && prev.min === defaultBounds.min && prev.max === defaultBounds.max) return prev
            return defaultBounds
          })
          if (!initialRangeSetRef.current) {
            setMinYear(DEFAULT_MIN_YEAR)
            setMaxYear(currentYear)
            initialRangeSetRef.current = true
          }
        }

        return
      }

      setLoading(true)

      // Fetch non-price data for all selected stocks
      const results = await Promise.all(
        missingMetricsByStock.map(async ({ symbol, metrics }) => ({
          symbol,
          result: await getMultipleMetrics({
            symbol,
            metrics,
            minYear: fetchMinYear,
            maxYear: fetchMaxYear,
            period: periodType,
          }),
        }))
      )

      if (requestId !== fetchRequestRef.current) return

      let firstError: string | null = null

      results.forEach(({ symbol, result }) => {
        if (result.error && !firstError) {
          firstError = result.error
        }

        if (result.data) {
          result.data.forEach((metricData) => {
            metricCacheRef.current[getMetricCacheKey(periodType, symbol, metricData.metric)] = metricData
          })
        }
      })

      // Fetch price data if stock price toggle is enabled
      // For annual mode, use monthly data for smooth line visualization
      // For quarterly mode, use period-aligned data (quarterly granularity)
      if (missingPriceSymbols.length > 0) {
        const priceFetchPromises = missingPriceSymbols.map(async (symbol) => {
          // Annual mode: weekly data (~52 points/year) for smooth line
          // Quarterly mode: monthly data (~12 points/year) for good density
          const priceResult = await getMonthlyChartPriceData({
            symbol,
            minYear: DEFAULT_PRICE_MIN_YEAR,
            maxYear: currentYear,
            granularity: periodType === 'annual' ? 'weekly' : 'monthly',
          })

          return { symbol, priceResult }
        })

        const priceResults = await Promise.all(priceFetchPromises)

        if (requestId !== fetchRequestRef.current) return

        priceResults.forEach(({ symbol, priceResult }) => {
          if (priceResult.error && !firstError) {
            firstError = priceResult.error
          }

          if (priceResult.data) {
            priceCacheRef.current[getPriceCacheKey(periodType, symbol)] = priceResult.data
          }
        })
      }

      if (requestId !== fetchRequestRef.current) return

      const { mergedData, combinedBounds } = buildFullDataFromCache()

      if (firstError && mergedData.length === 0) {
        setError(firstError)
        setFullData([])
      } else {
        setFullData(mergedData)
      }

      // Set up year bounds - either from financial data or use defaults for price-only
      if (combinedBounds) {
        const bounds = combinedBounds as { min: number; max: number }
        setYearBounds((prev) => {
          if (prev && prev.min === bounds.min && prev.max === bounds.max) return prev
          return bounds
        })
        // Set initial range to DEFAULT_MIN_YEAR-present on first load
        if (!initialRangeSetRef.current) {
          const effectiveMin = Math.max(bounds.min, DEFAULT_MIN_YEAR)
          setMinYear(effectiveMin)
          setMaxYear(bounds.max)
          initialRangeSetRef.current = true
        }
      } else if (showStockPrice && visibleMetrics.length === 0 && !initialRangeSetRef.current) {
        // Price-only mode with no financial metrics - set default year bounds
        const currentYear = new Date().getFullYear()
        const defaultBounds = { min: DEFAULT_PRICE_MIN_YEAR, max: currentYear }
        setYearBounds(defaultBounds)
        setMinYear(DEFAULT_MIN_YEAR)
        setMaxYear(currentYear)
        initialRangeSetRef.current = true
      }
    } catch (err) {
      if (requestId !== fetchRequestRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setFullData([])
    } finally {
      if (requestId === fetchRequestRef.current) {
        setLoading(false)
      }
    }
  }, [visibleMetrics, periodType, selectedStocks, showStockPrice])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fire resize event when sidebar transition ends so chart + slider recalculate widths
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'width') {
        window.dispatchEvent(new Event('resize'))
      }
    }
    el.addEventListener('transitionend', handleTransitionEnd)
    return () => el.removeEventListener('transitionend', handleTransitionEnd)
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

  // Toggle a single stock in/out (for modal)
  const handleStockToggle = (symbol: string) => {
    if (addedStocks.includes(symbol)) {
      setAddedStocks((prev) => prev.filter((s) => s !== symbol))
      setVisibleStocks((prev) => prev.filter((s) => s !== symbol))
    } else {
      setAddedStocks((prev) => [...prev, symbol])
      setVisibleStocks((prev) => [...prev, symbol])
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

  // Build a ChartExportSpec from current state and copy the export URL to clipboard
  const handleCopyExportUrl = useCallback(() => {
    const spec: ChartExportSpec = {
      stocks: visibleStocks,
      metrics: visibleMetrics,
      periodType,
      minYear: minYear ?? undefined,
      maxYear: maxYear ?? undefined,
      showStockPrice,
      colors: Object.keys(customColors).length > 0 ? customColors : undefined,
    }
    const url = buildExportUrl(spec, window.location.origin)
    navigator.clipboard.writeText(url).then(() => {
      // Brief visual feedback could be added here if desired
    })
  }, [visibleStocks, visibleMetrics, periodType, minYear, maxYear, showStockPrice, customColors])

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
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900">
      <Navigation />

      <div className="flex">
        {/* SIDEBAR — page-level, outside the card */}
        <div
          ref={sidebarRef}
          className={`${sidebarOpen ? 'w-[300px]' : 'w-0'} overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0`}
        >
          <ChartSidebar
            availableStocks={availableStocks}
            addedStocks={addedStocks}
            popularStocks={POPULAR_STOCKS}
            onStockToggle={handleStockToggle}
            onRemoveStock={handleRemoveStock}
            stockModalOpen={stockModalOpen}
            onStockModalChange={setStockModalOpen}
            availableMetrics={availableMetrics}
            addedMetrics={addedMetrics}
            visibleMetrics={visibleMetrics}
            customColors={customColors}
            colorPalette={COLOR_PALETTE}
            defaultMetricColors={DEFAULT_METRIC_COLORS}
            onMetricToggle={handleMetricToggle}
            onVisibilityToggle={handleVisibilityToggle}
            onRemoveMetric={handleRemoveMetric}
            onColorChange={(metricId, color) => setCustomColors((prev) => ({ ...prev, [metricId]: color }))}
            metricModalOpen={metricModalOpen}
            onMetricModalChange={setMetricModalOpen}
            selectedStock={selectedStock}
            selectedStocks={selectedStocks}
            periodType={periodType}
            onPeriodTypeChange={setPeriodType}
            showStockPrice={showStockPrice}
            onShowStockPriceChange={setShowStockPrice}
            onClearAll={() => {
              setAddedStocks([])
              setVisibleStocks([])
              setAddedMetrics([])
              setVisibleMetrics([])
              setCustomColors({})
              setShowStockPrice(false)
              if (yearBounds) {
                setMinYear(yearBounds.min)
                setMaxYear(yearBounds.max)
              }
            }}
            canClear={addedStocks.length > 0 || addedMetrics.length > 0 || showStockPrice}
          />
        </div>

        {/* TOGGLE BUTTON — page-level strip */}
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="w-5 flex-shrink-0 flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-cream-100 dark:hover:bg-gray-700 transition-colors border-r border-cream-300 dark:border-gray-700 cursor-pointer"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg
            className={`w-3 h-3 text-gray-500 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 px-6 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-cream-300 dark:border-gray-700">
            {/* Controls */}
            {addedStocks.length > 0 && (
            <div className="px-4 py-2 select-none">
              {/* Time Range Slider — full width */}
              <div className="space-y-2 range-slider-wrap">
                    <div className="range-slider">
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
                            style={{ left: `${getYearPercent(year)}%` }}
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
                            style={{ left: `${getYearPercent(year)}%` }}
                          >
                            {year}
                          </span>
                        ))}
                      </div>
                    )}
              </div>
            </div>
            )}

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
                          className="mt-4 px-4 py-2 bg-sage-500 text-white rounded-md hover:bg-sage-600 transition-colors"
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
                                const stockMetricIndex: Record<string, number> = {}
                                const stockColorFamilies = generateStockColorFamilies(selectedStocks, isDark)

                                return metricsData.map((d) => {
                                  const stockSymbol = d.metric.includes(':') ? d.metric.split(':')[0] : selectedStocks[0]
                                  const colorFamily = stockColorFamilies[stockSymbol] ?? COLOR_PALETTE
                                  const metricIndex = stockMetricIndex[stockSymbol] ?? 0
                                  stockMetricIndex[stockSymbol] = metricIndex + 1
                                  const color = colorFamily[metricIndex % colorFamily.length]
                                  return [d.metric, color]
                                })
                              })()
                            )
                          : customColors
                      }
                      onReset={handleReset}
                      onCopyExportUrl={handleCopyExportUrl}
                      initialChartType={initialChartType}
                    />
                  ) : (
                    <div className="h-[650px] flex items-start justify-center pt-24">
                      <div className="text-center max-w-lg">
                        {/* Guided steps */}
                        {addedStocks.length === 0 ? (
                          <>
                            <div className="mb-8">
                              <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Pick a stock</p>
                              <p className="text-gray-500 dark:text-gray-400 text-sm">Use the sidebar to select a stock</p>
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
                                  className="px-4 py-2 text-sm font-medium bg-cream-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-sage-100 dark:hover:bg-sage-900/20 hover:text-sage-700 dark:hover:text-sage-300 transition-colors border border-gray-200 dark:border-gray-700"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div>
                            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Choose metrics to compare</p>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Use the sidebar to add metrics to your chart</p>
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
      </div>
    )
  }
