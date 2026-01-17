/**
 * Phase 2: Batch ingestion of financial data for S&P 500 stocks
 *
 * Fetches and ingests financial data (income, balance sheet, cash flow) for
 * all S&P 500 constituents using the per-symbol FMP API approach.
 *
 * Uses UPSERT with conflict target (symbol, period_type, period_end_date).
 * Records without period_end_date are skipped to maintain data integrity.
 *
 * IMPORTANT: This script fetches all three statements (income, balance, cash flow)
 * in parallel and combines them before upserting. This makes naive UPSERT safe.
 * If you ever need to ingest statements separately, use the COALESCE-based SQL
 * approach documented in docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md Section 5.
 *
 * Features:
 * - Rate limiting (250 requests/min to stay under 300 limit)
 * - Progress tracking in sp500_constituents.data_status
 * - Error recovery and resume support
 * - Both annual and quarterly data
 * - Validates period_end_date before upsert
 *
 * Usage:
 *   npx tsx scripts/sp500/batch-ingest-financials.ts              # All pending stocks
 *   npx tsx scripts/sp500/batch-ingest-financials.ts --limit 10   # First 10 pending stocks
 *   npx tsx scripts/sp500/batch-ingest-financials.ts --symbol MSFT # Single stock
 *   npx tsx scripts/sp500/batch-ingest-financials.ts --resume     # Resume from last position
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const RATE_LIMIT_DELAY_MS = 250 // 4 requests per second = 240/min (safe margin)
const BATCH_SIZE = 10 // Process 10 stocks before reporting progress
const ANNUAL_LIMIT = 10 // Years of annual data
const QUARTERLY_LIMIT = 40 // ~10 years of quarterly data

interface SP500Constituent {
  symbol: string
  name: string
  alternate_symbols: { fmp?: string } | null
  data_status: Record<string, any>
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

function parseFiscalQuarter(period: string): number | null {
  const match = period.match(/^Q(\d)$/)
  return match ? parseInt(match[1], 10) : null
}

async function fetchFinancialsForSymbol(
  symbol: string,
  fmpSymbol: string,
  apiKey: string,
  periodType: 'annual' | 'quarterly'
): Promise<FinancialRecord[]> {
  const periodParam = periodType === 'quarterly' ? '&period=quarter' : ''
  const limit = periodType === 'quarterly' ? QUARTERLY_LIMIT : ANNUAL_LIMIT

  const [incomeData, balanceData, cashFlowData] = await Promise.all([
    rateLimitedFetch(
      `${FMP_BASE_URL}/income-statement/${fmpSymbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
    rateLimitedFetch(
      `${FMP_BASE_URL}/balance-sheet-statement/${fmpSymbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
    rateLimitedFetch(
      `${FMP_BASE_URL}/cash-flow-statement/${fmpSymbol}?limit=${limit}${periodParam}&apikey=${apiKey}`
    ),
  ])

  // Check for errors
  if (incomeData?.['Error Message'] || !Array.isArray(incomeData)) {
    throw new Error(`FMP API error for ${fmpSymbol}: ${incomeData?.['Error Message'] || 'Invalid response'}`)
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
      symbol: symbol, // Use canonical symbol, not FMP symbol
      year: calendarYear,
      period_type: periodType,
      fiscal_quarter: fiscalQuarter,
      fiscal_label: fiscalQuarter ? `${calendarYear}-Q${fiscalQuarter}` : null,
      period_end_date: item.date,
      revenue: item.revenue || 0,
      gross_profit: item.grossProfit || 0,
      net_income: item.netIncome || 0,
      operating_income: item.operatingIncome || 0,
      total_assets: 0,
      total_liabilities: 0,
      shareholders_equity: 0,
      operating_cash_flow: 0,
      eps: item.eps || 0,
    }
  })

  if (Array.isArray(balanceData)) {
    balanceData.forEach((item: any) => {
      const period = item.period || 'FY'
      const key = getKey(item.date, period)
      if (combinedByPeriod[key]) {
        combinedByPeriod[key].total_assets = item.totalAssets || 0
        combinedByPeriod[key].total_liabilities = item.totalLiabilities || 0
        combinedByPeriod[key].shareholders_equity = item.totalStockholdersEquity || 0
      }
    })
  }

  if (Array.isArray(cashFlowData)) {
    cashFlowData.forEach((item: any) => {
      const period = item.period || 'FY'
      const key = getKey(item.date, period)
      if (combinedByPeriod[key]) {
        combinedByPeriod[key].operating_cash_flow = item.operatingCashFlow || 0
      }
    })
  }

  return Object.values(combinedByPeriod)
}

async function ingestSingleStock(
  supabase: ReturnType<typeof createClient>,
  constituent: SP500Constituent,
  apiKey: string
): Promise<IngestionResult> {
  const { symbol, alternate_symbols } = constituent
  const fmpSymbol = alternate_symbols?.fmp || symbol

  try {
    // Fetch annual and quarterly data
    const [annualData, quarterlyData] = await Promise.all([
      fetchFinancialsForSymbol(symbol, fmpSymbol, apiKey, 'annual'),
      fetchFinancialsForSymbol(symbol, fmpSymbol, apiKey, 'quarterly'),
    ])

    const allRecords = [...annualData, ...quarterlyData]

    if (allRecords.length === 0) {
      return {
        symbol,
        success: false,
        annualRecords: 0,
        quarterlyRecords: 0,
        error: 'No data returned from FMP',
      }
    }

    // Filter out records without period_end_date (required for UNIQUE constraint)
    const validRecords = allRecords.filter((r) => r.period_end_date !== null)
    const skippedCount = allRecords.length - validRecords.length

    if (skippedCount > 0) {
      console.warn(`  (${skippedCount} records skipped - null period_end_date)`)
    }

    if (validRecords.length === 0) {
      return {
        symbol,
        success: false,
        annualRecords: 0,
        quarterlyRecords: 0,
        error: 'All records have null period_end_date',
      }
    }

    // Upsert to database using new conflict target: (symbol, period_type, period_end_date)
    // This is safe because we fetch all 3 statements together and combine before upserting
    const { error } = await supabase.from('financials_std').upsert(validRecords, {
      onConflict: 'symbol,period_type,period_end_date',
      ignoreDuplicates: false,
    })

    if (error) {
      return {
        symbol,
        success: false,
        annualRecords: 0,
        quarterlyRecords: 0,
        error: error.message,
      }
    }

    // Count valid records by type for status tracking
    const validAnnualCount = validRecords.filter((r) => r.period_type === 'annual').length
    const validQuarterlyCount = validRecords.filter((r) => r.period_type === 'quarterly').length

    // Update status in sp500_constituents
    const dataStatus = {
      ...constituent.data_status,
      financials_std: {
        status: 'complete',
        last_updated: new Date().toISOString(),
        annual_count: validAnnualCount,
        quarterly_count: validQuarterlyCount,
        skipped_null_dates: skippedCount,
      },
    }

    await supabase
      .from('sp500_constituents')
      .update({ data_status: dataStatus })
      .eq('symbol', symbol)

    return {
      symbol,
      success: true,
      annualRecords: validAnnualCount,
      quarterlyRecords: validQuarterlyCount,
    }
  } catch (error) {
    // Update status with error
    const dataStatus = {
      ...constituent.data_status,
      financials_std: {
        status: 'error',
        last_updated: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    }

    await supabase
      .from('sp500_constituents')
      .update({ data_status: dataStatus })
      .eq('symbol', symbol)

    return {
      symbol,
      success: false,
      annualRecords: 0,
      quarterlyRecords: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 2: Batch Financial Data Ingestion')
  console.log('='.repeat(60))
  console.log()

  // Parse command line args
  const args = process.argv.slice(2)
  let limit: number | undefined
  let singleSymbol: string | undefined
  let resumeMode = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--symbol' && args[i + 1]) {
      singleSymbol = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--resume') {
      resumeMode = true
    }
  }

  // Load environment variables
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

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const FMP_API_KEY = process.env.FMP_API_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FMP_API_KEY) {
    console.error('Error: Missing required environment variables')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Get constituents to process
  let query = supabase.from('sp500_constituents').select('symbol, name, alternate_symbols, data_status')

  if (singleSymbol) {
    query = query.eq('symbol', singleSymbol)
  }
  // Note: resumeMode filtering is done after fetching all constituents
  // because Supabase JSONB nested queries are complex

  query = query.eq('is_active', true).order('symbol')

  if (limit) {
    query = query.limit(limit)
  }

  const { data: constituents, error } = await query

  if (error) {
    console.error('Error fetching constituents:', error)
    process.exit(1)
  }

  if (!constituents || constituents.length === 0) {
    console.log('No constituents to process')
    return
  }

  // Filter for resume mode - only process stocks that need work
  let toProcess = constituents as SP500Constituent[]
  if (resumeMode) {
    toProcess = toProcess.filter((c) => {
      const status = c.data_status?.financials_std?.status
      return !status || status === 'error' || status === 'pending'
    })
  }

  if (toProcess.length === 0) {
    console.log('No stocks need processing (all complete)')
    return
  }

  console.log(`Processing ${toProcess.length} stocks...\n`)
  if (limit) console.log(`  (Limited to ${limit} stocks)`)
  if (singleSymbol) console.log(`  (Single symbol: ${singleSymbol})`)
  if (resumeMode) console.log(`  (Resume mode: only pending/error stocks)`)
  console.log()

  const results: IngestionResult[] = []
  const startTime = Date.now()

  for (let i = 0; i < toProcess.length; i++) {
    const constituent = toProcess[i]

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${constituent.symbol.padEnd(6)} `)

    const result = await ingestSingleStock(supabase, constituent, FMP_API_KEY)
    results.push(result)

    if (result.success) {
      console.log(`✓ ${result.annualRecords}A + ${result.quarterlyRecords}Q records`)
    } else {
      console.log(`✗ ${result.error}`)
    }

    // Progress report every BATCH_SIZE stocks
    if ((i + 1) % BATCH_SIZE === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const successCount = results.filter((r) => r.success).length
      const rate = ((i + 1) / elapsed).toFixed(1)
      console.log(`\n  --- Progress: ${i + 1}/${constituents.length} (${successCount} success, ${rate} stocks/sec) ---\n`)
    }
  }

  // Final summary
  const elapsed = (Date.now() - startTime) / 1000
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)
  const totalAnnual = successful.reduce((sum, r) => sum + r.annualRecords, 0)
  const totalQuarterly = successful.reduce((sum, r) => sum + r.quarterlyRecords, 0)

  console.log('\n' + '='.repeat(60))
  console.log('INGESTION SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nProcessed: ${results.length} stocks`)
  console.log(`Successful: ${successful.length}`)
  console.log(`Failed: ${failed.length}`)
  console.log(`\nRecords ingested:`)
  console.log(`  Annual: ${totalAnnual}`)
  console.log(`  Quarterly: ${totalQuarterly}`)
  console.log(`  Total: ${totalAnnual + totalQuarterly}`)
  console.log(`\nTime: ${elapsed.toFixed(1)} seconds`)
  console.log(`Rate: ${(results.length / elapsed).toFixed(2)} stocks/second`)

  if (failed.length > 0) {
    console.log('\nFailed stocks:')
    failed.slice(0, 10).forEach((r) => {
      console.log(`  ${r.symbol}: ${r.error}`)
    })
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`)
    }
    console.log('\nTo retry failed stocks, run:')
    console.log('  npx tsx scripts/sp500/batch-ingest-financials.ts --resume')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
