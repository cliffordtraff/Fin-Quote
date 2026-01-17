/**
 * Phase 1: Ingest S&P 500 constituents into Supabase
 *
 * Reads the JSON file created by fetch-sp500-constituents.ts and upserts
 * into the sp500_constituents table.
 *
 * Usage:
 *   npx tsx scripts/sp500/ingest-sp500-constituents.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

interface SP500Constituent {
  symbol: string
  name: string
  sector: string
  sub_industry: string
  headquarters_location: string
  date_added: string | null
  cik: string | null
  is_active: boolean
  alternate_symbols: Record<string, string>
}

interface IngestionResult {
  inserted: number
  updated: number
  errors: string[]
}

async function ingestConstituents(
  supabase: ReturnType<typeof createClient>,
  constituents: SP500Constituent[]
): Promise<IngestionResult> {
  const result: IngestionResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  }

  // Process in batches of 50 for efficiency
  const BATCH_SIZE = 50
  const batches: SP500Constituent[][] = []

  for (let i = 0; i < constituents.length; i += BATCH_SIZE) {
    batches.push(constituents.slice(i, i + BATCH_SIZE))
  }

  console.log(`Processing ${constituents.length} constituents in ${batches.length} batches...\n`)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    process.stdout.write(`  Batch ${i + 1}/${batches.length} (${batch.length} records)... `)

    // Transform to database format
    const records = batch.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      sector: c.sector,
      sub_industry: c.sub_industry,
      headquarters_location: c.headquarters_location,
      date_added: c.date_added,
      cik: c.cik,
      is_active: c.is_active,
      alternate_symbols: c.alternate_symbols,
      data_status: {}, // Empty initially, will be updated during data ingestion
    }))

    // Upsert batch
    const { data, error } = await supabase
      .from('sp500_constituents')
      .upsert(records, {
        onConflict: 'symbol',
        ignoreDuplicates: false,
      })
      .select('symbol')

    if (error) {
      console.log(`✗ Error: ${error.message}`)
      result.errors.push(`Batch ${i + 1}: ${error.message}`)
    } else {
      // Note: Supabase upsert doesn't tell us if it was insert vs update
      // We count all as "upserted" for simplicity
      result.inserted += data?.length || 0
      console.log(`✓ ${data?.length || 0} records`)
    }
  }

  return result
}

async function verifyIngestion(
  supabase: ReturnType<typeof createClient>,
  expectedCount: number
): Promise<boolean> {
  console.log('\nVerifying ingestion...\n')

  // Count total records
  const { count, error: countError } = await supabase
    .from('sp500_constituents')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error(`  ✗ Count query failed: ${countError.message}`)
    return false
  }

  console.log(`  Total records in table: ${count}`)
  console.log(`  Expected: ${expectedCount}`)

  if (count !== expectedCount) {
    console.log(`  ✗ Count mismatch!`)
    return false
  }

  // Check sector distribution
  const { data: sectorData, error: sectorError } = await supabase
    .from('sp500_constituents')
    .select('sector')

  if (sectorError) {
    console.error(`  ✗ Sector query failed: ${sectorError.message}`)
    return false
  }

  const sectorCounts = new Map<string, number>()
  for (const row of sectorData || []) {
    const sector = row.sector || 'Unknown'
    sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1)
  }

  console.log('\n  Sector distribution:')
  const sortedSectors = Array.from(sectorCounts.entries()).sort((a, b) => b[1] - a[1])
  for (const [sector, count] of sortedSectors) {
    console.log(`    ${sector}: ${count}`)
  }

  // Verify special symbols
  const { data: specialData } = await supabase
    .from('sp500_constituents')
    .select('symbol, alternate_symbols')
    .not('alternate_symbols', 'eq', '{}')

  if (specialData && specialData.length > 0) {
    console.log('\n  Special symbols verified:')
    for (const row of specialData) {
      console.log(`    ${row.symbol}: ${JSON.stringify(row.alternate_symbols)}`)
    }
  }

  console.log('\n  ✓ Verification passed!')
  return true
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 1: Ingest S&P 500 Constituents')
  console.log('='.repeat(60))
  console.log()

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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials')
    process.exit(1)
  }

  // Read constituent data
  const inputPath = path.join(process.cwd(), 'data', 'sp500-constituents.json')
  let constituents: SP500Constituent[]

  try {
    const content = await fs.readFile(inputPath, 'utf-8')
    constituents = JSON.parse(content)
    console.log(`Loaded ${constituents.length} constituents from ${inputPath}\n`)
  } catch (err) {
    console.error(`Error: Could not read ${inputPath}`)
    console.error('Run fetch-sp500-constituents.ts first')
    process.exit(1)
  }

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Ingest data
  const result = await ingestConstituents(supabase, constituents)

  // Verify ingestion
  const verified = await verifyIngestion(supabase, constituents.length)

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('INGESTION SUMMARY')
  console.log('='.repeat(60))
  console.log(`\nRecords upserted: ${result.inserted}`)
  console.log(`Errors: ${result.errors.length}`)
  console.log(`Verified: ${verified ? 'Yes' : 'No'}`)

  if (result.errors.length > 0) {
    console.log('\nErrors:')
    for (const error of result.errors) {
      console.log(`  - ${error}`)
    }
    process.exit(1)
  }

  if (!verified) {
    console.error('\n✗ Verification failed!')
    process.exit(1)
  }

  console.log('\n✓ Phase 1 complete! S&P 500 constituents ingested successfully.')
  console.log('\nNext steps:')
  console.log('  1. Review the data in Supabase dashboard')
  console.log('  2. Continue to Phase 2: Financial Data Ingestion')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
