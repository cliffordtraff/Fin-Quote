'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import type { SegmentData, SegmentType } from '@/app/actions/segment-data'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

// Color palette for segments
const SEGMENT_COLORS: Record<string, string> = {
  // Product segments
  iPhone: '#3b82f6',                            // blue
  Services: '#10b981',                          // emerald
  'Wearables, Home and Accessories': '#f59e0b', // amber
  Mac: '#8b5cf6',                               // violet
  iPad: '#ec4899',                              // pink
  // Geographic segments
  Americas: '#3b82f6',                          // blue
  Europe: '#10b981',                            // emerald
  'Greater China': '#f59e0b',                   // amber
  Japan: '#8b5cf6',                             // violet
  'Rest of Asia Pacific': '#ec4899',            // pink
}

const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

interface SegmentChartProps {
  data: SegmentData[]
  segmentType: SegmentType
  visibleSegments: string[]
  customColors?: Record<string, string>
  stacked?: boolean
}

export default function SegmentChart({
  data,
  segmentType,
  visibleSegments,
  customColors = {},
  stacked = true,
}: SegmentChartProps) {
  const [showDataLabels, setShowDataLabels] = useState(false)
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
      } catch {
        // Module already loaded
      }
    }
    setIsMounted(true)
  }, [])

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
        <p className="text-gray-600 dark:text-gray-400">No segment data available</p>
      </div>
    )
  }

  // Filter data to only include visible segments
  const filteredData = data.filter(d => visibleSegments.includes(d.segment))

  if (filteredData.length === 0) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Select at least one segment to display</p>
      </div>
    )
  }

  // Get years from first segment
  const years = filteredData[0].data.map(d => d.year.toString())

  // Generate title
  const segmentTypeLabel = segmentType === 'product' ? 'Product' : 'Geographic'
  const yearRange = years.length > 0 ? `(${years[0]}-${years[years.length - 1]})` : ''
  const title = `Apple ${segmentTypeLabel} Revenue ${yearRange}`

  // Build series data
  const series: Highcharts.SeriesOptionsType[] = filteredData.map((segmentData, index) => {
    const values = segmentData.data.map(d => d.value / 1_000_000_000) // Convert to billions
    const color = customColors[segmentData.segment] ?? SEGMENT_COLORS[segmentData.segment] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

    return {
      type: 'column',
      name: segmentData.segment,
      data: values,
      color,
    }
  })

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
    yAxis: {
      title: {
        text: undefined,
      },
      labels: {
        style: {
          fontSize: '12px',
          color: isDark ? '#9ca3af' : '#6b7280',
        },
        formatter: function() {
          const val = typeof this.value === 'number' ? this.value : Number(this.value)
          return `$${val}B`
        },
      },
      gridLineColor: isDark ? 'rgb(75, 75, 75)' : '#d1d5db',
      opposite: true,
      lineWidth: 2,
      lineColor: isDark ? '#6b7280' : '#374151',
      stackLabels: stacked ? {
        enabled: true,
        style: {
          fontWeight: '600',
          color: isDark ? '#e5e7eb' : '#374151',
          textOutline: isDark ? '1px rgb(45, 45, 45)' : '1px #ffffff',
        },
        formatter: function() {
          return `$${(this.total ?? 0).toFixed(0)}B`
        },
      } : undefined,
    },
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
        borderRadius: stacked ? 0 : 4,
        borderWidth: 0,
        stacking: stacked ? 'normal' : undefined,
        groupPadding: 0.15,
        pointPadding: 0.05,
        dataLabels: {
          enabled: showDataLabels,
          verticalAlign: 'middle',
          style: {
            fontSize: '11px',
            fontWeight: '500',
            color: isDark ? '#e5e7eb' : '#374151',
            textOutline: isDark ? '1px rgb(45, 45, 45)' : '1px #ffffff',
          },
          formatter: function() {
            const val = this.point.y ?? 0
            return val >= 10 ? `$${val.toFixed(0)}B` : `$${val.toFixed(1)}B`
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
      filename: `apple_${segmentType}_segments`,
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
      formatter: function() {
        const points = this.points || []
        let total = 0
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">FY ${this.x}</div>`

        points.forEach((point) => {
          const val = point.y ?? 0
          total += val
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 10px; height: 10px; background-color: ${point.color}; border-radius: 50%;"></span>
            <span>${point.series.name}: <strong>$${val.toFixed(1)}B</strong></span>
          </div>`
        })

        if (stacked && points.length > 1) {
          html += `<div style="border-top: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; margin-top: 8px; padding-top: 8px; font-weight: 600;">
            Total: $${total.toFixed(1)}B
          </div>`
        }

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

  const copyToClipboard = () => {
    const headers = ['Year', ...filteredData.map(d => d.segment)]
    const rows = years.map((year, i) => {
      const values = filteredData.map(d => {
        const value = d.data[i]?.value || 0
        return (value / 1_000_000_000).toFixed(2)
      })
      return [year, ...values]
    })

    const csvData = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

    navigator.clipboard.writeText(csvData).then(() => {
      alert('Data copied to clipboard!')
    }).catch((err) => {
      console.error('Copy failed:', err)
    })
  }

  const chartKey = `${visibleSegments.sort().join('-')}-labels-${showDataLabels}-stacked-${stacked}`

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

      {/* Data Table Section */}
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
                  Segment
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
              {filteredData.map((segmentData) => (
                <tr key={segmentData.segment} className="hover:bg-gray-50 dark:hover:bg-[rgb(50,50,50)]">
                  <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium truncate">
                    {segmentData.segment}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal ml-1">
                      ($B)
                    </span>
                  </td>
                  {years.map((year, yearIndex) => {
                    const value = segmentData.data[yearIndex]?.value || 0
                    const displayValue = `$${(value / 1_000_000_000).toFixed(1)}B`

                    return (
                      <td
                        key={`${segmentData.segment}-${year}`}
                        className="px-1 py-2 text-sm text-gray-900 dark:text-gray-100 text-right"
                      >
                        {displayValue}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* Total row */}
              <tr className="bg-gray-100 dark:bg-[rgb(35,35,35)] font-semibold">
                <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-100">
                  Total
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal ml-1">
                    ($B)
                  </span>
                </td>
                {years.map((year, yearIndex) => {
                  const total = filteredData.reduce((sum, seg) => {
                    return sum + (seg.data[yearIndex]?.value || 0)
                  }, 0)
                  const displayValue = `$${(total / 1_000_000_000).toFixed(1)}B`

                  return (
                    <td
                      key={`total-${year}`}
                      className="px-1 py-2 text-sm text-gray-900 dark:text-gray-100 text-right"
                    >
                      {displayValue}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export { SEGMENT_COLORS }
