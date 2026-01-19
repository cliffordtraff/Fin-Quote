'use client'

import { useEffect, useState } from 'react'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import FuturesTable from '@/components/FuturesTable'
import GainersTable from '@/components/GainersTable'
import LosersTable from '@/components/LosersTable'
import StocksTable from '@/components/StocksTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import VIXCard from '@/components/VIXCard'
import EconomicCalendar from '@/components/EconomicCalendar'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData } from '@/lib/market-types'

interface MarketDashboardProps {
  initialData: AllMarketData
}

export default function MarketDashboard({ initialData }: MarketDashboardProps) {
  const [data, setData] = useState<AllMarketData>(initialData)

  // Debug: Log data on client
  useEffect(() => {
    console.log('MarketDashboard mounted, SPX data:', {
      hasSpx: !!data.spx,
      priceHistoryLength: data.spx?.priceHistory?.length,
      firstCandle: data.spx?.priceHistory?.[0],
    })
  }, [data.spx])

  // Polling effect - refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const freshData = await fetchAllMarketData()
        setData(freshData)
      } catch (error) {
        console.error('Failed to refresh market data:', error)
        // Keep showing last good data on error
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const { spx, nasdaq, dow, russell, futures, gainers, losers, stocks, sectors, vix, economicEvents } = data

  return (
    <div className="flex flex-col items-center relative">
      <div className="flex gap-6 items-start">
        {/* SPX Chart */}
        {spx && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
            <div className="mb-0">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">SPX</h2>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(spx.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className={`text-xs font-medium mr-12 ${
                    spx.priceChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {spx.priceChange >= 0 ? '+' : ''}
                  {spx.priceChange.toFixed(2)} (
                  {spx.priceChangePercent >= 0 ? '+' : ''}
                  {spx.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Simple Canvas Chart */}
            {spx.priceHistory && spx.priceHistory.length > 0 ? (
              <SimpleCanvasChart
                data={spx.priceHistory}
                previousClose={spx.currentPrice - spx.priceChange}
                currentPrice={spx.currentPrice}
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {spx.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Nasdaq Chart */}
        {nasdaq && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
            <div className="mb-0">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">NASDAQ</h2>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(nasdaq.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className={`text-xs font-medium mr-12 ${
                    nasdaq.priceChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {nasdaq.priceChange >= 0 ? '+' : ''}
                  {nasdaq.priceChange.toFixed(2)} (
                  {nasdaq.priceChangePercent >= 0 ? '+' : ''}
                  {nasdaq.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Simple Canvas Chart */}
            {nasdaq.priceHistory && nasdaq.priceHistory.length > 0 ? (
              <SimpleCanvasChart
                data={nasdaq.priceHistory}
                previousClose={nasdaq.currentPrice - nasdaq.priceChange}
                currentPrice={nasdaq.currentPrice}
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {nasdaq.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Dow Chart */}
        {dow && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
            <div className="mb-0">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">DOW</h2>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(dow.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className={`text-xs font-medium mr-12 ${
                    dow.priceChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {dow.priceChange >= 0 ? '+' : ''}
                  {dow.priceChange.toFixed(2)} (
                  {dow.priceChangePercent >= 0 ? '+' : ''}
                  {dow.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Simple Canvas Chart */}
            {dow.priceHistory && dow.priceHistory.length > 0 ? (
              <SimpleCanvasChart
                data={dow.priceHistory}
                previousClose={dow.currentPrice - dow.priceChange}
                currentPrice={dow.currentPrice}
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {dow.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Russell 2000 Chart */}
        {russell && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '310px', minWidth: '310px' }}>
            <div className="mb-0">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">RUSSELL 2000</h2>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(russell.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className={`text-xs font-medium mr-12 ${
                    russell.priceChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {russell.priceChange >= 0 ? '+' : ''}
                  {russell.priceChange.toFixed(2)} (
                  {russell.priceChangePercent >= 0 ? '+' : ''}
                  {russell.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Simple Canvas Chart */}
            {russell.priceHistory && russell.priceHistory.length > 0 ? (
              <SimpleCanvasChart
                data={russell.priceHistory}
                previousClose={russell.currentPrice - russell.priceChange}
                currentPrice={russell.currentPrice}
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {russell.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gainers, Losers, VIX, and Sector Performance */}
      <div className="mt-12 flex gap-8 self-start ml-[-50px]">
        {/* Gainers Table */}
        {gainers.length > 0 && (
          <div>
            <GainersTable gainers={gainers} />
          </div>
        )}

        {/* Losers Table */}
        {losers.length > 0 && (
          <div>
            <LosersTable losers={losers} />
          </div>
        )}

        {/* VIX Card and Stocks Table Column */}
        <div className="flex flex-col gap-4">
          <VIXCard vix={vix} />

          {/* Stocks Table */}
          {stocks.length > 0 && (
            <div>
              <StocksTable stocks={stocks} />
            </div>
          )}
        </div>

        {/* Sector Performance Heatmap */}
        {sectors.length > 0 && (
          <div style={{ width: '250px' }}>
            <SectorHeatmap sectors={sectors} />
          </div>
        )}
      </div>

      {/* Futures Table and Economic Calendar */}
      <div className="mt-8 flex gap-8 self-start ml-[-50px]">
        {/* Futures Table */}
        {futures.length > 0 && (
          <div>
            <FuturesTable futures={futures} />
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
  )
}
