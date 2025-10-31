'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'

// Critical: Dynamic import with ssr: false to prevent Next.js hydration errors
// Highcharts needs the browser DOM and can't render on the server
const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

export type ChartConfig = {
  type: 'column'
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

  // Ensure component only renders after mounting (client-side only)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    // Show placeholder while loading
    return (
      <div className="w-full h-[400px] bg-gray-50 animate-pulse rounded flex items-center justify-center">
        <p className="text-gray-400">Loading chart...</p>
      </div>
    )
  }

  // Highcharts configuration with polish and animations
  const options: Highcharts.Options = {
    chart: {
      type: config.type,
      height: 400,
      backgroundColor: 'transparent',
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
      },
      style: {
        fontFamily: 'inherit', // Use Tailwind font
      },
    },
    title: {
      text: config.title,
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#1f2937', // gray-800
      },
    },
    xAxis: {
      categories: config.categories,
      title: {
        text: config.xAxisLabel,
        style: {
          fontSize: '12px',
          fontWeight: '500',
          color: '#6b7280', // gray-500
        },
      },
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280', // gray-500
        },
      },
      gridLineWidth: 0,
    },
    yAxis: {
      title: {
        text: config.yAxisLabel,
        style: {
          fontSize: '12px',
          fontWeight: '500',
          color: '#6b7280', // gray-500
        },
      },
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280', // gray-500
        },
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
          format: '{y}',
          style: {
            fontSize: '11px',
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
      series: {
        animation: {
          duration: 800,
        },
      },
    },
    series: [
      {
        type: 'column',
        name: config.yAxisLabel,
        data: config.data,
        color: '#3b82f6', // Blue color (Tailwind blue-500)
      },
    ],
    credits: {
      enabled: false, // Remove Highcharts.com branding
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
        fontSize: '12px',
        color: '#1f2937', // gray-800
      },
      headerFormat: '<div style="font-weight: 600; margin-bottom: 4px;">{point.x}</div>',
      pointFormat: '<div style="color: #6b7280;">{series.name}: <span style="font-weight: 600; color: #1f2937;">{point.y}</span></div>',
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
              height: 300, // Shorter on small screens
            },
            xAxis: {
              labels: {
                rotation: -45, // Rotate labels on mobile
                style: {
                  fontSize: '10px',
                },
              },
            },
            yAxis: {
              labels: {
                style: {
                  fontSize: '10px',
                },
              },
            },
            plotOptions: {
              column: {
                dataLabels: {
                  enabled: false, // Hide data labels on small screens
                },
              },
            },
          },
        },
      ],
    },
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  )
}
