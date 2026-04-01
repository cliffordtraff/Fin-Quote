/**
 * Test script to verify if FMP API provides futures market data
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const apiKey = process.env.FMP_API_KEY
if (!apiKey) { console.error('FMP_API_KEY is required — set it in .env.local'); process.exit(1) }

console.log('Testing FMP API for futures market data\n')
console.log('='.repeat(60))

// Common futures symbols to test
const futures = [
  { name: 'Crude Oil', symbols: ['CL', 'CLZ24', 'CL=F', 'CRUDE_OIL'] },
  { name: 'Natural Gas', symbols: ['NG', 'NGZ24', 'NG=F', 'NATURAL_GAS'] },
  { name: 'Gold', symbols: ['GC', 'GCZ24', 'GC=F', 'GOLD'] },
  { name: 'E-mini Dow', symbols: ['YM', 'YMZ24', 'YM=F', 'DJIA'] },
  { name: 'E-mini S&P 500', symbols: ['ES', 'ESZ24', 'ES=F', 'SPX'] },
  { name: 'E-mini Nasdaq 100', symbols: ['NQ', 'NQZ24', 'NQ=F', 'NASDAQ'] },
  { name: 'E-mini Russell 2000', symbols: ['RTY', 'RTYZ24', 'RTY=F', 'RUSSELL'] }
]

for (const future of futures) {
  console.log(`\n📊 Testing: ${future.name}`)
  console.log('-'.repeat(60))

  for (const symbol of future.symbols) {
    try {
      // Test quote endpoint
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
      const response = await fetch(quoteUrl)
      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        const quote = data[0]
        console.log(`  ✅ ${symbol} works!`)
        console.log(`     Name: ${quote.name}`)
        console.log(`     Price: $${quote.price}`)
        console.log(`     Change: ${quote.change} (${quote.changesPercentage}%)`)
        break // Found working symbol, move to next future
      } else if (data && 'Error Message' in data) {
        console.log(`  ❌ ${symbol}: ${data['Error Message']}`)
      } else {
        console.log(`  ❌ ${symbol}: No data returned`)
      }
    } catch (error) {
      console.log(`  ❌ ${symbol}: Error - ${error.message}`)
    }
  }
}

console.log('\n' + '='.repeat(60))
console.log('Test complete!')
