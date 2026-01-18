/**
 * Ingest earnings surprises data from FMP API into earnings_history table
 *
 * Data includes: actual EPS, estimated EPS, surprise amount and percentage
 *
 * Usage:
 *   npx tsx scripts/ingest-earnings-history.ts              # All S&P 500 stocks
 *   npx tsx scripts/ingest-earnings-history.ts --limit 10   # First 10 stocks
 *   npx tsx scripts/ingest-earnings-history.ts --symbol AAPL # Single stock
 *   npx tsx scripts/ingest-earnings-history.ts --skip-existing # Only process symbols not already in DB
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

interface FMPEarningsSurprise {
  date: string
  symbol: string
  actualEarningResult: number
  estimatedEarning: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchEarningsSurprises(symbol: string): Promise<FMPEarningsSurprise[] | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Failed to fetch earnings for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    return Array.isArray(data) ? data : null
  } catch (error) {
    console.error(`Error fetching earnings for ${symbol}:`, error)
    return null
  }
}

function transformEarnings(surprise: FMPEarningsSurprise) {
  const date = new Date(surprise.date)
  const month = date.getMonth() + 1 // 0-indexed

  // Estimate fiscal quarter based on earnings date
  // Most companies report ~45 days after quarter end
  let fiscalQuarter: number
  if (month >= 1 && month <= 3) fiscalQuarter = 4 // Q4 reported in Jan-Mar
  else if (month >= 4 && month <= 6) fiscalQuarter = 1 // Q1 reported in Apr-Jun
  else if (month >= 7 && month <= 9) fiscalQuarter = 2 // Q2 reported in Jul-Sep
  else fiscalQuarter = 3 // Q3 reported in Oct-Dec

  // Estimate fiscal year
  let fiscalYear = date.getFullYear()
  if (fiscalQuarter === 4 && month <= 3) {
    fiscalYear = fiscalYear - 1 // Q4 of previous fiscal year
  }

  // Calculate surprise
  const actual = surprise.actualEarningResult
  const estimated = surprise.estimatedEarning
  const epsSurprise = actual - estimated
  const epsSurprisePct = estimated !== 0 ? (epsSurprise / Math.abs(estimated)) * 100 : null

  return {
    symbol: surprise.symbol,
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    period_end: surprise.date, // Using earnings date as period_end
    eps_actual: actual,
    eps_estimated: estimated,
    eps_surprise: epsSurprise,
    eps_surprise_pct: epsSurprisePct,
    revenue_actual: null, // FMP earnings-surprises doesn't include revenue
    revenue_estimated: null,
    revenue_surprise: null,
    revenue_surprise_pct: null,
    earnings_date: surprise.date,
    earnings_time: null, // FMP doesn't provide BMO/AMC in this endpoint
  }
}

async function getExistingSymbols(): Promise<Set<string>> {
  const existingSymbols = new Set<string>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('earnings_history')
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

  // Get all symbols from financials_std table
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
  console.log('Earnings History Ingestion')
  console.log('='.repeat(60))

  const symbols = await getSymbolsToProcess(options)
  console.log(`Processing ${symbols.length} symbols...`)

  let successCount = 0
  let errorCount = 0
  let recordsInserted = 0

  // Process in batches
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batch.join(', ')}`)

    for (const symbol of batch) {
      const surprises = await fetchEarningsSurprises(symbol)

      if (surprises && surprises.length > 0) {
        // Get last 8 quarters (2 years)
        const recentSurprises = surprises.slice(0, 8)
        const transformed = recentSurprises.map(transformEarnings)

        const { error } = await supabase
          .from('earnings_history')
          .upsert(transformed, { onConflict: 'symbol,fiscal_year,fiscal_quarter' })

        if (error) {
          console.log(`  ✗ ${symbol}: DB error - ${error.message}`)
          errorCount++
        } else {
          const latest = surprises[0]
          const surprise = ((latest.actualEarningResult - latest.estimatedEarning) / Math.abs(latest.estimatedEarning) * 100).toFixed(1)
          console.log(`  ✓ ${symbol}: ${transformed.length} quarters, latest surprise ${surprise}%`)
          successCount++
          recordsInserted += transformed.length
        }
      } else {
        console.log(`  ✗ ${symbol}: No earnings data`)
        errorCount++
      }

      await sleep(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`✓ Symbols processed: ${successCount}`)
  console.log(`✓ Records inserted:  ${recordsInserted}`)
  console.log(`✗ Errors:            ${errorCount}`)
}

main().catch(console.error)
