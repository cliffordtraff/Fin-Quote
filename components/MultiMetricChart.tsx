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
}

// Fallback colors if metric not in map
const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

interface MultiMetricChartProps {
  data: MetricData[]
  metrics: string[]
  customColors?: Record<string, string>
}

export default function MultiMetricChart({ data, metrics, customColors = {} }: MultiMetricChartProps) {
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

  // Sort filtered data by the defined order (smallest first = leftmost bar)
  const sortedFilteredData = [...filteredData].sort((a, b) => {
    const orderA = METRIC_SORT_ORDER[a.metric] ?? 45
    const orderB = METRIC_SORT_ORDER[b.metric] ?? 45
    return orderA - orderB
  })

  // Check which unit types we have
  const hasCurrencyMetrics = filteredData.some((d) => d.unit === 'currency')
  const hasPercentMetrics = filteredData.some((d) => d.unit === 'percent')
  const hasNumberMetrics = filteredData.some((d) => d.unit === 'number')

  // Determine primary axis type (most common or first)
  const unitCounts = { currency: 0, percent: 0, number: 0 }
  filteredData.forEach((d) => { unitCounts[d.unit]++ })
  const primaryUnit = hasCurrencyMetrics ? 'currency' : hasPercentMetrics ? 'percent' : 'number'

  // Need dual axis if mixing different unit types
  const needsDualAxis = (hasCurrencyMetrics && (hasPercentMetrics || hasNumberMetrics)) ||
                        (hasPercentMetrics && hasNumberMetrics)

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
    const values = metricData.data.map((d) =>
      isCurrency ? d.value / 1_000_000_000 : d.value
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
  const getAxisTitle = (unit: 'currency' | 'percent' | 'number') => {
    if (unit === 'currency') return 'USD (Billions)'
    if (unit === 'percent') return 'Percentage (%)'
    return filteredData.find((d) => d.unit === 'number')?.label || 'Value'
  }

  // Helper to format Y-axis labels based on unit type
  const getAxisFormatter = (unit: 'currency' | 'percent' | 'number') => {
    return function (this: Highcharts.AxisLabelsFormatterContextObject) {
      const val = typeof this.value === 'number' ? this.value : Number(this.value)
      if (unit === 'currency') return `$${val}B`
      if (unit === 'percent') return `${val.toFixed(1)}%`
      return val.toLocaleString()
    }
  }

  // Build Y-axes configuration
  const yAxis: Highcharts.YAxisOptions[] = [
    {
      title: {
        text: getAxisTitle(primaryUnit),
        style: {
          fontSize: '14px',
          fontWeight: '500',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
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
        text: getAxisTitle(secondaryUnit),
        style: {
          fontSize: '14px',
          fontWeight: '500',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
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
        text: 'Fiscal Year',
        style: {
          fontSize: '14px',
          fontWeight: '500',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
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
      layout: 'vertical',
      floating: true,
      itemStyle: {
        fontSize: '14px',
        fontWeight: '500',
        color: isDark ? '#e5e7eb' : '#374151',
      },
      itemHoverStyle: {
        color: isDark ? '#ffffff' : '#111827',
      },
      x: 0,
      y: 50,
    },
    plotOptions: {
      column: {
        animation: false,
        borderRadius: 4,
        borderWidth: 0,
        groupPadding: 0.15,
        pointPadding: 0.05,
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
          x: 0,
          y: 10,
          menuItems: [
            'downloadPNG',
            'downloadJPEG',
            'downloadPDF',
            'downloadSVG',
            'separator',
            'downloadCSV',
            'downloadXLS',
          ],
          theme: {
            fill: isDark ? '#374151' : '#f3f4f6',
            stroke: isDark ? '#4b5563' : '#e5e7eb',
          },
          symbolStroke: isDark ? '#9ca3af' : '#6b7280',
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
        fontSize: '14px',
        color: isDark ? '#f9fafb' : '#1f2937',
      },
      formatter: function () {
        const points = this.points || []
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">FY ${this.x}</div>`

        points.forEach((point) => {
          const metricInfo = filteredData.find((d) => d.label === point.series.name)
          const unit = metricInfo?.unit
          // Format based on unit type
          let displayValue: string
          if (unit === 'currency') {
            displayValue = `$${(point.y ?? 0).toFixed(1)}B`
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

  // Create a stable key based on the metrics being displayed
  const chartKey = [...metrics].sort().join('-')

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
        <div className="flex justify-end mb-2">
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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-100 dark:bg-[rgb(35,35,35)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-100 dark:bg-[rgb(35,35,35)]">
                    Metric
                  </th>
                  {years.map((year) => (
                    <th
                      key={year}
                      className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                    >
                      {year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-[rgb(45,45,45)] divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((metricData) => (
                  <tr key={metricData.metric} className="hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]">
                    <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium sticky left-0 bg-white dark:bg-[rgb(45,45,45)] whitespace-nowrap">
                      {metricData.label}
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal ml-1">
                        {metricData.unit === 'currency' ? '($B)' : metricData.unit === 'percent' ? '(%)' : ''}
                      </span>
                    </td>
                    {years.map((year, yearIndex) => {
                      const value = metricData.data[yearIndex]?.value || 0
                      let displayValue: string
                      if (metricData.unit === 'currency') {
                        displayValue = `$${(value / 1_000_000_000).toFixed(1)}B`
                      } else if (metricData.unit === 'percent') {
                        displayValue = `${value.toFixed(1)}%`
                      } else {
                        displayValue = value.toFixed(2)
                      }

                      return (
                        <td
                          key={`${metricData.metric}-${year}`}
                          className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 text-right whitespace-nowrap"
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
    </div>
  )
}
