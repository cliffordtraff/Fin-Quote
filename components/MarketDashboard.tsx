'use client'

import { useEffect, useState } from 'react'
import SimpleCanvasChart from '@/components/SimpleCanvasChart'
import FuturesTable from '@/components/FuturesTable'
import GainersTable from '@/components/GainersTable'
import LosersTable from '@/components/LosersTable'
import StocksTable from '@/components/StocksTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import EconomicCalendar from '@/components/EconomicCalendar'
import MarketHeadlines from '@/components/MarketHeadlines'
import IndexSparklines from '@/components/IndexSparklines'
import MarketTrends from '@/components/MarketTrends'
import MarketSessions from '@/components/MarketSessions'
import SP500MoversTable from '@/components/SP500MoversTable'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData, MarketData } from '@/lib/market-types'

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
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const { spx, nasdaq, russell, esFutures, futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, mostActive, trending, sp500Gainers, sp500Losers } = data

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
    <div className="w-fit mx-auto pl-4 pr-8">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Market Summary Sentence */}
      <div className="mb-3">
        <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          {marketSummary}
        </p>
      </div>

      {/* Index Sparklines - Top Row */}
      {sparklineIndices.length > 0 && (
        <div className="mb-4">
          <IndexSparklines indices={sparklineIndices} />
        </div>
      )}

      {/* Market Trends Table and S&P 500 Movers */}
      <div className="flex gap-4 mb-8" style={{ width: '1360px' }}>
        {mostActive.length > 0 && (
          <MarketTrends
            mostActive={mostActive}
            gainers={gainers}
            losers={losers}
            trending={trending}
          />
        )}

        {sp500Gainers.length > 0 && (
          <SP500MoversTable data={sp500Gainers.slice(0, 15)} type="gainers" />
        )}

        {sp500Losers.length > 0 && (
          <SP500MoversTable data={sp500Losers.slice(0, 15)} type="losers" />
        )}
      </div>

      {/* Main Content Grid */}
      <div
        className="grid gap-4 mb-8 w-full"
        style={{
          gridTemplateColumns: 'minmax(400px, 500px) 280px 180px 1fr',
          gridTemplateRows: 'auto auto auto',
        }}
      >
        {/* Row 1: Chart + Headlines Column, Index Selector, Stocks, Economic Calendar */}
        {/* Chart and Headlines Column */}
        <div className="flex flex-col gap-4 self-start">
          {/* Main Chart */}
          {selectedData && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-2 pb-2 pl-2 pr-0">
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

          {/* Headlines */}
          {marketNews.length > 0 && (
            <div style={{ width: '600px' }}>
              <MarketHeadlines news={marketNews} />
            </div>
          )}

          {/* Futures */}
          {futures.length > 0 && (
            <FuturesTable futures={futures} />
          )}

          {/* Market Sessions */}
          <MarketSessions />
        </div>

        {/* Index Selector Table */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden self-start">
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

        {/* Stocks Table */}
        {stocks.length > 0 && (
          <div className="self-start">
            <StocksTable stocks={stocks} />
          </div>
        )}

        {/* Economic Calendar and Sector Column */}
        <div className="flex flex-col gap-4 justify-self-end">
          {economicEvents.length > 0 && (
            <div style={{ width: '400px' }}>
              <EconomicCalendar events={economicEvents} />
            </div>
          )}
          {sectors.length > 0 && (
            <div style={{ width: '400px' }}>
              <SectorHeatmap sectors={sectors} />
            </div>
          )}
        </div>

      </div>

      {/* Gainers, Losers */}
      {ENABLE_MOVERS && (
        <div className="flex gap-8">
          {gainers.length > 0 && (
            <GainersTable gainers={gainers} />
          )}
          {losers.length > 0 && (
            <LosersTable losers={losers} />
          )}
        </div>
      )}
    </div>
  )
}
