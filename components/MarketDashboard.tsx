'use client'

import { useEffect, useState } from 'react'
import FuturesTable from '@/components/FuturesTable'
import GainersTable from '@/components/GainersTable'
import LosersTable from '@/components/LosersTable'
import StocksTable from '@/components/StocksTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import EconomicCalendar from '@/components/EconomicCalendar'
import MarketHeadlines from '@/components/MarketHeadlines'
import IndexSparklines from '@/components/IndexSparklines'
import MarketTrends from '@/components/MarketTrends'
import SP500PerformanceChart from '@/components/SP500PerformanceChart'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData } from '@/lib/market-types'

interface MarketDashboardProps {
  initialData: AllMarketData
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'

export default function MarketDashboard({ initialData }: MarketDashboardProps) {
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

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

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, mostActive, trending, sp500Gainers, sp500Losers } = data

  // Placeholder for LLM-generated market summary
  const marketSummary = "U.S. stock markets are broadly higher today, extending a relief rally that began Wednesday."

  return (
    <div className="mx-auto px-4" style={{ width: '1360px' }}>
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
      <div className="flex gap-4 mb-8">
        {mostActive.length > 0 && (
          <MarketTrends
            mostActive={mostActive}
            gainers={gainers}
            losers={losers}
            trending={trending}
          />
        )}

        {(sp500Gainers.length > 0 || sp500Losers.length > 0) && (
          <SP500PerformanceChart
            gainers={sp500Gainers.slice(0, 17)}
            losers={sp500Losers.slice(0, 17)}
          />
        )}
      </div>

      {/* Main Content Grid */}
      <div
        className="grid gap-4 mb-8 w-full"
        style={{
          gridTemplateColumns: '600px 180px 1fr',
          gridTemplateRows: 'auto auto auto',
        }}
      >
        {/* Headlines Column */}
        <div className="flex flex-col gap-4 self-start">
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
