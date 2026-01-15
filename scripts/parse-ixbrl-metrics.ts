/**
 * iXBRL Metrics Parser
 *
 * Extracts multiple metrics from SEC filing HTML files:
 * - Segment revenue (by product and geography)
 * - Segment operating income (by geography)
 * - Cost of sales (product vs services)
 * - Revenue by country
 * - Long-lived assets by country
 *
 * Uses Inline XBRL (iXBRL) tags embedded in the HTML.
 *
 * Usage:
 *   npx tsx scripts/parse-ixbrl-metrics.ts --ticker AAPL
 *   npx tsx scripts/parse-ixbrl-metrics.ts --ticker AAPL --ingest
 *   npx tsx scripts/parse-ixbrl-metrics.ts --ticker AAPL --filing aapl-10-k-2024.html
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import {
  getMappingsForTicker,
  getSegmentDisplayName,
  getFiscalYearFromPeriodEnd,
  type SegmentType,
  type MetricCategory,
} from '../lib/ixbrl-mappings'

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

interface ParsedMetric {
  fiscalYear: number
  metricName: string
  metricCategory: MetricCategory
  dimensionType: SegmentType | null
  dimensionValue: string | null
  value: number
  unit: 'currency' | 'count' | 'percentage'
  periodType: 'duration' | 'instant'
  periodStart?: string
  periodEnd?: string
  xbrlFact: string
  xbrlMember?: string
  xbrlContextId: string
}

interface ParseResult {
  ticker: string
  filing: string
  metrics: ParsedMetric[]
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
 * Parse all numeric facts from ix:nonFraction elements
 */
function parseFacts(html: string, factNames: Set<string>): XBRLFact[] {
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

    // Only include facts we're interested in
    if (!factNames.has(name)) continue

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
 * Extract all metrics from parsed contexts and facts
 */
function extractMetrics(
  contexts: Map<string, XBRLContext>,
  facts: XBRLFact[],
  mappings: NonNullable<ReturnType<typeof getMappingsForTicker>>
): ParsedMetric[] {
  const metrics: ParsedMetric[] = []

  for (const fact of facts) {
    const context = contexts.get(fact.contextId)
    if (!context) continue

    // Get period info
    const periodEnd = context.period?.end || context.period?.date
    if (!periodEnd) continue

    const fiscalYear = getFiscalYearFromPeriodEnd(periodEnd)
    const periodType = context.period?.type || 'duration'

    // Find which metric mappings match this fact
    for (const metricMapping of mappings.metrics) {
      if (metricMapping.xbrlFact !== fact.name) continue

      // Check if context has the required dimension
      if (context.dimensions.length === 0) continue

      for (const dim of context.dimensions) {
        // Check if this axis is one we care about for this metric
        if (!metricMapping.axes.includes(dim.axis)) continue

        // Get display name for this member
        const displayName = getSegmentDisplayName(dim.member)
        if (!displayName) continue

        // Determine dimension type from member
        const memberMapping = mappings.members[dim.member]
        if (!memberMapping) continue

        // For duration metrics (revenue, operating income, cost of sales), only use duration periods
        // For instant metrics (assets), use instant periods
        const isInstantMetric = metricMapping.metricName === 'long_lived_assets'
        if (isInstantMetric && periodType !== 'instant') continue
        if (!isInstantMetric && periodType !== 'duration') continue

        metrics.push({
          fiscalYear,
          metricName: metricMapping.metricName,
          metricCategory: metricMapping.metricCategory,
          dimensionType: memberMapping.type,
          dimensionValue: displayName,
          value: fact.value,
          unit: metricMapping.unit,
          periodType,
          periodStart: context.period?.start,
          periodEnd: context.period?.end || context.period?.date,
          xbrlFact: fact.name,
          xbrlMember: dim.member,
          xbrlContextId: context.id,
        })
      }
    }
  }

  return metrics
}

/**
 * Parse a single filing HTML file
 */
async function parseFilingHtml(
  html: string,
  ticker: string,
  filename: string
): Promise<ParseResult> {
  const errors: string[] = []

  const mappings = getMappingsForTicker(ticker)
  if (!mappings) {
    return {
      ticker,
      filing: filename,
      metrics: [],
      errors: [`No mappings found for ticker: ${ticker}`],
    }
  }

  // Parse contexts
  const contexts = parseContexts(html)
  if (contexts.size === 0) {
    errors.push('No XBRL contexts found in filing')
  }

  // Get set of all fact names we need
  const factNames = new Set(mappings.metrics.map((m) => m.xbrlFact))

  // Parse facts
  const facts = parseFacts(html, factNames)
  if (facts.length === 0) {
    errors.push('No relevant facts found in filing')
  }

  // Extract metrics
  const metrics = extractMetrics(contexts, facts, mappings)

  // Deduplicate by fiscal year + metric + dimension (keep the one with highest absolute value)
  const deduped = new Map<string, ParsedMetric>()
  for (const metric of metrics) {
    const key = `${metric.fiscalYear}-${metric.metricName}-${metric.dimensionType}-${metric.dimensionValue}`
    const existing = deduped.get(key)
    if (!existing || Math.abs(metric.value) > Math.abs(existing.value)) {
      deduped.set(key, metric)
    }
  }

  return {
    ticker,
    filing: filename,
    metrics: Array.from(deduped.values()),
    errors,
  }
}

/**
 * Download and parse a filing from Supabase Storage
 */
async function parseFilingFromStorage(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  filename: string
): Promise<ParseResult> {
  const { data: htmlBlob, error } = await supabase.storage
    .from('filings')
    .download(`html/${filename}`)

  if (error || !htmlBlob) {
    return {
      ticker,
      filing: filename,
      metrics: [],
      errors: [`Failed to download filing: ${error?.message || 'Unknown error'}`],
    }
  }

  const html = await htmlBlob.text()
  return parseFilingHtml(html, ticker, filename)
}

/**
 * List available filing HTML files for a ticker
 */
async function listFilings(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string
): Promise<string[]> {
  const { data: files, error } = await supabase.storage.from('filings').list('html')

  if (error || !files) {
    console.error('Error listing filings:', error)
    return []
  }

  // Filter for this ticker's 10-K files (annual reports have segment data)
  const tickerLower = ticker.toLowerCase()
  return files
    .filter((f) => f.name.startsWith(`${tickerLower}-10-k`))
    .map((f) => f.name)
    .sort()
    .reverse() // Most recent first
}

/**
 * Ingest parsed metrics into company_metrics table
 */
async function ingestToDatabase(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  metrics: ParsedMetric[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = []

  // Prepare rows
  const rows = metrics.map((m) => ({
    symbol: ticker.toUpperCase(),
    year: m.fiscalYear,
    period: 'FY',
    metric_name: m.metricName,
    metric_category: m.metricCategory,
    metric_value: m.value,
    unit: m.unit,
    dimension_type: m.dimensionType,
    dimension_value: m.dimensionValue,
    data_source: 'SEC-XBRL',
  }))

  if (rows.length === 0) {
    return { inserted: 0, errors: ['No metric data to ingest'] }
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
 * Display parsed metrics
 */
function displayResults(results: ParseResult[]) {
  for (const result of results) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Filing: ${result.filing}`)
    console.log(`${'='.repeat(60)}`)

    if (result.errors.length > 0) {
      console.log('\nErrors:')
      result.errors.forEach((e) => console.log(`  - ${e}`))
    }

    if (result.metrics.length === 0) {
      console.log('\nNo metrics found')
      continue
    }

    // Group by fiscal year and metric name
    const byYearAndMetric = new Map<string, ParsedMetric[]>()
    for (const metric of result.metrics) {
      const key = `${metric.fiscalYear}-${metric.metricName}`
      if (!byYearAndMetric.has(key)) {
        byYearAndMetric.set(key, [])
      }
      byYearAndMetric.get(key)!.push(metric)
    }

    // Get unique years and metrics
    const years = [...new Set(result.metrics.map((m) => m.fiscalYear))].sort().reverse()
    const metricNames = [...new Set(result.metrics.map((m) => m.metricName))]

    for (const year of years) {
      console.log(`\nFY ${year}:`)

      for (const metricName of metricNames) {
        const key = `${year}-${metricName}`
        const items = byYearAndMetric.get(key) || []
        if (items.length === 0) continue

        console.log(`  ${metricName}:`)
        items
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          .forEach((m) => {
            const valueStr =
              m.unit === 'currency'
                ? `$${(m.value / 1e9).toFixed(2)}B`
                : m.unit === 'percentage'
                  ? `${m.value.toFixed(2)}%`
                  : m.value.toLocaleString()
            console.log(`    ${(m.dimensionValue || 'Total').padEnd(30)} ${valueStr}`)
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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && args[i + 1]) {
      ticker = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--filing' && args[i + 1]) {
      specificFiling = args[i + 1]
      i++
    } else if (args[i] === '--ingest') {
      shouldIngest = true
    }
  }

  console.log(`iXBRL Metrics Parser`)
  console.log(`Ticker: ${ticker}`)
  console.log(`Mode: ${shouldIngest ? 'Parse + Ingest' : 'Parse Only (dry run)'}`)

  // Check if ticker is supported
  const mappings = getMappingsForTicker(ticker)
  if (!mappings) {
    console.error(`\nError: No mappings found for ticker ${ticker}`)
    console.error('Supported tickers: AAPL')
    process.exit(1)
  }

  console.log(`\nMetrics to extract:`)
  mappings.metrics.forEach((m) => {
    console.log(`  - ${m.metricName} (${m.metricCategory})`)
  })

  const supabase = getSupabaseClient()

  // Get filings to parse
  let filingsToProcess: string[]

  if (specificFiling) {
    filingsToProcess = [specificFiling]
  } else {
    console.log('\nListing available filings...')
    filingsToProcess = await listFilings(supabase, ticker)
    console.log(`Found ${filingsToProcess.length} 10-K filings`)
  }

  if (filingsToProcess.length === 0) {
    console.error('No filings found to process')
    process.exit(1)
  }

  // Parse each filing
  const results: ParseResult[] = []

  for (const filename of filingsToProcess) {
    console.log(`\nParsing: ${filename}...`)
    const result = await parseFilingFromStorage(supabase, ticker, filename)
    results.push(result)
    console.log(`  Found ${result.metrics.length} metric records`)
  }

  // Display results
  displayResults(results)

  // Aggregate all metrics and deduplicate (same FY/metric may appear in multiple filings)
  const allMetrics = results.flatMap((r) => r.metrics)
  const dedupedMap = new Map<string, ParsedMetric>()
  for (const metric of allMetrics) {
    const key = `${metric.fiscalYear}-${metric.metricName}-${metric.dimensionType}-${metric.dimensionValue}`
    // Keep the first occurrence (most recent filing has priority)
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, metric)
    }
  }
  const dedupedMetrics = Array.from(dedupedMap.values())

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  console.log(`Total filings processed: ${results.length}`)
  console.log(`Total metric records (raw): ${allMetrics.length}`)
  console.log(`Unique metric records (deduplicated): ${dedupedMetrics.length}`)

  // Count by metric name
  const byMetricName = new Map<string, number>()
  for (const m of dedupedMetrics) {
    byMetricName.set(m.metricName, (byMetricName.get(m.metricName) || 0) + 1)
  }
  console.log('\nBy metric:')
  byMetricName.forEach((count, name) => {
    console.log(`  ${name}: ${count}`)
  })

  // Ingest if requested
  if (shouldIngest) {
    console.log('\nIngesting to database...')
    const { inserted, errors } = await ingestToDatabase(supabase, ticker, dedupedMetrics)

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
