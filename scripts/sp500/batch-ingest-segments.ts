/**
 * Phase 4: Batch ingestion of segment data for S&P 500 stocks
 *
 * Fetches and ingests product/business segment and geographic segment revenue
 * from FMP's Segment API for all S&P 500 constituents.
 *
 * FMP Endpoints:
 * - /stable/revenue-product-segmentation
 * - /stable/revenue-geographic-segmentation
 *
 * Usage:
 *   npx tsx scripts/sp500/batch-ingest-segments.ts              # All pending stocks
 *   npx tsx scripts/sp500/batch-ingest-segments.ts --limit 10   # First 10 pending stocks
 *   npx tsx scripts/sp500/batch-ingest-segments.ts --symbol MSFT # Single stock
 *   npx tsx scripts/sp500/batch-ingest-segments.ts --resume     # Resume from errors
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

// Configuration
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const RATE_LIMIT_DELAY_MS = 500 // 2 requests per second (being conservative)
const BATCH_SIZE = 10

interface SP500Constituent {
  symbol: string
  name: string
  alternate_symbols: { fmp?: string } | null
  data_status: Record<string, any>
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

  // Check for restricted endpoint
  if (response.status === 402) {
    throw new Error('Restricted endpoint - requires higher FMP tier')
  }

  const text = await response.text()

  // Handle non-JSON responses
  if (text.startsWith('Restricted')) {
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

async function fetchSegmentsForSymbol(
  symbol: string,
  fmpSymbol: string,
  apiKey: string
): Promise<SegmentRecord[]> {
  const segments: SegmentRecord[] = []

  // Fetch product segments
  const productUrl = `${FMP_BASE_URL}/revenue-product-segmentation?symbol=${fmpSymbol}&apikey=${apiKey}`
  const productData = await rateLimitedFetch(productUrl)

  if (Array.isArray(productData)) {
    for (const row of productData) {
      const year = new Date(row.date).getFullYear()
      const segmentKeys = Object.keys(row).filter((k) => !['date', 'symbol'].includes(k))

      for (const segmentName of segmentKeys) {
        const value = row[segmentName]
        if (value !== null && value !== 0 && typeof value === 'number') {
          segments.push({
            symbol: symbol, // Use canonical symbol
            year,
            period: 'FY',
            metric_name: 'segment_revenue',
            dimension_type: 'product',
            dimension_value: segmentName,
            metric_value: value,
            data_source: 'fmp_api',
          })
        }
      }
    }
  }

  // Fetch geographic segments
  const geoUrl = `${FMP_BASE_URL}/revenue-geographic-segmentation?symbol=${fmpSymbol}&apikey=${apiKey}`
  const geoData = await rateLimitedFetch(geoUrl)

  if (Array.isArray(geoData)) {
    for (const row of geoData) {
      const year = new Date(row.date).getFullYear()
      const segmentKeys = Object.keys(row).filter((k) => !['date', 'symbol'].includes(k))

      for (const segmentName of segmentKeys) {
        const value = row[segmentName]
        if (value !== null && value !== 0 && typeof value === 'number') {
          segments.push({
            symbol: symbol,
            year,
            period: 'FY',
            metric_name: 'segment_revenue',
            dimension_type: 'geographic',
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

async function ingestSingleStock(
  supabase: ReturnType<typeof createClient>,
  constituent: SP500Constituent,
  apiKey: string
): Promise<IngestionResult> {
  const { symbol, alternate_symbols } = constituent
  const fmpSymbol = alternate_symbols?.fmp || symbol

  try {
    const segments = await fetchSegmentsForSymbol(symbol, fmpSymbol, apiKey)

    const productSegments = segments.filter((s) => s.dimension_type === 'product')
    const geoSegments = segments.filter((s) => s.dimension_type === 'geographic')
    const years = [...new Set(segments.map((s) => s.year))].sort()

    if (segments.length === 0) {
      // Update status as no_data (not an error, just no segment data available)
      const dataStatus = {
        ...constituent.data_status,
        segments: {
          status: 'no_data',
          last_updated: new Date().toISOString(),
        },
      }

      await supabase
        .from('sp500_constituents')
        .update({ data_status: dataStatus })
        .eq('symbol', symbol)

      return {
        symbol,
        success: true, // Not a failure, just no data
        productSegments: 0,
        geoSegments: 0,
        years: [],
      }
    }

    // Upsert to database
    const { error } = await supabase.from('company_metrics').upsert(segments, {
      onConflict: 'symbol,year,period,metric_name,dimension_type,dimension_value',
      ignoreDuplicates: false,
    })

    if (error) {
      return {
        symbol,
        success: false,
        productSegments: 0,
        geoSegments: 0,
        years: [],
        error: error.message,
      }
    }

    // Update status
    const dataStatus = {
      ...constituent.data_status,
      segments: {
        status: 'complete',
        last_updated: new Date().toISOString(),
        product_count: productSegments.length,
        geo_count: geoSegments.length,
        years: years,
      },
    }

    await supabase
      .from('sp500_constituents')
      .update({ data_status: dataStatus })
      .eq('symbol', symbol)

    return {
      symbol,
      success: true,
      productSegments: productSegments.length,
      geoSegments: geoSegments.length,
      years,
    }
  } catch (error) {
    // Update status with error
    const dataStatus = {
      ...constituent.data_status,
      segments: {
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
      productSegments: 0,
      geoSegments: 0,
      years: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 4: Batch Segment Data Ingestion')
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
      const status = c.data_status?.segments?.status
      return !status || status === 'error' || status === 'pending'
    })
  }

  if (limit && resumeMode) {
    toProcess = toProcess.slice(0, limit)
  }

  if (toProcess.length === 0) {
    console.log('No stocks need processing (all complete or no_data)')
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
      if (result.productSegments === 0 && result.geoSegments === 0) {
        console.log(`- no segment data`)
      } else {
        console.log(`✓ ${result.productSegments}P + ${result.geoSegments}G (${result.years.length}yr)`)
      }
    } else {
      console.log(`✗ ${result.error}`)
    }

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

  if (failed.length > 0) {
    console.log('\nFailed stocks:')
    failed.slice(0, 10).forEach((r) => {
      console.log(`  ${r.symbol}: ${r.error}`)
    })
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`)
    }
    console.log('\nTo retry failed stocks, run:')
    console.log('  npx tsx scripts/sp500/batch-ingest-segments.ts --resume')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
