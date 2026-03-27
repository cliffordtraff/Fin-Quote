'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import type { MetricData } from '@/app/actions/chart-metrics'
import { isPriceMetric } from '@/lib/price-matcher'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

// Light mode colors - dark, bold colors for contrast against white
const METRIC_COLORS_LIGHT: Record<string, string> = {
  // Income Statement
  revenue: '#1a1a2e',           // Near black (primary)
  gross_profit: '#252540',      // Dark navy
  net_income: '#2d4a3e',        // Dark forest green
  operating_income: '#3a5a4e',  // Forest green
  eps: '#3d3520',               // Dark bronze
  ebitda: '#4a6a5e',            // Sage
  depreciation_amortization: '#2a3540', // Dark blue-gray
  stock_based_comp: '#3a4550',  // Blue gray
  // Balance Sheet
  total_assets: '#2a4050',      // Steel blue
  total_liabilities: '#4a2c2c', // Dark burgundy
  shareholders_equity: '#2e2640', // Dark purple
  // Cash Flow
  operating_cash_flow: '#2e2640', // Dark purple
  free_cash_flow: '#1a3a3a',    // Dark teal
  capital_expenditure: '#3a3a20', // Dark olive
  dividends_paid: '#1a3a2a',    // Dark eucalyptus
  stock_buybacks: '#3a2a3a',    // Dark plum
  // Ratio metrics
  gross_margin: '#1a3a3a',      // Dark teal
  operating_margin: '#2a4a4a',  // Teal
  net_margin: '#3a5a5a',        // Light teal
  roe: '#1a3a2a',               // Teal-green
  roa: '#2a4a3a',               // Sea teal
  pe_ratio: '#3d3520',          // Dark bronze
  // Stock Specific - Product Segments
  segment_iphone: '#1a1a2e',    // Near black
  segment_services: '#1a3a3a',  // Dark teal
  segment_wearables: '#3a3028', // Dark taupe
  segment_mac: '#252540',       // Dark navy
  segment_ipad: '#2a3540',      // Dark blue-gray
  // Stock Specific - Geographic Segments
  segment_americas: '#1a1a2e',  // Near black
  segment_europe: '#2d4a3e',    // Dark forest
  segment_china: '#4a2c2c',     // Dark burgundy
  segment_japan: '#2e2640',     // Dark purple
  segment_asia_pacific: '#1a3a3a', // Dark teal
  // Additional metrics
  rnd_expense: '#2a3540',       // Dark blue-gray
  shares_outstanding: '#2a2a3a', // Dark slate
  // Price metrics
  stock_price: '#166534',       // Forest green
}

// Dark mode colors - lighter, softer colors for contrast against dark
const METRIC_COLORS_DARK: Record<string, string> = {
  // Income Statement
  revenue: '#6b8cce',           // Soft blue (primary)
  gross_profit: '#7b9cde',      // Lighter blue
  net_income: '#7ab08a',        // Sage green
  operating_income: '#8ac09a',  // Light sage
  eps: '#b8a870',               // Khaki gold
  ebitda: '#9ad0aa',            // Mint
  depreciation_amortization: '#8898a8', // Blue gray
  stock_based_comp: '#98a8b8',  // Light blue gray
  // Balance Sheet
  total_assets: '#7898b8',      // Steel blue
  total_liabilities: '#c27878', // Dusty rose
  shareholders_equity: '#9888b8', // Lavender
  // Cash Flow
  operating_cash_flow: '#9888b8', // Lavender
  free_cash_flow: '#78a8a8',    // Light teal
  capital_expenditure: '#a8a878', // Light olive
  dividends_paid: '#78a888',    // Light eucalyptus
  stock_buybacks: '#a888a8',    // Light plum
  // Ratio metrics
  gross_margin: '#78a8a8',      // Light teal
  operating_margin: '#88b8b8',  // Lighter teal
  net_margin: '#98c8c8',        // Lightest teal
  roe: '#78a898',               // Teal-sage
  roa: '#88b8a8',               // Sea teal
  pe_ratio: '#b8a870',          // Khaki gold
  // Stock Specific - Product Segments
  segment_iphone: '#6b8cce',    // Soft blue
  segment_services: '#78a8a8',  // Light teal
  segment_wearables: '#a89888', // Light taupe
  segment_mac: '#7b9cde',       // Lighter blue
  segment_ipad: '#8898a8',      // Blue-gray
  // Stock Specific - Geographic Segments
  segment_americas: '#6b8cce',  // Soft blue
  segment_europe: '#7ab08a',    // Sage green
  segment_china: '#c27878',     // Dusty rose
  segment_japan: '#9888b8',     // Lavender
  segment_asia_pacific: '#78a8a8', // Light teal
  // Additional metrics
  rnd_expense: '#8898a8',       // Blue gray
  shares_outstanding: '#8888a8', // Slate
  // Price metrics
  stock_price: '#4ade80',       // Light green
}

// Fallback colors for light/dark modes
const FALLBACK_COLORS_LIGHT = ['#1a1a2e', '#2d4a3e', '#1a3a3a', '#2e2640']
const FALLBACK_COLORS_DARK = ['#6b8cce', '#7ab08a', '#78a8a8', '#9888b8']

// Export function to get colors based on theme
export function getMetricColors(isDark: boolean): Record<string, string> {
  return isDark ? METRIC_COLORS_DARK : METRIC_COLORS_LIGHT
}

export function getFallbackColors(isDark: boolean): string[] {
  return isDark ? FALLBACK_COLORS_DARK : FALLBACK_COLORS_LIGHT
}

// Keep DEFAULT_METRIC_COLORS for backwards compatibility (defaults to light mode)
export const DEFAULT_METRIC_COLORS = METRIC_COLORS_LIGHT

interface MultiMetricChartProps {
  data: MetricData[]
  metrics: string[]
  customColors?: Record<string, string>
  onReset?: () => void
  /** Render in clean export mode: hides controls, forces light theme, signals readiness */
  exportMode?: boolean
  /** Initial chart type (used by export mode to set without UI interaction) */
  initialChartType?: 'bar' | 'line' | 'area'
  /** Initial data labels visibility */
  initialShowLabels?: boolean
  /** Initial stacked state */
  initialStacked?: boolean
  /** Initial index-to-zero state */
  initialIndexToZero?: boolean
  /** Optional explicit chart height for export/embed surfaces */
  chartHeight?: number
  /** Callback fired after Highcharts finishes rendering */
  onChartReady?: () => void
  /** Callback to copy a newsletter export URL (shown in export dropdown when provided) */
  onCopyExportUrl?: () => void
  /** Optional Highcharts theme overrides (backward-compatible — callers without this prop are unaffected) */
  highchartsTheme?: {
    backgroundColor?: string
    textColor?: string
    gridLineColor?: string
    lineColor?: string
    tooltipBg?: string
    tooltipBorder?: string
    tooltipText?: string
    tooltipBorderRadius?: number
    columnBorderRadius?: number
    fontFamily?: string
  }
}

export default function MultiMetricChart({ data, metrics, customColors = {}, onReset, exportMode, initialChartType, initialShowLabels, initialStacked, initialIndexToZero, chartHeight, onChartReady, onCopyExportUrl, highchartsTheme: ht }: MultiMetricChartProps) {
  const [showDataLabels, setShowDataLabels] = useState(initialShowLabels ?? true)
  const [isStacked, setIsStacked] = useState(initialStacked ?? false)
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>(initialChartType ?? 'bar')
  const [indexToZero, setIndexToZero] = useState(initialIndexToZero ?? false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exportColors, setExportColors] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const isDark = exportMode ? false : theme === 'dark'
  const [isMounted, setIsMounted] = useState(false)
  const chartRef = useRef<Highcharts.Chart | null>(null)

  // Get theme-aware colors
  const METRIC_COLORS = getMetricColors(isDark)
  const FALLBACK_COLORS = getFallbackColors(isDark)
  const resolvedChartHeight = chartHeight ?? (exportMode ? 500 : 650)

  useEffect(() => {
    if (typeof window !== 'undefined' && Highcharts) {
      try {
        const HighchartsExporting = require('highcharts/modules/exporting')
        HighchartsExporting(Highcharts)
      } catch (error) {
        // Module already loaded
      }
      try {
        const HighchartsOfflineExporting = require('highcharts/modules/offline-exporting')
        HighchartsOfflineExporting(Highcharts)
      } catch (error) {
        // Module already loaded
      }
    }
    setIsMounted(true)
  }, [])

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle escape key to exit fullscreen
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Prevent body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  if (!isMounted) {
    return (
      <div
        className={`w-full animate-pulse rounded flex items-center justify-center ${exportMode ? 'bg-white' : 'bg-cream-50 dark:bg-gray-800'}`}
        style={{ height: resolvedChartHeight }}
      >
        <p className={exportMode ? 'text-gray-400' : 'text-gray-400 dark:text-gray-500'}>Loading chart...</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height: resolvedChartHeight }}>
        <p className="text-gray-600 dark:text-gray-400">No data available</p>
      </div>
    )
  }

  // Get x-axis categories from first metric (all metrics should have same categories)
  // Use fiscal_label if available (quarterly data), otherwise use year
  const isQuarterlyData = data[0].data.some((d) => d.fiscal_label)
  const categories = data[0].data.map((d) => isQuarterlyData && d.fiscal_label ? d.fiscal_label : d.year.toString())
  // Keep years for backward compatibility in tooltips and legend
  const years = isQuarterlyData ? categories : data[0].data.map((d) => d.year.toString())
  // Auto-hide data labels when chart is too dense (>20 data points)
  const isDenseChart = categories.length > 20

  // Filter data to only include metrics that are in the metrics prop
  // Also deduplicate by metric id to prevent duplicate series
  const seenMetrics = new Set<string>()
  const filteredData = data.filter((d) => {
    if (!metrics.includes(d.metric)) return false
    if (seenMetrics.has(d.metric)) return false
    seenMetrics.add(d.metric)
    return true
  })
  const showDataTableSection =
    !isFullscreen &&
    !exportMode &&
    !filteredData.every(d => isPriceMetric(d.metric))

  // Define sort order for chart bars (smaller metrics on left, larger on right)
  // Revenue should always be on the right (highest number = rightmost bar)
  const METRIC_SORT_ORDER: Record<string, number> = {
    // Ratios and small numbers (leftmost)
    pe_ratio: 1,
    eps: 2,
    // Percentages
    gross_margin: 5,
    operating_margin: 6,
    net_margin: 7,
    roe: 8,
    roa: 9,
    // Smaller currency metrics
    stock_based_comp: 20,
    depreciation_amortization: 21,
    dividends_paid: 22,
    capital_expenditure: 23,
    stock_buybacks: 24,
    net_income: 30,
    operating_income: 31,
    free_cash_flow: 32,
    operating_cash_flow: 33,
    gross_profit: 40,
    ebitda: 41,
    shareholders_equity: 50,
    total_liabilities: 51,
    total_assets: 60,
    // Revenue always rightmost
    revenue: 100,
  }

  // For metrics not in METRIC_SORT_ORDER, calculate dynamic order based on most recent year's value
  // This ensures segment metrics (iPhone, Services, etc.) are ordered by size: smallest left, largest right
  const getMostRecentValue = (metricData: MetricData): number => {
    const dataPoints = metricData.data
    if (dataPoints.length === 0) return 0
    // Get the last (most recent) year's value
    return dataPoints[dataPoints.length - 1]?.value ?? 0
  }

  // Helper to extract base metric from prefixed ID (e.g., "AAPL:revenue" -> "revenue")
  const getBaseMetric = (metricId: string): string => {
    return metricId.includes(':') ? metricId.split(':')[1] : metricId
  }

  // Helper to extract stock symbol from prefixed ID (e.g., "AAPL:revenue" -> "AAPL")
  const getStockSymbol = (metricId: string): string => {
    return metricId.includes(':') ? metricId.split(':')[0] : ''
  }

  // Sort filtered data by the defined order, or by most recent value for dynamic metrics
  // For multi-stock: group by metric first, then by stock symbol
  const sortedFilteredData = [...filteredData].sort((a, b) => {
    const baseMetricA = getBaseMetric(a.metric)
    const baseMetricB = getBaseMetric(b.metric)
    const stockA = getStockSymbol(a.metric)
    const stockB = getStockSymbol(b.metric)

    const orderA = METRIC_SORT_ORDER[baseMetricA]
    const orderB = METRIC_SORT_ORDER[baseMetricB]

    // If both have defined orders, use them (group by metric first)
    if (orderA !== undefined && orderB !== undefined) {
      if (orderA !== orderB) {
        return orderA - orderB
      }
      // Same metric, sort by stock symbol alphabetically
      return stockA.localeCompare(stockB)
    }

    // If neither has a defined order, sort by most recent year's value (smallest first)
    if (orderA === undefined && orderB === undefined) {
      const valueA = getMostRecentValue(a)
      const valueB = getMostRecentValue(b)
      if (valueA !== valueB) {
        return valueA - valueB
      }
      // Same value, sort by stock symbol
      return stockA.localeCompare(stockB)
    }

    // If only one has a defined order, put undefined ones in the middle (order ~45)
    // Compare the defined order against the dynamic value scaled to similar range
    if (orderA === undefined) {
      // a is dynamic, b has fixed order
      // Put dynamic metrics after fixed small metrics but before fixed large metrics
      return 45 - orderB
    } else {
      // b is dynamic, a has fixed order
      return orderA - 45
    }
  })

  // Check which unit types we have
  const hasCurrencyMetrics = filteredData.some((d) => d.unit === 'currency')
  const hasPercentMetrics = filteredData.some((d) => d.unit === 'percent')
  const hasNumberMetrics = filteredData.some((d) => d.unit === 'number')
  const hasSharesMetrics = filteredData.some((d) => d.unit === 'shares')
  const hasPriceMetrics = filteredData.some((d) => d.unit === 'price')

  // Determine primary axis type (most common or first)
  // Price is always secondary (goes on right axis), so never primary
  const unitCounts = { currency: 0, percent: 0, number: 0, shares: 0, price: 0 }
  filteredData.forEach((d) => { unitCounts[d.unit as keyof typeof unitCounts]++ })
  const primaryUnit = hasCurrencyMetrics ? 'currency' : hasSharesMetrics ? 'shares' : hasPercentMetrics ? 'percent' : hasPriceMetrics ? 'price' : 'number'

  // Need dual axis if mixing different unit types
  // Price always needs its own axis when combined with other metrics
  const needsDualAxis = (hasCurrencyMetrics && (hasPercentMetrics || hasNumberMetrics || hasSharesMetrics || hasPriceMetrics)) ||
                        (hasPercentMetrics && (hasNumberMetrics || hasSharesMetrics || hasPriceMetrics)) ||
                        (hasSharesMetrics && (hasNumberMetrics || hasPriceMetrics)) ||
                        (hasPriceMetrics && hasNumberMetrics)

  // Generate title
  const metricLabels = filteredData.map((d) => d.label)
  const yearRange = years.length > 0 ? `(${years[0]}-${years[years.length - 1]})` : ''
  const title = metricLabels.length <= 2
    ? `${metricLabels.join(' and ')} ${yearRange}`
    : `Financial Metrics ${yearRange}`

  // Format value for display (convert to billions for currency)
  const formatValue = (value: number, unit: string): string => {
    if (unit === 'currency') {
      const billions = value / 1_000_000_000
      return `$${billions.toFixed(1)}B`
    }
    return value.toFixed(2)
  }

  // Calculate total change percentage from first to last value
  const calculateTotalChange = (dataPoints: { year: number; value: number }[]): number | null => {
    if (dataPoints.length < 2) return null
    const firstValue = dataPoints[0].value
    const lastValue = dataPoints[dataPoints.length - 1].value
    if (firstValue === 0) return null
    return ((lastValue - firstValue) / Math.abs(firstValue)) * 100
  }

  // Calculate CAGR (Compound Annual Growth Rate)
  const calculateCAGR = (dataPoints: { year: number; value: number }[]): number | null => {
    if (dataPoints.length < 2) return null
    const firstValue = dataPoints[0].value
    const lastValue = dataPoints[dataPoints.length - 1].value
    const years = dataPoints[dataPoints.length - 1].year - dataPoints[0].year
    if (firstValue <= 0 || lastValue <= 0 || years === 0) return null
    return (Math.pow(lastValue / firstValue, 1 / years) - 1) * 100
  }

  // Format percentage with sign
  const formatPct = (value: number | null): string => {
    if (value === null) return 'N/A'
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
  }

  // Check if we have any price data with timestamps (monthly data has many more data points)
  const hasPriceWithTimestamps = filteredData.some(
    (d) => isPriceMetric(d.metric) && d.data.some((p) => p.timestamp)
  )

  // Build series data (use sortedFilteredData for bar order)
  const series: Highcharts.SeriesOptionsType[] = sortedFilteredData.map((metricData, index) => {
    const isCurrency = metricData.unit === 'currency'
    const isShares = metricData.unit === 'shares'
    const isPrice = metricData.unit === 'price'
    const isThisPriceMetric = isPriceMetric(metricData.metric)

    // For datetime axis, build data as [[timestamp, value], ...] format
    // For price metrics with timestamps, use full monthly data
    // For financial metrics, use their period_end_date timestamps
    let dataPoints: [number, number][] = metricData.data.map((d) => {
      const rawValue = isCurrency || isShares ? d.value / 1_000_000_000 : d.value
      // Use timestamp from data if available, fallback to Dec 31 of year
      const timestamp = d.timestamp ?? Date.UTC(d.year, 11, 31)
      return [timestamp, rawValue]
    })

    // Apply "Index to 0" transformation if enabled
    if (indexToZero && dataPoints.length > 0) {
      const baseValue = dataPoints[0][1]
      if (baseValue !== 0) {
        dataPoints = dataPoints.map(([ts, v]) => [ts, ((v - baseValue) / Math.abs(baseValue)) * 100])
      }
    }

    // Use custom color if provided, otherwise use theme-aware color, fall back to index-based color
    const color = customColors[metricData.metric] ?? METRIC_COLORS[metricData.metric] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

    // Determine which Y-axis to use (not needed when indexed - all use same scale)
    const useSecondaryAxis = !indexToZero && needsDualAxis && metricData.unit !== primaryUnit

    // Price metrics always display as lines, regardless of chart type setting
    const seriesType = isThisPriceMetric
      ? 'line'
      : chartType === 'line' ? 'line' : chartType === 'area' ? 'area' : 'column'

    // Reduce marker density for monthly price data (many points)
    const markerOptions = isThisPriceMetric && dataPoints.length > 20
      ? { enabled: false, states: { hover: { enabled: true, radius: 4 } } }
      : seriesType === 'line' || chartType === 'area' ? { enabled: true, radius: 4 } : undefined

    return {
      type: seriesType,
      name: metricData.label,
      data: dataPoints,
      color,
      yAxis: useSecondaryAxis ? 1 : 0,
      marker: markerOptions,
      // Ensure price line renders on top of bars
      zIndex: isThisPriceMetric ? 10 : 1,
      // Never show data labels on price series (too many points, clutters the chart)
      ...(isThisPriceMetric && { dataLabels: { enabled: false } }),
    }
  })

  // Helper to get Y-axis title based on unit type
  const getAxisTitle = (unit: 'currency' | 'percent' | 'number' | 'shares' | 'price') => {
    if (unit === 'currency') return 'USD (Billions)'
    if (unit === 'shares') return 'Shares (Billions)'
    if (unit === 'percent') return 'Percentage (%)'
    if (unit === 'price') return 'Stock Price ($)'
    return filteredData.find((d) => d.unit === 'number')?.label || 'Value'
  }

  // Helper to format Y-axis labels based on unit type
  const getAxisFormatter = (unit: 'currency' | 'percent' | 'number' | 'shares' | 'price') => {
    return function (this: Highcharts.AxisLabelsFormatterContextObject) {
      const val = typeof this.value === 'number' ? this.value : Number(this.value)
      // When indexed, always show as percentage change
      if (indexToZero) {
        const sign = val >= 0 ? '+' : ''
        return `${sign}${val.toFixed(0)}%`
      }
      if (unit === 'currency') return `$${val}B`
      if (unit === 'shares') return `${val}B`
      if (unit === 'percent') return `${val.toFixed(1)}%`
      if (unit === 'price') return `$${val.toFixed(0)}`
      return val.toLocaleString()
    }
  }

  // Build Y-axes configuration
  const yAxis: Highcharts.YAxisOptions[] = [
    {
      title: {
        text: undefined,
      },
      labels: {
        style: {
          fontSize: exportMode ? '22px' : '12px',
          color: ht?.textColor ?? (isDark ? '#9ca3af' : '#6b7280'),
        },
        formatter: getAxisFormatter(primaryUnit),
      },
      gridLineColor: ht?.gridLineColor ?? (isDark ? 'rgb(75, 75, 75)' : '#d1d5db'),
      opposite: true,
      lineWidth: 2,
      lineColor: ht?.lineColor ?? (isDark ? '#6b7280' : '#374151'),
    },
  ]

  // Add second Y-axis if needed (for secondary unit type)
  // This axis is on the left side (opposite: false) since the primary axis is now on the right
  if (needsDualAxis) {
    // Find the secondary unit type
    // Price should be on secondary axis when combined with currency (most common case)
    const secondaryUnit: 'currency' | 'percent' | 'number' | 'price' =
      primaryUnit === 'currency'
        ? (hasPriceMetrics ? 'price' : hasPercentMetrics ? 'percent' : 'number')
        : (primaryUnit === 'percent' ? (hasPriceMetrics ? 'price' : hasNumberMetrics ? 'number' : 'currency')
          : primaryUnit === 'shares' ? (hasPriceMetrics ? 'price' : hasPercentMetrics ? 'percent' : hasNumberMetrics ? 'number' : 'currency')
          : primaryUnit === 'price' ? (hasCurrencyMetrics ? 'currency' : hasPercentMetrics ? 'percent' : 'number')
          : 'currency')

    yAxis.push({
      title: {
        text: undefined,
      },
      labels: {
        style: {
          fontSize: exportMode ? '22px' : '12px',
          color: ht?.textColor ?? (isDark ? '#9ca3af' : '#6b7280'),
        },
        formatter: getAxisFormatter(secondaryUnit),
      },
      opposite: false,
      gridLineWidth: 0,
      lineWidth: 2,
      lineColor: ht?.lineColor ?? (isDark ? '#6b7280' : '#374151'),
    })
  }

  // Calculate min/max timestamps from bar data (non-price metrics) to set explicit axis limits
  // This prevents bars from being cut off at the edges
  const barTimestamps: number[] = []
  sortedFilteredData.forEach((metricData) => {
    if (!isPriceMetric(metricData.metric)) {
      metricData.data.forEach((d) => {
        const timestamp = d.timestamp ?? Date.UTC(d.year, 11, 31)
        barTimestamps.push(timestamp)
      })
    }
  })

  // Add buffer for bar width: half a year on each side for annual, ~45 days for quarterly
  const halfBarWidth = isQuarterlyData
    ? 45 * 24 * 3600 * 1000  // ~45 days for quarterly
    : 183 * 24 * 3600 * 1000 // ~6 months for annual

  const xAxisMin = barTimestamps.length > 0
    ? Math.min(...barTimestamps) - halfBarWidth
    : undefined
  const xAxisMax = barTimestamps.length > 0
    ? Math.max(...barTimestamps) + halfBarWidth
    : undefined

  // Smart y-axis floor: limit negative space when data is mostly positive
  // For each axis, if the minimum value is only slightly negative relative to the
  // max, clamp the axis floor so the chart doesn't waste half the space below zero.
  yAxis.forEach((axis, axisIndex) => {
    const axisValues: number[] = []
    sortedFilteredData.forEach((metricData) => {
      const metricUnit = metricData.unit
      const isSecondaryUnit = axisIndex === 1
      const isPrimary = axisIndex === 0

      // Determine which axis this metric belongs to
      const metricOnPrimary = metricUnit === primaryUnit || (metricUnit === 'shares' && primaryUnit === 'shares')
      if ((isPrimary && !metricOnPrimary && needsDualAxis) || (isSecondaryUnit && metricOnPrimary)) return

      metricData.data.forEach((d) => {
        if (d.value != null) {
          const scaledValue = (metricUnit === 'currency' || metricUnit === 'shares')
            ? d.value / 1_000_000_000
            : d.value
          axisValues.push(scaledValue)
        }
      })
    })

    if (axisValues.length === 0) return

    const minVal = Math.min(...axisValues)
    const maxVal = Math.max(...axisValues)

    // Only adjust when data is mostly positive but has small negative values
    if (minVal < 0 && maxVal > 0) {
      const range = maxVal - minVal
      const negativeRatio = Math.abs(minVal) / range

      // If negative values are less than 15% of the total range,
      // set a tight floor with just a small buffer below the min
      if (negativeRatio < 0.15) {
        const buffer = Math.abs(minVal) * 0.5
        axis.floor = minVal - buffer
        axis.softMin = minVal - buffer
      }
    }
  })

  const options: Highcharts.Options = {
    chart: {
      type: 'column',
      height: resolvedChartHeight,
      backgroundColor: exportMode ? '#ffffff' : exportColors ? (isDark ? 'rgb(45, 45, 45)' : '#ffffff') : (ht?.backgroundColor ?? 'transparent'),
      animation: false,
      style: {
        fontFamily: ht?.fontFamily ?? 'inherit',
      },
      spacingBottom: exportMode ? 8 : 20,
      zooming: {
        type: 'x',
        mouseWheel: { enabled: true },
      },
      panning: { enabled: true, type: 'x' },
      panKey: 'shift',
    },
    title: {
      text: undefined,
    },
    xAxis: {
      type: 'datetime',
      title: {
        text: undefined,
      },
      dateTimeLabelFormats: {
        year: '%Y',
      },
      tickInterval: 365.25 * 24 * 3600 * 1000, // One year in milliseconds
      labels: {
        format: isQuarterlyData ? '{value:%Y Q%q}' : '{value:%Y}',
        style: {
          fontSize: exportMode ? '22px' : (isQuarterlyData ? '10px' : '12px'),
          color: ht?.textColor ?? (isDark ? '#9ca3af' : '#6b7280'),
        },
        rotation: isQuarterlyData && categories.length > 16 ? -45 : 0,
      },
      gridLineWidth: 0,
      lineWidth: 2,
      lineColor: ht?.lineColor ?? (isDark ? '#6b7280' : '#374151'),
      // Set explicit min/max to prevent bars from being cut off at edges
      // Buffer accounts for bar width (bars are centered on their timestamp)
      min: xAxisMin,
      max: xAxisMax,
    },
    yAxis,
    legend: {
      enabled: false,
    },
    plotOptions: {
      column: {
        animation: false,
        borderRadius: isStacked ? 0 : (ht?.columnBorderRadius ?? 4),
        borderWidth: 0,
        groupPadding: isStacked ? 0.2 : 0.15,
        pointPadding: isStacked ? 0.1 : 0.05,
        stacking: (isStacked && chartType === 'bar') ? 'normal' : undefined,
        pointPlacement: 'on', // Center columns on their timestamp for datetime axis
        // Set pointRange to tell Highcharts each bar represents a year (annual) or quarter (quarterly)
        // This ensures proper bar width when mixed with monthly price data
        pointRange: isQuarterlyData
          ? 90 * 24 * 3600 * 1000  // ~90 days for quarterly
          : 365 * 24 * 3600 * 1000, // 1 year for annual
        dataLabels: {
          enabled: showDataLabels && !isDenseChart,
          verticalAlign: isStacked ? 'middle' : 'bottom',
          y: isStacked ? 0 : (exportMode ? -8 : -5),
          style: {
            fontSize: exportMode ? '20px' : '11px',
            fontWeight: exportMode ? '600' : '500',
            color: isStacked ? '#ffffff' : (isDark ? '#e5e7eb' : '#374151'),
            textOutline: isStacked ? '1px rgba(0, 0, 0, 0.3)' : (isDark ? '1px rgb(45, 45, 45)' : '1px #ffffff'),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: function (this: any) {
            const point = this.point
            const seriesName = this.series.name
            const metricInfo = filteredData.find((d) => d.label === seriesName)
            const unit = metricInfo?.unit
            const val = point.y ?? 0
            // When indexed, show as percentage change
            if (indexToZero) {
              const sign = val >= 0 ? '+' : ''
              return `${sign}${val.toFixed(1)}%`
            }
            // For stacked charts, hide small values to avoid clutter
            if (isStacked && chartType === 'bar' && (unit === 'currency' || unit === 'shares') && Math.abs(val) < 5) return ''
            if (unit === 'currency') return val.toFixed(1)
            if (unit === 'shares') return val.toFixed(1)
            if (unit === 'percent') return `${val.toFixed(1)}%`
            if (unit === 'price') return `$${val.toFixed(0)}`
            return val.toFixed(2)
          },
        },
      },
      line: {
        animation: false,
        lineWidth: exportMode ? 3 : 2,
        dataLabels: {
          enabled: showDataLabels && !isDenseChart,
          style: {
            fontSize: exportMode ? '20px' : '11px',
            fontWeight: exportMode ? '600' : '500',
            color: isDark ? '#e5e7eb' : '#374151',
            textOutline: isDark ? '1px rgb(45, 45, 45)' : '1px #ffffff',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: function (this: any) {
            const point = this.point
            const seriesName = this.series.name
            const metricInfo = filteredData.find((d) => d.label === seriesName)
            const unit = metricInfo?.unit
            const val = point.y ?? 0
            // When indexed, show as percentage change
            if (indexToZero) {
              const sign = val >= 0 ? '+' : ''
              return `${sign}${val.toFixed(1)}%`
            }
            if (unit === 'currency') return val.toFixed(1)
            if (unit === 'shares') return val.toFixed(1)
            if (unit === 'percent') return `${val.toFixed(1)}%`
            if (unit === 'price') return `$${val.toFixed(0)}`
            return val.toFixed(2)
          },
        },
      },
      area: {
        animation: false,
        lineWidth: exportMode ? 3 : 2,
        fillOpacity: 0.6,
        stacking: 'normal',
        dataLabels: {
          enabled: showDataLabels && !isDenseChart,
          verticalAlign: exportMode ? 'bottom' : 'middle',
          y: exportMode ? -12 : 0,
          style: {
            fontSize: exportMode ? '20px' : '11px',
            fontWeight: exportMode ? '600' : '500',
            color: exportMode ? '#374151' : '#ffffff',
            textOutline: exportMode ? '2px #ffffff' : '1px rgba(0, 0, 0, 0.3)',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: function (this: any) {
            const point = this.point
            const seriesName = this.series.name
            const metricInfo = filteredData.find((d) => d.label === seriesName)
            const unit = metricInfo?.unit
            const val = point.y ?? 0
            // When indexed, show as percentage change
            if (indexToZero) {
              const sign = val >= 0 ? '+' : ''
              return `${sign}${val.toFixed(1)}%`
            }
            // Hide small values to avoid clutter
            if ((unit === 'currency' || unit === 'shares') && Math.abs(val) < 5) return ''
            if (unit === 'currency') return val.toFixed(1)
            if (unit === 'shares') return val.toFixed(1)
            if (unit === 'percent') return `${val.toFixed(1)}%`
            if (unit === 'price') return `$${val.toFixed(0)}`
            return val.toFixed(2)
          },
        },
      },
      series: {
        animation: false,
      },
    },
    series,
    credits: {
      enabled: false,
    },
    accessibility: {
      enabled: false,
    },
    exporting: {
      enabled: true,
      fallbackToExportServer: false,
      sourceWidth: 1200,
      sourceHeight: 650,
      buttons: {
        contextButton: {
          enabled: false,
        },
      },
      filename: 'financials_chart',
    },
    tooltip: {
      backgroundColor: ht?.tooltipBg ?? (isDark ? '#1f2937' : '#ffffff'),
      borderColor: ht?.tooltipBorder ?? (isDark ? '#374151' : '#e5e7eb'),
      borderRadius: ht?.tooltipBorderRadius ?? 8,
      borderWidth: 1,
      shared: false,
      style: {
        fontSize: '12px',
        fontFamily: ht?.fontFamily ?? undefined,
        color: ht?.tooltipText ?? (isDark ? '#f9fafb' : '#1f2937'),
      },
      positioner: function (labelWidth, labelHeight, point) {
        // Position tooltip above the point
        const chart = this.chart
        let x = point.plotX + chart.plotLeft - labelWidth / 2
        let y = point.plotY + chart.plotTop - labelHeight - 10

        // Keep tooltip within chart bounds
        x = Math.max(chart.plotLeft, Math.min(x, chart.plotLeft + chart.plotWidth - labelWidth))
        y = Math.max(10, y)

        return { x, y }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: function (this: any) {
        const point = this.point || this
        const seriesName = this.series?.name || ''
        // With datetime axis, this.x is a timestamp
        const timestamp = this.x as number
        const date = new Date(timestamp)
        const year = date.getUTCFullYear()
        const month = date.getUTCMonth()
        const metricInfo = filteredData.find((d) => d.label === seriesName)
        const isMonthlyPrice = metricInfo && isPriceMetric(metricInfo.metric) && metricInfo.data.length > 20
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const periodLabel = isMonthlyPrice
          ? `${monthNames[month]} ${year}`
          : isQuarterlyData
            ? `Q${Math.floor(month / 3) + 1} ${year}`
            : `FY ${year}`

        const unit = metricInfo?.unit
        const val = point.y ?? 0
        let displayValue: string
        if (indexToZero) {
          const sign = val >= 0 ? '+' : ''
          displayValue = `${sign}${val.toFixed(1)}%`
        } else if (unit === 'currency') {
          displayValue = `$${val.toFixed(1)}B`
        } else if (unit === 'shares') {
          displayValue = `${val.toFixed(2)}B shares`
        } else if (unit === 'percent') {
          displayValue = `${val.toFixed(1)}%`
        } else if (unit === 'price') {
          displayValue = `$${val.toFixed(2)}`
        } else {
          displayValue = val.toFixed(2)
        }

        const tooltipLabel = metricInfo ? metricInfo.label : seriesName
        const color = point.color || this.series?.color || '#888'

        return `<div style="font-weight: 600; margin-bottom: 8px;">${periodLabel}</div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; background-color: ${color}; border-radius: 50%; flex-shrink: 0;"></span>
            <span>${tooltipLabel}: <strong>${displayValue}</strong></span>
          </div>`
      },
      useHTML: true,
    },
    responsive: {
      rules: [
        {
          condition: {
            maxWidth: 500,
          },
          chartOptions: {
            chart: {
              height: 300,
            },
            legend: {
              layout: 'horizontal',
              align: 'center',
              verticalAlign: 'bottom',
            },
            xAxis: {
              labels: {
                rotation: -45,
                style: {
                  fontSize: '10px',
                },
              },
            },
          },
        },
      ],
    },
  }

  // Copy table data to clipboard
  const copyToClipboard = () => {
    const headers = ['Year', ...filteredData.map((d) => d.label)]
    const rows = years.map((year, i) => {
      const values = filteredData.map((d) => {
        const value = d.data[i]?.value || 0
        if (d.unit === 'currency') return (value / 1_000_000_000).toFixed(2)
        if (d.unit === 'percent') return value.toFixed(2)
        return value.toFixed(2)
      })
      return [year, ...values]
    })

    const csvData = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    navigator.clipboard.writeText(csvData).then(() => {
      alert('Data copied to clipboard!')
    }).catch((err) => {
      console.error('Copy failed:', err)
    })
  }

  // Create a stable key based on the metrics being displayed and options
  const chartKey = `${[...metrics].sort().join('-')}-labels-${showDataLabels}-stacked-${isStacked}-type-${chartType}-indexed-${indexToZero}-exportColors-${exportColors}`

  // Build legend data with stats
  const legendItems = sortedFilteredData.map((metricData, index) => {
    const color = customColors[metricData.metric] ?? METRIC_COLORS[metricData.metric] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
    const totalChange = calculateTotalChange(metricData.data)
    const cagr = calculateCAGR(metricData.data)
    return {
      label: metricData.label,
      color,
      totalChange,
      cagr,
    }
  })

  return (
    <div
      ref={containerRef}
      className={`${!exportMode && isFullscreen
        ? 'fixed inset-0 z-50 bg-white dark:bg-gray-800 p-6 overflow-auto'
        : 'w-full'
      }`}
    >
      {/* Fullscreen close button */}
      {isFullscreen && !exportMode && (
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Exit fullscreen (Esc)"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <HighchartsReact
        key={`${chartKey}-fullscreen-${isFullscreen}-export-${!!exportMode}`}
        highcharts={Highcharts}
        options={{
          ...options,
          chart: {
            ...options.chart,
            height: exportMode ? resolvedChartHeight : (isFullscreen ? window.innerHeight - 100 : resolvedChartHeight),
          },
        }}
        callback={(chart: Highcharts.Chart) => {
          chartRef.current = chart
          if (exportMode) onChartReady?.()
        }}
      />

      {/* Custom Legend + Controls Row */}
      <div className={`flex items-start ${exportMode ? 'mb-1' : 'justify-between mb-4'} mt-2 gap-4`}>
        {/* Legend - stacked vertically */}
        <div className="flex flex-col gap-1">
          {legendItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className={`${exportMode ? 'w-5 h-5' : 'w-3 h-3'} rounded-full flex-shrink-0`}
                style={{ backgroundColor: item.color }}
              />
              <span className={`${exportMode ? 'text-xl' : 'text-sm'} ${exportMode ? 'text-gray-700' : 'text-gray-700 dark:text-gray-300'}`}>
                {item.label} ({years[0]}-{years[years.length - 1]}: {formatPct(item.totalChange)} | CAGR: {formatPct(item.cagr)})
              </span>
            </div>
          ))}
        </div>

        {/* Controls - hidden in export mode */}
        {!exportMode && <div className="flex items-center gap-4 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer" title="Switch to white background with export-friendly colors">
            <input
              type="checkbox"
              checked={exportColors}
              onChange={(e) => setExportColors(e.target.checked)}
              className="w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-sage-500 focus:ring-2"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Export Colors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showDataLabels}
              onChange={(e) => setShowDataLabels(e.target.checked)}
              className="w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-sage-500 focus:ring-2"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show Labels</span>
          </label>
          <label className={`flex items-center gap-2 cursor-pointer ${chartType !== 'bar' ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="checkbox"
              checked={isStacked || chartType === 'area'}
              onChange={(e) => setIsStacked(e.target.checked)}
              disabled={chartType !== 'bar'}
              className="w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-sage-500 focus:ring-2 disabled:opacity-50"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Stacked</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer" title="Normalize all metrics to show % change from first year">
            <input
              type="checkbox"
              checked={indexToZero}
              onChange={(e) => setIndexToZero(e.target.checked)}
              className="w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-sage-500 focus:ring-2"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Index to 0</span>
          </label>
          <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2 py-1 text-sm flex items-center gap-1 ${
                chartType === 'bar'
                  ? 'bg-sage-500 text-white'
                  : 'bg-cream-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="10" width="4" height="10" rx="1" />
                <rect x="10" y="6" width="4" height="14" rx="1" />
                <rect x="16" y="2" width="4" height="18" rx="1" />
              </svg>
              Bar
            </button>
            <button
              onClick={() => { setChartType('line'); setIsStacked(false) }}
              className={`px-2 py-1 text-sm flex items-center gap-1 ${
                chartType === 'line'
                  ? 'bg-sage-500 text-white'
                  : 'bg-cream-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
              </svg>
              Line
            </button>
            <button
              onClick={() => { setChartType('area'); setIsStacked(false) }}
              className={`px-2 py-1 text-sm flex items-center gap-1 ${
                chartType === 'area'
                  ? 'bg-sage-500 text-white'
                  : 'bg-cream-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 17l6-6 4 4 8-8v10H3v0z" opacity="0.6" />
                <path d="M3 17l6-6 4 4 8-8" fill="none" stroke="currentColor" strokeWidth={2} />
              </svg>
              Area
            </button>
          </div>
          {onReset && (
            <button
              onClick={onReset}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset Chart
            </button>
          )}
          <div ref={exportMenuRef} className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className={`w-3 h-3 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                <button
                  onClick={() => { (chartRef.current as any)?.exportChart({ type: 'image/png' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-700"
                >
                  Download PNG
                </button>
                <button
                  onClick={() => { (chartRef.current as any)?.exportChart({ type: 'image/jpeg' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-700"
                >
                  Download JPEG
                </button>
                <button
                  onClick={() => { (chartRef.current as any)?.exportChart({ type: 'application/pdf' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-700"
                >
                  Download PDF
                </button>
                {onCopyExportUrl && (
                  <>
                    <div className="border-t border-cream-200 dark:border-gray-600 my-1" />
                    <button
                      onClick={() => { onCopyExportUrl(); setShowExportMenu(false) }}
                      className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-700"
                    >
                      Copy Newsletter URL
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium flex items-center gap-1"
            title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>}
      </div>

      {/* Data Table - hidden in fullscreen, export mode, and when only stock price is shown */}
      {showDataTableSection && (
      <div className="bg-cream-50 dark:bg-gray-800 border border-cream-300 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full table-fixed divide-y divide-cream-200 dark:divide-gray-700">
          <thead className="bg-cream-50 dark:bg-gray-900">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[200px]">
                Metric
              </th>
              {years.map((year, yearIndex) => (
                <th
                  key={`year-header-${yearIndex}`}
                  className="px-1 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-cream-200 dark:divide-gray-700">
            {filteredData.map((metricData) => {
              // For price metrics with monthly data, extract year-end values for table display
              const isMonthlyPriceData = isPriceMetric(metricData.metric) && metricData.data.length > years.length

              // Build a map of year -> year-end value for price metrics
              const yearEndValues: Record<string, number> = {}
              if (isMonthlyPriceData) {
                metricData.data.forEach((d) => {
                  const yearKey = String(d.year)
                  // For each year, keep the latest value (December)
                  if (d.date) {
                    const month = new Date(d.date).getMonth()
                    if (month === 11 || !yearEndValues[yearKey]) { // December or first value for year
                      yearEndValues[yearKey] = d.value
                    }
                  } else {
                    yearEndValues[yearKey] = d.value
                  }
                })
              }

              return (
                <tr key={metricData.metric} className="hover:bg-cream-50 dark:hover:bg-gray-700">
                  <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {metricData.label}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal ml-1">
                      {metricData.unit === 'currency' ? '($B)' : metricData.unit === 'shares' ? '(B shares)' : metricData.unit === 'percent' ? '(%)' : metricData.unit === 'price' ? '($)' : ''}
                    </span>
                  </td>
                  {years.map((year, yearIndex) => {
                    // For monthly price data, use year-end value; otherwise use index-based value
                    const value = isMonthlyPriceData
                      ? (yearEndValues[year] || 0)
                      : (metricData.data[yearIndex]?.value || 0)
                    let displayValue: string
                    if (metricData.unit === 'currency') {
                      displayValue = `$${(value / 1_000_000_000).toFixed(1)}B`
                    } else if (metricData.unit === 'shares') {
                      displayValue = `${(value / 1_000_000_000).toFixed(2)}B`
                    } else if (metricData.unit === 'percent') {
                      displayValue = `${value.toFixed(1)}%`
                    } else if (metricData.unit === 'price') {
                      displayValue = `$${value.toFixed(2)}`
                    } else {
                      displayValue = value.toFixed(2)
                    }

                    return (
                      <td
                        key={`${metricData.metric}-${yearIndex}`}
                        className="px-1 py-2 text-sm text-gray-900 dark:text-gray-100 text-right"
                      >
                        {displayValue}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
