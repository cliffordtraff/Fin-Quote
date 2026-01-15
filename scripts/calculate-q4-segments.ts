/**
 * Calculate Q4 Segment Data
 *
 * Calculates Q4 segment revenue as: Q4 = FY - Q1 - Q2 - Q3
 * Since 10-Q filings don't cover Q4 (only 10-K covers the full year),
 * we derive Q4 by subtracting quarterly values from the annual total.
 *
 * Usage:
 *   npx tsx scripts/calculate-q4-segments.ts           # Dry run
 *   npx tsx scripts/calculate-q4-segments.ts --ingest  # Calculate and save
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

interface SegmentRecord {
  year: number
  period: string
  dimension_type: string
  dimension_value: string
  metric_value: number
}

interface Q4Calculation {
  year: number
  dimension_type: string
  dimension_value: string
  fyValue: number
  q1Value: number
  q2Value: number
  q3Value: number
  q4Value: number
  isValid: boolean
  validationNote: string
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

async function main() {
  const args = process.argv.slice(2)
  const shouldIngest = args.includes('--ingest')

  console.log('Q4 Segment Calculator')
  console.log('=====================')
  console.log(`Mode: ${shouldIngest ? 'Calculate + Ingest' : 'Calculate Only (dry run)'}\n`)

  const supabase = getSupabaseClient()

  // Fetch all segment data
  console.log('Fetching segment data...')
  const { data: allData, error } = await supabase
    .from('company_metrics')
    .select('year, period, dimension_type, dimension_value, metric_value')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'segment_revenue')
    .order('year', { ascending: false })

  if (error || !allData) {
    console.error('Error fetching data:', error)
    process.exit(1)
  }

  console.log(`Found ${allData.length} total segment records`)

  // Group by year and segment
  const byYearAndSegment = new Map<string, Map<string, number>>()

  for (const row of allData) {
    const segmentKey = `${row.year}-${row.dimension_type}-${row.dimension_value}`
    if (!byYearAndSegment.has(segmentKey)) {
      byYearAndSegment.set(segmentKey, new Map())
    }
    byYearAndSegment.get(segmentKey)!.set(row.period, row.metric_value)
  }

  // Calculate Q4 for each year/segment combination
  const calculations: Q4Calculation[] = []
  const yearsProcessed = new Set<number>()

  for (const [segmentKey, periods] of byYearAndSegment) {
    const [yearStr, dimType, ...dimValueParts] = segmentKey.split('-')
    const year = parseInt(yearStr)
    const dimValue = dimValueParts.join('-') // Handle names with hyphens

    yearsProcessed.add(year)

    const fyValue = periods.get('FY')
    const q1Value = periods.get('Q1')
    const q2Value = periods.get('Q2')
    const q3Value = periods.get('Q3')
    const existingQ4 = periods.get('Q4')

    // Skip if we don't have FY data
    if (fyValue === undefined) continue

    // Skip if Q4 already exists
    if (existingQ4 !== undefined) {
      console.log(`  Q4 already exists for ${year} ${dimType}/${dimValue}: $${(existingQ4 / 1e9).toFixed(2)}B`)
      continue
    }

    // Need at least Q1, Q2, Q3 to calculate Q4
    if (q1Value === undefined || q2Value === undefined || q3Value === undefined) {
      continue // Missing quarterly data
    }

    // Calculate Q4
    const q4Value = fyValue - q1Value - q2Value - q3Value

    // Validate: Q4 should be positive and reasonable (not more than FY or negative)
    let isValid = true
    let validationNote = ''

    if (q4Value < 0) {
      isValid = false
      validationNote = `Negative Q4 value: $${(q4Value / 1e9).toFixed(2)}B`
    } else if (q4Value > fyValue * 0.5) {
      // Q4 shouldn't be more than 50% of annual (sanity check)
      validationNote = `Large Q4 (>${(q4Value / fyValue * 100).toFixed(0)}% of FY)`
    }

    // Verify sum: Q1+Q2+Q3+Q4 should equal FY
    const quarterSum = q1Value + q2Value + q3Value + q4Value
    const sumDiff = Math.abs(quarterSum - fyValue)
    if (sumDiff > 1000) { // Allow $1000 rounding difference
      validationNote += ` Sum diff: $${sumDiff.toFixed(0)}`
    }

    calculations.push({
      year,
      dimension_type: dimType,
      dimension_value: dimValue,
      fyValue,
      q1Value,
      q2Value,
      q3Value,
      q4Value,
      isValid,
      validationNote,
    })
  }

  // Display results
  console.log(`\n${'='.repeat(80)}`)
  console.log('Q4 CALCULATIONS')
  console.log(`${'='.repeat(80)}`)

  // Group by year for display
  const byYear = new Map<number, Q4Calculation[]>()
  for (const calc of calculations) {
    if (!byYear.has(calc.year)) {
      byYear.set(calc.year, [])
    }
    byYear.get(calc.year)!.push(calc)
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => b - a)

  for (const year of sortedYears) {
    const yearCalcs = byYear.get(year)!
    console.log(`\nFY ${year} Q4:`)

    // Product segments
    const products = yearCalcs.filter(c => c.dimension_type === 'product')
    if (products.length > 0) {
      console.log('  Product Segments:')
      for (const calc of products.sort((a, b) => b.q4Value - a.q4Value)) {
        const q4B = (calc.q4Value / 1e9).toFixed(2)
        const status = calc.isValid ? '✓' : '✗'
        const note = calc.validationNote ? ` (${calc.validationNote})` : ''
        console.log(`    ${status} ${calc.dimension_value.padEnd(35)} $${q4B}B${note}`)
      }
    }

    // Geographic segments
    const geos = yearCalcs.filter(c => c.dimension_type === 'geographic')
    if (geos.length > 0) {
      console.log('  Geographic Segments:')
      for (const calc of geos.sort((a, b) => b.q4Value - a.q4Value)) {
        const q4B = (calc.q4Value / 1e9).toFixed(2)
        const status = calc.isValid ? '✓' : '✗'
        const note = calc.validationNote ? ` (${calc.validationNote})` : ''
        console.log(`    ${status} ${calc.dimension_value.padEnd(35)} $${q4B}B${note}`)
      }
    }
  }

  // Summary
  const validCount = calculations.filter(c => c.isValid).length
  const invalidCount = calculations.filter(c => !c.isValid).length

  console.log(`\n${'='.repeat(80)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(80)}`)
  console.log(`Years with Q4 calculations: ${sortedYears.join(', ')}`)
  console.log(`Total Q4 values calculated: ${calculations.length}`)
  console.log(`  Valid: ${validCount}`)
  console.log(`  Invalid: ${invalidCount}`)

  // Ingest if requested
  if (shouldIngest && validCount > 0) {
    const validCalcs = calculations.filter(c => c.isValid)

    console.log('\nIngesting valid Q4 data to database...')

    const rows = validCalcs.map(calc => ({
      symbol: 'AAPL',
      year: calc.year,
      period: 'Q4',
      metric_name: 'segment_revenue',
      metric_category: 'segment_reporting',
      metric_value: calc.q4Value,
      unit: 'currency',
      dimension_type: calc.dimension_type,
      dimension_value: calc.dimension_value,
      data_source: 'Calculated', // Mark as calculated, not from filing
    }))

    const { data, error: insertError } = await supabase
      .from('company_metrics')
      .upsert(rows, {
        onConflict: 'symbol,year,period,metric_name,dimension_type,dimension_value',
      })
      .select()

    if (insertError) {
      console.error('Error inserting Q4 data:', insertError.message)
    } else {
      console.log(`Successfully ingested ${data?.length || 0} Q4 records`)
    }
  } else if (!shouldIngest) {
    console.log('\nDry run complete. Use --ingest to save Q4 data to database.')
  }
}

main().catch(console.error)
