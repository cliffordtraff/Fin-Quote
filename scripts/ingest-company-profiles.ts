/**
 * Ingest company profile data from FMP API into company_profile table
 *
 * Data includes: employees, IPO date, sector, industry, CEO, etc.
 *
 * Usage:
 *   npx tsx scripts/ingest-company-profiles.ts              # All S&P 500 stocks
 *   npx tsx scripts/ingest-company-profiles.ts --limit 10   # First 10 stocks
 *   npx tsx scripts/ingest-company-profiles.ts --symbol AAPL # Single stock
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!FMP_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const RATE_LIMIT_DELAY_MS = 200 // 5 requests per second
const BATCH_SIZE = 10

interface FMPProfile {
  symbol: string
  companyName: string
  exchange: string
  exchangeShortName: string
  sector: string
  industry: string
  description: string
  ceo: string
  fullTimeEmployees: string | number
  city: string
  state: string
  country: string
  website: string
  ipoDate: string
  // Additional fields we might want
  image: string
  currency: string
  mktCap: number
  price: number
  volAvg: number
  beta: number
  changes: number
  range: string
  isActivelyTrading: boolean
  isEtf: boolean
  isFund: boolean
  isAdr: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchCompanyProfile(symbol: string): Promise<FMPProfile | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      console.error(`Failed to fetch profile for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data?.[0] || null
  } catch (error) {
    console.error(`Error fetching profile for ${symbol}:`, error)
    return null
  }
}

function transformProfile(profile: FMPProfile) {
  // Parse employees - FMP returns it as a string sometimes
  let employees: number | null = null
  if (profile.fullTimeEmployees) {
    const parsed = parseInt(String(profile.fullTimeEmployees).replace(/,/g, ''), 10)
    if (!isNaN(parsed)) {
      employees = parsed
    }
  }

  // Build headquarters string
  const headquarters = [profile.city, profile.state].filter(Boolean).join(', ') || null

  return {
    symbol: profile.symbol,
    company_name: profile.companyName || null,
    exchange: profile.exchangeShortName || profile.exchange || null,
    sector: profile.sector || null,
    industry: profile.industry || null,
    description: profile.description || null,
    ceo: profile.ceo || null,
    employees,
    headquarters,
    country: profile.country || null,
    website: profile.website || null,
    ipo_date: profile.ipoDate || null,
    fiscal_year_end: null, // FMP doesn't provide this in profile endpoint
    last_updated: new Date().toISOString(),
  }
}

async function getSymbolsToProcess(options: { symbol?: string; limit?: number }): Promise<string[]> {
  if (options.symbol) {
    return [options.symbol.toUpperCase()]
  }

  // Get all symbols from financials_std table (S&P 500 stocks)
  // Paginate to get all symbols since table has ~30k rows
  let allSymbols: string[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('financials_std')
      .select('symbol')
      .order('symbol')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching company symbols:', error)
      break
    }

    if (!data || data.length === 0) break

    allSymbols.push(...data.map(c => c.symbol))
    offset += pageSize

    if (data.length < pageSize) break
  }

  // Deduplicate symbols (financials_std has multiple rows per symbol)
  let symbols = [...new Set(allSymbols)]

  if (options.limit) {
    symbols = symbols.slice(0, options.limit)
  }

  return symbols
}

async function main() {
  const args = process.argv.slice(2)
  const options: { symbol?: string; limit?: number } = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      options.symbol = args[i + 1]
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10)
      i++
    }
  }

  console.log('='.repeat(60))
  console.log('Company Profile Ingestion')
  console.log('='.repeat(60))

  const symbols = await getSymbolsToProcess(options)
  console.log(`Processing ${symbols.length} symbols...`)

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  // Process in batches
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batch.join(', ')}`)

    const profiles: ReturnType<typeof transformProfile>[] = []

    for (const symbol of batch) {
      const profile = await fetchCompanyProfile(symbol)

      if (profile) {
        profiles.push(transformProfile(profile))
        console.log(`  ✓ ${symbol}: ${profile.companyName} (${profile.fullTimeEmployees || 'N/A'} employees)`)
        successCount++
      } else {
        console.log(`  ✗ ${symbol}: Failed to fetch`)
        errorCount++
      }

      await sleep(RATE_LIMIT_DELAY_MS)
    }

    // Upsert batch to database
    if (profiles.length > 0) {
      const { error } = await supabase
        .from('company_profile')
        .upsert(profiles, { onConflict: 'symbol' })

      if (error) {
        console.error(`  Error upserting batch:`, error.message)
        errorCount += profiles.length
        successCount -= profiles.length
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`✓ Success: ${successCount}`)
  console.log(`✗ Errors:  ${errorCount}`)
  console.log(`- Skipped: ${skippedCount}`)
}

main().catch(console.error)
