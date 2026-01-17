/**
 * Test if FMP Bulk API is available on current tier
 */

import * as fs from 'fs/promises'
import * as path from 'path'

async function main() {
  // Load environment variables
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = await fs.readFile(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })

  const FMP_API_KEY = process.env.FMP_API_KEY
  if (!FMP_API_KEY) {
    console.error('FMP_API_KEY not found')
    process.exit(1)
  }

  console.log('Testing FMP Bulk API access...\n')

  // Test bulk endpoint with multiple years
  const testYears = [2024, 2023, 2022]
  let bulkData: any[] = []
  let workingYear = 0
  let bulkAvailable = false
  let errorMessage = ''

  for (const year of testYears) {
    const bulkUrl = `https://financialmodelingprep.com/api/v3/income-statement-bulk?year=${year}&period=annual&apikey=${FMP_API_KEY}`
    console.log(`Testing: income-statement-bulk?year=${year}&period=annual`)

    const response = await fetch(bulkUrl)
    const data = await response.json()

    if (data['Error Message']) {
      console.log(`  ❌ Error: ${data['Error Message']}`)
      errorMessage = data['Error Message']
      break
    } else if (Array.isArray(data) && data.length > 0) {
      console.log(`  ✅ Got ${data.length} records`)
      bulkData = data
      workingYear = year
      bulkAvailable = true
      break
    } else {
      console.log(`  ⚠️ Empty response (0 records)`)
    }
  }

  console.log('')

  if (errorMessage) {
    console.log(`❌ Bulk API NOT available: ${errorMessage}`)
    console.log('\nFalling back to per-symbol API approach...\n')

    // Test per-symbol endpoint
    const perSymbolUrl = `https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=1&apikey=${FMP_API_KEY}`
    console.log('Testing: income-statement/AAPL?limit=1')
    const perSymbolResponse = await fetch(perSymbolUrl)
    const perSymbolData = await perSymbolResponse.json()

    if (Array.isArray(perSymbolData) && perSymbolData.length > 0) {
      console.log('✅ Per-symbol API is working')
      console.log(`   Sample: ${perSymbolData[0].symbol} - Revenue: $${(perSymbolData[0].revenue / 1e9).toFixed(1)}B`)
      console.log('\n→ Recommendation: Use per-symbol approach for Phase 2')
    } else {
      console.log('❌ Per-symbol API also failing:', perSymbolData)
    }
  } else if (bulkAvailable && bulkData.length > 0) {
    console.log(`✅ Bulk API is available! (Year ${workingYear})`)
    console.log(`   Records returned: ${bulkData.length}`)

    // Count S&P 500 symbols
    const sp500Path = path.join(process.cwd(), 'data', 'sp500-constituents.json')
    try {
      const sp500Content = await fs.readFile(sp500Path, 'utf-8')
      const sp500 = JSON.parse(sp500Content)
      const sp500Symbols = new Set(sp500.map((c: any) => c.symbol))

      // Also check alternate symbols (for FMP format like BRK-B)
      sp500.forEach((c: any) => {
        if (c.alternate_symbols?.fmp) {
          sp500Symbols.add(c.alternate_symbols.fmp)
        }
      })

      const sp500InBulk = bulkData.filter((r: any) => sp500Symbols.has(r.symbol))
      console.log(`   S&P 500 stocks in response: ${sp500InBulk.length}`)

      // Show some samples
      console.log('\n   Sample records:')
      sp500InBulk.slice(0, 3).forEach((r: any) => {
        console.log(`     ${r.symbol}: Revenue $${(r.revenue / 1e9).toFixed(1)}B`)
      })
    } catch {
      console.log('   (Could not check S&P 500 overlap - sp500-constituents.json not found)')
    }

    console.log('\n→ Recommendation: Use bulk API approach for Phase 2')
  } else {
    console.log('⚠️ Bulk API returned empty for all years. Testing per-symbol approach...\n')

    // Test per-symbol endpoint
    const perSymbolUrl = `https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=1&apikey=${FMP_API_KEY}`
    console.log('Testing: income-statement/AAPL?limit=1')
    const perSymbolResponse = await fetch(perSymbolUrl)
    const perSymbolData = await perSymbolResponse.json()

    if (Array.isArray(perSymbolData) && perSymbolData.length > 0) {
      console.log('✅ Per-symbol API is working')
      console.log(`   Sample: ${perSymbolData[0].symbol} FY${perSymbolData[0].calendarYear} - Revenue: $${(perSymbolData[0].revenue / 1e9).toFixed(1)}B`)
      console.log('\n→ Recommendation: Use per-symbol approach for Phase 2 (bulk returned empty)')
    } else {
      console.log('❌ Per-symbol API also failing:', perSymbolData)
    }
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
