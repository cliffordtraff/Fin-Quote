'use server'

import OpenAI from 'openai'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface MarketSummaryResult {
  summary: string
  error?: string
}

export interface MarketSummaryInput {
  gainers: GainerData[]
  losers: LoserData[]
  sectors: SectorData[]
  indices: SparklineIndexData[]
}

function buildMarketDataContext(data: MarketSummaryInput): string {
  const lines: string[] = []

  // Index performance
  if (data.indices.length > 0) {
    lines.push('## Major Indices Today:')
    data.indices.slice(0, 5).forEach(idx => {
      const direction = idx.priceChangePercent >= 0 ? '↑' : '↓'
      lines.push(`- ${idx.name}: $${idx.currentPrice.toFixed(2)} (${direction}${Math.abs(idx.priceChangePercent).toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Sector performance
  if (data.sectors.length > 0) {
    lines.push('## Sector Performance:')
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
    lines.push('## Top Gainers:')
    data.gainers.slice(0, 5).forEach(g => {
      lines.push(`- ${g.symbol} (${g.name}): $${g.price.toFixed(2)} (+${g.changesPercentage.toFixed(2)}%)`)
    })
    lines.push('')
  }

  // Top losers
  if (data.losers.length > 0) {
    lines.push('## Top Losers:')
    data.losers.slice(0, 5).forEach(l => {
      lines.push(`- ${l.symbol} (${l.name}): $${l.price.toFixed(2)} (${l.changesPercentage.toFixed(2)}%)`)
    })
  }

  return lines.join('\n')
}

export async function getMarketSummary(data?: MarketSummaryInput): Promise<MarketSummaryResult> {
  console.log('getMarketSummary called')
  try {
    console.log('Calling OpenAI Responses API with web search...')
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const marketContext = data ? buildMarketDataContext(data) : ''

    const userPrompt = data
      ? `You are a financial market analyst writing a brief daily market summary. Be concise, insightful, and focus on actionable information. Write in a professional but accessible tone. Do not use markdown formatting - write in plain paragraphs.

Based on this real-time market data and current news, write a 2-3 paragraph summary of what's happening in the markets today. Focus on the most important movements and themes. Be specific about which sectors and stocks are moving and explain WHY they are moving based on today's news.

${marketContext}

Use web search to find the latest market news to explain the movements. Write a natural, conversational summary that a trader would find useful. Don't just list the data - synthesize it into insights with explanations of the drivers.`
      : 'What is happening in the US stock markets today? Give me a 2-3 paragraph summary of the key market movements and themes, including why markets are moving based on current news.'

    // Use the Responses API with web search tool
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search' }],
      input: userPrompt,
    })

    console.log('Full OpenAI response:', JSON.stringify(response, null, 2))

    // Use the convenient output_text property
    const summary = response.output_text || 'Unable to generate market summary.'

    console.log('OpenAI response received, summary length:', summary.length)
    console.log('OpenAI response content:', summary)

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
