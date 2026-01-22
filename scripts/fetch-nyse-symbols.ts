import * as fs from 'fs/promises'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

interface FMPStock {
  symbol: string
  name: string
  price: number
  exchange: string
  exchangeShortName: string
  type: string
}

interface NYSEConstituent {
  symbol: string
  name: string
  exchange: string
  type: string
  is_active: boolean
  alternate_symbols: Record<string, string>
}

async function fetchNYSESymbols() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    console.error('FMP_API_KEY not found in environment variables')
    process.exit(1)
  }

  console.log('Fetching stock list from FMP...')

  const url = `https://financialmodelingprep.com/api/v3/stock/list?apikey=${apiKey}`

  const response = await fetch(url)

  if (!response.ok) {
    console.error(`Failed to fetch stock list: ${response.status}`)
    process.exit(1)
  }

  const allStocks: FMPStock[] = await response.json()

  console.log(`Total stocks returned: ${allStocks.length}`)

  // Filter for NYSE stocks only (common stocks, not ETFs/funds/warrants/units/preferred)
  const nyseStocks = allStocks.filter(stock => {
    if (stock.exchangeShortName !== 'NYSE') return false
    if (stock.type !== 'stock') return false
    if (!stock.symbol || !stock.name) return false

    // Exclude warrants, units, preferred shares, rights
    const symbol = stock.symbol
    if (symbol.includes('-WT') || symbol.includes('.WT')) return false // Warrants
    if (symbol.includes('-UN') || symbol.includes('.UN')) return false // Units
    if (symbol.includes('-RT') || symbol.includes('.RT')) return false // Rights
    if (/-P[A-Z]?$/.test(symbol)) return false // Preferred shares (e.g., -PA, -PB, -P)
    if (/\.P[A-Z]?$/.test(symbol)) return false // Preferred shares with dot notation
    if (symbol.includes('-WS')) return false // Warrants (alternate notation)

    return true
  })

  console.log(`NYSE stocks found: ${nyseStocks.length}`)

  // Format for our use
  const nyseConstituents: NYSEConstituent[] = nyseStocks.map(stock => ({
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    type: stock.type,
    is_active: true,
    alternate_symbols: {}
  }))

  // Sort alphabetically by symbol
  nyseConstituents.sort((a, b) => a.symbol.localeCompare(b.symbol))

  // Save to file
  const outputPath = path.join(process.cwd(), 'data', 'nyse-constituents.json')
  await fs.writeFile(outputPath, JSON.stringify(nyseConstituents, null, 2))

  console.log(`Saved ${nyseConstituents.length} NYSE stocks to ${outputPath}`)

  // Print some stats
  console.log('\nSample stocks:')
  nyseConstituents.slice(0, 10).forEach(s => console.log(`  ${s.symbol}: ${s.name}`))
}

fetchNYSESymbols().catch(console.error)
