/**
 * Ingestion script: Loads financial data from seed file into Supabase
 * Supports both annual and quarterly data for any symbol
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

  // Get existing rows for this symbol
  const { data: existingRows, error: fetchError } = await supabase
    .from('financials_std')
    .select('*')
    .eq('symbol', symbol)

  if (fetchError) {
    console.error('Error fetching existing rows:', fetchError)
    return
  }

  console.log(`Found ${existingRows?.length || 0} existing ${symbol} rows in database\n`)

  let updated = 0
  let inserted = 0
  let errors = 0

  for (const financial of financials) {
    // Find existing row by composite key: symbol + year + period_type + fiscal_quarter
    const existingRow = existingRows?.find((row) =>
      row.year === financial.year &&
      row.period_type === financial.period_type &&
      row.fiscal_quarter === financial.fiscal_quarter
    )

    const rowData = {
      symbol: financial.symbol,
      year: financial.year,
      period_type: financial.period_type,
      fiscal_quarter: financial.fiscal_quarter,
      fiscal_label: financial.fiscal_label,
      period_end_date: financial.period_end_date,
      revenue: financial.revenue,
      gross_profit: financial.gross_profit,
      net_income: financial.net_income,
      operating_income: financial.operating_income,
      total_assets: financial.total_assets,
      total_liabilities: financial.total_liabilities,
      shareholders_equity: financial.shareholders_equity,
      operating_cash_flow: financial.operating_cash_flow,
      eps: financial.eps,
    }

    const label = financial.fiscal_label || `FY${financial.year}`

    if (existingRow) {
      // UPDATE existing row
      const { error } = await supabase
        .from('financials_std')
        .update(rowData)
        .eq('id', existingRow.id)

      if (error) {
        console.error(`✗ Error updating ${label}:`, error.message)
        errors++
      } else {
        console.log(`✓ Updated ${label}`)
        updated++
      }
    } else {
      // INSERT new row
      const { error } = await supabase.from('financials_std').insert(rowData)

      if (error) {
        console.error(`✗ Error inserting ${label}:`, error.message)
        errors++
      } else {
        console.log(`✓ Inserted ${label}`)
        inserted++
      }
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Updated: ${updated}`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total: ${financials.length}`)
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
