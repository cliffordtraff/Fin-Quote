'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import type { MetricData } from '@/app/actions/chart-metrics'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

// Color palette for up to 4 series
const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
]

interface MultiMetricChartProps {
  data: MetricData[]
  metrics: string[]
}

export default function MultiMetricChart({ data, metrics }: MultiMetricChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [isMounted, setIsMounted] = useState(false)
  const [showDataTable, setShowDataTable] = useState(false)
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
      <div className="w-full h-[500px] bg-gray-50 dark:bg-gray-800 animate-pulse rounded flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500">Loading chart...</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">No data available</p>
      </div>
    )
  }

  // Get years from first metric (all metrics should have same years)
  const years = data[0].data.map((d) => d.year.toString())

  // Check if we need dual Y-axes (mixing currency and non-currency)
  const hasCurrencyMetrics = data.some((d) => d.unit === 'currency')
  const hasNonCurrencyMetrics = data.some((d) => d.unit !== 'currency')
  const needsDualAxis = hasCurrencyMetrics && hasNonCurrencyMetrics

  // Generate title
  const metricLabels = data.map((d) => d.label)
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

  // Build series data
  const series: Highcharts.SeriesOptionsType[] = data.map((metricData, index) => {
    const isCurrency = metricData.unit === 'currency'
    const values = metricData.data.map((d) =>
      isCurrency ? d.value / 1_000_000_000 : d.value
    )

    return {
      type: 'column',
      name: metricData.label,
      data: values,
      color: CHART_COLORS[index % CHART_COLORS.length],
      yAxis: needsDualAxis && !isCurrency ? 1 : 0,
    }
  })

  // Build Y-axes configuration
  const yAxis: Highcharts.YAxisOptions[] = [
    {
      title: {
        text: hasCurrencyMetrics ? 'USD (Billions)' : data[0].label,
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
        formatter: function () {
          const val = typeof this.value === 'number' ? this.value : Number(this.value)
          if (hasCurrencyMetrics) {
            return `$${val}B`
          }
          return val.toLocaleString()
        },
      },
      gridLineColor: isDark ? 'rgb(50, 50, 50)' : '#f3f4f6',
    },
  ]

  // Add second Y-axis if needed (for non-currency metrics like EPS)
  if (needsDualAxis) {
    const nonCurrencyMetric = data.find((d) => d.unit !== 'currency')
    yAxis.push({
      title: {
        text: nonCurrencyMetric?.label || 'Value',
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
        formatter: function () {
          const val = typeof this.value === 'number' ? this.value : Number(this.value)
          return val.toFixed(2)
        },
      },
      opposite: true,
      gridLineWidth: 0,
    })
  }

  const options: Highcharts.Options = {
    chart: {
      type: 'column',
      height: 500,
      backgroundColor: isDark ? 'rgb(45, 45, 45)' : 'transparent',
      style: {
        fontFamily: 'inherit',
      },
    },
    title: {
      text: title,
      style: {
        fontSize: '24px',
        fontWeight: '600',
        color: isDark ? '#f9fafb' : '#1f2937',
      },
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
      lineColor: isDark ? 'rgb(50, 50, 50)' : '#e5e7eb',
    },
    yAxis,
    legend: {
      enabled: data.length > 1,
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: {
        fontSize: '14px',
        fontWeight: '500',
        color: isDark ? '#e5e7eb' : '#374151',
      },
      itemHoverStyle: {
        color: isDark ? '#ffffff' : '#111827',
      },
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        borderWidth: 0,
        groupPadding: 0.15,
        pointPadding: 0.05,
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
      filename: title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
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
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">${this.x}</div>`

        points.forEach((point) => {
          const metricInfo = data.find((d) => d.label === point.series.name)
          const xValue = String(this.x)
          const rawValue = metricInfo?.data.find((d) => d.year.toString() === xValue)?.value || 0
          const formattedValue = formatValue(rawValue, metricInfo?.unit || 'number')

          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 10px; height: 10px; background-color: ${point.color}; border-radius: 50%;"></span>
            <span>${point.series.name}: <strong>${formattedValue}</strong></span>
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
              height: 400,
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
    const headers = ['Year', ...data.map((d) => d.label)]
    const rows = years.map((year, i) => {
      const values = data.map((d) => {
        const value = d.data[i]?.value || 0
        return d.unit === 'currency' ? (value / 1_000_000_000).toFixed(2) : value.toFixed(2)
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

  return (
    <div className="w-full">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        callback={(chart: Highcharts.Chart) => {
          chartRef.current = chart
        }}
      />

      {/* Data Table Section */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <button
            onClick={() => setShowDataTable(!showDataTable)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-2"
          >
            {showDataTable ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Hide Data Table
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                View Data Table
              </>
            )}
          </button>
          {showDataTable && (
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
          )}
        </div>

        {showDataTable && (
          <div className="bg-gray-50 dark:bg-[rgb(40,40,40)] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-100 dark:bg-[rgb(35,35,35)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Year
                    </th>
                    {data.map((metricData) => (
                      <th
                        key={metricData.metric}
                        className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {metricData.label}
                        <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal normal-case">
                          {metricData.unit === 'currency' ? '(Billions USD)' : ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-[rgb(45,45,45)] divide-y divide-gray-200 dark:divide-gray-700">
                  {years.map((year, yearIndex) => (
                    <tr key={year} className="hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                        {year}
                      </td>
                      {data.map((metricData) => {
                        const value = metricData.data[yearIndex]?.value || 0
                        const displayValue = metricData.unit === 'currency'
                          ? `$${(value / 1_000_000_000).toFixed(2)}B`
                          : value.toFixed(2)

                        return (
                          <td
                            key={`${year}-${metricData.metric}`}
                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right"
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
        )}
      </div>
    </div>
  )
}
