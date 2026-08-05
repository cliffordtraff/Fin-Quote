/**
 * Test script to verify if FMP API provides 10-minute intraday data
 */

import { requireFmpApiKey } from './lib/require-fmp-api-key.mjs'

const apiKey = requireFmpApiKey()
let successfulIntervals = 0

console.log('Testing FMP API intraday endpoints for AAPL\n')
console.log('='.repeat(60))

// Test different time intervals
const intervals = ['1min', '5min', '10min', '15min', '30min', '1hour']

for (const interval of intervals) {
  console.log(`\n📊 Testing ${interval} interval:`)
  console.log('-'.repeat(60))

  const url = `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/AAPL?apikey=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`)
      continue
    }

    // Check if response has an error message
    if (data && 'Error Message' in data) {
      console.log(`❌ API Error: ${data['Error Message']}`)
      continue
    }

    // Check if it's an array with data
    if (Array.isArray(data)) {
      console.log(`✅ SUCCESS: Received ${data.length} candles`)

      if (data.length > 0) {
        successfulIntervals++
        console.log(`   First candle: ${data[0].date}`)
        console.log(`   Last candle:  ${data[data.length - 1].date}`)

        // Show first 3 candles as sample
        console.log(`   Sample data:`)
        data.slice(0, 3).forEach((candle, i) => {
          console.log(`     ${i + 1}. ${candle.date} - O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`)
        })
      } else {
        console.log(`   ⚠️  Array is empty - no data returned`)
      }
    } else {
      console.log(`❌ Unexpected response format:`)
      console.log(JSON.stringify(data, null, 2))
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
  }
}

if (successfulIntervals === 0) {
  console.error('\nNo intraday interval returned a valid response.')
  process.exitCode = 1
}

console.log('\n' + '='.repeat(60))
console.log('Test complete!')
