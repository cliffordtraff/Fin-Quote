'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import type { MetricData } from '@/app/actions/chart-metrics'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

// Fixed color mapping for each metric (so colors don't change when adding/removing metrics)
export const DEFAULT_METRIC_COLORS: Record<string, string> = {
  // Income Statement
  revenue: '#3b82f6',           // blue-500
  gross_profit: '#10b981',      // emerald-500
  net_income: '#f59e0b',        // amber-500
  operating_income: '#8b5cf6',  // violet-500
  eps: '#ec4899',               // pink-500
  ebitda: '#14b8a6',            // teal-500
  depreciation_amortization: '#78716c', // stone-500
  stock_based_comp: '#a3e635',  // lime-400
  // Balance Sheet
  total_assets: '#06b6d4',      // cyan-500
  total_liabilities: '#f97316', // orange-500
  shareholders_equity: '#84cc16', // lime-500
  // Cash Flow
  operating_cash_flow: '#a855f7', // purple-500
  free_cash_flow: '#22d3ee',    // cyan-400
  capital_expenditure: '#fb923c', // orange-400
  dividends_paid: '#4ade80',    // green-400
  stock_buybacks: '#c084fc',    // purple-400
  // Ratio metrics
  gross_margin: '#22c55e',      // green-500
  operating_margin: '#0ea5e9',  // sky-500
  net_margin: '#eab308',        // yellow-500
  roe: '#f43f5e',               // rose-500
  roa: '#8b5cf6',               // violet-500
  pe_ratio: '#e879f9',          // fuchsia-400
  // Stock Specific - Product Segments
  segment_iphone: '#3b82f6',    // blue-500
  segment_services: '#10b981',  // emerald-500
  segment_wearables: '#f59e0b', // amber-500
  segment_mac: '#8b5cf6',       // violet-500
  segment_ipad: '#ec4899',      // pink-500
  // Stock Specific - Geographic Segments
  segment_americas: '#06b6d4',  // cyan-500
  segment_europe: '#22c55e',    // green-500
  segment_china: '#f97316',     // orange-500
  segment_japan: '#a855f7',     // purple-500
  segment_asia_pacific: '#f43f5e', // rose-500
  // Additional metrics
  rnd_expense: '#7c3aed',       // violet-600
  shares_outstanding: '#0d9488', // teal-600
}

// Fallback colors if metric not in map
const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

interface MultiMetricChartProps {
  data: MetricData[]
  metrics: string[]
  customColors?: Record<string, string>
  onReset?: () => void
}

export default function MultiMetricChart({ data, metrics, customColors = {}, onReset }: MultiMetricChartProps) {
  const [showDataLabels, setShowDataLabels] = useState(true)
  const [isStacked, setIsStacked] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [isMounted, setIsMounted] = useState(false)
  const chartRef = useRef<Highcharts.Chart | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && Highcharts) {
      try {
        const HighchartsExporting = require('highcharts/modules/exporting')
        HighchartsExporting(Highcharts)
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

  if (!isMounted) {
    return (
      <div className="w-full h-[650px] bg-gray-50 dark:bg-gray-800 animate-pulse rounded flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500">Loading chart...</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">No data available</p>
      </div>
    )
  }

  // Get years from first metric (all metrics should have same years)
  const years = data[0].data.map((d) => d.year.toString())

  // Filter data to only include metrics that are in the metrics prop
  // Also deduplicate by metric id to prevent duplicate series
  const seenMetrics = new Set<string>()
  const filteredData = data.filter((d) => {
    if (!metrics.includes(d.metric)) return false
    if (seenMetrics.has(d.metric)) return false
    seenMetrics.add(d.metric)
    return true
  })

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

  // Sort filtered data by the defined order, or by most recent value for dynamic metrics
  const sortedFilteredData = [...filteredData].sort((a, b) => {
    const orderA = METRIC_SORT_ORDER[a.metric]
    const orderB = METRIC_SORT_ORDER[b.metric]

    // If both have defined orders, use them
    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB
    }

    // If neither has a defined order, sort by most recent year's value (smallest first)
    if (orderA === undefined && orderB === undefined) {
      return getMostRecentValue(a) - getMostRecentValue(b)
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

  // Determine primary axis type (most common or first)
  const unitCounts = { currency: 0, percent: 0, number: 0, shares: 0 }
  filteredData.forEach((d) => { unitCounts[d.unit as keyof typeof unitCounts]++ })
  const primaryUnit = hasCurrencyMetrics ? 'currency' : hasSharesMetrics ? 'shares' : hasPercentMetrics ? 'percent' : 'number'

  // Need dual axis if mixing different unit types
  const needsDualAxis = (hasCurrencyMetrics && (hasPercentMetrics || hasNumberMetrics || hasSharesMetrics)) ||
                        (hasPercentMetrics && (hasNumberMetrics || hasSharesMetrics)) ||
                        (hasSharesMetrics && hasNumberMetrics)

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

  // Build series data (use sortedFilteredData for bar order)
  const series: Highcharts.SeriesOptionsType[] = sortedFilteredData.map((metricData, index) => {
    const isCurrency = metricData.unit === 'currency'
    const isShares = metricData.unit === 'shares'
    const values = metricData.data.map((d) =>
      isCurrency || isShares ? d.value / 1_000_000_000 : d.value
    )

    // Use custom color if provided, otherwise use default color, fall back to index-based color
    const color = customColors[metricData.metric] ?? DEFAULT_METRIC_COLORS[metricData.metric] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

    // Determine which Y-axis to use
    const useSecondaryAxis = needsDualAxis && metricData.unit !== primaryUnit

    return {
      type: 'column',
      name: `Apple ${metricData.label}`,
      data: values,
      color,
      yAxis: useSecondaryAxis ? 1 : 0,
    }
  })

  // Helper to get Y-axis title based on unit type
  const getAxisTitle = (unit: 'currency' | 'percent' | 'number' | 'shares') => {
    if (unit === 'currency') return 'USD (Billions)'
    if (unit === 'shares') return 'Shares (Billions)'
    if (unit === 'percent') return 'Percentage (%)'
    return filteredData.find((d) => d.unit === 'number')?.label || 'Value'
  }

  // Helper to format Y-axis labels based on unit type
  const getAxisFormatter = (unit: 'currency' | 'percent' | 'number' | 'shares') => {
    return function (this: Highcharts.AxisLabelsFormatterContextObject) {
      const val = typeof this.value === 'number' ? this.value : Number(this.value)
      if (unit === 'currency') return `$${val}B`
      if (unit === 'shares') return `${val}B`
      if (unit === 'percent') return `${val.toFixed(1)}%`
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
          fontSize: '12px',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
        formatter: getAxisFormatter(primaryUnit),
      },
      gridLineColor: isDark ? 'rgb(75, 75, 75)' : '#d1d5db',
      opposite: true,
      lineWidth: 2,
      lineColor: isDark ? '#6b7280' : '#374151',
    },
  ]

  // Add second Y-axis if needed (for secondary unit type)
  // This axis is on the left side (opposite: false) since the primary axis is now on the right
  if (needsDualAxis) {
    // Find the secondary unit type
    const secondaryUnit: 'currency' | 'percent' | 'number' =
      primaryUnit === 'currency'
        ? (hasPercentMetrics ? 'percent' : 'number')
        : (primaryUnit === 'percent' ? (hasNumberMetrics ? 'number' : 'currency') : 'currency')

    yAxis.push({
      title: {
        text: undefined,
      },
      labels: {
        style: {
          fontSize: '12px',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
        formatter: getAxisFormatter(secondaryUnit),
      },
      opposite: false,
      gridLineWidth: 0,
      lineWidth: 2,
      lineColor: isDark ? '#6b7280' : '#374151',
    })
  }

  const options: Highcharts.Options = {
    chart: {
      type: 'column',
      height: 650,
      backgroundColor: isDark ? 'rgb(45, 45, 45)' : 'transparent',
      animation: false,
      style: {
        fontFamily: 'inherit',
      },
      spacingBottom: 70,
    },
    title: {
      text: undefined,
    },
    xAxis: {
      categories: years,
      title: {
        text: undefined,
      },
      labels: {
        style: {
          fontSize: '12px',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
      },
      gridLineWidth: 0,
      lineWidth: 2,
      lineColor: isDark ? '#6b7280' : '#374151',
    },
    yAxis,
    legend: {
      enabled: true,
      align: 'left',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      floating: false,
      itemStyle: {
        fontSize: '14px',
        fontWeight: '500',
        color: isDark ? '#e5e7eb' : '#374151',
      },
      itemHoverStyle: {
        color: isDark ? '#ffffff' : '#111827',
      },
      margin: 20,
    },
    plotOptions: {
      column: {
        animation: false,
        borderRadius: isStacked ? 0 : 4,
        borderWidth: 0,
        groupPadding: isStacked ? 0.2 : 0.15,
        pointPadding: isStacked ? 0.1 : 0.05,
        stacking: isStacked ? 'normal' : undefined,
        dataLabels: {
          enabled: showDataLabels,
          verticalAlign: isStacked ? 'middle' : 'bottom',
          y: isStacked ? 0 : -5,
          style: {
            fontSize: '11px',
            fontWeight: '500',
            color: isStacked ? '#ffffff' : (isDark ? '#e5e7eb' : '#374151'),
            textOutline: isStacked ? '1px rgba(0, 0, 0, 0.3)' : (isDark ? '1px rgb(45, 45, 45)' : '1px #ffffff'),
          },
          formatter: function (this: Highcharts.PointLabelObject) {
            const point = this.point
            const seriesName = this.series.name
            const metricInfo = filteredData.find((d) => `Apple ${d.label}` === seriesName)
            const unit = metricInfo?.unit
            const val = point.y ?? 0
            // For stacked charts, hide small values to avoid clutter
            if (isStacked && (unit === 'currency' || unit === 'shares') && Math.abs(val) < 5) return ''
            if (unit === 'currency') return val.toFixed(1)
            if (unit === 'shares') return val.toFixed(1)
            if (unit === 'percent') return `${val.toFixed(1)}%`
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
      buttons: {
        contextButton: {
          enabled: false,
        },
      },
      filename: 'apple_financials',
    },
    tooltip: {
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      borderColor: isDark ? '#374151' : '#e5e7eb',
      borderRadius: 8,
      borderWidth: 1,
      shared: true,
      style: {
        fontSize: '12px',
        color: isDark ? '#f9fafb' : '#1f2937',
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
      formatter: function () {
        const points = this.points || []
        // Get the category (year) from the x-axis - this.x is the index, so use point.key or category
        const year = points[0]?.key || this.x
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">FY ${year}</div>`

        points.forEach((point) => {
          const metricInfo = filteredData.find((d) => `Apple ${d.label}` === point.series.name)
          const unit = metricInfo?.unit
          // Format based on unit type
          let displayValue: string
          if (unit === 'currency') {
            displayValue = `$${(point.y ?? 0).toFixed(1)}B`
          } else if (unit === 'shares') {
            displayValue = `${(point.y ?? 0).toFixed(2)}B shares`
          } else if (unit === 'percent') {
            displayValue = `${(point.y ?? 0).toFixed(1)}%`
          } else {
            displayValue = (point.y ?? 0).toFixed(2)
          }

          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 10px; height: 10px; background-color: ${point.color}; border-radius: 50%;"></span>
            <span>${point.series.name}: <strong>${displayValue}</strong></span>
          </div>`
        })

        return html
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
  const chartKey = `${[...metrics].sort().join('-')}-labels-${showDataLabels}-stacked-${isStacked}`

  return (
    <div className="w-full">
      <HighchartsReact
        key={chartKey}
        highcharts={Highcharts}
        options={options}
        immutable={true}
        callback={(chart: Highcharts.Chart) => {
          chartRef.current = chart
        }}
      />

      {/* Data Table Section - years as columns */}
      <div className="mt-4">
        <div className="flex justify-end items-center gap-4 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showDataLabels}
              onChange={(e) => setShowDataLabels(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show Labels</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isStacked}
              onChange={(e) => setIsStacked(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Stacked</span>
          </label>
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
              <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                <button
                  onClick={() => { chartRef.current?.exportChart({ type: 'image/png' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)]"
                >
                  Download PNG
                </button>
                <button
                  onClick={() => { chartRef.current?.exportChart({ type: 'image/jpeg' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)]"
                >
                  Download JPEG
                </button>
                <button
                  onClick={() => { chartRef.current?.exportChart({ type: 'application/pdf' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)]"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => { chartRef.current?.exportChart({ type: 'image/svg+xml' }, {}); setShowExportMenu(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)]"
                >
                  Download SVG
                </button>
              </div>
            )}
          </div>
          <button
            onClick={copyToClipboard}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy as CSV
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-[rgb(40,40,40)] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-[rgb(35,35,35)]">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider w-[200px]">
                  Metric
                </th>
                {years.map((year) => (
                  <th
                    key={year}
                    className="px-1 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[rgb(45,45,45)] divide-y divide-gray-200 dark:divide-gray-700">
              {filteredData.map((metricData) => (
                <tr key={metricData.metric} className="hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]">
                  <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {metricData.label}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal ml-1">
                      {metricData.unit === 'currency' ? '($B)' : metricData.unit === 'shares' ? '(B shares)' : metricData.unit === 'percent' ? '(%)' : ''}
                    </span>
                  </td>
                  {years.map((year, yearIndex) => {
                    const value = metricData.data[yearIndex]?.value || 0
                    let displayValue: string
                    if (metricData.unit === 'currency') {
                      displayValue = `$${(value / 1_000_000_000).toFixed(1)}B`
                    } else if (metricData.unit === 'shares') {
                      displayValue = `${(value / 1_000_000_000).toFixed(2)}B`
                    } else if (metricData.unit === 'percent') {
                      displayValue = `${value.toFixed(1)}%`
                    } else {
                      displayValue = value.toFixed(2)
                    }

                    return (
                      <td
                        key={`${metricData.metric}-${year}`}
                        className="px-1 py-2 text-sm text-gray-900 dark:text-gray-100 text-right"
                      >
                        {displayValue}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
