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
import MarketTrendsCombined from '@/components/MarketTrendsCombined'
import SP500PerformanceChart from '@/components/SP500PerformanceChart'
import MarketInsights from '@/components/MarketInsights'
import EarningsCalendar from '@/components/EarningsCalendar'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import ForexBondsTable from '@/components/ForexBondsTable'
import MarketSessions from '@/components/MarketSessions'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import { getMarketSummary } from '@/app/actions/market-summary'
import type { AllMarketData } from '@/lib/market-types'

interface MarketDashboardSundayProps {
  initialData: AllMarketData
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'

export default function MarketDashboardSunday({ initialData }: MarketDashboardSundayProps) {
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [marketSummary, setMarketSummary] = useState<string>('')
  const [marketSummaryLoading, setMarketSummaryLoading] = useState(true)

  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Fetch market summary on mount (using market data for context)
  useEffect(() => {
    async function fetchSummary() {
      setMarketSummaryLoading(true)
      try {
        const result = await getMarketSummary({
          gainers: data.gainers,
          losers: data.losers,
          sectors: data.sectors,
          indices: data.sparklineIndices,
        })
        if (result.summary) {
          setMarketSummary(result.summary)
        }
      } catch (error) {
        console.error('Failed to fetch market summary:', error)
      } finally {
        setMarketSummaryLoading(false)
      }
    }
    fetchSummary()
  }, [data.gainers, data.losers, data.sectors, data.sparklineIndices])

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

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, sp500Gainers, sp500Losers, earnings, sp500GainerSparklines, sp500LoserSparklines, metaSparkline, xlbSparkline, forexBonds, largeInsiderTrades } = data

  // Placeholder for top-of-page summary sentence (separate from the card)
  const topSummary = "U.S. stock markets are broadly higher today, extending a relief rally that began Wednesday."

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Market Summary Sentence */}
      <div className="mb-3">
        <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          {topSummary}
        </p>
      </div>

      {/* Index Sparklines - Top Row */}
      {sparklineIndices.length > 0 && (
        <div className="mb-4">
          <IndexSparklines indices={sparklineIndices} />
        </div>
      )}

      {/* Combined Market Trends Table (Gainers, Losers, What's Happening Today) */}
      <div className="mb-8">
        <MarketTrendsCombined
          gainers={gainers}
          losers={losers}
          marketSummary={marketSummary}
          marketSummaryLoading={marketSummaryLoading}
        />
      </div>

      {/* Market Insights and Calendars */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1">
          <MarketInsights />
        </div>
        {economicEvents.length > 0 && (
          <div className="flex-1">
            <EconomicCalendar events={economicEvents} />
          </div>
        )}
        {earnings.length > 0 && (
          <div className="flex-1">
            <EarningsCalendar earnings={earnings} />
          </div>
        )}
      </div>

      {/* Main Content Grid - Headlines, Stocks, Sectors */}
      <div className="grid grid-cols-[1fr_180px_400px] gap-4 mb-8">
        {/* Headlines & Futures Column */}
        <div className="flex flex-col gap-4">
          {marketNews.length > 0 && (
            <MarketHeadlines news={marketNews} />
          )}
          {futures.length > 0 && (
            <FuturesTable futures={futures} />
          )}
        </div>

        {/* Stocks Table */}
        {stocks.length > 0 && (
          <div>
            <StocksTable stocks={stocks} />
          </div>
        )}

        {/* Sector Column */}
        <div>
          {sectors.length > 0 && (
            <SectorHeatmap sectors={sectors} />
          )}
        </div>
      </div>

      {/* Gainers, Losers */}
      {ENABLE_MOVERS && (
        <div className="flex gap-8 mb-8">
          {gainers.length > 0 && (
            <GainersTable gainers={gainers} />
          )}
          {losers.length > 0 && (
            <LosersTable losers={losers} />
          )}
        </div>
      )}

      {/* Forex & Bonds Table, Insider Trades, and Market Sessions Timeline */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div>
          {forexBonds.length > 0 && (
            <ForexBondsTable data={forexBonds} />
          )}
        </div>
        <div>
          {largeInsiderTrades.length > 0 && (
            <TopInsiderTrades trades={largeInsiderTrades} />
          )}
        </div>
        <div>
          <MarketSessions hideTable={true} />
        </div>
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
