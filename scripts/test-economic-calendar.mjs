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

console.log('Testing Economic Calendar API...\n')

// Get current date and 7 days from now
const today = new Date()
const nextWeek = new Date(today)
nextWeek.setDate(today.getDate() + 7)

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const from = formatDate(today)
const to = formatDate(nextWeek)

console.log(`Fetching economic events from ${from} to ${to}...\n`)

try {
  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`
  const response = await fetch(url)
  const data = await response.json()

  if (Array.isArray(data)) {
    console.log(`Found ${data.length} events`)
    console.log('\nFirst 5 events:')
    console.log(JSON.stringify(data.slice(0, 5), null, 2))
  } else {
    console.log('Response:', JSON.stringify(data, null, 2))
  }
} catch (error) {
  console.error('Error:', error.message)
}
