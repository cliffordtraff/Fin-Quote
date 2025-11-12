import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'

// Load environment variables from .env.local
config({ path: '.env.local' })

interface StockQuote {
  symbol: string
  name: string
  price: number
  exchange: string
  exchangeShortName: string
  type: string
  volume: number
  avgVolume: number
  marketCap: number
}

const FMP_API_KEY = process.env.FMP_API_KEY

const FILTERS = {
  exchanges: ['NYSE', 'NASDAQ'],
  minPrice: 5,
  minAvgVolume: 1_000_000, // 1M+ average daily volume
  minMarketCap: 500_000_000, // $500M minimum market cap
  excludeTypes: ['ETF', 'TRUST', 'REIT'], // Exclude non-common stocks
  maxSymbolLength: 5, // Exclude exotic tickers (e.g., ABCDE-WT)
  targetCount: 300, // Target 300 stocks
}

async function fetchAllUSStocks(): Promise<StockQuote[]> {
  console.log('Fetching all US stocks from FMP...')

  // Use stock screener with basic filters first
  const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=${FILTERS.minMarketCap}&priceMoreThan=${FILTERS.minPrice}&limit=2000&apikey=${FMP_API_KEY}`

  const response = await fetch(url)
  const data = await response.json()

  console.log(`Fetched ${data.length} stocks from FMP`)

  // Map to our StockQuote interface and add avgVolume from volume field
  const stocks: StockQuote[] = data.map((stock: any) => ({
    symbol: stock.symbol,
    name: stock.companyName || stock.name,
    price: stock.price,
    exchange: stock.exchange,
    exchangeShortName: stock.exchangeShortName,
    type: stock.type || 'stock',
    volume: stock.volume || 0,
    avgVolume: stock.volume || 0, // Use current volume as proxy for avg volume
    marketCap: stock.marketCap,
  }))

  return stocks
}

function filterStocks(stocks: StockQuote[]): StockQuote[] {
  console.log('\nApplying filters...')

  let filtered = stocks

  // Filter by exchange
  filtered = filtered.filter(s =>
    FILTERS.exchanges.includes(s.exchangeShortName)
  )
  console.log(`After exchange filter (NYSE/NASDAQ): ${filtered.length} stocks`)

  // Filter by price
  filtered = filtered.filter(s => s.price >= FILTERS.minPrice)
  console.log(`After price filter (>= $${FILTERS.minPrice}): ${filtered.length} stocks`)

  // Filter by average volume
  filtered = filtered.filter(s => s.avgVolume >= FILTERS.minAvgVolume)
  console.log(`After avg volume filter (>= ${FILTERS.minAvgVolume.toLocaleString()}): ${filtered.length} stocks`)

  // Filter by market cap
  filtered = filtered.filter(s => s.marketCap >= FILTERS.minMarketCap)
  console.log(`After market cap filter (>= $${(FILTERS.minMarketCap / 1_000_000).toFixed(0)}M): ${filtered.length} stocks`)

  // Filter by symbol length (exclude warrants, preferreds, units)
  filtered = filtered.filter(s =>
    s.symbol.length <= FILTERS.maxSymbolLength &&
    !s.symbol.includes('.') &&
    !s.symbol.includes('-') &&
    !s.symbol.includes('^')
  )
  console.log(`After symbol filter (length <= ${FILTERS.maxSymbolLength}): ${filtered.length} stocks`)

  // Filter by type (exclude ETFs, trusts)
  filtered = filtered.filter(s => {
    const name = s.name.toUpperCase()
    const symbol = s.symbol.toUpperCase()

    // Exclude ETFs
    if (name.includes('ETF') || symbol.includes('ETF')) return false

    // Exclude trusts and REITs
    if (FILTERS.excludeTypes.some(type => name.includes(type))) return false

    return true
  })
  console.log(`After type filter (exclude ETFs/Trusts/REITs): ${filtered.length} stocks`)

  // Sort by market cap (descending) and take top N
  filtered.sort((a, b) => b.marketCap - a.marketCap)
  filtered = filtered.slice(0, FILTERS.targetCount)
  console.log(`After limiting to top ${FILTERS.targetCount} by market cap: ${filtered.length} stocks`)

  return filtered
}

async function saveTickerList(stocks: StockQuote[]): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data')
  const filePath = path.join(dataDir, 'us_tickers.txt')

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Write symbols to file (one per line)
  const symbols = stocks.map(s => s.symbol).join('\n')
  fs.writeFileSync(filePath, symbols, 'utf-8')

  console.log(`\n✅ Saved ${stocks.length} tickers to ${filePath}`)

  // Also save detailed metadata for reference
  const metadataPath = path.join(dataDir, 'us_tickers_metadata.json')
  const metadata = stocks.map(s => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    exchange: s.exchangeShortName,
    volume: s.volume,
    avgVolume: s.avgVolume,
    marketCap: s.marketCap,
  }))
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  console.log(`✅ Saved metadata to ${metadataPath}`)
}

function printSummary(stocks: StockQuote[]): void {
  console.log('\n' + '='.repeat(60))
  console.log('TICKER UNIVERSE SUMMARY')
  console.log('='.repeat(60))

  console.log(`\nTotal stocks: ${stocks.length}`)

  // Exchange breakdown
  const exchangeCounts = stocks.reduce((acc, s) => {
    acc[s.exchangeShortName] = (acc[s.exchangeShortName] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log('\nBy Exchange:')
  Object.entries(exchangeCounts).forEach(([exchange, count]) => {
    console.log(`  ${exchange}: ${count}`)
  })

  // Market cap breakdown
  const large = stocks.filter(s => s.marketCap >= 10_000_000_000).length
  const mid = stocks.filter(s => s.marketCap >= 2_000_000_000 && s.marketCap < 10_000_000_000).length
  const small = stocks.filter(s => s.marketCap < 2_000_000_000).length
  console.log('\nBy Market Cap:')
  console.log(`  Large-cap (>= $10B): ${large}`)
  console.log(`  Mid-cap ($2B-$10B): ${mid}`)
  console.log(`  Small-cap (< $2B): ${small}`)

  // Price stats
  const prices = stocks.map(s => s.price)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  console.log('\nPrice Range:')
  console.log(`  Min: $${minPrice.toFixed(2)}`)
  console.log(`  Avg: $${avgPrice.toFixed(2)}`)
  console.log(`  Max: $${maxPrice.toFixed(2)}`)

  // Volume stats
  const volumes = stocks.map(s => s.avgVolume)
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length
  console.log('\nAverage Daily Volume:')
  console.log(`  Avg: ${avgVolume.toLocaleString()} shares`)

  console.log('\n' + '='.repeat(60))
}

async function main() {
  try {
    if (!FMP_API_KEY) {
      throw new Error('FMP_API_KEY environment variable is not set')
    }

    console.log('Starting ticker universe filtering...\n')

    // Fetch all US stocks
    const allStocks = await fetchAllUSStocks()

    // Apply filters
    const filteredStocks = filterStocks(allStocks)

    // Save to file
    await saveTickerList(filteredStocks)

    // Print summary
    printSummary(filteredStocks)

    console.log('\n✅ Ticker universe filtering complete!')
    console.log('\nNext steps:')
    console.log('  1. Review data/us_tickers.txt')
    console.log('  2. Check data/us_tickers_metadata.json for details')
    console.log('  3. Re-run this script weekly to keep the list updated')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
