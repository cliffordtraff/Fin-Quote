'use server'

import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'
import type { ForexBondData } from '@/app/actions/forex-bonds'
import type { VIXData } from '@/app/actions/vix'

export interface MarketTrendsInput {
  gainers: GainerData[]
  losers: LoserData[]
  sectors: SectorData[]
  indices: SparklineIndexData[]
  forexBonds?: ForexBondData[]
  vix?: VIXData | null
}

export interface MarketTrendsBullet {
  emoji: string
  title: string
  description: string
}

export interface MarketTrendsResult {
  bullets: MarketTrendsBullet[]
  approach: 'agents-sdk'
  generatedAt: string
  error?: string
  toolCalls?: string[]
}

// Store market data in module scope so tools can access it
let currentMarketData: MarketTrendsInput | null = null

// Tool: Get the leading sector
const getLeadingSectorTool = tool({
  name: 'get_leading_sector',
  description: 'Get the best performing sector from the market data',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.sectors.length) {
      return { error: 'No sector data available' }
    }
    const sorted = [...currentMarketData.sectors].sort(
      (a, b) => parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage)
    )
    const leader = sorted[0]
    return {
      sector: leader.sector,
      changePercent: parseFloat(leader.changesPercentage).toFixed(2),
    }
  },
})

// Tool: Get the lagging sector
const getLaggingSectorTool = tool({
  name: 'get_lagging_sector',
  description: 'Get the worst performing sector from the market data',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.sectors.length) {
      return { error: 'No sector data available' }
    }
    const sorted = [...currentMarketData.sectors].sort(
      (a, b) => parseFloat(a.changesPercentage) - parseFloat(b.changesPercentage)
    )
    const laggard = sorted[0]
    return {
      sector: laggard.sector,
      changePercent: parseFloat(laggard.changesPercentage).toFixed(2),
    }
  },
})

// Tool: Get top S&P 500 gainer
const getTopGainerTool = tool({
  name: 'get_top_sp500_gainer',
  description: 'Get the top gaining stock in the S&P 500',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.gainers.length) {
      return { error: 'No gainer data available' }
    }
    const top = currentMarketData.gainers[0]
    return {
      symbol: top.symbol,
      name: top.name,
      price: top.price.toFixed(2),
      changePercent: top.changesPercentage.toFixed(2),
    }
  },
})

// Tool: Get top S&P 500 loser
const getTopLoserTool = tool({
  name: 'get_top_sp500_loser',
  description: 'Get the worst performing stock in the S&P 500',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.losers.length) {
      return { error: 'No loser data available' }
    }
    const top = currentMarketData.losers[0]
    return {
      symbol: top.symbol,
      name: top.name,
      price: top.price.toFixed(2),
      changePercent: top.changesPercentage.toFixed(2),
    }
  },
})

// Tool: Get VIX data
const getVixTool = tool({
  name: 'get_vix',
  description: 'Get the current VIX (volatility index) reading and its change',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.vix) {
      return { error: 'No VIX data available' }
    }
    const vix = currentMarketData.vix
    return {
      price: vix.price.toFixed(2),
      changePercent: vix.changesPercentage.toFixed(2),
      sentiment: vix.price < 15 ? 'low volatility/complacent' :
                 vix.price < 20 ? 'normal' :
                 vix.price < 30 ? 'elevated fear' : 'high fear',
    }
  },
})

// Tool: Get major index performance
const getIndicesTool = tool({
  name: 'get_major_indices',
  description: 'Get the performance of major indices (S&P 500, Nasdaq, Dow, Russell 2000)',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.indices.length) {
      return { error: 'No index data available' }
    }
    return currentMarketData.indices.slice(0, 5).map(idx => ({
      name: idx.name,
      price: idx.currentPrice.toFixed(2),
      changePercent: idx.priceChangePercent.toFixed(2),
    }))
  },
})

// Tool: Get treasury yields
const getTreasuryYieldsTool = tool({
  name: 'get_treasury_yields',
  description: 'Get current treasury yield levels (2Y, 10Y, etc.)',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.forexBonds?.length) {
      return { error: 'No treasury data available' }
    }
    const treasuries = currentMarketData.forexBonds.filter(fb => fb.name.includes('Treasury'))
    if (!treasuries.length) {
      return { error: 'No treasury data available' }
    }
    return treasuries.map(t => ({
      name: t.name,
      yield: t.price.toFixed(2),
      changePercent: t.changesPercentage.toFixed(2),
    }))
  },
})

// Tool: Get all sector performance for analysis
const getAllSectorsTool = tool({
  name: 'get_all_sectors',
  description: 'Get performance data for all sectors to analyze rotation patterns',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.sectors.length) {
      return { error: 'No sector data available' }
    }
    const sorted = [...currentMarketData.sectors].sort(
      (a, b) => parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage)
    )
    return sorted.map(s => ({
      sector: s.sector,
      changePercent: parseFloat(s.changesPercentage).toFixed(2),
    }))
  },
})

// Tool: Get top 5 gainers for breadth analysis
const getTop5GainersTool = tool({
  name: 'get_top_5_gainers',
  description: 'Get the top 5 gaining stocks for market breadth analysis',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.gainers.length) {
      return { error: 'No gainer data available' }
    }
    return currentMarketData.gainers.slice(0, 5).map(g => ({
      symbol: g.symbol,
      name: g.name,
      changePercent: g.changesPercentage.toFixed(2),
    }))
  },
})

// Tool: Get top 5 losers for breadth analysis
const getTop5LosersTool = tool({
  name: 'get_top_5_losers',
  description: 'Get the top 5 losing stocks for market breadth analysis',
  parameters: z.object({}),
  execute: async () => {
    if (!currentMarketData?.losers.length) {
      return { error: 'No loser data available' }
    }
    return currentMarketData.losers.slice(0, 5).map(l => ({
      symbol: l.symbol,
      name: l.name,
      changePercent: l.changesPercentage.toFixed(2),
    }))
  },
})

export async function getMarketTrendsAgents(data: MarketTrendsInput): Promise<MarketTrendsResult> {
  console.log('getMarketTrendsAgents called')
  // Store data for tools to access
  currentMarketData = data

  const tools = [
    getLeadingSectorTool,
    getLaggingSectorTool,
    getTopGainerTool,
    getTopLoserTool,
    getVixTool,
    getIndicesTool,
    getTreasuryYieldsTool,
    getAllSectorsTool,
    getTop5GainersTool,
    getTop5LosersTool,
  ]

  const agent = new Agent({
    name: 'MarketTrendsAnalyst',
    model: process.env.OPENAI_MODEL || 'gpt-5',
    instructions: `You are a financial market analyst creating a concise bullet-point summary of market trends.

Your task is to generate exactly 6 bullet points summarizing the key market trends from the last trading day.

PROCESS:
1. First, call the tools to gather market data
2. Always start by calling get_leading_sector and get_top_sp500_gainer (these are REQUIRED)
3. Then call other tools as needed to gather insights for additional bullets
4. Analyze the data and generate insightful bullet points

REQUIRED BULLETS (must be first two):
1. Leading Sector - which sector performed best
2. Top S&P 500 Gainer - which stock gained the most

ADDITIONAL BULLETS (generate 4 more):
Consider insights about:
- Lagging sectors or notable underperformers
- Major index movements (S&P 500, Nasdaq, Dow, Russell 2000)
- VIX/volatility insights and what they signal
- Treasury yield movements and their implications
- Notable individual stock moves
- Sector rotation patterns
- Market breadth observations
- Risk sentiment indicators

OUTPUT FORMAT:
After gathering data, respond with ONLY a JSON array of bullet objects. No other text.
Each bullet should have:
- emoji: A single relevant emoji
- title: A short 2-5 word title
- description: A one-sentence description (max 15 words)

Example:
[
  {"emoji": "🏆", "title": "Leading Sector", "description": "Technology leads with +2.3% gain on AI optimism"},
  {"emoji": "🚀", "title": "Top Gainer", "description": "META surges +8.5% on strong earnings beat"}
]`,
    tools,
  })

  try {
    const result = await run(
      agent,
      'Analyze the current market data and generate 8-10 bullet point insights. Start by getting the leading sector and top gainer, then explore other interesting trends.'
    )

    const content = result.finalOutput || ''

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('Failed to parse JSON from agent response:', content)
      return {
        bullets: [],
        approach: 'agents-sdk',
        generatedAt: new Date().toISOString(),
        error: 'Failed to parse response',
      }
    }

    const bullets: MarketTrendsBullet[] = JSON.parse(jsonMatch[0])

    return {
      bullets,
      approach: 'agents-sdk',
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Error generating market trends (Agents SDK):', error)
    return {
      bullets: [],
      approach: 'agents-sdk',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    // Clear the module-scoped data
    currentMarketData = null
  }
}
