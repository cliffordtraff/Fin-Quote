/**
 * Ingestion script: Loads SEC filings from seed file into Supabase
 * Supports any stock symbol
 *
 * Usage:
 *   npx tsx scripts/ingest-filings.ts AAPL    # Ingest AAPL filings
 *   npx tsx scripts/ingest-filings.ts GOOGL   # Ingest GOOGL filings
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Parse command line arguments
const args = process.argv.slice(2)
const SYMBOL = args[0]?.toUpperCase() || 'AAPL'

async function ingestFilings() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    console.error('SUPABASE_URL:', SUPABASE_URL ? 'Found' : 'Missing')
    console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Found' : 'Missing')
    return
  }
  console.log(`Starting ${SYMBOL} filings ingestion...\n`)

  // Read seed data
  const symbolLower = SYMBOL.toLowerCase()
  const filePath = path.join(process.cwd(), 'data', `${symbolLower}-filings.json`)

  let fileContent: string
  try {
    fileContent = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    console.error(`Error reading ${symbolLower}-filings.json:`, error)
    console.error(`\nMake sure to run the fetch script first:`)
    console.error(`  npx tsx scripts/fetch-sec-filings.ts ${SYMBOL}`)
    return
  }

  const filings = JSON.parse(fileContent)

  console.log(`✓ Loaded ${filings.length} filings from data/${symbolLower}-filings.json\n`)

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Get existing filings by accession number (unique identifier)
  const { data: existingFilings, error: fetchError } = await supabase
    .from('filings')
    .select('accession_number')
    .eq('ticker', SYMBOL)

  if (fetchError) {
    console.error('Error fetching existing filings:', fetchError)
    console.error('\nNote: If table does not exist, run the SQL in data/create-filings-table.sql in Supabase SQL Editor first.')
    return
  }

  const existingAccessionNumbers = new Set(
    existingFilings?.map((f) => f.accession_number) || []
  )

  console.log(`Found ${existingAccessionNumbers.size} existing filings in database\n`)

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const filing of filings) {
    if (existingAccessionNumbers.has(filing.accession_number)) {
      // Skip duplicate
      console.log(`⊘ Skipped ${filing.filing_type} ${filing.filing_date} (already exists)`)
      skipped++
      continue
    }

    // INSERT new filing
    const { error } = await supabase.from('filings').insert({
      ticker: filing.ticker,
      filing_type: filing.filing_type,
      filing_date: filing.filing_date,
      period_end_date: filing.period_end_date,
      accession_number: filing.accession_number,
      document_url: filing.document_url,
      fiscal_year: filing.fiscal_year,
      fiscal_quarter: filing.fiscal_quarter,
    })

    if (error) {
      console.error(
        `✗ Error inserting ${filing.filing_type} ${filing.filing_date}:`,
        error.message
      )
      errors++
    } else {
      console.log(`✓ Inserted ${filing.filing_type} ${filing.filing_date} (FY${filing.fiscal_year}${filing.fiscal_quarter ? ' Q' + filing.fiscal_quarter : ''})`)
      inserted++
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total in seed file: ${filings.length}`)
}

// Load environment variables from .env.local
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')

    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Error loading .env.local:', error)
  }
}

loadEnv().then(() => ingestFilings()).catch(console.error)
