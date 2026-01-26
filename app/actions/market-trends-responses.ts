'use server'

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'
import type { ForexBondData } from '@/app/actions/forex-bonds'
import type { VIXData } from '@/app/actions/vix'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Create Supabase client for caching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// In-memory cache as fallback + faster first check
let cachedTrends: { bullets: MarketTrendsBullet[]; timestamp: number } | null = null
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

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
  approach: 'responses-api'
  generatedAt: string
  error?: string
}

function getLastTradingDay(): string {
  const now = new Date()
  const day = now.getDay()

  // If Sunday (0), go back 2 days to Friday
  // If Saturday (6), go back 1 day to Friday
  // If Monday-Friday, check if market hours have passed
  let daysBack = 0
  if (day === 0) daysBack = 2
  else if (day === 6) daysBack = 1

  const lastTradingDay = new Date(now)
  lastTradingDay.setDate(lastTradingDay.getDate() - daysBack)

  return lastTradingDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function buildMarketDataContext(data: MarketTrendsInput): string {
  const lines: string[] = []
  const lastTradingDay = getLastTradingDay()

  lines.push(`## Last Trading Day: ${lastTradingDay}`)
  lines.push('')

  // Sectors - sorted by performance
  if (data.sectors.length > 0) {
    lines.push('## Sector Performance (sorted best to worst):')
    const sortedSectors = [...data.sectors].sort((a, b) => parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage))
    sortedSectors.forEach(sector => {
      const pct = parseFloat(sector.changesPercentage)
      const direction = pct >= 0 ? '+' : ''
      lines.push(`- ${sector.sector}: ${direction}${pct.toFixed(2)}%`)
    })
    lines.push('')
  }

  // Index performance
  if (data.indices.length > 0) {
    lines.push('## Major Indices:')
    data.indices.slice(0, 5).forEach(idx => {
      const direction = idx.priceChangePercent >= 0 ? '+' : ''
      lines.push(`- ${idx.name}: ${idx.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${direction}${idx.priceChangePercent.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // VIX
  if (data.vix) {
    const direction = data.vix.changesPercentage >= 0 ? '+' : ''
    lines.push('## Volatility (VIX):')
    lines.push(`- VIX: ${data.vix.price.toFixed(2)} (${direction}${data.vix.changesPercentage.toFixed(2)}%)`)
    lines.push('')
  }

  // Treasury Yields
  if (data.forexBonds && data.forexBonds.length > 0) {
    const treasuries = data.forexBonds.filter(fb => fb.name.includes('Treasury'))
    if (treasuries.length > 0) {
      lines.push('## Treasury Yields:')
      treasuries.forEach(t => {
        const direction = t.changesPercentage >= 0 ? '+' : ''
        lines.push(`- ${t.name}: ${t.price.toFixed(2)}% (${direction}${t.changesPercentage.toFixed(2)}%)`)
      })
      lines.push('')
    }
  }

  // Top gainers (these are S&P 500 gainers from the API)
  if (data.gainers.length > 0) {
    lines.push('## Top S&P 500 Gainers:')
    data.gainers.slice(0, 10).forEach((g, i) => {
      lines.push(`${i + 1}. ${g.symbol} (${g.name}): $${g.price.toFixed(2)} (+${g.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Top losers
  if (data.losers.length > 0) {
    lines.push('## Top S&P 500 Losers:')
    data.losers.slice(0, 10).forEach((l, i) => {
      lines.push(`${i + 1}. ${l.symbol} (${l.name}): $${l.price.toFixed(2)} (${l.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

export async function getMarketTrendsResponses(data: MarketTrendsInput, forceRefresh?: boolean): Promise<MarketTrendsResult> {
  console.log('getMarketTrendsResponses called, forceRefresh:', forceRefresh)
  const now = Date.now()

  if (!forceRefresh) {
    // 1. Check in-memory cache first (fastest)
    if (cachedTrends && (now - cachedTrends.timestamp) < CACHE_TTL_MS) {
      console.log('Returning in-memory cached market trends (age:', Math.round((now - cachedTrends.timestamp) / 1000), 'seconds)')
      return {
        bullets: cachedTrends.bullets,
        approach: 'responses-api',
        generatedAt: new Date(cachedTrends.timestamp).toISOString(),
      }
    }

    // 2. Check Supabase cache
    console.log('Checking Supabase cache for market trends...')
    try {
      const { data: dbCache, error } = await supabase
        .from('market_trends_cache')
        .select('bullets, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.log('Supabase market trends query error:', error.message)
      } else if (dbCache) {
        const cacheAge = now - new Date(dbCache.created_at).getTime()
        console.log('Found Supabase market trends cache, age:', Math.round(cacheAge / 1000), 'seconds')
        if (cacheAge < CACHE_TTL_MS) {
          console.log('Returning Supabase cached market trends')
          const bullets = dbCache.bullets as MarketTrendsBullet[]
          cachedTrends = { bullets, timestamp: new Date(dbCache.created_at).getTime() }
          return {
            bullets,
            approach: 'responses-api',
            generatedAt: dbCache.created_at,
          }
        } else {
          console.log('Supabase market trends cache expired')
        }
      } else {
        console.log('No Supabase market trends cache entry found')
      }
    } catch (dbError) {
      console.log('Supabase market trends cache check failed:', dbError)
    }
  } else {
    console.log('Force refresh - skipping cache')
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5'
  const marketContext = buildMarketDataContext(data)

  // Get the leading sector and top gainer from the data
  const sortedSectors = [...data.sectors].sort((a, b) => parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage))
  const leadingSector = sortedSectors[0]
  const topGainer = data.gainers[0]

  const prompt = `You are a financial market analyst creating a concise bullet-point summary of market trends.

MARKET DATA:
${marketContext}

YOUR TASK:
Generate exactly 6 bullet points summarizing the key market trends. Each bullet should be a JSON object with:
- emoji: A single emoji that represents the bullet point
- title: A short 2-5 word title
- description: A one-sentence description (max 15 words)

REQUIRED BULLETS (must be first two):
1. Leading Sector: ${leadingSector?.sector || 'Technology'} (${leadingSector ? (parseFloat(leadingSector.changesPercentage) >= 0 ? '+' : '') + parseFloat(leadingSector.changesPercentage).toFixed(2) + '%' : 'N/A'})
2. Top S&P 500 Gainer: ${topGainer?.symbol || 'N/A'} (${topGainer ? '+' + topGainer.changesPercentage.toFixed(2) + '%' : 'N/A'})

ADDITIONAL BULLETS (generate 4 more based on the data):
Use your analysis to identify the most interesting and relevant trends. Consider:
- Lagging sectors or notable underperformers
- Major index movements (S&P 500, Nasdaq, Dow)
- VIX/volatility insights
- Treasury yield movements and what they signal
- Notable individual stock moves (big gainers or losers)
- Any sector rotation patterns
- Market breadth observations
- Risk sentiment indicators

Respond with ONLY a JSON array of bullet objects. No other text.

Example format:
[
  {"emoji": "🏆", "title": "Leading Sector", "description": "Technology leads with +2.3% gain on AI optimism"},
  {"emoji": "🚀", "title": "Top Gainer", "description": "META surges +8.5% on strong earnings beat"},
  {"emoji": "📉", "title": "Lagging Sector", "description": "Energy falls -1.2% amid oil price concerns"}
]`

  try {
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search' }],
      input: prompt,
    })

    const content = response.output_text || ''

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('Failed to parse JSON from response:', content)
      return {
        bullets: [],
        approach: 'responses-api',
        generatedAt: new Date().toISOString(),
        error: 'Failed to parse response',
      }
    }

    const bullets: MarketTrendsBullet[] = JSON.parse(jsonMatch[0])

    // Cache the result in memory
    cachedTrends = { bullets, timestamp: Date.now() }

    // Also save to Supabase (fire and forget)
    supabase
      .from('market_trends_cache')
      .insert({ bullets })
      .then(({ error }) => {
        if (error) console.log('Failed to save market trends to Supabase cache:', error.message)
        else console.log('Saved market trends to Supabase cache')
      })

    return {
      bullets,
      approach: 'responses-api',
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Error generating market trends (Responses API):', error)
    return {
      bullets: [],
      approach: 'responses-api',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
