/**
 * Batch ingest financial data for US stocks
 *
 * Fetches and ingests financial data (income, balance sheet, cash flow) for
 * stocks in the us_stocks table. Processes in batches with progress tracking.
 *
 * Features:
 * - Rate limiting (250ms between requests to stay under 300/min limit)
 * - Progress tracking in us_stocks table (financials_status column)
 * - Resume support - only processes pending stocks
 * - Priority order by market cap (largest companies first)
 * - Both annual and quarterly data
 *
 * Usage:
 *   npx tsx scripts/us-stocks/batch-ingest-financials.ts               # All pending stocks
 *   npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 500   # First 500 pending
 *   npx tsx scripts/us-stocks/batch-ingest-financials.ts --symbol PLTR # Single stock
 *   npx tsx scripts/us-stocks/batch-ingest-financials.ts --retry       # Retry failed stocks
 *   npx tsx scripts/us-stocks/batch-ingest-financials.ts --offset 1000 # Skip first 1000
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const RATE_LIMIT_DELAY_MS = 250 // 4 requests per second = 240/min (safe margin)
const BATCH_REPORT_SIZE = 25 // Report progress every N stocks
const ANNUAL_LIMIT = 10 // Years of annual data
const QUARTERLY_LIMIT = 40 // ~10 years of quarterly data

interface USStock {
  symbol: string
  name: string
  market_cap: number | null
  financials_status: string
}

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
  shares_outstanding: number
}

interface IngestionResult {
  symbol: string
  success: boolean
  annualRecords: number
  quarterlyRecords: number
  error?: string
}

// Rate limiter
let lastRequestTime = 0
async function rateLimitedFetch(url: string): Promise<any> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    await sleep(RATE_LIMIT_DELAY_MS - timeSinceLastRequest)
  }
  lastRequestTime = Date.now()

  const response = await fetch(url)
  return response.json()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Safely convert a value to a bigint-compatible integer
 * FMP API sometimes returns floats (e.g., 3520039.5) for fields stored as bigint
 */
function toBigInt(value: any): number {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  if (isNaN(num) || !isFinite(num)) return 0
  return Math.round(num)
}

/**
 * Safely convert EPS value - preserve decimal precision by not rounding
 * EPS is stored as numeric, not bigint
 */
function toNumeric(value: any): number {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  if (isNaN(num) || !isFinite(num)) return 0
  return num
}

function parseFiscalQuarter(period: string): number | null {
  const match = period.match(/^Q(\d)$/)
  return match ? parseInt(match[1], 10) : null
}

async function fetchFinancialsForSymbol(
  symbol: string,
  apiKey: string,
  periodType: 'annual' | 'quarterly'
): Promise<FinancialRecord[]> {
  const periodParam = periodType === 'quarterly' ? '&period=quarter' : ''
  const limit = periodType === 'quarterly' ? QUARTERLY_LIMIT : ANNUAL_LIMIT

  const [incomeData, balanceData, cashFlowData] = await Promise.all([
    rateLimitedFetch(
      `${FMP_BASE_URL}/income-statement/${symbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
    rateLimitedFetch(
      `${FMP_BASE_URL}/balance-sheet-statement/${symbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
    rateLimitedFetch(
      `${FMP_BASE_URL}/cash-flow-statement/${symbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
  ])

  // Check for errors or empty responses
  if (incomeData?.['Error Message'] || !Array.isArray(incomeData)) {
    throw new Error(`FMP API error: ${incomeData?.['Error Message'] || 'Invalid response'}`)
  }

  // Create unique key for each period
  const getKey = (date: string, period: string) => {
    const dateObj = new Date(date)
    const calendarYear = dateObj.getFullYear()
    const fiscalQuarter = parseFiscalQuarter(period)
    return fiscalQuarter ? `${calendarYear}-Q${fiscalQuarter}` : `${calendarYear}-FY`
  }

  // Combine by period key
  const combinedByPeriod: Record<string, FinancialRecord> = {}

  incomeData.forEach((item: any) => {
    const period = item.period || 'FY'
    const key = getKey(item.date, period)
    const dateObj = new Date(item.date)
    const calendarYear = dateObj.getFullYear()
    const fiscalQuarter = parseFiscalQuarter(period)

    combinedByPeriod[key] = {
      symbol: symbol,
      year: calendarYear,
      period_type: periodType,
      fiscal_quarter: fiscalQuarter,
      fiscal_label: fiscalQuarter ? `${calendarYear}-Q${fiscalQuarter}` : null,
      period_end_date: item.date,
      revenue: toBigInt(item.revenue),
      gross_profit: toBigInt(item.grossProfit),
      net_income: toBigInt(item.netIncome),
      operating_income: toBigInt(item.operatingIncome),
      total_assets: 0,
      total_liabilities: 0,
      shareholders_equity: 0,
      operating_cash_flow: 0,
      eps: toNumeric(item.eps),
      shares_outstanding: toBigInt(item.weightedAverageShsOut),
    }
  })

  if (Array.isArray(balanceData)) {
    balanceData.forEach((item: any) => {
      const period = item.period || 'FY'
      const key = getKey(item.date, period)
      if (combinedByPeriod[key]) {
        combinedByPeriod[key].total_assets = toBigInt(item.totalAssets)
        combinedByPeriod[key].total_liabilities = toBigInt(item.totalLiabilities)
        combinedByPeriod[key].shareholders_equity = toBigInt(item.totalStockholdersEquity)
      }
    })
  }

  if (Array.isArray(cashFlowData)) {
    cashFlowData.forEach((item: any) => {
      const period = item.period || 'FY'
      const key = getKey(item.date, period)
      if (combinedByPeriod[key]) {
        combinedByPeriod[key].operating_cash_flow = toBigInt(item.operatingCashFlow)
      }
    })
  }

  return Object.values(combinedByPeriod)
}

async function ingestSingleStock(
  supabase: ReturnType<typeof createClient>,
  stock: USStock,
  apiKey: string
): Promise<IngestionResult> {
  const { symbol } = stock

  try {
    // Mark as in_progress
    await supabase
      .from('us_stocks')
      .update({ financials_status: 'in_progress' })
      .eq('symbol', symbol)

    // Fetch annual and quarterly data
    const [annualData, quarterlyData] = await Promise.all([
      fetchFinancialsForSymbol(symbol, apiKey, 'annual'),
      fetchFinancialsForSymbol(symbol, apiKey, 'quarterly'),
    ])

    const allRecords = [...annualData, ...quarterlyData]

    // Check if we got any data
    if (allRecords.length === 0) {
      // Mark as no_data
      await supabase
        .from('us_stocks')
        .update({
          financials_status: 'no_data',
          financials_updated_at: new Date().toISOString(),
          financials_error: 'No financial data available from FMP',
        })
        .eq('symbol', symbol)

      return {
        symbol,
        success: true, // Not an error, just no data available
        annualRecords: 0,
        quarterlyRecords: 0,
        error: 'No data',
      }
    }

    // Filter out records without period_end_date
    const validRecords = allRecords.filter((r) => r.period_end_date !== null)

    if (validRecords.length === 0) {
      await supabase
        .from('us_stocks')
        .update({
          financials_status: 'no_data',
          financials_updated_at: new Date().toISOString(),
          financials_error: 'All records have null period_end_date',
        })
        .eq('symbol', symbol)

      return {
        symbol,
        success: true,
        annualRecords: 0,
        quarterlyRecords: 0,
        error: 'No valid dates',
      }
    }

    // Upsert to financials_std table
    const { error } = await supabase.from('financials_std').upsert(validRecords, {
      onConflict: 'symbol,period_type,period_end_date',
      ignoreDuplicates: false,
    })

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    const annualCount = validRecords.filter((r) => r.period_type === 'annual').length
    const quarterlyCount = validRecords.filter((r) => r.period_type === 'quarterly').length

    // Mark as complete
    await supabase
      .from('us_stocks')
      .update({
        financials_status: 'complete',
        financials_updated_at: new Date().toISOString(),
        financials_annual_count: annualCount,
        financials_quarterly_count: quarterlyCount,
        financials_error: null,
      })
      .eq('symbol', symbol)

    return {
      symbol,
      success: true,
      annualRecords: annualCount,
      quarterlyRecords: quarterlyCount,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Mark as failed
    await supabase
      .from('us_stocks')
      .update({
        financials_status: 'failed',
        financials_updated_at: new Date().toISOString(),
        financials_error: errorMessage,
      })
      .eq('symbol', symbol)

    return {
      symbol,
      success: false,
      annualRecords: 0,
      quarterlyRecords: 0,
      error: errorMessage,
    }
  }
}

async function loadEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const envContent = await fs.readFile(envPath, 'utf-8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
  } catch {
    console.error('Error: Could not load .env.local')
    process.exit(1)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('US STOCKS: BATCH FINANCIAL DATA INGESTION')
  console.log('='.repeat(60))
  console.log()

  // Parse command line args
  const args = process.argv.slice(2)
  let limit: number | undefined
  let offset = 0
  let singleSymbol: string | undefined
  let retryFailed = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--offset' && args[i + 1]) {
      offset = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--symbol' && args[i + 1]) {
      singleSymbol = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--retry') {
      retryFailed = true
    }
  }

  // Load environment
  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const FMP_API_KEY = process.env.FMP_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FMP_API_KEY) {
    console.error('Error: Missing required environment variables')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Build query
  let query = supabase
    .from('us_stocks')
    .select('symbol, name, market_cap, financials_status')
    .eq('is_active', true)

  if (singleSymbol) {
    query = query.eq('symbol', singleSymbol)
  } else if (retryFailed) {
    query = query.eq('financials_status', 'failed')
  } else {
    query = query.eq('financials_status', 'pending')
  }

  // Order by market cap (largest first) for priority
  query = query.order('market_cap', { ascending: false, nullsFirst: false })

  if (offset > 0) {
    query = query.range(offset, offset + (limit || 10000) - 1)
  } else if (limit) {
    query = query.limit(limit)
  }

  const { data: stocks, error } = await query

  if (error) {
    console.error('Error fetching stocks:', error)
    process.exit(1)
  }

  if (!stocks || stocks.length === 0) {
    console.log('No stocks to process')
    if (!singleSymbol && !retryFailed) {
      console.log('\nAll stocks have been processed or none are pending.')
      console.log('Use --retry to reprocess failed stocks.')
    }
    return
  }

  // Show what we're doing
  console.log(`Processing ${stocks.length} stocks...\n`)
  if (limit) console.log(`  Limit: ${limit}`)
  if (offset) console.log(`  Offset: ${offset}`)
  if (singleSymbol) console.log(`  Single symbol: ${singleSymbol}`)
  if (retryFailed) console.log(`  Mode: Retry failed stocks`)
  console.log()

  // Show first few stocks
  console.log('First stocks to process:')
  stocks.slice(0, 5).forEach((stock, i) => {
    const cap = stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : 'N/A'
    console.log(`  ${i + 1}. ${stock.symbol.padEnd(6)} ${stock.name?.slice(0, 30).padEnd(32) || ''.padEnd(32)} ${cap}`)
  })
  if (stocks.length > 5) console.log(`  ... and ${stocks.length - 5} more`)
  console.log()

  // Process stocks
  const results: IngestionResult[] = []
  const startTime = Date.now()

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i] as USStock

    // Show progress
    const pct = ((i / stocks.length) * 100).toFixed(1)
    process.stdout.write(`[${(i + 1).toString().padStart(4)}/${stocks.length}] ${pct}% ${stock.symbol.padEnd(6)} `)

    const result = await ingestSingleStock(supabase, stock, FMP_API_KEY)
    results.push(result)

    if (result.success) {
      if (result.annualRecords === 0 && result.quarterlyRecords === 0) {
        console.log(`- no data`)
      } else {
        console.log(`OK ${result.annualRecords}A + ${result.quarterlyRecords}Q`)
      }
    } else {
      console.log(`FAIL ${result.error?.slice(0, 40)}`)
    }

    // Progress report every BATCH_REPORT_SIZE stocks
    if ((i + 1) % BATCH_REPORT_SIZE === 0 && i < stocks.length - 1) {
      const elapsed = (Date.now() - startTime) / 1000
      const successCount = results.filter((r) => r.success).length
      const rate = ((i + 1) / elapsed).toFixed(2)
      const eta = ((stocks.length - i - 1) / parseFloat(rate) / 60).toFixed(1)
      console.log()
      console.log(`  --- Progress: ${i + 1}/${stocks.length} | Success: ${successCount} | Rate: ${rate}/sec | ETA: ${eta} min ---`)
      console.log()
    }
  }

  // Final summary
  const elapsed = (Date.now() - startTime) / 1000
  const successful = results.filter((r) => r.success && r.annualRecords > 0)
  const noData = results.filter((r) => r.success && r.annualRecords === 0)
  const failed = results.filter((r) => !r.success)
  const totalAnnual = successful.reduce((sum, r) => sum + r.annualRecords, 0)
  const totalQuarterly = successful.reduce((sum, r) => sum + r.quarterlyRecords, 0)

  console.log('\n' + '='.repeat(60))
  console.log('INGESTION SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nProcessed: ${results.length} stocks`)
  console.log(`  With data: ${successful.length}`)
  console.log(`  No data: ${noData.length}`)
  console.log(`  Failed: ${failed.length}`)
  console.log(`\nRecords ingested:`)
  console.log(`  Annual: ${totalAnnual}`)
  console.log(`  Quarterly: ${totalQuarterly}`)
  console.log(`  Total: ${totalAnnual + totalQuarterly}`)
  console.log(`\nTime: ${elapsed.toFixed(1)} seconds (${(elapsed / 60).toFixed(1)} min)`)
  console.log(`Rate: ${(results.length / elapsed).toFixed(2)} stocks/second`)

  if (failed.length > 0) {
    console.log('\nFailed stocks (first 10):')
    failed.slice(0, 10).forEach((r) => {
      console.log(`  ${r.symbol}: ${r.error}`)
    })
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`)
    }
    console.log('\nTo retry failed stocks:')
    console.log('  npx tsx scripts/us-stocks/batch-ingest-financials.ts --retry')
  }

  // Check remaining
  const { count } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('financials_status', 'pending')

  if (count && count > 0) {
    console.log(`\nRemaining pending stocks: ${count}`)
    console.log('Run again to continue:')
    console.log('  npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 500')
  } else {
    console.log('\nAll stocks processed!')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
