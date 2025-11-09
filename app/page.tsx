'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import { getAaplMarketData } from '@/app/actions/market-data'

interface MarketData {
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  financials: {
    year: number
    revenue: number
    netIncome: number
    eps: number
    totalAssets: number
    shareholdersEquity: number
  }
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

export default function Home() {
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const marketResult = await getAaplMarketData()

        if ('error' in marketResult) {
          setError(marketResult.error)
        } else {
          console.log('Market data received:', {
            hasPriceHistory: !!marketResult.priceHistory,
            priceHistoryLength: marketResult.priceHistory?.length,
            firstCandle: marketResult.priceHistory?.[0],
            lastCandle: marketResult.priceHistory?.[marketResult.priceHistory?.length - 1]
          })
          setMarketData(marketResult as MarketData)
        }
      } catch (err) {
        setError('Failed to load market data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number, decimals: number = 2): string => {
    if (value >= 1_000_000_000_000) {
      return `$${(value / 1_000_000_000_000).toFixed(decimals)}T`
    }
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(decimals)}B`
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(decimals)}M`
    }
    return `$${value.toFixed(decimals)}`
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-600 dark:text-gray-400">Loading market data...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 dark:text-red-400">{error}</div>
          </div>
        ) : marketData ? (
          <div className="space-y-6">
            {/* Stock Price Card with Chart */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2" style={{ maxWidth: '350px' }}>
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-bold text-gray-600 dark:text-gray-400 ml-2">AAPL</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(marketData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span
                    className={`text-sm font-medium mr-12 ${
                      marketData.priceChange >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {marketData.priceChange >= 0 ? '+' : ''}
                    {marketData.priceChange.toFixed(2)} (
                    {marketData.priceChangePercent >= 0 ? '+' : ''}
                    {marketData.priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Simple Canvas Chart */}
              {marketData.priceHistory && marketData.priceHistory.length > 0 ? (
                <SimpleCanvasChart data={marketData.priceHistory} />
              ) : (
                <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {marketData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : null}
      </main>
    </div>
  )
}
