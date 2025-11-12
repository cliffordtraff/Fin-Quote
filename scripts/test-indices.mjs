/**
 * Test FMP API for major market indices
 */

const apiKey = '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'

console.log('Testing FMP API for major market indices\n')
console.log('='.repeat(60))

// Common index symbols to test
const indices = [
  { name: 'S&P 500', symbols: ['^GSPC', 'SPX', '^SPX'] },
  { name: 'Nasdaq Composite', symbols: ['^IXIC', 'IXIC', 'COMP'] },
  { name: 'Dow Jones', symbols: ['^DJI', 'DJI', '^DJIA'] },
  { name: 'Russell 2000', symbols: ['^RUT', 'RUT', 'RUTX'] },
  { name: 'VIX', symbols: ['^VIX', 'VIX'] }
]

for (const index of indices) {
  console.log(`\n📊 Testing: ${index.name}`)
  console.log('-'.repeat(60))

  for (const symbol of index.symbols) {
    try {
      // Test quote endpoint
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
      const response = await fetch(quoteUrl)
      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        const quote = data[0]
        console.log(`  ✅ ${symbol} works!`)
        console.log(`     Price: $${quote.price}`)
        console.log(`     Change: ${quote.change} (${quote.changesPercentage}%)`)
        console.log(`     Volume: ${quote.volume}`)
        break // Found working symbol, move to next index
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

// Test intraday data for S&P 500
console.log(`\n\n${'='.repeat(60)}`)
console.log('Testing intraday data for S&P 500:')
console.log('='.repeat(60))

const spxSymbols = ['^GSPC', 'SPX', '^SPX']
for (const symbol of spxSymbols) {
  try {
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/5min/${symbol}?apikey=${apiKey}`
    const response = await fetch(intradayUrl)
    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      console.log(`\n✅ Intraday data available for ${symbol}`)
      console.log(`   Total candles: ${data.length}`)
      console.log(`   First: ${data[0].date} - $${data[0].close}`)
      console.log(`   Last: ${data[data.length - 1].date} - $${data[data.length - 1].close}`)
      break
    } else {
      console.log(`\n❌ ${symbol}: No intraday data`)
    }
  } catch (error) {
    console.log(`\n❌ ${symbol}: Error - ${error.message}`)
  }
}

console.log('\n' + '='.repeat(60))
console.log('Test complete!')
