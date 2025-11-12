import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const apiKey = process.env.FMP_API_KEY

if (!apiKey) {
  console.error('FMP_API_KEY not found in environment')
  process.exit(1)
}

console.log('Testing VIX API...\n')

// Try different VIX symbol variations
const symbols = ['^VIX', 'VIX', 'VIXCLS']

for (const symbol of symbols) {
  console.log(`\nTrying symbol: ${symbol}`)
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
    const response = await fetch(url)
    const data = await response.json()
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Error:', error.message)
  }
}
