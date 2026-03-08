'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import { getMultipleMetrics, type MetricData, type MetricId } from '@/app/actions/chart-metrics'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

// Color palette for metrics
const COLOR_PALETTE_LIGHT = [
  '#1a1a2e', '#2d4a3e', '#4a2c2c', '#3d3520', '#1a3a3a', '#2e2640',
]

const COLOR_PALETTE_DARK = [
  '#6b8cce', '#7ab08a', '#c27878', '#b8a870', '#78a8a8', '#9888b8',
]

interface MiniChartPanelProps {
  title: string
  symbol: string
  metrics: MetricId[]
  height?: number
  colorIndex?: number
}

export default function MiniChartPanel({ title, symbol, metrics, height = 300, colorIndex = 0 }: MiniChartPanelProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const COLOR_PALETTE = isDark ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT

  const [periodType, setPeriodType] = useState<'annual' | 'quarterly'>('annual')
  const [metricsData, setMetricsData] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Year range state
  const [yearBounds, setYearBounds] = useState<{ min: number; max: number } | null>(null)
  const [minYear, setMinYear] = useState<number | null>(null)
  const [maxYear, setMaxYear] = useState<number | null>(null)
  const [initialRangeSet, setInitialRangeSet] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [sliderWidth, setSliderWidth] = useState(0)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Measure slider width
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

  // Reset year bounds when period type changes
  useEffect(() => {
    setYearBounds(null)
    setInitialRangeSet(false)
  }, [periodType])

  // Fetch data
  const fetchData = useCallback(async () => {
    if (metrics.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const result = await getMultipleMetrics({
        symbol,
        metrics,
        minYear: minYear ?? undefined,
        maxYear: maxYear ?? undefined,
        period: periodType,
      })

      if (result.error) {
        setError(result.error)
        setMetricsData([])
      } else {
        setMetricsData(result.data || [])

        // Set year bounds from result
        if (result.yearBounds && !yearBounds) {
          setYearBounds(result.yearBounds)
          if (!initialRangeSet) {
            // Default to last 7 years
            const defaultMin = Math.max(result.yearBounds.min, result.yearBounds.max - 6)
            setMinYear(defaultMin)
            setMaxYear(result.yearBounds.max)
            setInitialRangeSet(true)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setMetricsData([])
    } finally {
      setLoading(false)
    }
  }, [symbol, metrics, periodType, minYear, maxYear, yearBounds, initialRangeSet])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Slider calculations
  const sliderYears = yearBounds
    ? Array.from({ length: yearBounds.max - yearBounds.min + 1 }, (_, i) => yearBounds.min + i)
    : []
  const minSliderValue = minYear ?? yearBounds?.min ?? 0
  const maxSliderValue = maxYear ?? yearBounds?.max ?? 0
  const sliderSpan = yearBounds ? Math.max(yearBounds.max - yearBounds.min, 1) : 1
  const minPercent = yearBounds ? ((minSliderValue - yearBounds.min) / sliderSpan) * 100 : 0
  const maxPercent = yearBounds ? ((maxSliderValue - yearBounds.min) / sliderSpan) * 100 : 0
  const minThumbOnTop = minSliderValue >= maxSliderValue - 1

  const handleSliderMinChange = (value: number) => {
    if (!yearBounds) return
    const clamped = Math.min(Math.max(value, yearBounds.min), yearBounds.max)
    setMinYear(clamped)
    if (maxYear !== null && clamped > maxYear) {
      setMaxYear(clamped)
    }
  }

  const handleSliderMaxChange = (value: number) => {
    if (!yearBounds) return
    const clamped = Math.min(Math.max(value, yearBounds.min), yearBounds.max)
    setMaxYear(clamped)
    if (minYear !== null && clamped < minYear) {
      setMinYear(clamped)
    }
  }

  // Build chart options
  const chartOptions = useMemo(() => {
    if (!metricsData.length) return null

    const isQuarterlyData = metricsData[0]?.data.some((d) => d.fiscal_label)

    // Check unit types
    const hasCurrencyMetrics = metricsData.some((d) => d.unit === 'currency')
    const hasPercentMetrics = metricsData.some((d) => d.unit === 'percent')
    const primaryUnit = hasCurrencyMetrics ? 'currency' : hasPercentMetrics ? 'percent' : 'number'
    const needsDualAxis = hasCurrencyMetrics && hasPercentMetrics

    // Build series
    const series: Highcharts.SeriesOptionsType[] = metricsData.map((metricData, index) => {
      const isCurrency = metricData.unit === 'currency'
      const color = COLOR_PALETTE[(index + colorIndex) % COLOR_PALETTE.length]

      const dataPoints: [number, number][] = metricData.data.map((d) => {
        const rawValue = isCurrency ? d.value / 1_000_000_000 : d.value
        const timestamp = d.timestamp ?? Date.UTC(d.year, 11, 31)
        return [timestamp, rawValue]
      })

      return {
        type: 'column' as const,
        name: metricData.label,
        data: dataPoints,
        color,
        yAxis: needsDualAxis && metricData.unit !== primaryUnit ? 1 : 0,
      }
    })

    // Y-axis formatter
    const getAxisFormatter = (unit: string) => {
      return function (this: Highcharts.AxisLabelsFormatterContextObject) {
        const val = typeof this.value === 'number' ? this.value : Number(this.value)
        if (unit === 'currency') return `$${val}B`
        if (unit === 'percent') return `${val.toFixed(0)}%`
        return val.toLocaleString()
      }
    }

    // Build Y-axes
    const yAxis: Highcharts.YAxisOptions[] = [
      {
        title: { text: undefined },
        labels: {
          style: { fontSize: '10px', color: isDark ? '#9ca3af' : '#6b7280' },
          formatter: getAxisFormatter(primaryUnit),
        },
        gridLineColor: isDark ? 'rgb(75, 75, 75)' : '#e5e7eb',
        opposite: true,
      },
    ]

    if (needsDualAxis) {
      yAxis.push({
        title: { text: undefined },
        labels: {
          style: { fontSize: '10px', color: isDark ? '#9ca3af' : '#6b7280' },
          formatter: getAxisFormatter('percent'),
        },
        opposite: false,
        gridLineWidth: 0,
      })
    }

    // Calculate x-axis bounds
    const timestamps: number[] = []
    metricsData.forEach((m) => {
      m.data.forEach((d) => {
        timestamps.push(d.timestamp ?? Date.UTC(d.year, 11, 31))
      })
    })
    const halfBarWidth = isQuarterlyData ? 45 * 24 * 3600 * 1000 : 183 * 24 * 3600 * 1000
    const xAxisMin = timestamps.length ? Math.min(...timestamps) - halfBarWidth : undefined
    const xAxisMax = timestamps.length ? Math.max(...timestamps) + halfBarWidth : undefined

    return {
      chart: {
        type: 'column',
        height,
        backgroundColor: 'transparent',
        animation: false,
        style: { fontFamily: 'inherit' },
        spacingTop: 10,
        spacingBottom: 5,
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        dateTimeLabelFormats: { year: '%Y' },
        tickInterval: 365.25 * 24 * 3600 * 1000,
        labels: {
          format: isQuarterlyData ? '{value:%y}' : '{value:%Y}',
          style: { fontSize: '10px', color: isDark ? '#9ca3af' : '#6b7280' },
        },
        gridLineWidth: 0,
        lineWidth: 1,
        lineColor: isDark ? '#4b5563' : '#d1d5db',
        min: xAxisMin,
        max: xAxisMax,
      },
      yAxis,
      legend: { enabled: false },
      plotOptions: {
        column: {
          animation: false,
          borderRadius: 3,
          borderWidth: 0,
          groupPadding: 0.15,
          pointPadding: 0.05,
          pointPlacement: 'on',
          pointRange: isQuarterlyData ? 90 * 24 * 3600 * 1000 : 365 * 24 * 3600 * 1000,
          dataLabels: { enabled: false },
        },
      },
      series,
      credits: { enabled: false },
      accessibility: { enabled: false },
      exporting: { enabled: false },
      tooltip: {
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        borderRadius: 6,
        borderWidth: 1,
        shared: true,
        style: { fontSize: '11px', color: isDark ? '#f9fafb' : '#1f2937' },
        formatter: function () {
          const points = this.points || []
          const timestamp = this.x as number
          const date = new Date(timestamp)
          const year = date.getUTCFullYear()
          let html = `<div style="font-weight: 600; margin-bottom: 4px;">FY ${year}</div>`

          points.forEach((point) => {
            const metricInfo = metricsData.find((d) => d.label === point.series.name)
            const unit = metricInfo?.unit
            const val = point.y ?? 0
            let displayValue: string
            if (unit === 'currency') {
              displayValue = `$${val.toFixed(1)}B`
            } else if (unit === 'percent') {
              displayValue = `${val.toFixed(1)}%`
            } else {
              displayValue = val.toFixed(2)
            }
            html += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
              <span style="width: 8px; height: 8px; background-color: ${point.color}; border-radius: 50%;"></span>
              <span>${point.series.name}: <strong>${displayValue}</strong></span>
            </div>`
          })
          return html
        },
        useHTML: true,
      },
    } as Highcharts.Options
  }, [metricsData, height, isDark, COLOR_PALETTE])

  // Legend items
  const legendItems = metricsData.map((d, i) => ({
    label: d.label,
    color: COLOR_PALETTE[(i + colorIndex) % COLOR_PALETTE.length],
  }))

  if (!isMounted) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-cream-300 dark:border-gray-700 p-4">
        <div className="h-[300px] bg-cream-50 dark:bg-gray-700 animate-pulse rounded" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-cream-300 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cream-300 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{symbol}</span>
        </div>
        {/* Period Toggle */}
        <div className="flex items-center gap-1 bg-cream-50 dark:bg-gray-700 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setPeriodType('annual')}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              periodType === 'annual'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Annual
          </button>
          <button
            type="button"
            onClick={() => setPeriodType('quarterly')}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
              periodType === 'quarterly'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Quarterly
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="p-2">
        {loading ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-sage-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center text-sm text-red-500" style={{ height }}>
            {error}
          </div>
        ) : chartOptions ? (
          <HighchartsReact highcharts={Highcharts} options={chartOptions} />
        ) : (
          <div className="flex items-center justify-center text-sm text-gray-500" style={{ height }}>
            No data available
          </div>
        )}
      </div>

      {/* Legend + Year Range Presets */}
      {legendItems.length > 0 && (
        <div className="flex items-center justify-between px-4 pb-3">
          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {legendItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
          {/* Year Range Presets */}
          {yearBounds && (
            <div className="flex items-center gap-1">
              {[
                { label: '3Y', years: 3 },
                { label: '5Y', years: 5 },
                { label: '10Y', years: 10 },
                { label: 'All', years: null },
              ].map(({ label, years }) => {
                const targetMin = years ? Math.max(yearBounds.min, yearBounds.max - years + 1) : yearBounds.min
                const isActive = minSliderValue === targetMin && maxSliderValue === yearBounds.max
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setMinYear(targetMin)
                      setMaxYear(yearBounds.max)
                    }}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                      isActive
                        ? 'bg-sage-500 text-white'
                        : 'bg-cream-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-cream-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
