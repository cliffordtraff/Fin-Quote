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

  // Highcharts configuration
  const options: Highcharts.Options = {
    chart: {
      type: config.type,
      height: 400,
      backgroundColor: 'transparent',
    },
    title: {
      text: config.title,
      style: {
        fontSize: '16px',
        fontWeight: '600',
      },
    },
    xAxis: {
      categories: config.categories,
      title: {
        text: config.xAxisLabel,
      },
    },
    yAxis: {
      title: {
        text: config.yAxisLabel,
      },
      labels: {
        formatter: function () {
          return this.value.toString()
        },
      },
    },
    legend: {
      enabled: false, // Hide legend for single series
    },
    plotOptions: {
      column: {
        dataLabels: {
          enabled: true, // Show values on top of bars
          format: '{y}',
        },
        borderRadius: 4, // Rounded corners on bars
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
      headerFormat: '<b>{point.x}</b><br/>',
      pointFormat: '{series.name}: {point.y}',
    },
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  )
}
