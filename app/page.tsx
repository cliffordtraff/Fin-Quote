'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData } from '@/app/actions/market-data'

interface MarketData {
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

export default function Home() {
  const [spxData, setSpxData] = useState<MarketData | null>(null)
  const [nasdaqData, setNasdaqData] = useState<MarketData | null>(null)
  const [dowData, setDowData] = useState<MarketData | null>(null)
  const [russellData, setRussellData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch SPX, Nasdaq, Dow, and Russell data in parallel
        const [spxResult, nasdaqResult, dowResult, russellResult] = await Promise.all([
          getAaplMarketData(),
          getNasdaqMarketData(),
          getDowMarketData(),
          getRussellMarketData()
        ])

        if ('error' in spxResult) {
          setError(spxResult.error)
        } else {
          console.log('SPX data received:', {
            hasPriceHistory: !!spxResult.priceHistory,
            priceHistoryLength: spxResult.priceHistory?.length,
          })
          setSpxData(spxResult as MarketData)
        }

        if ('error' in nasdaqResult) {
          setError(nasdaqResult.error)
        } else {
          console.log('Nasdaq data received:', {
            hasPriceHistory: !!nasdaqResult.priceHistory,
            priceHistoryLength: nasdaqResult.priceHistory?.length,
          })
          setNasdaqData(nasdaqResult as MarketData)
        }

        if ('error' in dowResult) {
          setError(dowResult.error)
        } else {
          console.log('Dow data received:', {
            hasPriceHistory: !!dowResult.priceHistory,
            priceHistoryLength: dowResult.priceHistory?.length,
          })
          setDowData(dowResult as MarketData)
        }

        if ('error' in russellResult) {
          setError(russellResult.error)
        } else {
          console.log('Russell data received:', {
            hasPriceHistory: !!russellResult.priceHistory,
            priceHistoryLength: russellResult.priceHistory?.length,
          })
          setRussellData(russellResult as MarketData)
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-600 dark:text-gray-400">Loading market data...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 dark:text-red-400">{error}</div>
          </div>
        ) : (
          <div className="flex gap-6 justify-center">
            {/* SPX Chart */}
            {spxData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">SPX</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(spxData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        spxData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {spxData.priceChange >= 0 ? '+' : ''}
                      {spxData.priceChange.toFixed(2)} (
                      {spxData.priceChangePercent >= 0 ? '+' : ''}
                      {spxData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {spxData.priceHistory && spxData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart data={spxData.priceHistory} />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {spxData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Nasdaq Chart */}
            {nasdaqData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">NASDAQ</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(nasdaqData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        nasdaqData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {nasdaqData.priceChange >= 0 ? '+' : ''}
                      {nasdaqData.priceChange.toFixed(2)} (
                      {nasdaqData.priceChangePercent >= 0 ? '+' : ''}
                      {nasdaqData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {nasdaqData.priceHistory && nasdaqData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart data={nasdaqData.priceHistory} />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {nasdaqData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dow Chart */}
            {dowData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">DOW</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(dowData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        dowData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {dowData.priceChange >= 0 ? '+' : ''}
                      {dowData.priceChange.toFixed(2)} (
                      {dowData.priceChangePercent >= 0 ? '+' : ''}
                      {dowData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {dowData.priceHistory && dowData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart data={dowData.priceHistory} yAxisInterval={100} />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {dowData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Russell 2000 Chart */}
            {russellData && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
                <div className="mb-0">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">RUSSELL</h2>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(russellData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span
                      className={`text-xs font-medium mr-12 ${
                        russellData.priceChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {russellData.priceChange >= 0 ? '+' : ''}
                      {russellData.priceChange.toFixed(2)} (
                      {russellData.priceChangePercent >= 0 ? '+' : ''}
                      {russellData.priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Simple Canvas Chart */}
                {russellData.priceHistory && russellData.priceHistory.length > 0 ? (
                  <SimpleCanvasChart data={russellData.priceHistory} yAxisInterval={1} />
                ) : (
                  <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {russellData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
