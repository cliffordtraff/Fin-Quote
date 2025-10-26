/**
 * Ingestion script: Loads AAPL financial data from seed file into Supabase
 * Run with: npx tsx scripts/ingest-financials.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function ingestFinancials() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials in .env.local')
    console.error('SUPABASE_URL:', SUPABASE_URL ? 'Found' : 'Missing')
    console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Found' : 'Missing')
    return
  }
  console.log('Starting AAPL financials ingestion...\n')

  // Read seed data
  const filePath = path.join(process.cwd(), 'data', 'aapl-financials.json')
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const financials = JSON.parse(fileContent)

  console.log(`✓ Loaded ${financials.length} years from seed file\n`)

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Get existing AAPL rows
  const { data: existingRows, error: fetchError } = await supabase
    .from('financials_std')
    .select('*')
    .eq('symbol', 'AAPL')

  if (fetchError) {
    console.error('Error fetching existing rows:', fetchError)
    return
  }

  console.log(`Found ${existingRows?.length || 0} existing AAPL rows in database\n`)

  let updated = 0
  let inserted = 0
  let errors = 0

  for (const financial of financials) {
    const existingRow = existingRows?.find((row) => row.year === financial.year)

    if (existingRow) {
      // UPDATE existing row
      const { error } = await supabase
        .from('financials_std')
        .update({
          revenue: financial.revenue,
          gross_profit: financial.gross_profit,
          net_income: financial.net_income,
          operating_income: financial.operating_income,
          total_assets: financial.total_assets,
          total_liabilities: financial.total_liabilities,
          shareholders_equity: financial.shareholders_equity,
          operating_cash_flow: financial.operating_cash_flow,
          eps: financial.eps,
        })
        .eq('id', existingRow.id)

      if (error) {
        console.error(`✗ Error updating year ${financial.year}:`, error.message)
        errors++
      } else {
        console.log(`✓ Updated year ${financial.year}`)
        updated++
      }
    } else {
      // INSERT new row
      const { error } = await supabase.from('financials_std').insert({
        symbol: financial.symbol,
        year: financial.year,
        revenue: financial.revenue,
        gross_profit: financial.gross_profit,
        net_income: financial.net_income,
        operating_income: financial.operating_income,
        total_assets: financial.total_assets,
        total_liabilities: financial.total_liabilities,
        shareholders_equity: financial.shareholders_equity,
        operating_cash_flow: financial.operating_cash_flow,
        eps: financial.eps,
      })

      if (error) {
        console.error(`✗ Error inserting year ${financial.year}:`, error.message)
        errors++
      } else {
        console.log(`✓ Inserted year ${financial.year}`)
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
