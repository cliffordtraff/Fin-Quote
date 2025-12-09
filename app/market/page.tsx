'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import FuturesTable from '@/components/FuturesTable'
import GainersTable from '@/components/GainersTable'
import LosersTable from '@/components/LosersTable'
import StocksTable from '@/components/StocksTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import VIXCard from '@/components/VIXCard'
import EconomicCalendar from '@/components/EconomicCalendar'
import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData } from '@/app/actions/market-data'
import { getFuturesData } from '@/app/actions/futures'
import { getGainersData } from '@/app/actions/gainers'
import { getLosersData } from '@/app/actions/losers'
import { getStocksData } from '@/app/actions/stocks'
import { getSectorPerformance } from '@/app/actions/sectors'
import { getVIXData } from '@/app/actions/vix'
import { getEconomicEvents } from '@/app/actions/economic-calendar'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { StockData } from '@/app/actions/stocks'
import type { SectorData } from '@/app/actions/sectors'
import type { VIXData } from '@/app/actions/vix'
import type { EconomicEvent } from '@/app/actions/economic-calendar'

interface MarketData {
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export default function MarketPage() {
  // Market data state
  const [spxData, setSpxData] = useState<MarketData | null>(null)
  const [nasdaqData, setNasdaqData] = useState<MarketData | null>(null)
  const [dowData, setDowData] = useState<MarketData | null>(null)
  const [russellData, setRussellData] = useState<MarketData | null>(null)
  const [futuresData, setFuturesData] = useState<FutureData[]>([])
  const [gainersData, setGainersData] = useState<GainerData[]>([])
  const [losersData, setLosersData] = useState<LoserData[]>([])
  const [stocksData, setStocksData] = useState<StockData[]>([])
  const [sectorsData, setSectorsData] = useState<SectorData[]>([])
  const [vixData, setVixData] = useState<VIXData | null>(null)
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all market data in parallel
        const [spxResult, nasdaqResult, dowResult, russellResult, futuresResult, gainersResult, losersResult, stocksResult, sectorsResult, vixResult, economicResult] = await Promise.all([
          getAaplMarketData(),
          getNasdaqMarketData(),
          getDowMarketData(),
          getRussellMarketData(),
          getFuturesData(),
          getGainersData(),
          getLosersData(),
          getStocksData(),
          getSectorPerformance(),
          getVIXData(),
          getEconomicEvents()
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

        if ('error' in futuresResult) {
          console.error('Futures data error:', futuresResult.error)
        } else {
          setFuturesData(futuresResult.futures)
        }

        if ('error' in gainersResult) {
          console.error('Gainers data error:', gainersResult.error)
        } else {
          setGainersData(gainersResult.gainers)
        }

        if ('error' in losersResult) {
          console.error('Losers data error:', losersResult.error)
        } else {
          setLosersData(losersResult.losers)
        }

        if ('error' in stocksResult) {
          console.error('Stocks data error:', stocksResult.error)
        } else {
          setStocksData(stocksResult.stocks)
        }

        if ('error' in sectorsResult) {
          console.error('Sector performance data error:', sectorsResult.error)
        } else if ('sectors' in sectorsResult) {
          setSectorsData(sectorsResult.sectors)
        }

        if ('error' in vixResult) {
          console.error('VIX data error:', vixResult.error)
        } else if ('vix' in vixResult) {
          setVixData(vixResult.vix)
        }

        if ('error' in economicResult) {
          console.error('Economic calendar error:', economicResult.error)
        } else if ('events' in economicResult) {
          setEconomicEvents(economicResult.events)
        }
      } catch (err) {
        setError('Failed to load market data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Refresh data every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
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
          <div className="flex flex-col items-center relative">
            <div className="flex gap-6 items-start">
          {/* SPX Chart */}
          {spxData && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
              <div className="mb-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">SPX</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(spxData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                <SimpleCanvasChart
                  data={spxData.priceHistory}
                  previousClose={spxData.currentPrice - spxData.priceChange}
                  currentPrice={spxData.currentPrice}
                />
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
              <div className="mb-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">NASDAQ</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(nasdaqData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                <SimpleCanvasChart
                  data={nasdaqData.priceHistory}
                  previousClose={nasdaqData.currentPrice - nasdaqData.priceChange}
                  currentPrice={nasdaqData.currentPrice}
                />
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
              <div className="mb-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">DOW</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(dowData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                <SimpleCanvasChart
                  data={dowData.priceHistory}
                  previousClose={dowData.currentPrice - dowData.priceChange}
                  currentPrice={dowData.currentPrice}
                />
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
              <div className="mb-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">RUSSELL</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(russellData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                <SimpleCanvasChart
                  data={russellData.priceHistory}
                  previousClose={russellData.currentPrice - russellData.priceChange}
                  currentPrice={russellData.currentPrice}
                />
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

            {/* Gainers, Losers, VIX, and Sector Performance */}
            <div className="mt-12 flex gap-8 self-start ml-[-50px]">
              {/* Gainers Table */}
              {gainersData.length > 0 && (
                <div>
                  <GainersTable gainers={gainersData} />
                </div>
              )}

              {/* Losers Table */}
              {losersData.length > 0 && (
                <div>
                  <LosersTable losers={losersData} />
                </div>
              )}

              {/* VIX Card and Stocks Table Column */}
              <div className="flex flex-col gap-4">
                <VIXCard vix={vixData} />

                {/* Stocks Table */}
                {stocksData.length > 0 && (
                  <div>
                    <StocksTable stocks={stocksData} />
                  </div>
                )}
              </div>

              {/* Sector Performance Heatmap */}
              {sectorsData.length > 0 && (
                <div style={{ width: '250px' }}>
                  <SectorHeatmap sectors={sectorsData} />
                </div>
              )}
            </div>

            {/* Futures Table and Economic Calendar */}
            <div className="mt-8 flex gap-8 self-start ml-[-50px]">
              {/* Futures Table */}
              {futuresData.length > 0 && (
                <div>
                  <FuturesTable futures={futuresData} />
                </div>
              )}

              {/* Economic Calendar */}
              {economicEvents.length > 0 && (
                <div style={{ width: '400px' }}>
                  <EconomicCalendar events={economicEvents} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
