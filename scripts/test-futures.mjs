/**
 * Test script to verify if FMP API provides futures market data
 */

import { requireFmpApiKey } from './lib/require-fmp-api-key.mjs'

const apiKey = requireFmpApiKey()
let failedFutures = 0

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
  let foundWorkingSymbol = false

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
        foundWorkingSymbol = true
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

  if (!foundWorkingSymbol) {
    failedFutures++
  }
}

if (failedFutures > 0) {
  console.error(`\n${failedFutures} futures contract group(s) returned no usable quote.`)
  process.exitCode = 1
}

console.log('\n' + '='.repeat(60))
console.log('Test complete!')
