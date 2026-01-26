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
import { getMarketTrendsResponses, type MarketTrendsBullet } from '@/app/actions/market-trends-responses'
import { getMarketTrendsAgents } from '@/app/actions/market-trends-agents'
import { getCalendarSummaries } from '@/app/actions/calendar-summaries'
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
  const [summaryLastUpdated, setSummaryLastUpdated] = useState<Date | null>(null)

  // Market Trends bullet points state (for MarketInsights component)
  const [responsesApiBullets, setResponsesApiBullets] = useState<MarketTrendsBullet[]>([])
  const [agentsSdkBullets, setAgentsSdkBullets] = useState<MarketTrendsBullet[]>([])
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [responsesError, setResponsesError] = useState<string | undefined>()
  const [agentsError, setAgentsError] = useState<string | undefined>()
  const [responsesGeneratedAt, setResponsesGeneratedAt] = useState<string | undefined>()
  const [agentsGeneratedAt, setAgentsGeneratedAt] = useState<string | undefined>()

  // Calendar summaries state
  const [economicSummary, setEconomicSummary] = useState<string>('')
  const [earningsSummary, setEarningsSummary] = useState<string>('')

  // Set initial timestamp on client mount to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Function to fetch market summary (for "What's Happening Today")
  const fetchSummary = async (forceRefresh = false) => {
    setMarketSummaryLoading(true)
    try {
      const result = await getMarketSummary({
        gainers: data.gainers,
        losers: data.losers,
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
      const result = await getMarketTrendsResponses({
        gainers: data.gainers,
        losers: data.losers,
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

  // Function to fetch bullet points from Agents SDK (for MarketInsights/Market Trends)
  const fetchAgentsBullets = async () => {
    setAgentsLoading(true)
    setAgentsError(undefined)
    try {
      const result = await getMarketTrendsAgents({
        gainers: data.gainers,
        losers: data.losers,
        sectors: data.sectors,
        indices: data.sparklineIndices,
        forexBonds: data.forexBonds,
        vix: data.vix,
      })
      if (result.error) {
        setAgentsError(result.error)
      } else {
        setAgentsSdkBullets(result.bullets)
        setAgentsGeneratedAt(result.generatedAt)
      }
    } catch (error) {
      console.error('Failed to fetch Agents SDK bullets:', error)
      setAgentsError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setAgentsLoading(false)
    }
  }

  // Function to fetch calendar summaries
  const fetchCalendarSummaries = async () => {
    try {
      const economicEvents = data.economicEvents.map(e => ({
        date: e.date,
        event: e.event,
        impact: e.impact,
        previous: e.previous,
        estimate: e.estimate,
      }))
      const earningsEvents = data.earnings.map(e => ({
        symbol: e.symbol,
        name: e.name,
        date: e.date,
        time: e.time,
      }))
      const result = await getCalendarSummaries(economicEvents, earningsEvents)
      if (result.economicSummary) setEconomicSummary(result.economicSummary)
      if (result.earningsSummary) setEarningsSummary(result.earningsSummary)
    } catch (error) {
      console.error('Failed to fetch calendar summaries:', error)
    }
  }

  // Fetch market summary and bullet points on mount
  useEffect(() => {
    fetchSummary()
    fetchResponsesBullets()
    fetchAgentsBullets()
    fetchCalendarSummaries()
  }, []) // Only run on mount, not on data changes

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
    <div className="w-full max-w-[1600px] mx-auto px-4">
      {/* Last Updated Note */}
      {lastUpdated && (
        <div className="text-right mb-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
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
          marketSummary={summaryBody}
          marketSummaryLoading={marketSummaryLoading}
          onRefreshSummary={() => fetchSummary(true)}
          summaryLastUpdated={summaryLastUpdated}
        />
      </div>

      {/* Market Insights (Market Trends with bullet points) and Calendars */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1">
          <MarketInsights
            responsesApiBullets={responsesApiBullets}
            agentsSdkBullets={agentsSdkBullets}
            responsesLoading={responsesLoading}
            agentsLoading={agentsLoading}
            responsesError={responsesError}
            agentsError={agentsError}
            onRefreshResponses={fetchResponsesBullets}
            onRefreshAgents={fetchAgentsBullets}
            responsesGeneratedAt={responsesGeneratedAt}
            agentsGeneratedAt={agentsGeneratedAt}
          />
        </div>
        {economicEvents.length > 0 && (
          <div className="flex-1">
            <EconomicCalendar events={economicEvents} summary={economicSummary} />
          </div>
        )}
        {earnings.length > 0 && (
          <div className="flex-1">
            <EarningsCalendar earnings={earnings} summary={earningsSummary} totalCount={earningsTotalCount} />
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
          <MarketSessions hideTable={true} indexQuotes={globalIndexQuotes} futuresQuotes={globalFuturesQuotes} />
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
