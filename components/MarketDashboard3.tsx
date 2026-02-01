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

  async function fetchFast() {
    const res = await fetch('/api/market-snapshot/fast')
    if (!res.ok) throw new Error(`fast snapshot fetch failed: ${res.status}`)
    return (await res.json()) as Partial<AllMarketData>
  }

  async function fetchSlow() {
    const res = await fetch('/api/market-snapshot/slow')
    if (!res.ok) throw new Error(`slow snapshot fetch failed: ${res.status}`)
    return (await res.json()) as Partial<AllMarketData>
  }

  // Polling effect - fast data every 60s, slow data every 10 min
  useEffect(() => {
    const apply = (patch: Partial<AllMarketData>) => {
      setData((prev) => ({ ...prev, ...patch }))
      setLastUpdated(new Date())
    }

    fetchSlow().then(apply).catch((e) => console.error('Failed to refresh slow market data:', e))

    const fastInterval = setInterval(async () => {
      try {
        apply(await fetchFast())
      } catch (error) {
        console.error('Failed to refresh fast market data:', error)
      }
    }, 60000)

    const slowInterval = setInterval(async () => {
      try {
        apply(await fetchSlow())
      } catch (error) {
        console.error('Failed to refresh slow market data:', error)
      }
    }, 600000)

    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
    }
  }, [])

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, sp500Gainers, sp500Losers, earnings, sp500GainerSparklines, sp500LoserSparklines, metaSparkline, xlbSparkline, forexBonds } = data

  // Placeholder for LLM-generated market summary
  const marketSummary = "U.S. stock markets are broadly higher today, extending a relief rally that began Wednesday."

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4">
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
      <div className="grid gap-4 mb-8 w-full grid-cols-1 lg:grid-cols-[600px_180px_1fr]">
        {/* Headlines Column */}
        <div className="flex flex-col gap-4 self-start">
          {/* Headlines */}
          {marketNews.length > 0 && (
            <div className="w-full lg:w-[600px]">
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
            <div className="w-full lg:w-[400px]">
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

      {/* Forex & Bonds Table and Market Sessions */}
      <div className="flex gap-4 mb-8">
        {forexBonds.length > 0 && (
          <ForexBondsTable data={forexBonds} />
        )}
        <MarketSessions />
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
