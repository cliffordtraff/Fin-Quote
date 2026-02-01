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

    // kick slow once on mount so long-lived tabs eventually refresh slow sections
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

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, mostActive, trending, sp500Gainers, sp500Losers, vix } = data

  // Deterministic market summary (avoid fake/LLM placeholder copy)
  const summarize = () => {
    const parts: string[] = []
    if (sparklineIndices && sparklineIndices.length) {
      const byName: Record<string, string> = {}
      for (const idx of sparklineIndices) {
        if (!idx?.name) continue
        byName[idx.name] = `${idx.priceChangePercent >= 0 ? '+' : ''}${idx.priceChangePercent.toFixed(2)}%`
      }
      const sp = byName['S&P 500'] || byName['S&P']
      const nd = byName['NASDAQ']
      const dw = byName['DOW'] || byName['Dow']
      if (sp) parts.push(`S&P 500 ${sp}`)
      if (dw) parts.push(`Dow ${dw}`)
      if (nd) parts.push(`Nasdaq ${nd}`)
    }
    if (vix?.changesPercentage !== undefined) {
      parts.push(`VIX ${vix.changesPercentage >= 0 ? '+' : ''}${vix.changesPercentage.toFixed(2)}%`)
    }
    return parts.length ? `Today: ${parts.join(' · ')}` : ''
  }
  const marketSummary = summarize()

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      )}

      {/* Market Summary Sentence */}
      {marketSummary && (
        <div className="mb-3">
          <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
            {marketSummary}
          </p>
        </div>
      )}

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

        {/* Economic Calendar and Sector Column */}
        <div className="flex flex-col gap-4 justify-self-end">
          {economicEvents.length > 0 && (
            <div className="w-full lg:w-[400px]">
              <EconomicCalendar events={economicEvents} />
            </div>
          )}
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
    </div>
  )
}
