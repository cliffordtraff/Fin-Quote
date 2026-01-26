'use server'

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'
import type { ForexBondData } from '@/app/actions/forex-bonds'
import type { VIXData } from '@/app/actions/vix'
import type { MarketNewsItem } from '@/app/actions/get-market-news'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Create a simple Supabase client for caching (no auth needed)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// In-memory cache as fallback + faster first check
let cachedSummary: { summary: string; timestamp: number } | null = null
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface MarketSummaryResult {
  summary: string
  error?: string
  status?: string
}

export interface MarketSummaryInput {
  gainers: GainerData[]
  losers: LoserData[]
  sectors: SectorData[]
  indices: SparklineIndexData[]
  forexBonds?: ForexBondData[]
  vix?: VIXData | null
  marketNews?: MarketNewsItem[]
}

function isMarketOpen(): { isOpen: boolean; status: string } {
  const now = new Date()
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etNow.getDay()
  const hour = etNow.getHours()
  const minute = etNow.getMinutes()
  const timeInMinutes = hour * 60 + minute

  // Weekend
  if (day === 0 || day === 6) {
    return { isOpen: false, status: 'closed for the weekend' }
  }

  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30 // 9:30 AM
  const marketClose = 16 * 60 // 4:00 PM

  if (timeInMinutes < marketOpen) {
    return { isOpen: false, status: 'pre-market (opens at 9:30 AM ET)' }
  } else if (timeInMinutes >= marketClose) {
    return { isOpen: false, status: 'after-hours (closed at 4:00 PM ET)' }
  }

  return { isOpen: true, status: 'open' }
}

function buildMarketDataContext(data: MarketSummaryInput): string {
  const lines: string[] = []
  const now = new Date()
  const marketStatus = isMarketOpen()

  // Current date and market status
  lines.push(`## Current Date & Time:`)
  lines.push(`- Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  lines.push(`- US stock markets are currently ${marketStatus.status}`)
  lines.push('')

  // Index performance
  if (data.indices.length > 0) {
    lines.push('## Major Indices:')
    data.indices.slice(0, 5).forEach(idx => {
      const direction = idx.priceChangePercent >= 0 ? '+' : ''
      lines.push(`- ${idx.name}: ${idx.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${direction}${idx.priceChangePercent.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // VIX (Volatility)
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

  // Sector performance
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

  // Top gainers
  if (data.gainers.length > 0) {
    lines.push('## Top 5 Gainers:')
    data.gainers.slice(0, 5).forEach(g => {
      lines.push(`- ${g.symbol} (${g.name}): $${g.price.toFixed(2)} (+${g.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Top losers
  if (data.losers.length > 0) {
    lines.push('## Top 5 Losers:')
    data.losers.slice(0, 5).forEach(l => {
      lines.push(`- ${l.symbol} (${l.name}): $${l.price.toFixed(2)} (${l.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Market News Headlines
  if (data.marketNews && data.marketNews.length > 0) {
    lines.push('## Recent Market Headlines:')
    data.marketNews.slice(0, 6).forEach(news => {
      lines.push(`- "${news.title}" (${news.site})`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

export async function getMarketSummary(data?: MarketSummaryInput, forceRefresh?: boolean): Promise<MarketSummaryResult> {
  console.log('getMarketSummary called, forceRefresh:', forceRefresh)
  const now = Date.now()

  if (!forceRefresh) {
    // 1. Check in-memory cache first (fastest)
    if (cachedSummary && (now - cachedSummary.timestamp) < CACHE_TTL_MS) {
      console.log('Returning in-memory cached summary (age:', Math.round((now - cachedSummary.timestamp) / 1000), 'seconds)')
      return { summary: cachedSummary.summary }
    }

    // 2. Check Supabase cache (survives server restarts)
    console.log('Checking Supabase cache...')
    try {
      const { data: dbCache, error } = await supabase
        .from('market_summary_cache')
        .select('summary, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.log('Supabase query error:', error.message)
      } else if (dbCache) {
        const cacheAge = now - new Date(dbCache.created_at).getTime()
        console.log('Found Supabase cache entry, age:', Math.round(cacheAge / 1000), 'seconds, TTL:', CACHE_TTL_MS / 1000, 'seconds')
        if (cacheAge < CACHE_TTL_MS) {
          console.log('Returning Supabase cached summary')
          // Also update in-memory cache
          cachedSummary = { summary: dbCache.summary, timestamp: new Date(dbCache.created_at).getTime() }
          return { summary: dbCache.summary }
        } else {
          console.log('Supabase cache expired')
        }
      } else {
        console.log('No Supabase cache entry found')
      }
    } catch (dbError) {
      console.log('Supabase cache check failed:', dbError)
    }
  } else {
    console.log('Force refresh - skipping cache')
  }

  try {
    console.log('Calling OpenAI Responses API with web search...')
    const model = process.env.OPENAI_MODEL || 'gpt-5'

    const marketContext = data ? buildMarketDataContext(data) : ''

    const structuredPrompt = `You are a financial market analyst writing a professional market summary report. Your task is to synthesize the provided market data with current news to explain market movements.

IMPORTANT INSTRUCTIONS:
1. State the current date and market status (open/closed)
2. List index performance with numbers
3. Mention 2-3 themes driving the market
4. MAXIMUM 300 words total. Be concise. No filler words.

FORMAT YOUR RESPONSE AS (for weekends/closed markets):

[Day], [Month] [Date], [Year] — US markets closed. Index futures reopen this evening at 6pm Eastern.

* [[S&P 500:+X.XX%]]: brief description.
* [[Nasdaq:+X.XX%]]: brief description.
* [[Russell 2000:-X.XX%]]: brief description.
* [[Dow:-X.XX%]]: brief description.
* [[VIX:+X.XX%]]: brief description of risk sentiment.
* Crypto: BTC and ETH brief status.

What's driving the market this week
* 1-2 sentence explanation of first theme.
* 1-2 sentence explanation of second theme.
* 1-2 sentence explanation of third theme.

Do NOT write "Theme 1:", "Theme 2:", etc. Just the content directly after the bullet.

Keep under 300 words total. Use the [[TICKER:+X.XX%]] format for all assets with percentages.
- Write in professional but accessible prose, no bullet points or headers in output
- Use proper grammar and complete sentence structure. When listing multiple items, maintain consistent grammatical structure (e.g., "Friday's session finished mixed, with the S&P 500 essentially flat..." not "the S&P 500 essentially flat...")
- For stocks, indices, and assets with percentage changes, use this exact format: [[Name:+1.23%]] or [[Name:-1.23%]] (e.g., [[S&P 500:+0.03%]], [[TSLA:-0.07%]], [[VIX:+2.88%]]). Do NOT write the name before the bracket - the format includes the name. WRONG: "the S&P 500 [[S&P 500:+0.03%]]". CORRECT: "the [[S&P 500:+0.03%]]".
- For sector names without specific percentages, just use **bold** (e.g., **Technology**, **Healthcare**)
- Write in third person - NEVER use "I" or first person pronouns
- NEVER make assumptions about investor sentiment or behavior (avoid phrases like "investors are parsing", "the tone is cautious", "traders are watching", "market participants expect"). Instead, focus ONLY on factual observations: what events are happening, how specific assets/sectors are performing (with numbers), and news that may be driving moves
- NEVER use vague explanations like "seasonal rebalancing", "tightening liquidity conditions", "risk-on/risk-off", "rotation dynamics", or similar finance jargon that sounds sophisticated but explains nothing. If you can't explain WHY something is moving with a specific catalyst (earnings, news event, economic data), just state the price movement without speculation
- NEVER state redundant/obvious information. Examples: Don't say "Russell 2000 fell as small-caps declined" (the Russell 2000 IS small-caps), don't say "VIX rose showing increased volatility" (VIX IS volatility), don't say "Nasdaq outperformed as tech stocks led" (Nasdaq IS tech-heavy). Either explain the actual driver or just state the number.
- NEVER mention third-party publication names (avoid "AP reported", "Seeking Alpha noted", "MarketWatch said", "Reuters reported", etc.). Just state the facts directly without attribution.
- Use accessible language: prefer "widely expected" over "widely priced in", prefer "likely" over "probability", avoid overly technical jargon when simpler words work.
- For source links, use this exact format at the end of relevant sentences: [↗](url) - this will render as a small clickable icon. Do NOT include the domain name or full URL text.

MARKET DATA:
${marketContext}

Now write the market summary, using web search to verify and explain the drivers behind the movements shown in the data.`

    // Use the Responses API with web search tool
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search' }],
      input: structuredPrompt,
    })

    console.log('Full OpenAI response:', JSON.stringify(response, null, 2))

    // Use the convenient output_text property
    const summary = response.output_text || 'Unable to generate market summary.'

    console.log('OpenAI response received, summary length:', summary.length)
    console.log('OpenAI response content:', summary)

    // Cache the result in memory
    cachedSummary = { summary, timestamp: Date.now() }

    // Also save to Supabase (fire and forget, don't block on it)
    supabase
      .from('market_summary_cache')
      .insert({ summary })
      .then(({ error }) => {
        if (error) console.log('Failed to save to Supabase cache:', error.message)
        else console.log('Saved market summary to Supabase cache')
      })

    return { summary }
  } catch (error) {
    console.error('Error generating market summary:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    return {
      summary: '',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
