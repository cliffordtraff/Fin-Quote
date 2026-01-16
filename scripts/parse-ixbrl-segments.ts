/**
 * iXBRL Segment Data Parser
 *
 * Extracts segment revenue data (by product and geography) from SEC filing HTML files.
 * Uses Inline XBRL (iXBRL) tags embedded in the HTML.
 *
 * Usage:
 *   npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL
 *   npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --ingest
 *   npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing aapl-10-k-2024.html
 *   npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing-type 10-q
 *   npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing-type 10-q --ingest
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import {
  getMappingsForTicker,
  getSegmentDisplayNameForTicker,
  getSegmentTypeFromAxisForTicker,
  getSupportedTickers,
  type SegmentType,
} from '../lib/ixbrl-mappings'
import {
  getFiscalYearFromPeriodEnd as aaplGetFiscalYear,
  getFiscalQuarterFromPeriodEnd as aaplGetFiscalQuarter,
  isQuarterlyDuration,
  isAnnualDuration,
} from '../lib/ixbrl-mappings/aapl'
import {
  getFiscalYearFromPeriodEnd as googlGetFiscalYear,
  getFiscalQuarterFromPeriodEnd as googlGetFiscalQuarter,
} from '../lib/ixbrl-mappings/googl'

// Wrapper functions to handle different tickers
function getFiscalYearFromPeriodEnd(ticker: string, periodEnd: string): number {
  if (ticker.toUpperCase() === 'GOOGL') {
    return googlGetFiscalYear(periodEnd)
  }
  return aaplGetFiscalYear(periodEnd)
}

function getFiscalQuarterFromPeriodEnd(ticker: string, periodEnd: string): {
  fiscalYear: number
  fiscalQuarter: 1 | 2 | 3 | 4
  period: 'Q1' | 'Q2' | 'Q3' | 'Q4'
} {
  if (ticker.toUpperCase() === 'GOOGL') {
    return googlGetFiscalQuarter(periodEnd)
  }
  return aaplGetFiscalQuarter(periodEnd)
}

type FilingType = '10-k' | '10-q'
type PeriodType = 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'

dotenv.config({ path: '.env.local' })

// Types
interface XBRLContext {
  id: string
  period: {
    type: 'duration' | 'instant'
    start?: string
    end?: string
    date?: string
  } | null
  dimensions: Array<{
    axis: string
    member: string
  }>
}

interface XBRLFact {
  name: string
  contextId: string
  value: number
  scale: number
}

interface SegmentRevenue {
  fiscalYear: number
  fiscalQuarter?: 1 | 2 | 3 | 4
  period: PeriodType
  segmentType: SegmentType
  segmentName: string
  value: number
  periodStart?: string
  periodEnd?: string
  xbrlMember: string
  xbrlContextId: string
}

interface ParseResult {
  ticker: string
  filing: string
  segments: SegmentRevenue[]
  errors: string[]
}

// Supabase client
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient(url, key)
}

/**
 * Parse XBRL contexts from ix:header section
 */
function parseContexts(html: string): Map<string, XBRLContext> {
  const contexts = new Map<string, XBRLContext>()

  // Find ix:header section
  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i)
  if (!headerMatch) {
    return contexts
  }

  const header = headerMatch[1]

  // Parse each context
  const contextRegex = /<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi
  let match

  while ((match = contextRegex.exec(header)) !== null) {
    const contextId = match[1]
    const contextContent = match[2]

    // Extract period
    let period: XBRLContext['period'] = null
    const periodMatch = contextContent.match(/<xbrli:period>([\s\S]*?)<\/xbrli:period>/i)

    if (periodMatch) {
      const periodContent = periodMatch[1]
      const startMatch = periodContent.match(/<xbrli:startDate>([^<]+)/i)
      const endMatch = periodContent.match(/<xbrli:endDate>([^<]+)/i)
      const instantMatch = periodContent.match(/<xbrli:instant>([^<]+)/i)

      if (instantMatch) {
        period = { type: 'instant', date: instantMatch[1] }
      } else if (startMatch && endMatch) {
        period = { type: 'duration', start: startMatch[1], end: endMatch[1] }
      }
    }

    // Extract dimensions
    const dimensions: XBRLContext['dimensions'] = []
    const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/gi
    let dimMatch

    while ((dimMatch = dimRegex.exec(contextContent)) !== null) {
      dimensions.push({
        axis: dimMatch[1],
        member: dimMatch[2],
      })
    }

    contexts.set(contextId, { id: contextId, period, dimensions })
  }

  return contexts
}

/**
 * Parse numeric facts from ix:nonFraction elements
 */
function parseFacts(html: string): XBRLFact[] {
  const facts: XBRLFact[] = []

  // Match ix:nonFraction elements
  const factRegex = /<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/gi
  let match

  while ((match = factRegex.exec(html)) !== null) {
    const attrs = match[1]
    const rawValue = match[2].replace(/,/g, '').trim()

    // Extract attributes
    const nameMatch = attrs.match(/name="([^"]+)"/i)
    const contextMatch = attrs.match(/contextRef="([^"]+)"/i)
    const scaleMatch = attrs.match(/scale="([^"]+)"/i)

    if (!nameMatch || !contextMatch) continue

    const name = nameMatch[1]

    // Filter for revenue facts only
    if (!name.toLowerCase().includes('revenue')) continue

    const scale = scaleMatch ? parseInt(scaleMatch[1]) : 0
    let value = parseFloat(rawValue)

    if (isNaN(value)) continue

    // Apply scale
    if (scale) {
      value = value * Math.pow(10, scale)
    }

    facts.push({
      name,
      contextId: contextMatch[1],
      value,
      scale,
    })
  }

  return facts
}

/**
 * Extract segment revenue data from parsed contexts and facts
 */
function extractSegmentRevenue(
  contexts: Map<string, XBRLContext>,
  facts: XBRLFact[],
  mappings: ReturnType<typeof getMappingsForTicker>,
  ticker: string,
  filingType: FilingType = '10-k'
): SegmentRevenue[] {
  if (!mappings) return []

  const segments: SegmentRevenue[] = []

  for (const fact of facts) {
    const context = contexts.get(fact.contextId)
    if (!context || context.dimensions.length === 0) continue

    // Only include duration periods (revenue is a flow, not point-in-time)
    if (context.period?.type !== 'duration') continue

    const periodStart = context.period.start
    const periodEnd = context.period.end
    if (!periodStart || !periodEnd) continue

    // Filter by duration based on filing type
    if (filingType === '10-q') {
      // For 10-Q, only include single-quarter durations (84-98 days)
      // Skip YTD cumulative periods (6 months, 9 months)
      if (!isQuarterlyDuration(periodStart, periodEnd)) {
        continue
      }
    } else {
      // For 10-K, only include full-year durations (360-370 days)
      if (!isAnnualDuration(periodStart, periodEnd)) {
        continue
      }
    }

    // Check if this context has a product or geographic dimension
    for (const dim of context.dimensions) {
      const segmentType = getSegmentTypeFromAxisForTicker(ticker, dim.axis)
      if (!segmentType) continue

      const segmentName = getSegmentDisplayNameForTicker(ticker, dim.member)
      if (!segmentName) continue

      // Calculate fiscal year and period
      let fiscalYear: number
      let fiscalQuarter: 1 | 2 | 3 | 4 | undefined
      let period: PeriodType

      if (filingType === '10-q') {
        const quarterInfo = getFiscalQuarterFromPeriodEnd(ticker, periodEnd)
        fiscalYear = quarterInfo.fiscalYear
        fiscalQuarter = quarterInfo.fiscalQuarter
        period = quarterInfo.period
      } else {
        fiscalYear = getFiscalYearFromPeriodEnd(ticker, periodEnd)
        period = 'FY'
      }

      segments.push({
        fiscalYear,
        fiscalQuarter,
        period,
        segmentType,
        segmentName,
        value: fact.value,
        periodStart,
        periodEnd,
        xbrlMember: dim.member,
        xbrlContextId: context.id,
      })
    }
  }

  return segments
}

/**
 * Parse a single filing HTML file
 */
async function parseFilingHtml(
  html: string,
  ticker: string,
  filename: string,
  filingType: FilingType = '10-k'
): Promise<ParseResult> {
  const errors: string[] = []

  const mappings = getMappingsForTicker(ticker)
  if (!mappings) {
    return {
      ticker,
      filing: filename,
      segments: [],
      errors: [`No mappings found for ticker: ${ticker}`],
    }
  }

  // Parse contexts and facts
  const contexts = parseContexts(html)
  if (contexts.size === 0) {
    errors.push('No XBRL contexts found in filing')
  }

  const facts = parseFacts(html)
  if (facts.length === 0) {
    errors.push('No revenue facts found in filing')
  }

  // Extract segment revenue
  const segments = extractSegmentRevenue(contexts, facts, mappings, ticker, filingType)

  // Deduplicate by fiscal year + period + segment (keep the one with highest value if duplicates)
  const deduped = new Map<string, SegmentRevenue>()
  for (const seg of segments) {
    const key = `${seg.fiscalYear}-${seg.period}-${seg.segmentType}-${seg.segmentName}`
    const existing = deduped.get(key)
    if (!existing || seg.value > existing.value) {
      deduped.set(key, seg)
    }
  }

  return {
    ticker,
    filing: filename,
    segments: Array.from(deduped.values()),
    errors,
  }
}

/**
 * Download and parse a filing from Supabase Storage
 */
async function parseFilingFromStorage(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  filename: string,
  filingType: FilingType = '10-k'
): Promise<ParseResult> {
  const { data: htmlBlob, error } = await supabase.storage
    .from('filings')
    .download(`html/${filename}`)

  if (error || !htmlBlob) {
    return {
      ticker,
      filing: filename,
      segments: [],
      errors: [`Failed to download filing: ${error?.message || 'Unknown error'}`],
    }
  }

  const html = await htmlBlob.text()
  return parseFilingHtml(html, ticker, filename, filingType)
}

/**
 * List available filing HTML files for a ticker
 */
async function listFilings(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  filingType: FilingType = '10-k'
): Promise<string[]> {
  const { data: files, error } = await supabase.storage.from('filings').list('html')

  if (error || !files) {
    console.error('Error listing filings:', error)
    return []
  }

  // Filter for this ticker's files by type
  const tickerLower = ticker.toLowerCase()
  const prefix = `${tickerLower}-${filingType}`

  return files
    .filter((f) => f.name.startsWith(prefix))
    .map((f) => f.name)
    .sort()
    .reverse() // Most recent first
}

/**
 * Ingest parsed segment data into company_metrics table
 */
async function ingestToDatabase(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  segments: SegmentRevenue[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = []

  // Prepare rows
  // metric_category: 'segment_reporting' = ASC 280 segment data (required disclosure)
  // See docs/METRIC_TAXONOMY.md for full classification system
  const rows = segments.map((seg) => ({
    symbol: ticker.toUpperCase(),
    year: seg.fiscalYear,
    period: seg.period, // 'FY', 'Q1', 'Q2', 'Q3', or 'Q4'
    metric_name: 'segment_revenue',
    metric_category: 'segment_reporting', // ASC 280 - Segment Reporting
    metric_value: seg.value,
    unit: 'currency',
    dimension_type: seg.segmentType,
    dimension_value: seg.segmentName,
    data_source: 'SEC-XBRL',
  }))

  if (rows.length === 0) {
    return { inserted: 0, errors: ['No segment data to ingest'] }
  }

  // Upsert (update if exists, insert if not)
  const { data, error } = await supabase
    .from('company_metrics')
    .upsert(rows, {
      onConflict: 'symbol,year,period,metric_name,dimension_type,dimension_value',
    })
    .select()

  if (error) {
    errors.push(`Database error: ${error.message}`)
    return { inserted: 0, errors }
  }

  return { inserted: data?.length || 0, errors }
}

/**
 * Display parsed segment data
 */
function displayResults(results: ParseResult[], filingType: FilingType = '10-k') {
  for (const result of results) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Filing: ${result.filing}`)
    console.log(`${'='.repeat(60)}`)

    if (result.errors.length > 0) {
      console.log('\nErrors:')
      result.errors.forEach((e) => console.log(`  - ${e}`))
    }

    if (result.segments.length === 0) {
      console.log('\nNo segment data found')
      continue
    }

    // Group by fiscal year, period, and type
    const byYearPeriodType = new Map<string, SegmentRevenue[]>()
    for (const seg of result.segments) {
      const key = `${seg.fiscalYear}-${seg.period}-${seg.segmentType}`
      if (!byYearPeriodType.has(key)) {
        byYearPeriodType.set(key, [])
      }
      byYearPeriodType.get(key)!.push(seg)
    }

    // Get unique year-period combinations
    const yearPeriods = [...new Set(result.segments.map((s) => `${s.fiscalYear}-${s.period}`))]
      .sort()
      .reverse()

    for (const yearPeriod of yearPeriods) {
      const [year, period] = yearPeriod.split('-')
      const displayLabel = period === 'FY' ? `FY ${year}` : `FY ${year} ${period}`
      console.log(`\n${displayLabel}:`)

      // Product segments
      const productKey = `${yearPeriod}-product`
      const products = byYearPeriodType.get(productKey) || []
      if (products.length > 0) {
        console.log('  Product Segments:')
        products
          .sort((a, b) => b.value - a.value)
          .forEach((seg) => {
            const valueB = (seg.value / 1e9).toFixed(2)
            console.log(`    ${seg.segmentName.padEnd(35)} $${valueB}B`)
          })
      }

      // Geographic segments
      const geoKey = `${yearPeriod}-geographic`
      const geos = byYearPeriodType.get(geoKey) || []
      if (geos.length > 0) {
        console.log('  Geographic Segments:')
        geos
          .sort((a, b) => b.value - a.value)
          .forEach((seg) => {
            const valueB = (seg.value / 1e9).toFixed(2)
            console.log(`    ${seg.segmentName.padEnd(35)} $${valueB}B`)
          })
      }
    }
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)

  // Parse arguments
  let ticker = 'AAPL'
  let specificFiling: string | null = null
  let shouldIngest = false
  let filingType: FilingType = '10-k'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && args[i + 1]) {
      ticker = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--filing' && args[i + 1]) {
      specificFiling = args[i + 1]
      i++
    } else if (args[i] === '--filing-type' && args[i + 1]) {
      const ft = args[i + 1].toLowerCase()
      if (ft === '10-k' || ft === '10-q') {
        filingType = ft
      } else {
        console.error(`Invalid filing type: ${ft}. Use '10-k' or '10-q'.`)
        process.exit(1)
      }
      i++
    } else if (args[i] === '--ingest') {
      shouldIngest = true
    }
  }

  console.log(`iXBRL Segment Parser`)
  console.log(`Ticker: ${ticker}`)
  console.log(`Filing Type: ${filingType.toUpperCase()}`)
  console.log(`Mode: ${shouldIngest ? 'Parse + Ingest' : 'Parse Only (dry run)'}`)

  // Check if ticker is supported
  const mappings = getMappingsForTicker(ticker)
  if (!mappings) {
    console.error(`\nError: No mappings found for ticker ${ticker}`)
    console.error(`Supported tickers: ${getSupportedTickers().join(', ')}`)
    process.exit(1)
  }

  const supabase = getSupabaseClient()

  // Get filings to parse
  let filingsToProcess: string[]

  if (specificFiling) {
    filingsToProcess = [specificFiling]
  } else {
    console.log('\nListing available filings...')
    filingsToProcess = await listFilings(supabase, ticker, filingType)
    console.log(`Found ${filingsToProcess.length} ${filingType.toUpperCase()} filings`)
  }

  if (filingsToProcess.length === 0) {
    console.error('No filings found to process')
    process.exit(1)
  }

  // Parse each filing
  const results: ParseResult[] = []

  for (const filename of filingsToProcess) {
    console.log(`\nParsing: ${filename}...`)
    const result = await parseFilingFromStorage(supabase, ticker, filename, filingType)
    results.push(result)
    console.log(`  Found ${result.segments.length} segment records`)
  }

  // Display results
  displayResults(results, filingType)

  // Aggregate all segments and deduplicate (same FY/period/segment may appear in multiple filings)
  const allSegments = results.flatMap((r) => r.segments)
  const dedupedMap = new Map<string, SegmentRevenue>()
  for (const seg of allSegments) {
    const key = `${seg.fiscalYear}-${seg.period}-${seg.segmentType}-${seg.segmentName}`
    // Keep the first occurrence (most recent filing has priority)
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, seg)
    }
  }
  const dedupedSegments = Array.from(dedupedMap.values())

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  console.log(`Total filings processed: ${results.length}`)
  console.log(`Total segment records (raw): ${allSegments.length}`)
  console.log(`Unique segment records (deduplicated): ${dedupedSegments.length}`)

  const productCount = dedupedSegments.filter((s) => s.segmentType === 'product').length
  const geoCount = dedupedSegments.filter((s) => s.segmentType === 'geographic').length
  console.log(`  Product segments: ${productCount}`)
  console.log(`  Geographic segments: ${geoCount}`)

  // Show period breakdown for quarterly
  if (filingType === '10-q') {
    const periodCounts = new Map<string, number>()
    for (const seg of dedupedSegments) {
      const key = `${seg.fiscalYear} ${seg.period}`
      periodCounts.set(key, (periodCounts.get(key) || 0) + 1)
    }
    console.log('\n  By period:')
    const sortedPeriods = [...periodCounts.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    for (const [period, count] of sortedPeriods) {
      console.log(`    ${period}: ${count} segments`)
    }
  }

  // Ingest if requested
  if (shouldIngest) {
    console.log('\nIngesting to database...')
    const { inserted, errors } = await ingestToDatabase(supabase, ticker, dedupedSegments)

    if (errors.length > 0) {
      console.error('Ingestion errors:')
      errors.forEach((e) => console.error(`  - ${e}`))
    }

    console.log(`Successfully ingested ${inserted} records`)
  } else {
    console.log('\nDry run complete. Use --ingest to save to database.')
  }
}

main().catch(console.error)
