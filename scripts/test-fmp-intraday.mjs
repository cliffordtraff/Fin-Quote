// Test FMP API intraday endpoints
import 'dotenv/config'

const apiKey = process.env.FMP_API_KEY

async function testIntradayEndpoints() {
  console.log('Testing FMP Intraday Endpoints...\n')
  console.log('Note: Testing on Sunday - market is closed, so checking for recent historical data\n')

  // Test 1: Standard intraday endpoint (should give last 5 days)
  console.log('1. Standard intraday endpoint (10min):')
  const url1 = `https://financialmodelingprep.com/api/v3/historical-chart/10min/AAPL?apikey=${apiKey}`
  const res1 = await fetch(url1)
  const data1 = await res1.json()
  console.log(`   Total candles: ${data1?.length || 0}`)
  if (data1?.length > 0) {
    console.log(`   First 3 candles:`)
    data1.slice(0, 3).forEach(c => console.log(`     ${c.date} - O:${c.open} H:${c.high} L:${c.low} C:${c.close}`))
    console.log(`   Last 3 candles:`)
    data1.slice(-3).forEach(c => console.log(`     ${c.date} - O:${c.open} H:${c.high} L:${c.low} C:${c.close}`))
  } else {
    console.log(`   Response:`, data1)
  }

  // Test 2: Try with specific date range (Friday Nov 8)
  console.log('\n2. Intraday with date range (Nov 7-8, 2024):')
  const url2 = `https://financialmodelingprep.com/api/v3/historical-chart/10min/AAPL?from=2024-11-07&to=2024-11-08&apikey=${apiKey}`
  const res2 = await fetch(url2)
  const data2 = await res2.json()
  console.log(`   Total candles: ${data2?.length || 0}`)
  if (data2?.length > 0) {
    console.log(`   Date range: ${data2[data2.length-1].date} to ${data2[0].date}`)
    console.log(`   Sample candles:`)
    data2.slice(0, 3).forEach(c => console.log(`     ${c.date}`))
  } else {
    console.log(`   Response:`, data2)
  }

  // Test 3: Try 15-minute interval (might have more historical data)
  console.log('\n3. 15-minute interval:')
  const url3 = `https://financialmodelingprep.com/api/v3/historical-chart/15min/AAPL?apikey=${apiKey}`
  const res3 = await fetch(url3)
  const data3 = await res3.json()
  console.log(`   Total candles: ${data3?.length || 0}`)
  if (data3?.length > 0) {
    console.log(`   Date range: ${data3[data3.length-1].date} to ${data3[0].date}`)
  } else {
    console.log(`   Response:`, data3)
  }

  // Test 4: Try 5-minute interval
  console.log('\n4. 5-minute interval:')
  const url4 = `https://financialmodelingprep.com/api/v3/historical-chart/5min/AAPL?apikey=${apiKey}`
  const res4 = await fetch(url4)
  const data4 = await res4.json()
  console.log(`   Total candles: ${data4?.length || 0}`)
  if (data4?.length > 0) {
    console.log(`   Date range: ${data4[data4.length-1].date} to ${data4[0].date}`)
    console.log(`   Sample: ${data4[0].date}`)
  } else {
    console.log(`   Response:`, data4)
  }
}

testIntradayEndpoints().catch(console.error)
