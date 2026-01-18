/**
 * Ingest technical indicators from FMP API into technical_indicators table
 *
 * Data includes: SMA (20, 50, 200), EMA (20, 50), RSI (14), ATR (14)
 *
 * Usage:
 *   npx tsx scripts/ingest-technical-indicators.ts              # All S&P 500 stocks
 *   npx tsx scripts/ingest-technical-indicators.ts --limit 10   # First 10 stocks
 *   npx tsx scripts/ingest-technical-indicators.ts --symbol AAPL # Single stock
 *   npx tsx scripts/ingest-technical-indicators.ts --skip-existing # Only process symbols not already in DB
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
const BATCH_SIZE = 5 // Smaller batch since we make multiple API calls per symbol

interface TechnicalData {
  date: string
  sma?: number
  ema?: number
  rsi?: number
  atr?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchIndicator(
  symbol: string,
  type: 'sma' | 'ema' | 'rsi' | 'atr',
  period: number
): Promise<TechnicalData | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/technical_indicator/daily/${symbol}?period=${period}&type=${type}&apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    // Get the most recent data point
    const latest = data[0]
    return {
      date: latest.date.split(' ')[0], // Remove time portion
      [type]: latest[type],
    }
  } catch (error) {
    return null
  }
}

async function fetchAllIndicators(symbol: string): Promise<{
  sma20: number | null
  sma50: number | null
  sma200: number | null
  ema20: number | null
  ema50: number | null
  rsi14: number | null
  atr14: number | null
  date: string | null
} | null> {
  try {
    // Fetch all indicators in parallel to reduce time
    const [sma20, sma50, sma200, ema20, ema50, rsi14, atr14] = await Promise.all([
      fetchIndicator(symbol, 'sma', 20),
      fetchIndicator(symbol, 'sma', 50),
      fetchIndicator(symbol, 'sma', 200),
      fetchIndicator(symbol, 'ema', 20),
      fetchIndicator(symbol, 'ema', 50),
      fetchIndicator(symbol, 'rsi', 14),
      fetchIndicator(symbol, 'atr', 14),
    ])

    // Use the date from SMA20 as the reference date
    const date = sma20?.date || sma50?.date || null

    if (!date) {
      return null
    }

    return {
      date,
      sma20: sma20?.sma ?? null,
      sma50: sma50?.sma ?? null,
      sma200: sma200?.sma ?? null,
      ema20: ema20?.ema ?? null,
      ema50: ema50?.ema ?? null,
      rsi14: rsi14?.rsi ?? null,
      atr14: atr14?.atr ?? null,
    }
  } catch (error) {
    console.error(`Error fetching indicators for ${symbol}:`, error)
    return null
  }
}

async function getExistingSymbols(): Promise<Set<string>> {
  const existingSymbols = new Set<string>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('technical_indicators')
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
  console.log('Technical Indicators Ingestion')
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
      const indicators = await fetchAllIndicators(symbol)

      if (indicators && indicators.date) {
        const record = {
          symbol,
          as_of_date: indicators.date,
          sma_20: indicators.sma20,
          sma_50: indicators.sma50,
          sma_200: indicators.sma200,
          ema_20: indicators.ema20,
          ema_50: indicators.ema50,
          rsi_14: indicators.rsi14,
          atr_14: indicators.atr14,
          volatility_week: null, // Would need to calculate from price data
          volatility_month: null,
        }

        const { error } = await supabase
          .from('technical_indicators')
          .upsert(record, { onConflict: 'symbol,as_of_date' })

        if (error) {
          console.log(`  ✗ ${symbol}: DB error - ${error.message}`)
          errorCount++
        } else {
          const rsi = indicators.rsi14?.toFixed(1) || 'N/A'
          const sma50 = indicators.sma50?.toFixed(2) || 'N/A'
          console.log(`  ✓ ${symbol}: RSI ${rsi}, SMA50 $${sma50}`)
          successCount++
        }
      } else {
        console.log(`  ✗ ${symbol}: No indicator data`)
        errorCount++
      }

      await sleep(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`✓ Success: ${successCount}`)
  console.log(`✗ Errors:  ${errorCount}`)
}

main().catch(console.error)
