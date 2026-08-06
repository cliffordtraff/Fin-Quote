/**
 * Ingest Segment Data for All US Stocks
 *
 * Fetches product and geographic segment revenue data from FMP API
 * and stores it in the company_metrics table.
 *
 * Usage:
 *   npx tsx scripts/ingest-segment-data-all.ts --min-market-cap 50000000000  # Phase 1: >$50B
 *   npx tsx scripts/ingest-segment-data-all.ts --min-market-cap 10000000000  # Phase 2: >$10B
 *   npx tsx scripts/ingest-segment-data-all.ts --min-market-cap 1000000000   # Phase 3: >$1B
 *   npx tsx scripts/ingest-segment-data-all.ts                                # Phase 4: All
 *   npx tsx scripts/ingest-segment-data-all.ts --resume                       # Retry failed
 *   npx tsx scripts/ingest-segment-data-all.ts --symbol NVDA                  # Single stock
 *   npx tsx scripts/ingest-segment-data-all.ts --dry-run --limit 10           # Test run
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { requireSupabaseServiceRoleCredentials } from './lib/require-supabase-service-role'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v4'
const RATE_LIMIT_DELAY_MS = 500
const BATCH_SIZE = 10

interface USStock {
  symbol: string
  name: string
  market_cap: number | null
  segment_status: string | null
}

interface SegmentRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  dimension_type: string
  dimension_value: string
  metric_value: number
  data_source: string
}

interface IngestionResult {
  symbol: string
  success: boolean
  productSegments: number
  geoSegments: number
  years: number[]
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

  if (response.status === 402) {
    throw new Error('Restricted endpoint - requires higher FMP tier')
  }

  const text = await response.text()

  if (text.startsWith('Restricted') || text.includes('Upgrade your plan')) {
    throw new Error('Restricted endpoint - requires higher FMP tier')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSegmentData(data: any[], symbol: string, dimensionType: 'product' | 'geographic'): SegmentRecord[] {
  const segments: SegmentRecord[] = []

  if (!Array.isArray(data)) return segments

  for (const row of data) {
    // Each row is like { "2024-12-31": { "Segment A": 1000, "Segment B": 2000 } }
    const dateKeys = Object.keys(row).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))

    for (const dateKey of dateKeys) {
      const year = new Date(dateKey).getFullYear()
      const segmentData = row[dateKey]

      if (typeof segmentData !== 'object' || segmentData === null) continue

      for (const [segmentName, value] of Object.entries(segmentData)) {
        if (value !== null && value !== 0 && typeof value === 'number') {
          segments.push({
            symbol,
            year,
            period: 'FY',
            metric_name: 'segment_revenue',
            dimension_type: dimensionType,
            dimension_value: segmentName,
            metric_value: value,
            data_source: 'fmp_api',
          })
        }
      }
    }
  }

  return segments
}

async function fetchSegmentsForSymbol(symbol: string, apiKey: string): Promise<SegmentRecord[]> {
  const segments: SegmentRecord[] = []

  // Fetch product segments
  try {
    const productUrl = `${FMP_BASE_URL}/revenue-product-segmentation?symbol=${symbol}&structure=flat&apikey=${apiKey}`
    const productData = await rateLimitedFetch(productUrl)
    segments.push(...parseSegmentData(productData, symbol, 'product'))
  } catch (err) {
    // Log but continue - some stocks may only have geographic data
    if (!(err instanceof Error && err.message.includes('Restricted'))) {
      console.error(`    Warning: Could not fetch product segments for ${symbol}`)
    }
  }

  // Fetch geographic segments
  try {
    const geoUrl = `${FMP_BASE_URL}/revenue-geographic-segmentation?symbol=${symbol}&structure=flat&apikey=${apiKey}`
    const geoData = await rateLimitedFetch(geoUrl)
    segments.push(...parseSegmentData(geoData, symbol, 'geographic'))
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('Restricted'))) {
      console.error(`    Warning: Could not fetch geographic segments for ${symbol}`)
    }
  }

  // Deduplicate segments by unique key to avoid "ON CONFLICT DO UPDATE cannot affect row a second time" error
  // FMP API can return multiple entries for the same segment (e.g., different periods mapping to same FY)
  const uniqueSegments = new Map<string, SegmentRecord>()
  for (const seg of segments) {
    const key = `${seg.symbol}|${seg.year}|${seg.period}|${seg.metric_name}|${seg.dimension_type}|${seg.dimension_value}`
    // Keep the last value (most recent) if duplicates exist
    uniqueSegments.set(key, seg)
  }

  return Array.from(uniqueSegments.values())
}

async function ingestSingleStock(
  supabase: ReturnType<typeof createClient>,
  stock: USStock,
  apiKey: string,
  dryRun: boolean
): Promise<IngestionResult> {
  const { symbol } = stock

  try {
    const segments = await fetchSegmentsForSymbol(symbol, apiKey)

    const productSegments = segments.filter((s) => s.dimension_type === 'product')
    const geoSegments = segments.filter((s) => s.dimension_type === 'geographic')
    const years = [...new Set(segments.map((s) => s.year))].sort()

    if (segments.length === 0) {
      // No segment data available
      if (!dryRun) {
        await supabase
          .from('us_stocks')
          .update({
            segment_status: 'no_data',
            segment_updated_at: new Date().toISOString(),
          })
          .eq('symbol', symbol)
      }

      return {
        symbol,
        success: true,
        productSegments: 0,
        geoSegments: 0,
        years: [],
      }
    }

    if (!dryRun) {
      // Upsert segment data
      const { error } = await supabase.from('company_metrics').upsert(segments, {
        onConflict: 'symbol,year,period,metric_name,dimension_type,dimension_value',
        ignoreDuplicates: false,
      })

      if (error) {
        throw new Error(error.message)
      }

      // Update status
      await supabase
        .from('us_stocks')
        .update({
          segment_status: 'complete',
          segment_updated_at: new Date().toISOString(),
        })
        .eq('symbol', symbol)
    }

    return {
      symbol,
      success: true,
      productSegments: productSegments.length,
      geoSegments: geoSegments.length,
      years,
    }
  } catch (error) {
    if (!dryRun) {
      await supabase
        .from('us_stocks')
        .update({
          segment_status: 'error',
          segment_updated_at: new Date().toISOString(),
        })
        .eq('symbol', symbol)
    }

    return {
      symbol,
      success: false,
      productSegments: 0,
      geoSegments: 0,
      years: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('SEGMENT DATA INGESTION - ALL US STOCKS')
  console.log('='.repeat(60))
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let minMarketCap: number | undefined
  let limit: number | undefined
  let singleSymbol: string | undefined
  let resumeMode = false
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-market-cap' && args[i + 1]) {
      minMarketCap = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--symbol' && args[i + 1]) {
      singleSymbol = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--resume') {
      resumeMode = true
    } else if (args[i] === '--dry-run') {
      dryRun = true
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

  const FMP_API_KEY = process.env.FMP_API_KEY

  if (!FMP_API_KEY) {
    console.error('Error: Missing FMP_API_KEY')
    process.exit(1)
  }

  const { url: supabaseUrl, serviceRoleKey } =
    requireSupabaseServiceRoleCredentials()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch stocks with pagination (Supabase limits to 1000 rows per request)
  const PAGE_SIZE = 1000
  const allStocks: USStock[] = []
  let page = 0

  while (true) {
    let query = supabase
      .from('us_stocks')
      .select('symbol, name, market_cap, segment_status')
      .eq('is_active', true)

    if (singleSymbol) {
      query = query.eq('symbol', singleSymbol)
    } else {
      if (minMarketCap) {
        query = query.gte('market_cap', minMarketCap)
      }
      query = query.order('market_cap', { ascending: false, nullsFirst: false })
    }

    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching stocks:', error)
      process.exit(1)
    }

    if (!data || data.length === 0) {
      break
    }

    allStocks.push(...(data as USStock[]))

    if (data.length < PAGE_SIZE) {
      break // Last page
    }

    page++
  }

  if (allStocks.length === 0) {
    console.log('No stocks found matching criteria')
    return
  }

  // Filter for pending/error stocks (unless single symbol)
  let toProcess = allStocks as USStock[]
  if (!singleSymbol) {
    if (resumeMode) {
      toProcess = toProcess.filter((s) => s.segment_status === 'error' || s.segment_status === 'pending' || s.segment_status === null)
    } else {
      // Skip already processed
      toProcess = toProcess.filter((s) => s.segment_status !== 'complete' && s.segment_status !== 'no_data')
    }
  }

  if (limit) {
    toProcess = toProcess.slice(0, limit)
  }

  if (toProcess.length === 0) {
    console.log('No stocks need processing (all complete or no_data)')
    return
  }

  // Print config
  console.log('Configuration:')
  if (minMarketCap) {
    const mcapStr = minMarketCap >= 1e9 ? `$${(minMarketCap / 1e9).toFixed(0)}B` : `$${(minMarketCap / 1e6).toFixed(0)}M`
    console.log(`  Min market cap: ${mcapStr}`)
  }
  if (limit) console.log(`  Limit: ${limit} stocks`)
  if (singleSymbol) console.log(`  Single symbol: ${singleSymbol}`)
  if (resumeMode) console.log(`  Resume mode: only pending/error stocks`)
  if (dryRun) console.log(`  DRY RUN: no database writes`)
  console.log(`  Total to process: ${toProcess.length} stocks`)
  console.log()

  const results: IngestionResult[] = []
  const startTime = Date.now()

  for (let i = 0; i < toProcess.length; i++) {
    const stock = toProcess[i]
    const mcap = stock.market_cap ? `$${(stock.market_cap / 1e9).toFixed(1)}B` : 'N/A'

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${stock.symbol.padEnd(6)} (${mcap.padStart(8)}) `)

    const result = await ingestSingleStock(supabase, stock, FMP_API_KEY, dryRun)
    results.push(result)

    if (result.success) {
      if (result.productSegments === 0 && result.geoSegments === 0) {
        console.log(`- no data`)
      } else {
        console.log(`✓ ${result.productSegments}P + ${result.geoSegments}G (${result.years.length} yrs)`)
      }
    } else {
      console.log(`✗ ${result.error}`)
    }

    // Progress update every batch
    if ((i + 1) % BATCH_SIZE === 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const withData = results.filter((r) => r.success && (r.productSegments > 0 || r.geoSegments > 0)).length
      const rate = ((i + 1) / elapsed).toFixed(1)
      console.log(`\n  --- Progress: ${i + 1}/${toProcess.length} (${withData} with data, ${rate} stocks/sec) ---\n`)
    }
  }

  // Summary
  const elapsed = (Date.now() - startTime) / 1000
  const successful = results.filter((r) => r.success)
  const withData = successful.filter((r) => r.productSegments > 0 || r.geoSegments > 0)
  const noData = successful.filter((r) => r.productSegments === 0 && r.geoSegments === 0)
  const failed = results.filter((r) => !r.success)
  const totalProduct = withData.reduce((sum, r) => sum + r.productSegments, 0)
  const totalGeo = withData.reduce((sum, r) => sum + r.geoSegments, 0)

  console.log('\n' + '='.repeat(60))
  console.log('INGESTION SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nProcessed: ${results.length} stocks`)
  console.log(`With segment data: ${withData.length}`)
  console.log(`No segment data: ${noData.length}`)
  console.log(`Failed: ${failed.length}`)
  console.log(`\nSegment records:`)
  console.log(`  Product segments: ${totalProduct}`)
  console.log(`  Geographic segments: ${totalGeo}`)
  console.log(`  Total: ${totalProduct + totalGeo}`)
  console.log(`\nTime: ${elapsed.toFixed(1)} seconds`)
  console.log(`Rate: ${(results.length / elapsed).toFixed(2)} stocks/second`)

  if (dryRun) {
    console.log('\n[DRY RUN - No data was written to database]')
  }

  if (failed.length > 0) {
    console.log('\nFailed stocks:')
    failed.slice(0, 10).forEach((r) => {
      console.log(`  ${r.symbol}: ${r.error}`)
    })
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`)
    }
    console.log('\nTo retry failed stocks, run:')
    console.log('  npx tsx scripts/ingest-segment-data-all.ts --resume')
  }

  // Show top stocks with data
  if (withData.length > 0) {
    console.log('\nTop stocks with segment data:')
    withData.slice(0, 10).forEach((r) => {
      console.log(`  ${r.symbol.padEnd(6)} ${r.productSegments}P + ${r.geoSegments}G (${r.years.join(', ')})`)
    })
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
