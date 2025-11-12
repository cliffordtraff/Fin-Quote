'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'

const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})

interface MiniPriceChartProps {
  data: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

export default function MiniPriceChart({ data }: MiniPriceChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted || !data || data.length === 0) {
    return (
      <div className="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
    )
  }

  // Convert data to Highcharts candlestick format
  const candlestickData = data.map((item) => {
    const timestamp = new Date(item.date).getTime()
    return [timestamp, item.open, item.high, item.low, item.close]
  })

  const options: Highcharts.Options = {
    chart: {
      type: 'candlestick',
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      height: 190,
      spacing: [5, 5, 5, 5],
    },
    title: {
      text: undefined,
    },
    credits: {
      enabled: false,
    },
    xAxis: {
      type: 'datetime',
      labels: {
        style: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: '10px',
        },
      },
      lineColor: isDark ? '#374151' : '#e5e7eb',
      tickColor: isDark ? '#374151' : '#e5e7eb',
    },
    yAxis: {
      title: {
        text: undefined,
      },
      labels: {
        align: 'left',
        x: -3,
        style: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: '10px',
        },
      },
      gridLineColor: isDark ? '#374151' : '#f3f4f6',
      opposite: true,
    },
    legend: {
      enabled: false,
    },
    plotOptions: {
      candlestick: {
        color: '#ef4444', // Red for down
        upColor: '#10b981', // Green for up
        lineColor: '#ef4444',
        upLineColor: '#10b981',
      },
    },
    series: [
      {
        type: 'candlestick',
        name: 'AAPL',
        data: candlestickData,
        tooltip: {
          valueDecimals: 2,
        },
      },
    ],
    tooltip: {
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      borderColor: isDark ? '#374151' : '#e5e7eb',
      style: {
        color: isDark ? '#f9fafb' : '#111827',
      },
      split: false,
      shared: true,
    },
    navigator: {
      enabled: false,
    },
    scrollbar: {
      enabled: false,
    },
    rangeSelector: {
      enabled: false,
    },
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
      />
    </div>
  )
}
