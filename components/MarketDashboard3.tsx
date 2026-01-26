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
import MarketTrends2 from '@/components/MarketTrends2'
import SP500PerformanceChart from '@/components/SP500PerformanceChart'
import MarketInsights from '@/components/MarketInsights'
import AfterHours from '@/components/AfterHours'
import EarningsCalendar from '@/components/EarningsCalendar'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import ForexBondsTable from '@/components/ForexBondsTable'
import MarketSessions from '@/components/MarketSessions'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData } from '@/lib/market-types'

interface MarketDashboard3Props {
  initialData: AllMarketData
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'

export default function MarketDashboard3({ initialData }: MarketDashboard3Props) {
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

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, sp500Gainers, sp500Losers, earnings, sp500GainerSparklines, sp500LoserSparklines, metaSparkline, xlbSparkline, forexBonds, largeInsiderTrades, globalIndexQuotes, globalFuturesQuotes } = data

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
        <div className="mb-4 w-full">
          <IndexSparklines indices={sparklineIndices} />
        </div>
      )}

      {/* Market Trends Tables and Insights */}
      <div className="flex gap-4 mb-8">
        <MarketTrends2
          gainers={gainers}
          losers={losers}
        />
        {/* Market Insights, After Hours, and Calendars stacked */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <MarketInsights />
            <AfterHours />
          </div>
          <div className="flex gap-4">
            {economicEvents.length > 0 && (
              <EconomicCalendar events={economicEvents} />
            )}
            {earnings.length > 0 && (
              <EarningsCalendar earnings={earnings} />
            )}
          </div>
        </div>
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

        {/* Sector Column */}
        <div className="flex flex-col gap-4 justify-self-end">
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

      {/* Forex & Bonds Table, Insider Trades, and Market Sessions Timeline */}
      <div className="flex gap-4 mb-8 justify-center">
        {forexBonds.length > 0 && (
          <ForexBondsTable data={forexBonds} />
        )}
        {largeInsiderTrades.length > 0 && (
          <TopInsiderTrades trades={largeInsiderTrades} />
        )}
        <MarketSessions hideTable={true} indexQuotes={globalIndexQuotes} futuresQuotes={globalFuturesQuotes} />
      </div>

      {/* Top S&P 500 Gainer/Loser Sparklines Carousel */}
      {(sp500GainerSparklines.length > 0 || sp500LoserSparklines.length > 0) && (
        <div className="mb-8">
          <TopGainerSparklines sparklines={sp500GainerSparklines} loserSparklines={sp500LoserSparklines} />
        </div>
      )}
    </div>
  )
}
