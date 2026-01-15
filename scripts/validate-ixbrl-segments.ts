/**
 * Validate iXBRL Parser Output Against Existing Data
 *
 * Compares segment revenue data parsed from SEC filings against
 * existing data in the company_metrics table.
 *
 * Usage:
 *   npx tsx scripts/validate-ixbrl-segments.ts --ticker AAPL
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import {
  getMappingsForTicker,
  getSegmentDisplayName,
  getSegmentTypeFromAxis,
  getFiscalYearFromPeriodEnd,
  type SegmentType,
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

interface SegmentRevenue {
  fiscalYear: number
  segmentType: SegmentType
  segmentName: string
  value: number
}

interface ValidationResult {
  fiscalYear: number
  segmentType: SegmentType
  segmentName: string
  parsedValue: number | null
  existingValue: number | null
  difference: number | null
  percentDiff: number | null
  status: 'match' | 'mismatch' | 'missing_parsed' | 'missing_existing'
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

  const headerMatch = html.match(/<ix:header[^>]*>([\s\S]*?)<\/ix:header>/i)
  if (!headerMatch) return contexts

  const header = headerMatch[1]
  const contextRegex = /<xbrli:context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi
  let match

  while ((match = contextRegex.exec(header)) !== null) {
    const contextId = match[1]
    const contextContent = match[2]

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

    const dimensions: XBRLContext['dimensions'] = []
    const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/gi
    let dimMatch

    while ((dimMatch = dimRegex.exec(contextContent)) !== null) {
      dimensions.push({ axis: dimMatch[1], member: dimMatch[2] })
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
  const factRegex = /<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/gi
  let match

  while ((match = factRegex.exec(html)) !== null) {
    const attrs = match[1]
    const rawValue = match[2].replace(/,/g, '').trim()

    const nameMatch = attrs.match(/name="([^"]+)"/i)
    const contextMatch = attrs.match(/contextRef="([^"]+)"/i)
    const scaleMatch = attrs.match(/scale="([^"]+)"/i)

    if (!nameMatch || !contextMatch) continue

    const name = nameMatch[1]
    if (!name.toLowerCase().includes('revenue')) continue

    const scale = scaleMatch ? parseInt(scaleMatch[1]) : 0
    let value = parseFloat(rawValue)
    if (isNaN(value)) continue

    if (scale) {
      value = value * Math.pow(10, scale)
    }

    facts.push({ name, contextId: contextMatch[1], value, scale })
  }

  return facts
}

/**
 * Extract segment revenue from parsed data
 */
function extractSegmentRevenue(
  contexts: Map<string, XBRLContext>,
  facts: XBRLFact[]
): SegmentRevenue[] {
  const segments: SegmentRevenue[] = []

  for (const fact of facts) {
    const context = contexts.get(fact.contextId)
    if (!context || context.dimensions.length === 0) continue

    for (const dim of context.dimensions) {
      const segmentType = getSegmentTypeFromAxis(dim.axis)
      if (!segmentType) continue

      const segmentName = getSegmentDisplayName(dim.member)
      if (!segmentName) continue

      const periodEnd = context.period?.end || context.period?.date
      if (!periodEnd) continue

      if (context.period?.type !== 'duration') continue

      const fiscalYear = getFiscalYearFromPeriodEnd(periodEnd)

      segments.push({ fiscalYear, segmentType, segmentName, value: fact.value })
    }
  }

  // Deduplicate
  const deduped = new Map<string, SegmentRevenue>()
  for (const seg of segments) {
    const key = `${seg.fiscalYear}-${seg.segmentType}-${seg.segmentName}`
    const existing = deduped.get(key)
    if (!existing || seg.value > existing.value) {
      deduped.set(key, seg)
    }
  }

  return Array.from(deduped.values())
}

/**
 * Fetch existing segment data from database
 */
async function fetchExistingData(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string
): Promise<SegmentRevenue[]> {
  const { data, error } = await supabase
    .from('company_metrics')
    .select('year, dimension_type, dimension_value, metric_value')
    .eq('symbol', ticker.toUpperCase())
    .eq('metric_name', 'segment_revenue')
    .order('year', { ascending: false })

  if (error || !data) {
    console.error('Error fetching existing data:', error)
    return []
  }

  return data.map((row) => ({
    fiscalYear: row.year,
    segmentType: row.dimension_type as SegmentType,
    segmentName: row.dimension_value,
    value: row.metric_value,
  }))
}

/**
 * Compare parsed data against existing data
 */
function compareData(
  parsed: SegmentRevenue[],
  existing: SegmentRevenue[],
  tolerancePercent: number = 0.1
): ValidationResult[] {
  const results: ValidationResult[] = []

  // Create lookup maps
  const parsedMap = new Map<string, SegmentRevenue>()
  for (const seg of parsed) {
    const key = `${seg.fiscalYear}-${seg.segmentType}-${seg.segmentName}`
    parsedMap.set(key, seg)
  }

  const existingMap = new Map<string, SegmentRevenue>()
  for (const seg of existing) {
    const key = `${seg.fiscalYear}-${seg.segmentType}-${seg.segmentName}`
    existingMap.set(key, seg)
  }

  // Get all unique keys
  const allKeys = new Set([...parsedMap.keys(), ...existingMap.keys()])

  for (const key of allKeys) {
    const parsedSeg = parsedMap.get(key)
    const existingSeg = existingMap.get(key)

    // Extract year/type/name from key
    const [year, type, ...nameParts] = key.split('-')
    const name = nameParts.join('-')

    if (!parsedSeg && existingSeg) {
      results.push({
        fiscalYear: parseInt(year),
        segmentType: type as SegmentType,
        segmentName: name,
        parsedValue: null,
        existingValue: existingSeg.value,
        difference: null,
        percentDiff: null,
        status: 'missing_parsed',
      })
    } else if (parsedSeg && !existingSeg) {
      results.push({
        fiscalYear: parseInt(year),
        segmentType: type as SegmentType,
        segmentName: name,
        parsedValue: parsedSeg.value,
        existingValue: null,
        difference: null,
        percentDiff: null,
        status: 'missing_existing',
      })
    } else if (parsedSeg && existingSeg) {
      const difference = parsedSeg.value - existingSeg.value
      const percentDiff = (difference / existingSeg.value) * 100

      const status = Math.abs(percentDiff) <= tolerancePercent ? 'match' : 'mismatch'

      results.push({
        fiscalYear: parseInt(year),
        segmentType: type as SegmentType,
        segmentName: name,
        parsedValue: parsedSeg.value,
        existingValue: existingSeg.value,
        difference,
        percentDiff,
        status,
      })
    }
  }

  // Sort by year desc, then type, then name
  results.sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) return b.fiscalYear - a.fiscalYear
    if (a.segmentType !== b.segmentType) return a.segmentType.localeCompare(b.segmentType)
    return a.segmentName.localeCompare(b.segmentName)
  })

  return results
}

/**
 * Display validation results
 */
function displayResults(results: ValidationResult[]) {
  console.log('\n' + '='.repeat(100))
  console.log('VALIDATION RESULTS')
  console.log('='.repeat(100))

  // Summary counts
  const counts = {
    match: 0,
    mismatch: 0,
    missing_parsed: 0,
    missing_existing: 0,
  }

  for (const r of results) {
    counts[r.status]++
  }

  console.log(`\nSummary:`)
  console.log(`  Matches (within tolerance): ${counts.match}`)
  console.log(`  Mismatches: ${counts.mismatch}`)
  console.log(`  Missing from parsed: ${counts.missing_parsed}`)
  console.log(`  Missing from existing: ${counts.missing_existing}`)

  // Detailed results by status
  if (counts.mismatch > 0) {
    console.log('\n--- MISMATCHES ---')
    console.log(
      'Year  Type        Segment                             Parsed          Existing        Diff %'
    )
    console.log('-'.repeat(100))

    for (const r of results.filter((r) => r.status === 'mismatch')) {
      const parsed = r.parsedValue ? `$${(r.parsedValue / 1e9).toFixed(2)}B` : 'N/A'
      const existing = r.existingValue ? `$${(r.existingValue / 1e9).toFixed(2)}B` : 'N/A'
      const pctDiff = r.percentDiff !== null ? `${r.percentDiff.toFixed(2)}%` : 'N/A'

      console.log(
        `${r.fiscalYear}  ${r.segmentType.padEnd(10)}  ${r.segmentName.padEnd(35)} ${parsed.padStart(12)}  ${existing.padStart(12)}  ${pctDiff.padStart(8)}`
      )
    }
  }

  if (counts.missing_parsed > 0) {
    console.log('\n--- MISSING FROM PARSED (in DB but not in filing) ---')
    for (const r of results.filter((r) => r.status === 'missing_parsed')) {
      const existing = r.existingValue ? `$${(r.existingValue / 1e9).toFixed(2)}B` : 'N/A'
      console.log(`  FY${r.fiscalYear} ${r.segmentType}/${r.segmentName}: ${existing}`)
    }
  }

  if (counts.missing_existing > 0) {
    console.log('\n--- MISSING FROM EXISTING (in filing but not in DB) ---')
    for (const r of results.filter((r) => r.status === 'missing_existing')) {
      const parsed = r.parsedValue ? `$${(r.parsedValue / 1e9).toFixed(2)}B` : 'N/A'
      console.log(`  FY${r.fiscalYear} ${r.segmentType}/${r.segmentName}: ${parsed}`)
    }
  }

  if (counts.match > 0) {
    console.log('\n--- MATCHES ---')
    console.log(
      'Year  Type        Segment                             Parsed          Existing        Diff %'
    )
    console.log('-'.repeat(100))

    for (const r of results.filter((r) => r.status === 'match')) {
      const parsed = r.parsedValue ? `$${(r.parsedValue / 1e9).toFixed(2)}B` : 'N/A'
      const existing = r.existingValue ? `$${(r.existingValue / 1e9).toFixed(2)}B` : 'N/A'
      const pctDiff = r.percentDiff !== null ? `${r.percentDiff.toFixed(4)}%` : 'N/A'

      console.log(
        `${r.fiscalYear}  ${r.segmentType.padEnd(10)}  ${r.segmentName.padEnd(35)} ${parsed.padStart(12)}  ${existing.padStart(12)}  ${pctDiff.padStart(10)}`
      )
    }
  }

  // Overall score
  const total = results.length
  const passing = counts.match + counts.missing_existing // missing_existing is OK (new data)
  const score = total > 0 ? (passing / total) * 100 : 0

  console.log('\n' + '='.repeat(100))
  console.log(`VALIDATION SCORE: ${score.toFixed(1)}% (${passing}/${total} passing)`)
  console.log('='.repeat(100))

  if (score === 100) {
    console.log('\n✓ All parsed values match existing data!')
  } else if (score >= 90) {
    console.log('\n⚠ Most values match, but some discrepancies found.')
  } else {
    console.log('\n✗ Significant discrepancies found. Review the mismatches above.')
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)

  let ticker = 'AAPL'
  let tolerance = 0.1 // 0.1% tolerance

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticker' && args[i + 1]) {
      ticker = args[i + 1].toUpperCase()
      i++
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      tolerance = parseFloat(args[i + 1])
      i++
    }
  }

  console.log(`iXBRL Segment Validator`)
  console.log(`Ticker: ${ticker}`)
  console.log(`Tolerance: ${tolerance}%`)

  const mappings = getMappingsForTicker(ticker)
  if (!mappings) {
    console.error(`\nError: No mappings found for ticker ${ticker}`)
    process.exit(1)
  }

  const supabase = getSupabaseClient()

  // List and parse filings
  console.log('\nFetching filings from storage...')
  const { data: files } = await supabase.storage.from('filings').list('html')

  const tickerLower = ticker.toLowerCase()
  const filingNames =
    files
      ?.filter((f) => f.name.startsWith(`${tickerLower}-10-k`))
      .map((f) => f.name)
      .sort()
      .reverse() || []

  console.log(`Found ${filingNames.length} 10-K filings`)

  // Parse all filings
  const allParsed: SegmentRevenue[] = []

  for (const filename of filingNames) {
    console.log(`Parsing: ${filename}...`)

    const { data: htmlBlob, error } = await supabase.storage
      .from('filings')
      .download(`html/${filename}`)

    if (error || !htmlBlob) {
      console.error(`  Error downloading: ${error?.message}`)
      continue
    }

    const html = await htmlBlob.text()
    const contexts = parseContexts(html)
    const facts = parseFacts(html)
    const segments = extractSegmentRevenue(contexts, facts)

    allParsed.push(...segments)
    console.log(`  Found ${segments.length} segment records`)
  }

  // Deduplicate parsed data
  const parsedMap = new Map<string, SegmentRevenue>()
  for (const seg of allParsed) {
    const key = `${seg.fiscalYear}-${seg.segmentType}-${seg.segmentName}`
    const existing = parsedMap.get(key)
    if (!existing || seg.value > existing.value) {
      parsedMap.set(key, seg)
    }
  }
  const parsedDeduped = Array.from(parsedMap.values())

  // Fetch existing data
  console.log('\nFetching existing data from database...')
  const existing = await fetchExistingData(supabase, ticker)
  console.log(`Found ${existing.length} existing records`)

  // Compare
  console.log('\nComparing parsed vs existing...')
  const results = compareData(parsedDeduped, existing, tolerance)

  // Display results
  displayResults(results)
}

main().catch(console.error)
