/**
 * Phase 2b: Batch ingestion of extended financial metrics for S&P 500 stocks
 *
 * Fetches and ingests 100+ financial metrics (P/E, ROE, margins, growth rates, etc.)
 * for all S&P 500 constituents using the per-symbol FMP API approach.
 *
 * Data sources:
 * - key-metrics: valuation, per-share metrics
 * - ratios: profitability, leverage, efficiency
 * - financial-growth: growth rates
 * - enterprise-values: market data
 *
 * Usage:
 *   npx tsx scripts/sp500/batch-ingest-metrics.ts              # All pending stocks
 *   npx tsx scripts/sp500/batch-ingest-metrics.ts --limit 10   # First 10 pending stocks
 *   npx tsx scripts/sp500/batch-ingest-metrics.ts --symbol MSFT # Single stock
 *   npx tsx scripts/sp500/batch-ingest-metrics.ts --resume     # Resume from errors
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const RATE_LIMIT_DELAY_MS = 200 // 5 requests per second
const BATCH_SIZE = 10
const ANNUAL_LIMIT = 10
const QUARTERLY_LIMIT = 40

// Metrics to skip (duplicates across endpoints)
const SKIP_METRICS = new Set([
  'daysOfInventoryOutstanding',
  'daysPayablesOutstanding',
  'daysSalesOutstanding',
  'debtToAssets',
  'debtToEquity',
  'enterpriseValueOverEBITDA',
  'operatingProfitMargin',
  'priceEarningsRatio',
  'priceBookValueRatio',
  'priceToBookRatio',
  'priceToFreeCashFlowsRatio',
  'priceToOperatingCashFlowsRatio',
  'priceToSalesRatio',
  'roe',
  'shareholdersEquityPerShare',
])

// Category mapping
const CATEGORY_MAP: Record<string, string> = {
  marketCap: 'Valuation',
  enterpriseValue: 'Valuation',
  peRatio: 'Valuation',
  priceToSalesRatio: 'Valuation',
  pbRatio: 'Valuation',
  evToSales: 'Valuation',
  evToEbitda: 'Valuation',
  evToOperatingCashFlow: 'Valuation',
  evToFreeCashFlow: 'Valuation',
  earningsYield: 'Valuation',
  freeCashFlowYield: 'Valuation',
  pegRatio: 'Valuation',
  returnOnEquity: 'Profitability & Returns',
  returnOnAssets: 'Profitability & Returns',
  returnOnCapitalEmployed: 'Profitability & Returns',
  roic: 'Profitability & Returns',
  grossProfitMargin: 'Profitability & Returns',
  netProfitMargin: 'Profitability & Returns',
  ebitdaMargin: 'Profitability & Returns',
  revenuePerShare: 'Per-Share Metrics',
  netIncomePerShare: 'Per-Share Metrics',
  bookValuePerShare: 'Per-Share Metrics',
  freeCashFlowPerShare: 'Per-Share Metrics',
  debtRatio: 'Leverage & Solvency',
  debtEquityRatio: 'Leverage & Solvency',
  currentRatio: 'Leverage & Solvency',
  quickRatio: 'Leverage & Solvency',
  interestCoverage: 'Leverage & Solvency',
  assetTurnover: 'Efficiency & Working Capital',
  inventoryTurnover: 'Efficiency & Working Capital',
  receivablesTurnover: 'Efficiency & Working Capital',
  revenueGrowth: 'Growth',
  epsgrowth: 'Growth',
  netIncomeGrowth: 'Growth',
  freeCashFlowGrowth: 'Growth',
  dividendYield: 'Capital Returns & Share Data',
  payoutRatio: 'Capital Returns & Share Data',
  numberOfShares: 'Capital Returns & Share Data',
  // Cash flow metrics (from cash-flow-statement endpoint)
  freeCashFlow: 'Cash Flow',
  capitalExpenditure: 'Cash Flow',
  commonStockRepurchased: 'Capital Returns & Share Data',
  dividendsPaid: 'Capital Returns & Share Data',
  stockBasedCompensation: 'Other',
  // Income statement metrics
  ebitda: 'Profitability & Returns',
  ebitdaratio: 'Profitability & Returns',
  operatingExpenses: 'Other',
  depreciationAndAmortization: 'Other',
}

interface SP500Constituent {
  symbol: string
  name: string
  alternate_symbols: { fmp?: string } | null
  data_status: Record<string, any>
}

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
  period_type: 'annual' | 'quarterly'
  fiscal_quarter: number | null
  fiscal_label: string | null
  period_end_date: string | null
}

interface IngestionResult {
  symbol: string
  success: boolean
  metricCount: number
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

function extractFiscalQuarter(period: string): number | null {
  const match = period.match(/Q(\d)/)
  return match ? parseInt(match[1], 10) : null
}

async function fetchMetricsForSymbol(
  symbol: string,
  fmpSymbol: string,
  apiKey: string
): Promise<MetricRecord[]> {
  const metrics: MetricRecord[] = []

  // Fetch annual data (key-metrics, ratios, financial-growth, cash-flow-statement, income-statement)
  const annualEndpoints = [
    `${FMP_BASE_URL}/key-metrics/${fmpSymbol}?period=annual&limit=${ANNUAL_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/ratios/${fmpSymbol}?period=annual&limit=${ANNUAL_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/financial-growth/${fmpSymbol}?period=annual&limit=${ANNUAL_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/cash-flow-statement/${fmpSymbol}?period=annual&limit=${ANNUAL_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/income-statement/${fmpSymbol}?period=annual&limit=${ANNUAL_LIMIT}&apikey=${apiKey}`,
  ]

  // Fetch quarterly data
  const quarterlyEndpoints = [
    `${FMP_BASE_URL}/key-metrics/${fmpSymbol}?period=quarter&limit=${QUARTERLY_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/ratios/${fmpSymbol}?period=quarter&limit=${QUARTERLY_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/financial-growth/${fmpSymbol}?period=quarter&limit=${QUARTERLY_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/cash-flow-statement/${fmpSymbol}?period=quarter&limit=${QUARTERLY_LIMIT}&apikey=${apiKey}`,
    `${FMP_BASE_URL}/income-statement/${fmpSymbol}?period=quarter&limit=${QUARTERLY_LIMIT}&apikey=${apiKey}`,
  ]

  const allEndpoints = [...annualEndpoints, ...quarterlyEndpoints]
  const sources = ['key-metrics', 'ratios', 'financial-growth', 'cash-flow-statement', 'income-statement', 'key-metrics', 'ratios', 'financial-growth', 'cash-flow-statement', 'income-statement']

  // Cash flow metrics to extract (these are the specific fields we want from cash-flow-statement)
  const CASH_FLOW_METRICS = new Set(['freeCashFlow', 'capitalExpenditure', 'commonStockRepurchased', 'dividendsPaid', 'stockBasedCompensation'])

  // Income statement metrics to extract (we only need a few, the rest is in financials_std)
  const INCOME_STATEMENT_METRICS = new Set(['ebitda', 'ebitdaratio', 'operatingExpenses', 'depreciationAndAmortization'])

  for (let i = 0; i < allEndpoints.length; i++) {
    const data = await rateLimitedFetch(allEndpoints[i])
    const isCashFlowEndpoint = sources[i] === 'cash-flow-statement'
    const isIncomeStatementEndpoint = sources[i] === 'income-statement'

    if (data?.['Error Message']) {
      throw new Error(`FMP API error: ${data['Error Message']}`)
    }

    if (!Array.isArray(data)) continue

    for (const item of data) {
      const year = new Date(item.date).getFullYear()
      const periodStr = item.period || 'FY'
      const isQuarterly = periodStr.startsWith('Q')
      const fiscalQuarter = extractFiscalQuarter(periodStr)
      const fiscalLabel = fiscalQuarter ? `${year}-Q${fiscalQuarter}` : null

      Object.entries(item).forEach(([key, value]) => {
        if (key === 'date' || key === 'symbol' || key === 'period') return
        if (typeof value !== 'number' || value === null || isNaN(value)) return
        if (SKIP_METRICS.has(key)) return

        // For cash-flow-statement endpoint, only extract specific metrics we need
        if (isCashFlowEndpoint && !CASH_FLOW_METRICS.has(key)) return

        // For income-statement endpoint, only extract specific metrics (rest is in financials_std)
        if (isIncomeStatementEndpoint && !INCOME_STATEMENT_METRICS.has(key)) return

        // Skip duplicates (same year + quarter + metric)
        const isDuplicate = metrics.some(
          (m) => m.year === year && m.metric_name === key && m.fiscal_quarter === fiscalQuarter
        )
        if (isDuplicate) return

        // Make certain cash flow values positive (FMP returns negative for outflows)
        let metricValue = value
        if (key === 'capitalExpenditure' || key === 'commonStockRepurchased' || key === 'dividendsPaid') {
          metricValue = Math.abs(value)
        }

        metrics.push({
          symbol: symbol, // Use canonical symbol
          year,
          period: periodStr,
          metric_name: key,
          metric_value: metricValue,
          metric_category: CATEGORY_MAP[key] || 'Other',
          data_source: `FMP:${sources[i]}`,
          period_type: isQuarterly ? 'quarterly' : 'annual',
          fiscal_quarter: fiscalQuarter,
          fiscal_label: fiscalLabel,
          period_end_date: item.date,
        })
      })
    }
  }

  return metrics
}

async function ingestSingleStock(
  supabase: ReturnType<typeof createClient>,
  constituent: SP500Constituent,
  apiKey: string
): Promise<IngestionResult> {
  const { symbol, alternate_symbols } = constituent
  const fmpSymbol = alternate_symbols?.fmp || symbol

  try {
    const metrics = await fetchMetricsForSymbol(symbol, fmpSymbol, apiKey)

    if (metrics.length === 0) {
      return {
        symbol,
        success: false,
        metricCount: 0,
        error: 'No metrics returned from FMP',
      }
    }

    // Upsert to database
    const { error } = await supabase.from('financial_metrics').upsert(metrics, {
      onConflict: 'symbol,year,period,metric_name',
      ignoreDuplicates: false,
    })

    if (error) {
      return {
        symbol,
        success: false,
        metricCount: 0,
        error: error.message,
      }
    }

    // Update status
    const dataStatus = {
      ...constituent.data_status,
      financial_metrics: {
        status: 'complete',
        last_updated: new Date().toISOString(),
        metric_count: metrics.length,
      },
    }

    await supabase
      .from('sp500_constituents')
      .update({ data_status: dataStatus })
      .eq('symbol', symbol)

    return {
      symbol,
      success: true,
      metricCount: metrics.length,
    }
  } catch (error) {
    // Update status with error
    const dataStatus = {
      ...constituent.data_status,
      financial_metrics: {
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
      metricCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 2b: Batch Extended Metrics Ingestion')
  console.log('='.repeat(60))
  console.log()

  // Parse args
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

  // Load env
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

  // Get constituents
  let query = supabase.from('sp500_constituents').select('symbol, name, alternate_symbols, data_status')

  if (singleSymbol) {
    query = query.eq('symbol', singleSymbol)
  }

  query = query.eq('is_active', true).order('symbol')

  if (limit && !resumeMode) {
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

  // Filter for resume mode
  let toProcess = constituents as SP500Constituent[]
  if (resumeMode) {
    toProcess = toProcess.filter((c) => {
      const status = c.data_status?.financial_metrics?.status
      return !status || status === 'error' || status === 'pending'
    })
  }

  if (limit && resumeMode) {
    toProcess = toProcess.slice(0, limit)
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
      console.log(`✓ ${result.metricCount} metrics`)
    } else {
      console.log(`✗ ${result.error}`)
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const successCount = results.filter((r) => r.success).length
      const rate = ((i + 1) / elapsed).toFixed(1)
      console.log(`\n  --- Progress: ${i + 1}/${toProcess.length} (${successCount} success, ${rate} stocks/sec) ---\n`)
    }
  }

  // Summary
  const elapsed = (Date.now() - startTime) / 1000
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)
  const totalMetrics = successful.reduce((sum, r) => sum + r.metricCount, 0)

  console.log('\n' + '='.repeat(60))
  console.log('INGESTION SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nProcessed: ${results.length} stocks`)
  console.log(`Successful: ${successful.length}`)
  console.log(`Failed: ${failed.length}`)
  console.log(`Total metrics ingested: ${totalMetrics.toLocaleString()}`)
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
    console.log('  npx tsx scripts/sp500/batch-ingest-metrics.ts --resume')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
