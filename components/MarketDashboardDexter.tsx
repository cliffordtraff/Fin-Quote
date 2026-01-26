'use client'

import { useEffect, useState } from 'react'
import FuturesTable from '@/components/FuturesTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import EconomicCalendar from '@/components/EconomicCalendar'
import MarketHeadlines from '@/components/MarketHeadlines'
import IndexSparklines from '@/components/IndexSparklines'
import MarketTrends2 from '@/components/MarketTrends2'
import AfterHours from '@/components/AfterHours'
import EarningsCalendar from '@/components/EarningsCalendar'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import ForexBondsTable from '@/components/ForexBondsTable'
import MarketSessions from '@/components/MarketSessions'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import DexterMarketSummary from '@/components/DexterMarketSummary'
import DexterQueryBox from '@/components/DexterQueryBox'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import type { AllMarketData } from '@/lib/market-types'
import type { DexterMarketSummaryResult } from '@/app/actions/dexter-market-summary'

interface MarketDashboardDexterProps {
  initialData: AllMarketData
  initialDexterSummary: DexterMarketSummaryResult | null
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'

export default function MarketDashboardDexter({ initialData, initialDexterSummary }: MarketDashboardDexterProps) {
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Polling effect - refresh market data every 60 seconds
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

  const { futures, gainers, losers, sectors, economicEvents, marketNews, sparklineIndices, sp500GainerSparklines, sp500LoserSparklines, earnings, forexBonds, largeInsiderTrades, globalIndexQuotes, globalFuturesQuotes } = data

  return (
    <div className="mx-auto px-4" style={{ width: '1360px' }}>
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Dexter Market Summary - Featured at top */}
      <div className="mb-6">
        <DexterMarketSummary
          initialSummary={initialDexterSummary}
          marketData={{
            indices: sparklineIndices,
            gainers,
            losers,
            sectors,
          }}
        />
      </div>

      {/* Dexter Query Box - Ask anything */}
      <div className="mb-6">
        <DexterQueryBox />
      </div>

      {/* Index Sparklines - Top Row */}
      {sparklineIndices.length > 0 && (
        <div className="mb-4 w-full">
          <IndexSparklines indices={sparklineIndices} />
        </div>
      )}

      {/* Market Trends Tables and Side Content */}
      <div className="flex gap-4 mb-8">
        <MarketTrends2
          gainers={gainers}
          losers={losers}
        />
        {/* After Hours and Calendars stacked */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
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

        {/* Spacer for second column */}
        <div className="self-start" />

        {/* Sector Column */}
        <div className="flex flex-col gap-4 justify-self-end">
          {sectors.length > 0 && (
            <div style={{ width: '400px' }}>
              <SectorHeatmap sectors={sectors} />
            </div>
          )}
        </div>
      </div>

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
