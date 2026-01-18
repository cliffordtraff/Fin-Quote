/**
 * Ingest price performance data from FMP API into price_performance table
 *
 * Data includes: 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, Max returns
 *
 * Usage:
 *   npx tsx scripts/ingest-price-performance.ts              # All S&P 500 stocks
 *   npx tsx scripts/ingest-price-performance.ts --limit 10   # First 10 stocks
 *   npx tsx scripts/ingest-price-performance.ts --symbol AAPL # Single stock
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

interface FMPPriceChange {
  symbol: string
  '1D': number
  '5D': number
  '1M': number
  '3M': number
  '6M': number
  ytd: number
  '1Y': number
  '3Y': number
  '5Y': number
  '10Y': number
  max: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchPricePerformance(symbol: string): Promise<FMPPriceChange | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/stock-price-change/${symbol}?apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Failed to fetch price change for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data?.[0] || null
  } catch (error) {
    console.error(`Error fetching price change for ${symbol}:`, error)
    return null
  }
}

function transformPriceChange(priceChange: FMPPriceChange, asOfDate: string) {
  // FMP returns percentages as decimals (e.g., 0.05 for 5%)
  // We store them as-is (decimals)
  return {
    symbol: priceChange.symbol,
    as_of_date: asOfDate,
    perf_1d: priceChange['1D'] ?? null,
    perf_5d: priceChange['5D'] ?? null,
    perf_1m: priceChange['1M'] ?? null,
    perf_3m: priceChange['3M'] ?? null,
    perf_6m: priceChange['6M'] ?? null,
    perf_ytd: priceChange.ytd ?? null,
    perf_1y: priceChange['1Y'] ?? null,
    perf_3y: priceChange['3Y'] ?? null,
    perf_5y: priceChange['5Y'] ?? null,
    perf_10y: priceChange['10Y'] ?? null,
    perf_max: priceChange.max ?? null,
  }
}

async function getSymbolsToProcess(options: { symbol?: string; limit?: number }): Promise<string[]> {
  if (options.symbol) {
    return [options.symbol.toUpperCase()]
  }

  // Get all symbols from financials_std table (S&P 500 stocks)
  // Paginate to get all symbols since table has ~30k rows
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

  // Deduplicate symbols (financials_std has multiple rows per symbol)
  let symbols = [...new Set(allSymbols)]

  if (options.limit) {
    symbols = symbols.slice(0, options.limit)
  }

  return symbols
}

async function main() {
  const args = process.argv.slice(2)
  const options: { symbol?: string; limit?: number } = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      options.symbol = args[i + 1]
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10)
      i++
    }
  }

  console.log('='.repeat(60))
  console.log('Price Performance Ingestion')
  console.log('='.repeat(60))

  const symbols = await getSymbolsToProcess(options)
  console.log(`Processing ${symbols.length} symbols...`)

  // Today's date for as_of_date
  const asOfDate = new Date().toISOString().split('T')[0]
  console.log(`As of date: ${asOfDate}`)

  let successCount = 0
  let errorCount = 0

  // Process in batches
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batch.join(', ')}`)

    const performances: ReturnType<typeof transformPriceChange>[] = []

    for (const symbol of batch) {
      const priceChange = await fetchPricePerformance(symbol)

      if (priceChange) {
        performances.push(transformPriceChange(priceChange, asOfDate))
        const ytd = priceChange.ytd ? `${(priceChange.ytd * 100).toFixed(1)}%` : 'N/A'
        const oneYear = priceChange['1Y'] ? `${(priceChange['1Y'] * 100).toFixed(1)}%` : 'N/A'
        console.log(`  ✓ ${symbol}: YTD ${ytd}, 1Y ${oneYear}`)
        successCount++
      } else {
        console.log(`  ✗ ${symbol}: Failed to fetch`)
        errorCount++
      }

      await sleep(RATE_LIMIT_DELAY_MS)
    }

    // Upsert batch to database
    if (performances.length > 0) {
      const { error } = await supabase
        .from('price_performance')
        .upsert(performances, { onConflict: 'symbol,as_of_date' })

      if (error) {
        console.error(`  Error upserting batch:`, error.message)
        errorCount += performances.length
        successCount -= performances.length
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
