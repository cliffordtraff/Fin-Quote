/**
 * Ingest analyst estimates data from FMP API into analyst_estimates table
 *
 * Data includes: EPS estimates, revenue estimates, target price, analyst ratings
 *
 * Usage:
 *   npx tsx scripts/ingest-analyst-estimates.ts              # All S&P 500 stocks
 *   npx tsx scripts/ingest-analyst-estimates.ts --limit 10   # First 10 stocks
 *   npx tsx scripts/ingest-analyst-estimates.ts --symbol AAPL # Single stock
 *   npx tsx scripts/ingest-analyst-estimates.ts --skip-existing # Only process symbols not already in DB
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!FMP_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const RATE_LIMIT_DELAY_MS = 200
const BATCH_SIZE = 10

interface FMPAnalystEstimate {
  symbol: string
  date: string
  estimatedRevenueLow: number
  estimatedRevenueHigh: number
  estimatedRevenueAvg: number
  estimatedEbitdaLow: number
  estimatedEbitdaHigh: number
  estimatedEbitdaAvg: number
  estimatedEbitLow: number
  estimatedEbitHigh: number
  estimatedEbitAvg: number
  estimatedNetIncomeLow: number
  estimatedNetIncomeHigh: number
  estimatedNetIncomeAvg: number
  estimatedSgaExpenseLow: number
  estimatedSgaExpenseHigh: number
  estimatedSgaExpenseAvg: number
  estimatedEpsAvg: number
  estimatedEpsHigh: number
  estimatedEpsLow: number
  numberAnalystEstimatedRevenue: number
  numberAnalystsEstimatedEps: number
}

interface FMPPriceTarget {
  symbol: string
  targetHigh: number
  targetLow: number
  targetConsensus: number
  targetMedian: number
}

interface FMPAnalystRating {
  symbol: string
  date: string
  ratingStrongBuy: number
  ratingBuy: number
  ratingHold: number
  ratingSell: number
  ratingStrongSell: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchAnalystEstimates(symbol: string): Promise<FMPAnalystEstimate[] | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/analyst-estimates/${symbol}?apikey=${FMP_API_KEY}&limit=5`
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Failed to fetch analyst estimates for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    return Array.isArray(data) ? data : null
  } catch (error) {
    console.error(`Error fetching analyst estimates for ${symbol}:`, error)
    return null
  }
}

async function fetchPriceTarget(symbol: string): Promise<FMPPriceTarget | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/price-target-consensus/${symbol}?apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data?.[0] || null
  } catch (error) {
    return null
  }
}

async function fetchAnalystRatings(symbol: string): Promise<FMPAnalystRating | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/grade/${symbol}?apikey=${FMP_API_KEY}&limit=1`
    const response = await fetch(url)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    // Get rating summary
    const summaryUrl = `https://financialmodelingprep.com/api/v3/rating/${symbol}?apikey=${FMP_API_KEY}`
    const summaryResponse = await fetch(summaryUrl)
    const summaryData = await summaryResponse.json()

    return summaryData?.[0] || null
  } catch (error) {
    return null
  }
}

function transformEstimate(
  estimate: FMPAnalystEstimate,
  priceTarget: FMPPriceTarget | null
) {
  const today = new Date().toISOString().split('T')[0]

  return {
    symbol: estimate.symbol,
    estimate_date: today,
    period: 'annual',
    period_end: estimate.date,
    eps_estimated: estimate.estimatedEpsAvg ?? null,
    eps_estimated_low: estimate.estimatedEpsLow ?? null,
    eps_estimated_high: estimate.estimatedEpsHigh ?? null,
    eps_estimated_avg: estimate.estimatedEpsAvg ?? null,
    number_analysts_eps: estimate.numberAnalystsEstimatedEps ?? null,
    revenue_estimated: estimate.estimatedRevenueAvg ?? null,
    revenue_estimated_low: estimate.estimatedRevenueLow ?? null,
    revenue_estimated_high: estimate.estimatedRevenueHigh ?? null,
    revenue_estimated_avg: estimate.estimatedRevenueAvg ?? null,
    number_analysts_revenue: estimate.numberAnalystEstimatedRevenue ?? null,
    eps_growth_estimated: null, // Would need to calculate from historical
    revenue_growth_estimated: null, // Would need to calculate from historical
    target_price: priceTarget?.targetConsensus ?? null,
    target_price_low: priceTarget?.targetLow ?? null,
    target_price_high: priceTarget?.targetHigh ?? null,
    analyst_rating_buy: null,
    analyst_rating_hold: null,
    analyst_rating_sell: null,
    analyst_rating_strong_buy: null,
    analyst_rating_strong_sell: null,
  }
}

async function getExistingSymbols(): Promise<Set<string>> {
  const existingSymbols = new Set<string>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('analyst_estimates')
      .select('symbol')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching existing symbols:', error)
      break
    }

    if (!data || data.length === 0) break

    data.forEach(row => existingSymbols.add(row.symbol))
    offset += pageSize

    if (data.length < pageSize) break
  }

  return existingSymbols
}

async function getSymbolsToProcess(options: { symbol?: string; limit?: number; skipExisting?: boolean }): Promise<string[]> {
  if (options.symbol) {
    return [options.symbol.toUpperCase()]
  }

  // Get all symbols from financials_std table (S&P 500 stocks)
  let allSymbols: string[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('financials_std')
      .select('symbol')
      .order('symbol')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching company symbols:', error)
      break
    }

    if (!data || data.length === 0) break

    allSymbols.push(...data.map(c => c.symbol))
    offset += pageSize

    if (data.length < pageSize) break
  }

  // Deduplicate symbols
  let symbols = [...new Set(allSymbols)]

  // Filter out existing symbols if --skip-existing flag is set
  if (options.skipExisting) {
    const existingSymbols = await getExistingSymbols()
    const originalCount = symbols.length
    symbols = symbols.filter(s => !existingSymbols.has(s))
    console.log(`Skipping ${originalCount - symbols.length} symbols already in database`)
  }

  if (options.limit) {
    symbols = symbols.slice(0, options.limit)
  }

  return symbols
}

async function main() {
  const args = process.argv.slice(2)
  const options: { symbol?: string; limit?: number; skipExisting?: boolean } = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      options.symbol = args[i + 1]
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--skip-existing') {
      options.skipExisting = true
    }
  }

  console.log('='.repeat(60))
  console.log('Analyst Estimates Ingestion')
  console.log('='.repeat(60))

  const symbols = await getSymbolsToProcess(options)
  console.log(`Processing ${symbols.length} symbols...`)

  let successCount = 0
  let errorCount = 0

  // Process in batches
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batch.join(', ')}`)

    for (const symbol of batch) {
      const estimates = await fetchAnalystEstimates(symbol)
      await sleep(RATE_LIMIT_DELAY_MS)

      const priceTarget = await fetchPriceTarget(symbol)
      await sleep(RATE_LIMIT_DELAY_MS)

      if (estimates && estimates.length > 0) {
        // Get the next fiscal year estimate (first one is usually furthest out)
        const nextYearEstimate = estimates[estimates.length - 1]
        const transformed = transformEstimate(nextYearEstimate, priceTarget)

        const { error } = await supabase
          .from('analyst_estimates')
          .upsert(transformed, { onConflict: 'symbol,period,period_end' })

        if (error) {
          console.log(`  ✗ ${symbol}: DB error - ${error.message}`)
          errorCount++
        } else {
          const eps = nextYearEstimate.estimatedEpsAvg?.toFixed(2) || 'N/A'
          const target = priceTarget?.targetConsensus?.toFixed(2) || 'N/A'
          console.log(`  ✓ ${symbol}: EPS Est ${eps}, Target $${target}`)
          successCount++
        }
      } else {
        console.log(`  ✗ ${symbol}: No estimates available`)
        errorCount++
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`✓ Success: ${successCount}`)
  console.log(`✗ Errors:  ${errorCount}`)
}

main().catch(console.error)
