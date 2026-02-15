'use client'

import { useState } from 'react'
import Navigation from '@/components/Navigation'
import MiniChartPanel from '@/components/MiniChartPanel'
import StockSelector, { type StockSelectorHandle } from '@/components/StockSelector'
import { getAvailableStocks, type Stock } from '@/app/actions/get-stocks'
import { useEffect, useRef } from 'react'
import type { MetricId } from '@/app/actions/chart-metrics'

// Popular stocks for quick access
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'V',
]

// Preset chart configurations
const CHART_PRESETS: { title: string; metrics: MetricId[]; colorIndex?: number }[] = [
  {
    title: 'Revenue & Profitability',
    metrics: ['revenue', 'gross_profit', 'net_income'],
  },
  {
    title: 'Earnings per Share',
    metrics: ['eps'],
    colorIndex: 1,
  },
  {
    title: 'Shares Outstanding',
    metrics: ['shares_outstanding'],
    colorIndex: 2,
  },
  {
    title: 'Sales',
    metrics: ['revenue'],
    colorIndex: 3,
  },
]

export default function MultiChartsPage() {
  const [selectedStock, setSelectedStock] = useState<string>('AAPL')
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([])
  const stockSelectorRef = useRef<StockSelectorHandle>(null)

  // Load available stocks on mount
  useEffect(() => {
    async function loadStocks() {
      const result = await getAvailableStocks()
      if (result.data) {
        setAvailableStocks(result.data)
      }
    }
    loadStocks()
  }, [])

  const handleStockSelect = (symbols: string[]) => {
    if (symbols.length > 0) {
      setSelectedStock(symbols[0])
    }
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-[rgb(33,33,33)]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Header with Stock Selector */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Financial Overview</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Key metrics at a glance
            </p>
          </div>
          <div className="w-72">
            <StockSelector
              ref={stockSelectorRef}
              availableStocks={availableStocks}
              selectedStocks={[selectedStock]}
              onSelect={handleStockSelect}
              allowMultiple={false}
              popularStocks={POPULAR_STOCKS}
              autoFocus={true}
            />
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CHART_PRESETS.map((preset) => (
            <MiniChartPanel
              key={`${selectedStock}-${preset.title}`}
              title={preset.title}
              symbol={selectedStock}
              metrics={preset.metrics}
              height={280}
              colorIndex={preset.colorIndex}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
