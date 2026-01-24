/**
 * FMP Insider Trades Ingestion Script
 *
 * Fetches latest insider trades from Financial Modeling Prep API
 * and upserts them into the insider_transactions table.
 *
 * Usage:
 *   npx tsx scripts/ingest-fmp-insiders.ts              # Default: 500 trades
 *   npx tsx scripts/ingest-fmp-insiders.ts --limit 1000 # Custom limit
 *
 * This script is designed to be run daily via GitHub Actions cron.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FMP_API_KEY = process.env.FMP_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!FMP_API_KEY) {
  console.error('Missing FMP_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Batch size for database inserts
const BATCH_SIZE = 100

interface FMPInsiderTrade {
  symbol: string
  filingDate: string
  transactionDate: string
  reportingCik: string
  reportingName: string
  typeOfOwner: string
  transactionType: string
  securitiesTransacted: number
  price: number | null
  securitiesOwned: number
  securityName: string
  link: string
  acquistionOrDisposition: string
  formType: string
}

async function fetchFromFMP(limit: number): Promise<FMPInsiderTrade[]> {
  const url = `https://financialmodelingprep.com/api/v4/insider-trading?limit=${limit}&apikey=${FMP_API_KEY}`

  console.log(`Fetching ${limit} trades from FMP API...`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid FMP response format')
  }

  return data
}

function normalizeTransactionCode(type: string | null): string | null {
  if (!type) return null

  // FMP returns full descriptions like "P-Purchase", "S-Sale", etc.
  const firstChar = type.charAt(0).toUpperCase()

  // Valid SEC transaction codes
  const validCodes = ['P', 'S', 'A', 'D', 'F', 'I', 'M', 'C', 'E', 'H', 'O', 'X', 'G', 'L', 'W', 'Z', 'J', 'K', 'U']

  return validCodes.includes(firstChar) ? firstChar : null
}

function normalizeAcqDisp(value: string | null): string | null {
  if (!value) return null
  const firstChar = value.charAt(0).toUpperCase()
  return firstChar === 'A' || firstChar === 'D' ? firstChar : null
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

async function main() {
  const args = process.argv.slice(2)
  let limit = 500

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1])
      i++
    }
  }

  console.log('FMP Insider Trades Ingestion')
  console.log('============================')
  console.log(`Limit: ${limit}`)
  console.log('')

  const startTime = Date.now()

  // Create ingestion log
  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'fmp',
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  const logId = logEntry?.id

  let inserted = 0
  let skipped = 0
  let errors = 0

  try {
    // Fetch from FMP
    const trades = await fetchFromFMP(limit)
    console.log(`Fetched ${trades.length} trades`)

    // Filter valid trades
    const validTrades = trades.filter(t =>
      t.symbol &&
      t.reportingName &&
      t.transactionDate &&
      t.securitiesTransacted > 0
    )
    console.log(`Valid trades: ${validTrades.length}`)

    // Process each trade individually (partial indexes don't work with bulk upsert)
    for (let i = 0; i < validTrades.length; i++) {
      const trade = validTrades[i]

      // Get or create insider
      const { data: insiderId } = await supabase.rpc('get_or_create_insider', {
        p_name: trade.reportingName,
        p_cik: trade.reportingCik || null
      })

      // Prepare record
      const record = {
        insider_id: insiderId || null,
        symbol: trade.symbol.toUpperCase(),
        accession_number: null, // FMP doesn't provide this
        filing_date: trade.filingDate,
        transaction_date: trade.transactionDate,
        transaction_type: trade.transactionType || null,
        transaction_code: normalizeTransactionCode(trade.transactionType),
        acquisition_disposition: normalizeAcqDisp(trade.acquistionOrDisposition),
        shares: Math.abs(trade.securitiesTransacted),
        price: trade.price || null,
        shares_owned_after: trade.securitiesOwned || null,
        reporting_name: trade.reportingName,
        owner_type: trade.typeOfOwner || null,
        officer_title: null,
        security_name: trade.securityName || null,
        form_type: trade.formType || '4',
        source: 'fmp',
        source_id: trade.link ? hashString(trade.link) : null,
        sec_link: trade.link || null
      }

      // Insert (duplicates will fail on unique constraint)
      const { error: insertError } = await supabase
        .from('insider_transactions')
        .insert(record)

      if (insertError) {
        if (insertError.code === '23505') {
          // Duplicate - this is expected for re-runs
          skipped++
        } else {
          console.error(`Insert error for ${trade.symbol}:`, insertError.message)
          errors++
        }
      } else {
        inserted++
      }

      // Progress every 50 records
      if ((i + 1) % 50 === 0 || i + 1 === validTrades.length) {
        console.log(`Progress: ${i + 1}/${validTrades.length} (${inserted} inserted, ${skipped} duplicates)`)
      }
    }

    skipped = trades.length - validTrades.length

    const duration = Date.now() - startTime

    // Update log
    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: errors > 0 ? 'partial' : 'success',
          rows_fetched: trades.length,
          rows_inserted: inserted,
          rows_skipped: skipped,
          error_message: errors > 0 ? `${errors} errors` : null,
          duration_ms: duration
        })
        .eq('id', logId)
    }

    console.log('')
    console.log('============================')
    console.log('COMPLETE')
    console.log(`  Fetched: ${trades.length}`)
    console.log(`  Inserted: ${inserted}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Errors: ${errors}`)
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)

  } catch (error) {
    console.error('Fatal error:', error)

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startTime
        })
        .eq('id', logId)
    }

    process.exit(1)
  }
}

main()
