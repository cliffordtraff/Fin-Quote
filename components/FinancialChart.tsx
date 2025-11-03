'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'

// Critical: Dynamic import with ssr: false to prevent Next.js hydration errors
// Highcharts needs the browser DOM and can't render on the server
const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

export type ChartConfig = {
  type: 'column' | 'line'
  title: string
  data: number[]
  categories: string[]
  yAxisLabel: string
  xAxisLabel: string
}

interface FinancialChartProps {
  config: ChartConfig
}

export default function FinancialChart({ config }: FinancialChartProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenSize, setFullscreenSize] = useState<{ width: number; height: number } | null>(null)
  const [showDataTable, setShowDataTable] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartInstanceRef = useRef<Highcharts.Chart | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement | null>(null)
  // Force Highcharts to follow the surrounding wrapper dimensions (especially in fullscreen)
  const resizeChart = useCallback((sizeOverride?: { width: number; height: number }) => {
    const chart = chartInstanceRef.current
    const wrapperEl = chartWrapperRef.current

    if (!chart || (!wrapperEl && !sizeOverride)) {
      return
    }

    const width = sizeOverride?.width ?? wrapperEl?.clientWidth ?? 0
    const height = sizeOverride?.height ?? wrapperEl?.clientHeight ?? 0

    if (!width || !height) {
      return
    }

    chart.setSize(width, height, false)
    chart.reflow()
  }, [])

  // Ensure component only renders after mounting (client-side only)
  useEffect(() => {
    // Load exporting module on client side only
    if (typeof window !== 'undefined' && Highcharts) {
      try {
        const HighchartsExporting = require('highcharts/modules/exporting')
        HighchartsExporting(Highcharts)
      } catch (error) {
        console.warn('Highcharts exporting module not loaded:', error)
      }
    }
    setIsMounted(true)
  }, [])

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)

      requestAnimationFrame(() => {
        resizeChart()
      })
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [resizeChart])

  useEffect(() => {
    if (!chartInstanceRef.current) {
      return
    }

    if (!isFullscreen) {
      setFullscreenSize(null)
      requestAnimationFrame(() => {
        chartInstanceRef.current?.reflow()
      })
      return
    }

    const updateFullscreenSize = () => {
      if (typeof window === 'undefined') return
      const nextSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      setFullscreenSize(nextSize)
      requestAnimationFrame(() => resizeChart(nextSize))
    }

    updateFullscreenSize()
    window.addEventListener('resize', updateFullscreenSize)

    return () => {
      window.removeEventListener('resize', updateFullscreenSize)
    }
  }, [isFullscreen, resizeChart])

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    if (!chartContainerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await chartContainerRef.current.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }

  // Copy table data to clipboard
  const copyToClipboard = () => {
    const csvData = [
      [config.xAxisLabel, config.yAxisLabel].join(','),
      ...config.categories.map((cat, i) => `${cat},${config.data[i]}`).join('\n'),
    ].join('\n')

    navigator.clipboard.writeText(csvData).then(() => {
      alert('Data copied to clipboard!')
    }).catch((err) => {
      console.error('Copy failed:', err)
    })
  }

  if (!isMounted) {
    // Show placeholder while loading
    return (
      <div className="w-full h-[800px] bg-gray-50 animate-pulse rounded flex items-center justify-center">
        <p className="text-gray-400">Loading chart...</p>
      </div>
    )
  }

  // Highcharts configuration with polish and animations
  const options: Highcharts.Options = {
    chart: {
      type: config.type,
      height: isFullscreen
        ? fullscreenSize?.height ?? '100%'
        : 800, // Extra large: 800px for maximum visibility, 100%/viewport in fullscreen
      width: isFullscreen ? fullscreenSize?.width ?? undefined : undefined, // Full width in fullscreen mode
      backgroundColor: 'transparent',
      // Minimize whitespace in fullscreen while keeping axes readable
      spacingTop: isFullscreen ? 16 : 36,
      spacingBottom: isFullscreen ? 8 : 48,
      spacingLeft: 24,
      spacingRight: 24,
      animation: {
        duration: 800,
      },
      style: {
        fontFamily: 'inherit', // Use Tailwind font
      },
    },
    title: {
      text: config.title,
      style: {
        fontSize: '28px',
        fontWeight: '600',
        color: '#1f2937', // gray-800
      },
    },
    xAxis: {
      categories: config.categories,
      title: {
        text: config.xAxisLabel,
        style: {
          fontSize: '18px',
          fontWeight: '500',
          color: '#6b7280', // gray-500
        },
      },
      labels: {
        style: {
          fontSize: '16px',
          color: '#6b7280', // gray-500
        },
        formatter: function () {
          // Explicitly return the category string (year), not the index
          return this.value
        },
      },
      gridLineWidth: 0,
    },
    yAxis: {
      title: {
        text: config.yAxisLabel,
        style: {
          fontSize: '18px',
          fontWeight: '500',
          color: '#6b7280', // gray-500
        },
      },
      minPadding: 0,
      maxPadding: 0.08, // Leave headroom so column labels rendered above bars are visible
      labels: {
        style: {
          fontSize: '16px',
          color: '#6b7280', // gray-500
        },
        y: isFullscreen ? -4 : 0,
        formatter: function () {
          // Format large numbers with commas
          return this.value.toLocaleString('en-US')
        },
      },
      gridLineColor: '#f3f4f6', // gray-100
      gridLineWidth: 1,
    },
    legend: {
      enabled: false, // Hide legend for single series
    },
    plotOptions: {
      column: {
        animation: {
          duration: 800,
        },
        dataLabels: {
          enabled: true, // Show values on top of bars
          inside: false,
          format: config.yAxisLabel.includes('%') ? '{y}%' : '{y}',
          verticalAlign: 'bottom', // Anchor to the bar top when positioned outside
          y: -6, // Keep a small gap between label and bar
          crop: false,
          overflow: 'allow',
          style: {
            fontSize: '16px',
            fontWeight: '600',
            color: '#1f2937', // gray-800
            textOutline: 'none',
          },
        },
        borderRadius: 4, // Rounded corners on bars
        borderWidth: 0,
        states: {
          hover: {
            brightness: 0.1, // Subtle hover effect
          },
        },
      },
      line: {
        animation: {
          duration: 800,
        },
        dataLabels: {
          enabled: false, // Hide labels on line charts for cleaner look
        },
        lineWidth: 3, // Thicker line for better visibility
        marker: {
          radius: 4, // Medium-sized dots
          fillColor: '#3b82f6', // Blue
          lineWidth: 2,
          lineColor: '#ffffff', // White border around dots
          states: {
            hover: {
              radius: 6, // Slightly larger on hover
            },
          },
        },
        states: {
          hover: {
            lineWidthPlus: 1, // Slightly thicker on hover
          },
        },
      },
      series: {
        animation: {
          duration: 800,
        },
      },
    },
    series: [
      {
        type: config.type, // Dynamic: column or line based on data type
        name: config.yAxisLabel,
        data: config.data,
        color: '#3b82f6', // Blue color (Tailwind blue-500)
      },
    ],
    credits: {
      enabled: false, // Remove Highcharts.com branding
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
            fill: '#f3f4f6', // gray-100
            stroke: '#e5e7eb', // gray-200
            states: {
              hover: {
                fill: '#e5e7eb', // gray-200
              },
              select: {
                fill: '#d1d5db', // gray-300
              },
            },
          },
          symbolStroke: '#6b7280', // gray-500
        },
      },
      filename: config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
      sourceWidth: 1200,
      sourceHeight: 600,
      scale: 2, // Higher quality export
      chartOptions: {
        title: {
          style: {
            fontSize: '18px',
          },
        },
        subtitle: {
          text: 'Generated by Fin Quote',
          style: {
            fontSize: '12px',
            color: '#6b7280',
          },
        },
      },
    },
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb', // gray-200
      borderRadius: 8,
      borderWidth: 1,
      shadow: {
        color: 'rgba(0, 0, 0, 0.1)',
        offsetX: 0,
        offsetY: 2,
        opacity: 0.1,
        width: 4,
      },
      style: {
        fontSize: '16px',
        color: '#1f2937', // gray-800
      },
      headerFormat: '<div style="font-weight: 600; margin-bottom: 4px; font-size: 16px;">{point.key}</div>',
      pointFormat: '<div style="color: #6b7280; font-size: 16px;">{series.name}: <span style="font-weight: 600; color: #1f2937;">{point.y}</span></div>',
      useHTML: true,
    },
    // Responsive behavior
    responsive: {
      rules: [
        {
          condition: {
            maxWidth: 500,
          },
          chartOptions: {
            chart: {
              height: 400, // Larger on small screens too
            },
            xAxis: {
              labels: {
                rotation: -45, // Rotate labels on mobile
                style: {
                  fontSize: '14px',
                },
              },
            },
            yAxis: {
              labels: {
                style: {
                  fontSize: '14px',
                },
              },
            },
            plotOptions: {
              column: {
                dataLabels: {
                  enabled: false, // Hide data labels on small screens
                },
              },
              line: {
                marker: {
                  radius: 3, // Smaller markers on mobile
                },
              },
            },
          },
        },
      ],
    },
  }

  return (
    <div
      ref={chartContainerRef}
      className={`w-full relative ${isFullscreen ? 'bg-white flex flex-col h-full' : ''}`}
      style={
        isFullscreen
          ? {
              height: '100%',
              minHeight: '100vh',
              width: '100%',
              maxWidth: '100%',
            }
          : undefined
      }
    >
      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? (
          // Exit fullscreen icon
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
            />
          </svg>
        ) : (
          // Enter fullscreen icon
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        )}
      </button>

      <div className={isFullscreen ? 'flex-1 w-full min-h-0' : ''}>
        <div
          ref={chartWrapperRef}
          className={isFullscreen ? 'w-full h-full flex flex-1 min-h-0 items-stretch' : ''}
        >
          <HighchartsReact
            highcharts={Highcharts}
            options={options}
            callback={(chart) => {
              chartInstanceRef.current = chart
              requestAnimationFrame(resizeChart)
            }}
            containerProps={{
              className: isFullscreen ? 'flex-1 min-h-0' : undefined,
              style: isFullscreen
                ? {
                    width: '100%',
                    height: '100%',
                    flex: 1,
                    minHeight: 0,
                  }
                : {},
            }}
          />
        </div>
      </div>

      {/* Data Table Section */}
      {!isFullscreen && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={() => setShowDataTable(!showDataTable)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2"
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
                className="text-sm text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1"
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
            <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        {config.xAxisLabel}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                        {config.yAxisLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {config.categories.map((category, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{category}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {config.data[index].toLocaleString('en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
