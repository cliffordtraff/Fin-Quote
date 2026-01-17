/**
 * Ingestion script: Loads financial data from seed file into Supabase
 * Supports both annual and quarterly data for any symbol
 *
 * Uses UPSERT with conflict target (symbol, period_type, period_end_date).
 * Records without period_end_date are skipped to maintain data integrity.
 *
 * IMPORTANT: This script assumes the fetch script (fetch-aapl-data.ts) always
 * combines all three statements (income, balance, cash flow) before saving.
 * This makes naive UPSERT safe - we never overwrite complete data with partial data.
 * If you ever need to ingest statements separately, use the COALESCE-based SQL
 * approach documented in docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md Section 5.
 *
 * Usage:
 *   npx tsx scripts/ingest-financials.ts AAPL            # Ingest annual data (default)
 *   npx tsx scripts/ingest-financials.ts GOOGL annual    # Ingest annual data for GOOGL
 *   npx tsx scripts/ingest-financials.ts AAPL quarterly  # Ingest quarterly data
 *   npx tsx scripts/ingest-financials.ts GOOGL both      # Ingest both annual and quarterly
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

interface FinancialRecord {
  symbol: string
  year: number
  period_type: 'annual' | 'quarterly'
  fiscal_quarter: number | null
  fiscal_label: string | null
  period_end_date: string | null
  revenue: number
  gross_profit: number
  net_income: number
  operating_income: number
  total_assets: number
  total_liabilities: number
  shareholders_equity: number
  operating_cash_flow: number
  eps: number
}

async function ingestFinancials() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    console.error('SUPABASE_URL:', SUPABASE_URL ? 'Found' : 'Missing')
    console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Found' : 'Missing')
    return
  }

  const args = process.argv.slice(2)
  const symbol = args[0]?.toUpperCase() || 'AAPL'
  const mode = args[1] || 'annual'

  // Determine which file to load based on mode and symbol
  const symbolLower = symbol.toLowerCase()
  const filename = mode === 'both'
    ? `${symbolLower}-financials-all.json`
    : mode === 'quarterly'
      ? `${symbolLower}-financials-quarterly.json`
      : `${symbolLower}-financials.json`

  console.log(`Starting ${symbol} financials ingestion (${mode} mode)...\n`)

  // Read seed data
  const filePath = path.join(process.cwd(), 'data', filename)

  let financials: FinancialRecord[]
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    financials = JSON.parse(fileContent)
  } catch (error) {
    console.error(`Error reading ${filename}:`, error)
    console.error(`\nMake sure to run the fetch script first:`)
    console.error(`  npx tsx scripts/fetch-aapl-data.ts ${symbol} ${mode}`)
    return
  }

  // For legacy files without period_type, add defaults
  financials = financials.map((f) => ({
    ...f,
    period_type: f.period_type || 'annual',
    fiscal_quarter: f.fiscal_quarter ?? null,
    fiscal_label: f.fiscal_label ?? null,
    period_end_date: f.period_end_date ?? null,
  }))

  const annualCount = financials.filter((f) => f.period_type === 'annual').length
  const quarterlyCount = financials.filter((f) => f.period_type === 'quarterly').length

  console.log(`✓ Loaded ${financials.length} records from ${filename}`)
  if (annualCount > 0) console.log(`  - ${annualCount} annual records`)
  if (quarterlyCount > 0) console.log(`  - ${quarterlyCount} quarterly records`)
  console.log()

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Filter out records without period_end_date (required for UNIQUE constraint)
  const recordsWithDates = financials.filter((f) => f.period_end_date !== null)
  const skippedNullDates = financials.length - recordsWithDates.length

  if (skippedNullDates > 0) {
    console.log(`⚠ WARNING: Skipping ${skippedNullDates} records with null period_end_date`)
    console.log('  These records cannot be upserted. Consider re-fetching the data.\n')
  }

  // Filter out records without symbol (required for UNIQUE constraint)
  const validRecords = recordsWithDates.filter((f) => f.symbol !== null && f.symbol !== '')
  const skippedNullSymbols = recordsWithDates.length - validRecords.length

  if (skippedNullSymbols > 0) {
    console.log(`⚠ WARNING: Skipping ${skippedNullSymbols} records with null/empty symbol\n`)
  }

  if (validRecords.length === 0) {
    console.error('No valid records to upsert. All records have null period_end_date or symbol.')
    return
  }

  // Prepare records for upsert
  const upsertData = validRecords.map((f) => ({
    symbol: f.symbol,
    year: f.year,
    period_type: f.period_type,
    fiscal_quarter: f.fiscal_quarter,
    fiscal_label: f.fiscal_label,
    period_end_date: f.period_end_date,
    revenue: f.revenue,
    gross_profit: f.gross_profit,
    net_income: f.net_income,
    operating_income: f.operating_income,
    total_assets: f.total_assets,
    total_liabilities: f.total_liabilities,
    shareholders_equity: f.shareholders_equity,
    operating_cash_flow: f.operating_cash_flow,
    eps: f.eps,
  }))

  console.log(`Upserting ${upsertData.length} records...`)

  // UPSERT using new conflict target: (symbol, period_type, period_end_date)
  // This is safe because fetch-aapl-data.ts always combines all 3 statements before saving
  const { error } = await supabase
    .from('financials_std')
    .upsert(upsertData, {
      onConflict: 'symbol,period_type,period_end_date',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('Error upserting records:', error.message)
    return
  }

  console.log(`\n--- Summary ---`)
  console.log(`Upserted: ${upsertData.length} records`)
  console.log(`Skipped (null period_end_date): ${skippedNullDates}`)
  console.log(`Skipped (null symbol): ${skippedNullSymbols}`)
  console.log(`Total in file: ${financials.length}`)
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

loadEnv().then(() => ingestFinancials()).catch(console.error)
