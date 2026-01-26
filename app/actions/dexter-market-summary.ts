'use server'

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'

const execAsync = promisify(exec)

export interface DexterMarketSummaryResult {
  summary: string
  toolsUsed: string[]
  iterations: number
  error?: string
}

export interface MarketDataContext {
  indices?: SparklineIndexData[]
  gainers?: GainerData[]
  losers?: LoserData[]
  sectors?: SectorData[]
}

/**
 * Build a rich market context string from our FMP data
 */
function buildMarketContext(data: MarketDataContext): string {
  const lines: string[] = []

  // Get current date info
  const now = new Date()
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' })
  const isWeekend = now.getDay() === 0 || now.getDay() === 6

  lines.push(`Today is ${dayOfWeek}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`)
  if (isWeekend) {
    lines.push('Note: US stock markets are closed for the weekend. The data below reflects the most recent trading session.')
  }
  lines.push('')

  // Index performance
  if (data.indices && data.indices.length > 0) {
    lines.push('## Major Index Performance:')
    data.indices.forEach(idx => {
      const direction = idx.priceChangePercent >= 0 ? '+' : ''
      lines.push(`- ${idx.name}: ${idx.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${direction}${idx.priceChangePercent.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Sector performance
  if (data.sectors && data.sectors.length > 0) {
    const sortedSectors = [...data.sectors].sort((a, b) => parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage))
    lines.push('## Sector Performance (best to worst):')
    sortedSectors.forEach(sector => {
      const pct = parseFloat(sector.changesPercentage)
      const direction = pct >= 0 ? '+' : ''
      lines.push(`- ${sector.sector}: ${direction}${pct.toFixed(2)}%`)
    })
    lines.push('')
  }

  // Top gainers
  if (data.gainers && data.gainers.length > 0) {
    lines.push('## Top Gaining Stocks:')
    data.gainers.slice(0, 5).forEach(g => {
      lines.push(`- ${g.symbol}: $${g.price.toFixed(2)} (+${g.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Top losers
  if (data.losers && data.losers.length > 0) {
    lines.push('## Top Losing Stocks:')
    data.losers.slice(0, 5).forEach(l => {
      lines.push(`- ${l.symbol}: $${l.price.toFixed(2)} (${l.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Get a market summary from Dexter, the autonomous financial research agent.
 * Pass in market data context so Dexter can research WHY these movements are happening.
 */
export async function getDexterMarketSummary(marketData?: MarketDataContext): Promise<DexterMarketSummaryResult> {
  const marketContext = marketData ? buildMarketContext(marketData) : ''

  const query = `You are a financial market analyst providing a comprehensive daily market briefing.

${marketContext}

Based on this market data, research and explain:

1. **Market Overview**: Are markets up or down? Is this a risk-on or risk-off day?

2. **Key Drivers**: What news, economic data, or events are driving today's market action? Search for:
   - Federal Reserve news or interest rate expectations
   - Economic data releases (jobs, inflation, GDP, etc.)
   - Geopolitical events or trade policy news
   - Major corporate earnings or announcements
   - Commodity movements (oil, gold, etc.) and why

3. **Sector Analysis**: Why are the leading sectors outperforming? Why are lagging sectors underperforming?

4. **Notable Stock Movers**: For the biggest gainers and losers, what's driving each move?

Write a professional, well-structured market briefing (3-4 paragraphs) that synthesizes this information. Include specific data points and cite the reasons behind movements. If markets are closed, note this and provide the most recent trading session analysis.`

  try {
    const dexterPath = path.join(process.cwd(), 'dexter')
    const bunPath = `${process.env.HOME}/.bun/bin/bun`

    // Build environment variables for Dexter
    const env = {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      EXASEARCH_API_KEY: process.env.EXASEARCH_API_KEY || process.env.EXA_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      FINANCIAL_DATASETS_API_KEY: process.env.FINANCIAL_DATASETS_API_KEY,
      DEXTER_MODEL: process.env.DEXTER_MODEL || 'gpt-4o',
      DEXTER_MODEL_PROVIDER: process.env.DEXTER_MODEL_PROVIDER || 'openai',
    }

    console.log('[Dexter] Starting market summary query...')
    console.log('[Dexter] Has market context:', !!marketData)

    // Escape the query for shell
    const escapedQuery = query.replace(/"/g, '\\"').replace(/\n/g, '\\n')

    const { stdout, stderr } = await execAsync(
      `"${bunPath}" run-query.ts "${escapedQuery}"`,
      {
        cwd: dexterPath,
        env,
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
      }
    )

    if (stderr) {
      console.warn('[Dexter] stderr:', stderr)
    }

    // Parse the JSON response from Dexter
    const result = JSON.parse(stdout.trim())

    if (result.error) {
      console.error('[Dexter] Agent error:', result.error)
      return {
        summary: '',
        toolsUsed: [],
        iterations: 0,
        error: result.error,
      }
    }

    // Extract tool names from tool calls
    const toolsUsed = result.toolCalls?.map((tc: { tool: string }) => tc.tool) || []

    console.log('[Dexter] Completed successfully')
    console.log('[Dexter] Tools used:', toolsUsed)
    console.log('[Dexter] Iterations:', result.iterations)

    return {
      summary: result.answer,
      toolsUsed: [...new Set(toolsUsed)], // dedupe
      iterations: result.iterations,
    }
  } catch (error) {
    console.error('[Dexter] Error:', error)

    // Check if it's a timeout
    if (error instanceof Error && error.message.includes('TIMEOUT')) {
      return {
        summary: '',
        toolsUsed: [],
        iterations: 0,
        error: 'Dexter timed out while researching the market',
      }
    }

    return {
      summary: '',
      toolsUsed: [],
      iterations: 0,
      error: error instanceof Error ? error.message : 'Unknown error calling Dexter',
    }
  }
}
