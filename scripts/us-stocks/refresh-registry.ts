/**
 * Refresh US Stocks Registry
 *
 * Weekly maintenance script that:
 * 1. Fetches current stock list from FMP API
 * 2. Adds new stocks (IPOs, new listings)
 * 3. Marks delisted stocks as inactive
 * 4. Updates market cap values
 *
 * Usage:
 *   npx tsx scripts/us-stocks/refresh-registry.ts           # Full refresh
 *   npx tsx scripts/us-stocks/refresh-registry.ts --dry-run # Preview changes
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const VALID_EXCHANGES = [
  'NYSE',
  'NASDAQ',
  'AMEX',
  'New York Stock Exchange',
  'Nasdaq Global Select',
  'Nasdaq Global Market',
  'Nasdaq Capital Market',
  'NYSE American',
]
const EXCHANGE_SHORT_MAP: Record<string, string> = {
  'New York Stock Exchange': 'NYSE',
  'Nasdaq Global Select': 'NASDAQ',
  'Nasdaq Global Market': 'NASDAQ',
  'Nasdaq Capital Market': 'NASDAQ',
  'NYSE American': 'AMEX',
  NYSE: 'NYSE',
  NASDAQ: 'NASDAQ',
  AMEX: 'AMEX',
}

interface FMPStock {
  symbol: string
  name: string
  price: number
  exchange: string
  exchangeShortName: string
  type: string
}

interface RefreshSummary {
  newStocks: string[]
  delistedStocks: string[]
  marketCapsUpdated: number
  totalActive: number
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
  console.log('Fetching current stock list from FMP API...')

  const url = `${FMP_BASE_URL}/stock/list?apikey=${apiKey}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid response from FMP API')
  }

  console.log(`  Fetched ${data.length} total stocks globally`)
  return data
}

async function fetchMarketCaps(apiKey: string): Promise<Map<string, number>> {
  console.log('Fetching market caps...')

  const marketCaps = new Map<string, number>()
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
    console.log(`  Got market caps for ${marketCaps.size} stocks`)
  } catch (err) {
    console.log('  Warning: Could not fetch market caps')
  }

  return marketCaps
}

function filterUSStocks(stocks: FMPStock[]): FMPStock[] {
  return stocks.filter((stock) => {
    const isValidExchange =
      VALID_EXCHANGES.includes(stock.exchange) ||
      VALID_EXCHANGES.includes(stock.exchangeShortName)
    const isStock = stock.type === 'stock'
    const hasValidSymbol = /^[A-Z0-9.-]+$/.test(stock.symbol)
    const isNotWarrant = !stock.symbol.includes('W') || stock.symbol.length <= 4
    const isNotUnit = !stock.symbol.includes('U') || stock.symbol.length <= 4

    return isValidExchange && isStock && hasValidSymbol && isNotWarrant && isNotUnit
  })
}

async function main() {
  console.log('='.repeat(60))
  console.log('US STOCKS REGISTRY REFRESH')
  console.log('='.repeat(60))
  console.log()

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n')
  }

  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const FMP_API_KEY = process.env.FMP_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FMP_API_KEY) {
    console.error('Error: Missing required environment variables')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Fetch current data from FMP
  const allStocks = await fetchStockList(FMP_API_KEY)
  const usStocks = filterUSStocks(allStocks)
  const fmpSymbols = new Set(usStocks.map((s) => s.symbol))

  console.log(`  Filtered to ${usStocks.length} US stocks\n`)

  // Get existing stocks from database (need to handle >1000 rows)
  console.log('Fetching existing stocks from database...')
  const existingStocks: { symbol: string; is_active: boolean }[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error: fetchError } = await supabase
      .from('us_stocks')
      .select('symbol, is_active')
      .range(offset, offset + pageSize - 1)

    if (fetchError) {
      console.error('Error fetching existing stocks:', fetchError)
      process.exit(1)
    }

    if (!data || data.length === 0) break

    existingStocks.push(...data)
    offset += pageSize

    if (data.length < pageSize) break
  }

  const existingSymbols = new Set(existingStocks?.map((s) => s.symbol) || [])
  const activeSymbols = new Set(
    existingStocks?.filter((s) => s.is_active).map((s) => s.symbol) || []
  )

  console.log(`  Found ${existingSymbols.size} stocks in database`)
  console.log(`  ${activeSymbols.size} currently active\n`)

  // Calculate changes
  const summary: RefreshSummary = {
    newStocks: [],
    delistedStocks: [],
    marketCapsUpdated: 0,
    totalActive: 0,
  }

  // Find new stocks (in FMP but not in our database)
  for (const symbol of fmpSymbols) {
    if (!existingSymbols.has(symbol)) {
      summary.newStocks.push(symbol)
    }
  }

  // Find delisted stocks (active in our database but not in FMP)
  for (const symbol of activeSymbols) {
    if (!fmpSymbols.has(symbol)) {
      summary.delistedStocks.push(symbol)
    }
  }

  // Report changes
  console.log('Changes detected:')
  console.log(`  New stocks (IPOs): ${summary.newStocks.length}`)
  console.log(`  Delisted stocks: ${summary.delistedStocks.length}`)
  console.log()

  if (summary.newStocks.length > 0) {
    console.log('New stocks (first 20):')
    summary.newStocks.slice(0, 20).forEach((symbol) => {
      const stock = usStocks.find((s) => s.symbol === symbol)
      console.log(`  + ${symbol.padEnd(8)} ${stock?.name?.slice(0, 40) || ''}`)
    })
    if (summary.newStocks.length > 20) {
      console.log(`  ... and ${summary.newStocks.length - 20} more`)
    }
    console.log()
  }

  if (summary.delistedStocks.length > 0) {
    console.log('Delisted stocks (first 20):')
    summary.delistedStocks.slice(0, 20).forEach((symbol) => {
      console.log(`  - ${symbol}`)
    })
    if (summary.delistedStocks.length > 20) {
      console.log(`  ... and ${summary.delistedStocks.length - 20} more`)
    }
    console.log()
  }

  if (dryRun) {
    console.log('DRY RUN - No changes made')
    return
  }

  // Apply changes
  console.log('Applying changes...')

  // 1. Add new stocks
  if (summary.newStocks.length > 0) {
    console.log(`  Adding ${summary.newStocks.length} new stocks...`)

    const newRecords = summary.newStocks.map((symbol) => {
      const stock = usStocks.find((s) => s.symbol === symbol)!
      const exchangeShort =
        EXCHANGE_SHORT_MAP[stock.exchange] ||
        EXCHANGE_SHORT_MAP[stock.exchangeShortName] ||
        stock.exchangeShortName ||
        'OTHER'

      return {
        symbol: stock.symbol,
        name: stock.name || stock.symbol,
        exchange: stock.exchange,
        exchange_short: exchangeShort,
        type: 'stock',
        market_cap: null,
        is_active: true,
        financials_status: 'pending',
      }
    })

    const { error: insertError } = await supabase.from('us_stocks').upsert(newRecords, {
      onConflict: 'symbol',
      ignoreDuplicates: false,
    })

    if (insertError) {
      console.error('    Error inserting new stocks:', insertError.message)
    } else {
      console.log(`    Added ${newRecords.length} new stocks`)
    }
  }

  // 2. Mark delisted stocks as inactive
  if (summary.delistedStocks.length > 0) {
    console.log(`  Marking ${summary.delistedStocks.length} stocks as inactive...`)

    const { error: delistError } = await supabase
      .from('us_stocks')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('symbol', summary.delistedStocks)

    if (delistError) {
      console.error('    Error marking delisted stocks:', delistError.message)
    } else {
      console.log(`    Marked ${summary.delistedStocks.length} stocks as inactive`)
    }
  }

  // 3. Update market caps for all active stocks
  console.log('  Updating market caps...')
  const marketCaps = await fetchMarketCaps(FMP_API_KEY)

  let marketCapUpdates = 0
  const batchSize = 100
  const activeStocksList = [...fmpSymbols]

  for (let i = 0; i < activeStocksList.length; i += batchSize) {
    const batch = activeStocksList.slice(i, i + batchSize)

    for (const symbol of batch) {
      const marketCap = marketCaps.get(symbol)
      if (marketCap) {
        const { error } = await supabase
          .from('us_stocks')
          .update({ market_cap: marketCap, updated_at: new Date().toISOString() })
          .eq('symbol', symbol)

        if (!error) marketCapUpdates++
      }
    }

    // Progress indicator
    process.stdout.write(
      `\r    Updated ${Math.min(i + batchSize, activeStocksList.length)}/${activeStocksList.length} stocks`
    )
  }
  console.log()
  summary.marketCapsUpdated = marketCapUpdates

  // 4. Touch all active stocks to update the updated_at timestamp
  console.log('  Updating timestamps for all active stocks...')
  const { error: touchError } = await supabase
    .from('us_stocks')
    .update({ updated_at: new Date().toISOString() })
    .eq('is_active', true)

  if (touchError) {
    console.error('    Error updating timestamps:', touchError.message)
  }

  // Final count
  const { count } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  summary.totalActive = count || 0

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('REFRESH COMPLETE')
  console.log('='.repeat(60))
  console.log(`\nNew stocks added: ${summary.newStocks.length}`)
  console.log(`Stocks marked inactive: ${summary.delistedStocks.length}`)
  console.log(`Market caps updated: ${summary.marketCapsUpdated}`)
  console.log(`Total active stocks: ${summary.totalActive}`)

  if (summary.newStocks.length > 0) {
    console.log('\nTo load financials for new stocks:')
    console.log('  npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 100')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
