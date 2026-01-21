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
import MarketHeadlines from '@/components/MarketHeadlines'
import IndexSparklines from '@/components/IndexSparklines'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData, MarketData, FutureMarketData } from '@/lib/market-types'

interface MarketDashboardProps {
  initialData: AllMarketData
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'

type IndexKey = 'spx' | 'nasdaq' | 'russell' | 'esFutures'

const INDEX_CONFIG: { key: IndexKey; label: string; ticker: string }[] = [
  { key: 'spx', label: 'S&P 500', ticker: 'SPX' },
  { key: 'nasdaq', label: 'NASDAQ', ticker: 'IXIC' },
  { key: 'russell', label: 'Russell 2000', ticker: 'RUT' },
  { key: 'esFutures', label: '/ES Futures', ticker: 'ES=F' },
]

export default function MarketDashboard({ initialData }: MarketDashboardProps) {
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<IndexKey>('spx')
  const [selectedFuture, setSelectedFuture] = useState<string>('CL=F')

  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Polling effect - refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const freshData = await fetchAllMarketData()
        setData(freshData)
        setLastUpdated(new Date())
      } catch (error) {
        console.error('Failed to refresh market data:', error)
        // Keep showing last good data on error
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const { spx, nasdaq, russell, esFutures, futures, futuresWithHistory, gainers, losers, stocks, sectors, vix, economicEvents, marketNews, sparklineIndices } = data

  // Get the currently selected index data
  const indexData: Record<IndexKey, MarketData | null> = {
    spx,
    nasdaq,
    russell,
    esFutures,
  }
  const selectedData = indexData[selectedIndex]
  const selectedConfig = INDEX_CONFIG.find(c => c.key === selectedIndex)!

  // Placeholder for LLM-generated market summary
  const marketSummary = "Stocks are rebounding from a sharp sell-off on Tuesday, after President Trump stated the U.S. would not use force to acquire Greenland, easing geopolitical concerns."

  return (
    <div className="flex flex-col items-center relative">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="self-end mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Market Summary Sentence */}
      <div className="self-start ml-[-50px] mb-3" style={{ width: '1300px' }}>
        <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          {marketSummary}
        </p>
      </div>

      {/* Index Sparklines - Top Row */}
      {sparklineIndices.length > 0 && (
        <div className="self-start ml-[-50px] mb-8">
          <IndexSparklines indices={sparklineIndices} />
        </div>
      )}

      {/* Index Chart with Selector Table */}
      <div className="flex gap-4 items-start self-start ml-[-50px]">
        {/* Main Chart */}
        {selectedData && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '500px', minWidth: '500px' }}>
            <div className="mb-0">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">{selectedConfig.label}</h2>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {new Date(selectedData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span
                  className={`text-xs font-medium mr-12 ${
                    selectedData.priceChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {selectedData.priceChange >= 0 ? '+' : ''}
                  {selectedData.priceChange.toFixed(2)} (
                  {selectedData.priceChangePercent >= 0 ? '+' : ''}
                  {selectedData.priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Simple Canvas Chart */}
            {selectedData.priceHistory && selectedData.priceHistory.length > 0 ? (
              <SimpleCanvasChart
                data={selectedData.priceHistory}
                previousClose={selectedData.currentPrice - selectedData.priceChange}
                currentPrice={selectedData.currentPrice}
                showYAxisLabels={true}
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedData.priceHistory ? 'No intraday data available' : 'Loading chart...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Index Selector Table */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '280px' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Index</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Price</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Change</th>
              </tr>
            </thead>
            <tbody>
              {INDEX_CONFIG.map(({ key, label }) => {
                const indexItem = indexData[key]
                if (!indexItem) return null
                const isSelected = selectedIndex === key
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedIndex(key)}
                    className={`cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <td className={`py-2 px-3 font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {label}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                      {indexItem.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 px-3 text-right font-medium ${
                      indexItem.priceChangePercent >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {indexItem.priceChangePercent >= 0 ? '+' : ''}
                      {indexItem.priceChangePercent.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Futures Chart */}
        {(() => {
          const selectedFutureData = futuresWithHistory.find(f => f.symbol === selectedFuture)
          if (!selectedFutureData) return null
          return (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0" style={{ width: '500px', minWidth: '500px' }}>
              <div className="mb-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">{selectedFutureData.name}</h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(selectedFutureData.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span
                    className={`text-xs font-medium mr-12 ${
                      selectedFutureData.priceChange >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {selectedFutureData.priceChange >= 0 ? '+' : ''}
                    {selectedFutureData.priceChange.toFixed(2)} (
                    {selectedFutureData.priceChangePercent >= 0 ? '+' : ''}
                    {selectedFutureData.priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Simple Canvas Chart */}
              {selectedFutureData.priceHistory && selectedFutureData.priceHistory.length > 0 ? (
                <SimpleCanvasChart
                  data={selectedFutureData.priceHistory}
                  previousClose={selectedFutureData.currentPrice - selectedFutureData.priceChange}
                  currentPrice={selectedFutureData.currentPrice}
                  showYAxisLabels={false}
                />
              ) : (
                <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No data available
                  </p>
                </div>
              )}
            </div>
          )
        })()}

        {/* Futures Selector Table */}
        {futuresWithHistory.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '280px' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Futures</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Price</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Change</th>
                </tr>
              </thead>
              <tbody>
                {futuresWithHistory.map((future) => {
                  const isSelected = selectedFuture === future.symbol
                  return (
                    <tr
                      key={future.symbol}
                      onClick={() => setSelectedFuture(future.symbol)}
                      className={`cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <td className={`py-2 px-3 font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {future.name}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                        {future.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${
                        future.priceChangePercent >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {future.priceChangePercent >= 0 ? '+' : ''}
                        {future.priceChangePercent.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gainers, Losers, VIX, and Sector Performance */}
      <div className="mt-12 flex gap-8 self-start ml-[-50px]">
        {/* Gainers Table */}
        {ENABLE_MOVERS && gainers.length > 0 && (
          <div>
            <GainersTable gainers={gainers} />
          </div>
        )}

        {/* Losers Table */}
        {ENABLE_MOVERS && losers.length > 0 && (
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

      {/* Headlines, Futures, and Economic Calendar */}
      <div className="mt-8 flex gap-8 self-start ml-[-50px]">
        {/* Market Headlines and Futures Column */}
        <div className="flex flex-col gap-4">
          {/* Market Headlines */}
          {marketNews.length > 0 && (
            <div style={{ width: '800px' }}>
              <MarketHeadlines news={marketNews} />
            </div>
          )}

          {/* Futures Table */}
          {futures.length > 0 && (
            <div>
              <FuturesTable futures={futures} />
            </div>
          )}
        </div>

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
