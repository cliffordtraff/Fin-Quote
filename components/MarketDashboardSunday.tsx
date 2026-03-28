'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import FuturesTable from '@/components/FuturesTable'
import MarketMoversTable from '@/components/MarketMoversTable'
import StocksTable from '@/components/StocksTable'
import SectorHeatmap from '@/components/SectorHeatmap'
import MarketHeadlines from '@/components/MarketHeadlines'
import IndexSparklines from '@/components/IndexSparklines'
import MarketTrendsCombined from '@/components/MarketTrendsCombined'
import SP500PerformanceChart from '@/components/SP500PerformanceChart'
import MarketInsights from '@/components/MarketInsights'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import ForexBondsTable from '@/components/ForexBondsTable'
import MarketSessions from '@/components/MarketSessions'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import { getMarketSummary } from '@/app/actions/market-summary'
import { getMarketTrendsResponses, type MarketTrendsBullet } from '@/app/actions/market-trends-responses'

import type { AllMarketData } from '@/lib/market-types'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import { useTimezone, getTimezoneAbbr } from '@/lib/timezone-context'
import { formatTimeInTimezone } from '@/lib/timezone-utils'

interface MarketDashboardSundayProps {
  initialData: AllMarketData
  chartOfDaySpec: NewsletterChartSpec
}

const ENABLE_MOVERS = process.env.NEXT_PUBLIC_ENABLE_MOVERS === 'true'
const tertiaryCardWidthStyle: CSSProperties = {
  width: 'calc((100% - 2rem) / 3)',
}

export default function MarketDashboardSunday({
  initialData,
  chartOfDaySpec,
}: MarketDashboardSundayProps) {
  const { timezone } = useTimezone()
  const [data, setData] = useState<AllMarketData>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // Initialize from server-fetched cache (shows immediately if available)
  const [marketSummary, setMarketSummary] = useState<string>(initialData.marketSummary || '')
  const [marketSummaryLoading, setMarketSummaryLoading] = useState(!initialData.marketSummary)
  const [summaryLastUpdated, setSummaryLastUpdated] = useState<Date | null>(null)

  // Market Trends bullet points state (for MarketInsights component)
  // Initialize from server-fetched cache (shows immediately if available)
  const [responsesApiBullets, setResponsesApiBullets] = useState<MarketTrendsBullet[]>(initialData.marketTrendsBullets || [])
  const [responsesLoading, setResponsesLoading] = useState(!initialData.marketTrendsBullets?.length)
  const [responsesError, setResponsesError] = useState<string | undefined>()
  const [responsesGeneratedAt, setResponsesGeneratedAt] = useState<string | undefined>()


  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Function to fetch market summary (for "What's Happening Today")
  const fetchSummary = async (forceRefresh = false) => {
    setMarketSummaryLoading(true)
    try {
      // Use cash session data for LLM summary (main trading hours)
      const result = await getMarketSummary({
        gainers: data.gainers.cash,
        losers: data.losers.cash,
        sectors: data.sectors,
        indices: data.sparklineIndices,
        forexBonds: data.forexBonds,
        vix: data.vix,
        marketNews: data.marketNews,
      }, forceRefresh)
      if (result.summary) {
        setMarketSummary(result.summary)
        setSummaryLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch market summary:', error)
    } finally {
      setMarketSummaryLoading(false)
    }
  }

  // Function to fetch bullet points from Responses API (for MarketInsights/Market Trends)
  const fetchResponsesBullets = async () => {
    setResponsesLoading(true)
    setResponsesError(undefined)
    try {
      // Use cash session data for LLM trends (main trading hours)
      const result = await getMarketTrendsResponses({
        gainers: data.gainers.cash,
        losers: data.losers.cash,
        sectors: data.sectors,
        indices: data.sparklineIndices,
        forexBonds: data.forexBonds,
        vix: data.vix,
      })
      if (result.error) {
        setResponsesError(result.error)
      } else {
        setResponsesApiBullets(result.bullets)
        setResponsesGeneratedAt(result.generatedAt)
      }
    } catch (error) {
      console.error('Failed to fetch Responses API bullets:', error)
      setResponsesError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setResponsesLoading(false)
    }
  }

  // Fetch market summary and bullet points on mount
  useEffect(() => {
    // Only fetch summary if not already loaded from server cache
    if (!initialData.marketSummary) {
      fetchSummary()
    }
    // Only fetch trends bullets if not already loaded from server cache
    if (!initialData.marketTrendsBullets?.length) {
      fetchResponsesBullets()
    }
  }, []) // Only run on mount, not on data changes

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

    // Refresh slow once on mount (long-lived tabs)
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

  const { futures, gainers, losers, stocks, sectors, economicEvents, marketNews, sparklineIndices, sp500Gainers, sp500Losers, earnings, earningsTotalCount, sp500GainerSparklines, sp500LoserSparklines, metaSparkline, xlbSparkline, forexBonds, largeInsiderTrades, globalIndexQuotes, globalFuturesQuotes } = data

  // Extract the opening line from market summary (first line before double newline)
  // This gives us the market status/date line to show at the top of the page
  const { topSummary, summaryBody } = (() => {
    if (!marketSummary) {
      return { topSummary: '', summaryBody: '' }
    }
    // Split on double newline to separate headline from body
    const parts = marketSummary.split(/\n\n/)
    if (parts.length > 1) {
      return { topSummary: parts[0].trim(), summaryBody: parts.slice(1).join('\n\n').trim() }
    }
    // Fallback: use first sentence
    const firstSentenceMatch = marketSummary.match(/^[^.!?]+[.!?]/)
    if (firstSentenceMatch) {
      return {
        topSummary: firstSentenceMatch[0].trim(),
        summaryBody: marketSummary.slice(firstSentenceMatch[0].length).trim()
      }
    }
    return { topSummary: '', summaryBody: marketSummary }
  })()

  return (
    <div className="w-full max-w-[1400px] mx-auto px-6">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {formatTimeInTimezone(lastUpdated, timezone)} {getTimezoneAbbr(timezone)}
        </div>
      )}

      {/* Market Summary Sentence (extracted from LLM summary) */}
      <div className="mb-3">
        {marketSummaryLoading ? (
          <p className="text-base text-gray-400 dark:text-gray-500 leading-relaxed animate-pulse">
            Loading market summary...
          </p>
        ) : topSummary ? (
          <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
            {topSummary}
          </p>
        ) : null}
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
          sp500Losers={sp500Losers}
          chartOfDaySpec={chartOfDaySpec}
        />
      </div>

      {/* Market Insights + Stocks Table */}
      <div className="flex gap-4 mb-8 items-stretch">
        <div className="flex-1 min-w-0">
          <MarketInsights
            responsesApiBullets={responsesApiBullets}
            responsesLoading={responsesLoading}
            responsesError={responsesError}
            onRefreshResponses={fetchResponsesBullets}
            responsesGeneratedAt={responsesGeneratedAt}
            marketSummary={summaryBody}
            marketSummaryLoading={marketSummaryLoading}
            onRefreshSummary={() => fetchSummary(true)}
            summaryLastUpdated={summaryLastUpdated}
          />
        </div>
        {stocks.length > 0 && (
          <div className="w-[180px] shrink-0 self-stretch">
            <StocksTable stocks={stocks} />
          </div>
        )}
      </div>

      {/* Futures, Insider Trades, and Global Markets */}
      {(futures.length > 0 || largeInsiderTrades.length > 0 || globalIndexQuotes.length > 0 || globalFuturesQuotes.length > 0) && (
        <div className="mb-4 flex gap-4 items-start">
          {futures.length > 0 && (
            <div className="shrink-0 self-stretch" style={tertiaryCardWidthStyle}>
              <FuturesTable futures={futures} />
            </div>
          )}
          {largeInsiderTrades.length > 0 && (
            <div className="shrink-0" style={tertiaryCardWidthStyle}>
              <TopInsiderTrades trades={largeInsiderTrades} />
            </div>
          )}
          <div className="shrink-0 self-stretch" style={tertiaryCardWidthStyle}>
            <MarketSessions hideTable={true} indexQuotes={globalIndexQuotes} futuresQuotes={globalFuturesQuotes} />
          </div>
        </div>
      )}

      {/* Gainers, Losers */}
      {ENABLE_MOVERS && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <MarketMoversTable title="Gainers" data={gainers} />
          <MarketMoversTable title="Losers" data={losers} />
        </div>
      )}

      {/* Forex & Bonds Table */}
      {forexBonds.length > 0 && (
        <div className="mb-8" style={tertiaryCardWidthStyle}>
          <ForexBondsTable data={forexBonds} />
        </div>
      )}

      {/* Top S&P 500 Gainer/Loser Sparklines Carousel */}
      {(sp500GainerSparklines.length > 0 || sp500LoserSparklines.length > 0) && (
        <div className="mb-8">
          <TopGainerSparklines sparklines={sp500GainerSparklines} loserSparklines={sp500LoserSparklines} />
        </div>
      )}
    </div>
  )
}
