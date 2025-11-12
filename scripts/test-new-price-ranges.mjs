// Test script for new price range functionality
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const FMP_API_KEY = process.env.FMP_API_KEY

if (!FMP_API_KEY) {
  console.error('❌ FMP_API_KEY not found')
  process.exit(1)
}

// Test helper
async function testPriceRange(testName, params) {
  console.log(`\n🧪 Testing: ${testName}`)
  console.log(`   Params: ${JSON.stringify(params)}`)

  try {
    let url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${FMP_API_KEY}`

    if ('range' in params) {
      const { range } = params
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      let fromDate = null
      let toDate = null

      if (range === 'ytd') {
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        fromDate = startOfYear.toISOString().split('T')[0]
        toDate = todayStr
      } else if (range === 'max') {
        // Don't set from/to for max
      } else if (range.endsWith('y')) {
        const years = parseInt(range.slice(0, -1))
        const startDate = new Date(today)
        startDate.setFullYear(startDate.getFullYear() - years)
        fromDate = startDate.toISOString().split('T')[0]
        toDate = todayStr
      } else {
        const days = parseInt(range.slice(0, -1))
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - days)
        fromDate = startDate.toISOString().split('T')[0]
        toDate = todayStr
      }

      if (fromDate) url += `&from=${fromDate}`
      if (toDate) url += `&to=${toDate}`

      console.log(`   URL: ${url.replace(FMP_API_KEY, 'REDACTED')}`)
    } else {
      const { from, to } = params
      url += `&from=${from}`
      if (to) url += `&to=${to}`
      console.log(`   URL: ${url.replace(FMP_API_KEY, 'REDACTED')}`)
    }

    const response = await fetch(url)

    if (!response.ok) {
      console.error(`   ❌ API error: ${response.status}`)
      return
    }

    const json = await response.json()

    if (!json.historical || !Array.isArray(json.historical)) {
      console.error('   ❌ Unexpected response format')
      return
    }

    const data = json.historical
    console.log(`   ✅ Success: ${data.length} data points`)
    console.log(`   📅 Date range: ${data[data.length - 1].date} to ${data[0].date}`)
    console.log(`   💰 Latest price: $${data[0].close}`)
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`)
  }
}

// Run tests
console.log('🚀 Testing new price range functionality\n')
console.log('=' .repeat(60))

// Test old ranges
await testPriceRange('7d range', { range: '7d' })
await testPriceRange('30d range', { range: '30d' })
await testPriceRange('90d range', { range: '90d' })
await testPriceRange('365d range', { range: '365d' })
await testPriceRange('ytd range', { range: 'ytd' })

// Test new multi-year ranges
await testPriceRange('3y range (NEW)', { range: '3y' })
await testPriceRange('5y range (NEW)', { range: '5y' })
await testPriceRange('10y range (NEW)', { range: '10y' })
await testPriceRange('20y range (NEW)', { range: '20y' })
await testPriceRange('max range (NEW)', { range: 'max' })

// Test custom date ranges
await testPriceRange('Custom: 2020-01-01 to 2023-12-31', { from: '2020-01-01', to: '2023-12-31' })
await testPriceRange('Custom: from 2018-03-01 to today', { from: '2018-03-01' })

console.log('\n' + '='.repeat(60))
console.log('✅ All tests complete!')
