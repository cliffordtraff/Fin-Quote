/**
 * Load US Stocks Registry
 *
 * Fetches all US stocks from FMP API and loads them into the us_stocks table.
 * Filters to major exchanges (NYSE, NASDAQ, AMEX) and excludes ETFs.
 *
 * Usage:
 *   npx tsx scripts/us-stocks/load-registry.ts                    # Full load
 *   npx tsx scripts/us-stocks/load-registry.ts --dry-run          # Preview without inserting
 *   npx tsx scripts/us-stocks/load-registry.ts --update-market-cap # Update market caps only
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const VALID_EXCHANGES = ['NYSE', 'NASDAQ', 'AMEX', 'New York Stock Exchange', 'Nasdaq Global Select', 'Nasdaq Global Market', 'Nasdaq Capital Market', 'NYSE American']
const EXCHANGE_SHORT_MAP: Record<string, string> = {
  'New York Stock Exchange': 'NYSE',
  'Nasdaq Global Select': 'NASDAQ',
  'Nasdaq Global Market': 'NASDAQ',
  'Nasdaq Capital Market': 'NASDAQ',
  'NYSE American': 'AMEX',
  'NYSE': 'NYSE',
  'NASDAQ': 'NASDAQ',
  'AMEX': 'AMEX',
}

interface FMPStock {
  symbol: string
  name: string
  price: number
  exchange: string
  exchangeShortName: string
  type: string
}

interface USStock {
  symbol: string
  name: string
  exchange: string
  exchange_short: string
  type: string
  market_cap: number | null
  is_active: boolean
  financials_status: string
}

async function loadEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const envContent = await fs.readFile(envPath, 'utf-8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
  } catch {
    console.error('Error: Could not load .env.local')
    process.exit(1)
  }
}

async function fetchStockList(apiKey: string): Promise<FMPStock[]> {
  console.log('Fetching stock list from FMP API...')

  const url = `${FMP_BASE_URL}/stock/list?apikey=${apiKey}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid response from FMP API')
  }

  console.log(`  Fetched ${data.length} total stocks globally\n`)
  return data
}

async function fetchMarketCaps(apiKey: string, symbols: string[]): Promise<Map<string, number>> {
  console.log('Fetching market caps (this may take a moment)...')

  const marketCaps = new Map<string, number>()

  // FMP has a screener endpoint that can return market caps
  // We'll batch this in chunks of 1000 symbols
  const chunkSize = 1000
  const chunks: string[][] = []

  for (let i = 0; i < symbols.length; i += chunkSize) {
    chunks.push(symbols.slice(i, i + chunkSize))
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    process.stdout.write(`  Processing chunk ${i + 1}/${chunks.length}...`)

    // Use the quote endpoint which includes market cap
    // But it has limits, so we'll use the stock screener instead
    const url = `${FMP_BASE_URL}/stock-screener?marketCapMoreThan=0&exchange=NYSE,NASDAQ,AMEX&limit=10000&apikey=${apiKey}`

    try {
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          data.forEach((stock: any) => {
            if (stock.symbol && stock.marketCap) {
              marketCaps.set(stock.symbol, stock.marketCap)
            }
          })
        }
      }
      console.log(` found ${marketCaps.size} market caps`)
      break // Screener returns all at once
    } catch (err) {
      console.log(' error, skipping')
    }
  }

  return marketCaps
}

function filterUSStocks(stocks: FMPStock[]): FMPStock[] {
  return stocks.filter((stock) => {
    // Must be on a valid US exchange
    const isValidExchange =
      VALID_EXCHANGES.includes(stock.exchange) ||
      VALID_EXCHANGES.includes(stock.exchangeShortName)

    // Must be a stock (not ETF, fund, etc.)
    const isStock = stock.type === 'stock'

    // Must have a valid symbol (no special characters except dots and dashes)
    const hasValidSymbol = /^[A-Z0-9.-]+$/.test(stock.symbol)

    // Exclude common non-stock patterns
    const isNotWarrant = !stock.symbol.includes('W') || stock.symbol.length <= 4
    const isNotUnit = !stock.symbol.includes('U') || stock.symbol.length <= 4

    return isValidExchange && isStock && hasValidSymbol && isNotWarrant && isNotUnit
  })
}

function transformToUSStock(stock: FMPStock, marketCap: number | null): USStock {
  const exchangeShort = EXCHANGE_SHORT_MAP[stock.exchange] ||
    EXCHANGE_SHORT_MAP[stock.exchangeShortName] ||
    stock.exchangeShortName ||
    'OTHER'

  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    exchange: stock.exchange,
    exchange_short: exchangeShort,
    type: 'stock',
    market_cap: marketCap,
    is_active: true,
    financials_status: 'pending',
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('US STOCKS REGISTRY LOADER')
  console.log('='.repeat(60))
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const updateMarketCapOnly = args.includes('--update-market-cap')

  if (dryRun) {
    console.log('DRY RUN MODE - No data will be inserted\n')
  }

  // Load environment
  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const FMP_API_KEY = process.env.FMP_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FMP_API_KEY) {
    console.error('Error: Missing required environment variables')
    console.error('  Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, FMP_API_KEY')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Fetch all stocks from FMP
  const allStocks = await fetchStockList(FMP_API_KEY)

  // Filter to US stocks only
  const usStocks = filterUSStocks(allStocks)
  console.log(`Filtered to ${usStocks.length} US stocks (NYSE, NASDAQ, AMEX)\n`)

  // Show exchange breakdown
  const exchangeCounts: Record<string, number> = {}
  usStocks.forEach((stock) => {
    const ex = EXCHANGE_SHORT_MAP[stock.exchange] || stock.exchangeShortName || 'OTHER'
    exchangeCounts[ex] = (exchangeCounts[ex] || 0) + 1
  })
  console.log('Exchange breakdown:')
  Object.entries(exchangeCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([ex, count]) => {
      console.log(`  ${ex}: ${count}`)
    })
  console.log()

  // Fetch market caps for prioritization
  const marketCaps = await fetchMarketCaps(FMP_API_KEY, usStocks.map((s) => s.symbol))
  console.log(`  Got market caps for ${marketCaps.size} stocks\n`)

  // Transform to our format
  const records = usStocks.map((stock) =>
    transformToUSStock(stock, marketCaps.get(stock.symbol) || null)
  )

  // Sort by market cap (largest first) for reporting
  const sortedByMarketCap = [...records]
    .filter((r) => r.market_cap)
    .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))

  console.log('Top 20 stocks by market cap:')
  sortedByMarketCap.slice(0, 20).forEach((stock, i) => {
    const cap = stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : 'N/A'
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} ${stock.name.slice(0, 30).padEnd(32)} ${cap}`)
  })
  console.log()

  if (dryRun) {
    console.log('DRY RUN - Skipping database insert')
    console.log(`Would insert ${records.length} stocks`)
    return
  }

  if (updateMarketCapOnly) {
    console.log('Updating market caps only...')
    let updated = 0
    for (const record of records) {
      if (record.market_cap) {
        const { error } = await supabase
          .from('us_stocks')
          .update({ market_cap: record.market_cap })
          .eq('symbol', record.symbol)

        if (!error) updated++
      }
    }
    console.log(`Updated ${updated} market caps`)
    return
  }

  // Insert into database
  console.log('Inserting into us_stocks table...')

  // Batch insert in chunks of 500
  const batchSize = 500
  let inserted = 0
  let errors = 0

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    process.stdout.write(`  Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)}...`)

    const { error } = await supabase.from('us_stocks').upsert(batch, {
      onConflict: 'symbol',
      ignoreDuplicates: false,
    })

    if (error) {
      console.log(` error: ${error.message}`)
      errors += batch.length
    } else {
      console.log(` done (${batch.length} records)`)
      inserted += batch.length
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nTotal US stocks: ${records.length}`)
  console.log(`Inserted/updated: ${inserted}`)
  console.log(`Errors: ${errors}`)
  console.log(`\nStocks with market cap: ${records.filter((r) => r.market_cap).length}`)
  console.log(`Stocks without market cap: ${records.filter((r) => !r.market_cap).length}`)

  console.log('\nNext steps:')
  console.log('  1. Run batch-ingest-financials.ts to load financial data')
  console.log('  2. npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 500')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
