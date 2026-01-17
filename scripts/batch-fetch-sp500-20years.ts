/**
 * Batch fetch 20 years of annual financial data for all S&P 500 stocks
 *
 * This script:
 * 1. Reads S&P 500 constituents from data/sp500-constituents.json
 * 2. Fetches 20 years of annual data from FMP API (income, balance sheet, cash flow)
 * 3. Directly upserts into Supabase financials_std table
 *
 * Usage:
 *   npx tsx scripts/batch-fetch-sp500-20years.ts              # Fetch all
 *   npx tsx scripts/batch-fetch-sp500-20years.ts --start 100  # Start from index 100
 *   npx tsx scripts/batch-fetch-sp500-20years.ts --test       # Test with first 5 stocks
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY || '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Rate limiting: 300 requests per minute = 5 per second
const DELAY_BETWEEN_STOCKS_MS = 1000 // 1 second between stocks (3 API calls each)
const BATCH_SIZE = 50 // Save progress every 50 stocks

interface SP500Constituent {
  symbol: string
  name: string
  sector: string
  is_active: boolean
}

interface FinancialRecord {
  symbol: string
  year: number
  period_type: 'annual'
  fiscal_quarter: null
  fiscal_label: null
  period_end_date: string | null
  revenue: number | null
  gross_profit: number | null
  net_income: number | null
  operating_income: number | null
  total_assets: number | null
  total_liabilities: number | null
  shareholders_equity: number | null
  operating_cash_flow: number | null
  eps: number | null
}

async function fetchFinancialsForSymbol(symbol: string): Promise<FinancialRecord[]> {
  const limit = 20 // 20 years of annual data

  const endpoints = {
    incomeStatement: `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=${limit}&apikey=${FMP_API_KEY}`,
    balanceSheet: `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=${limit}&apikey=${FMP_API_KEY}`,
    cashFlow: `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=${limit}&apikey=${FMP_API_KEY}`,
  }

  try {
    const [incomeData, balanceData, cashFlowData] = await Promise.all([
      fetch(endpoints.incomeStatement).then((r) => r.json()),
      fetch(endpoints.balanceSheet).then((r) => r.json()),
      fetch(endpoints.cashFlow).then((r) => r.json()),
    ])

    // Handle API errors
    if (!Array.isArray(incomeData)) {
      console.error(`  ✗ ${symbol}: API error - ${JSON.stringify(incomeData)}`)
      return []
    }

    // Combine by calendar year
    const combinedByYear: Record<number, FinancialRecord> = {}

    incomeData.forEach((item: any) => {
      const year = parseInt(item.calendarYear)
      if (!year) return

      combinedByYear[year] = {
        symbol: symbol,
        year: year,
        period_type: 'annual',
        fiscal_quarter: null,
        fiscal_label: null,
        period_end_date: item.date || null,
        revenue: item.revenue || null,
        gross_profit: item.grossProfit || null,
        net_income: item.netIncome || null,
        operating_income: item.operatingIncome || null,
        total_assets: null,
        total_liabilities: null,
        shareholders_equity: null,
        operating_cash_flow: null,
        eps: item.eps || null,
      }
    })

    balanceData.forEach((item: any) => {
      const year = parseInt(item.calendarYear)
      if (year && combinedByYear[year]) {
        combinedByYear[year].total_assets = item.totalAssets || null
        combinedByYear[year].total_liabilities = item.totalLiabilities || null
        combinedByYear[year].shareholders_equity = item.totalStockholdersEquity || null
      }
    })

    cashFlowData.forEach((item: any) => {
      const year = parseInt(item.calendarYear)
      if (year && combinedByYear[year]) {
        combinedByYear[year].operating_cash_flow = item.operatingCashFlow || null
      }
    })

    return Object.values(combinedByYear).sort((a, b) => b.year - a.year)
  } catch (error) {
    console.error(`  ✗ ${symbol}: Fetch error - ${error}`)
    return []
  }
}

async function upsertToDatabase(records: FinancialRecord[]): Promise<boolean> {
  if (records.length === 0) return true

  const symbol = records[0].symbol

  // Delete existing annual records for this symbol first
  const { error: deleteError } = await supabase
    .from('financials_std')
    .delete()
    .eq('symbol', symbol)
    .eq('period_type', 'annual')

  if (deleteError) {
    console.error(`  Delete error: ${deleteError.message}`)
    return false
  }

  // Insert new records
  const { error: insertError } = await supabase
    .from('financials_std')
    .insert(records)

  if (insertError) {
    console.error(`  Insert error: ${insertError.message}`)
    return false
  }
  return true
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const startIndex = args.includes('--start')
    ? parseInt(args[args.indexOf('--start') + 1]) || 0
    : 0
  const testMode = args.includes('--test')

  // Load S&P 500 constituents
  const sp500Path = path.join(process.cwd(), 'data', 'sp500-constituents.json')
  const sp500: SP500Constituent[] = JSON.parse(fs.readFileSync(sp500Path, 'utf-8'))

  let symbols = sp500.filter(s => s.is_active).map(s => s.symbol)

  if (testMode) {
    symbols = symbols.slice(0, 5)
    console.log('🧪 TEST MODE: Processing first 5 stocks only\n')
  }

  symbols = symbols.slice(startIndex)

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  S&P 500 - 20 Years Annual Data Fetch')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total stocks: ${symbols.length}`)
  console.log(`  Starting from index: ${startIndex}`)
  console.log(`  Estimated time: ${Math.ceil(symbols.length * DELAY_BETWEEN_STOCKS_MS / 60000)} minutes`)
  console.log('═══════════════════════════════════════════════════════════\n')

  let successCount = 0
  let failCount = 0
  let totalRecords = 0

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    const globalIndex = startIndex + i

    process.stdout.write(`[${globalIndex + 1}/${startIndex + symbols.length}] ${symbol}... `)

    // Fetch from FMP
    const records = await fetchFinancialsForSymbol(symbol)

    if (records.length === 0) {
      console.log('✗ No data')
      failCount++
    } else {
      // Upsert to database
      const success = await upsertToDatabase(records)

      if (success) {
        const minYear = Math.min(...records.map(r => r.year))
        const maxYear = Math.max(...records.map(r => r.year))
        console.log(`✓ ${records.length} years (${minYear}-${maxYear})`)
        successCount++
        totalRecords += records.length
      } else {
        console.log('✗ DB error')
        failCount++
      }
    }

    // Progress checkpoint every BATCH_SIZE stocks
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`\n--- Checkpoint: ${i + 1}/${symbols.length} processed (${successCount} success, ${failCount} failed) ---\n`)
    }

    // Rate limiting delay
    if (i < symbols.length - 1) {
      await sleep(DELAY_BETWEEN_STOCKS_MS)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  COMPLETE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  ✓ Success: ${successCount} stocks`)
  console.log(`  ✗ Failed:  ${failCount} stocks`)
  console.log(`  📊 Total records inserted: ${totalRecords}`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(console.error)
