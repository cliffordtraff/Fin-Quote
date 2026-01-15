/**
 * Check 10-Q Storage
 *
 * Verifies which 10-Q HTML files exist in Supabase Storage
 * and compares against available filing metadata.
 *
 * Usage:
 *   npx tsx scripts/check-10q-storage.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

// Supabase client
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient(url, key)
}

interface FilingMetadata {
  ticker: string
  filing_type: string
  filing_date: string
  period_end_date: string
  accession_number: string
  document_url: string
  fiscal_year: number
  fiscal_quarter: number | null
}

/**
 * Get fiscal quarter from period end date (Apple calendar)
 */
function getFiscalQuarter(periodEnd: string): { fiscalYear: number; fiscalQuarter: 1 | 2 | 3 } {
  const date = new Date(periodEnd)
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  if (month >= 10 && month <= 12) {
    // Oct-Dec = Q1 of NEXT fiscal year
    return { fiscalYear: year + 1, fiscalQuarter: 1 }
  } else if (month >= 1 && month <= 3) {
    // Jan-Mar = Q2
    return { fiscalYear: year, fiscalQuarter: 2 }
  } else if (month >= 4 && month <= 6) {
    // Apr-Jun = Q3
    return { fiscalYear: year, fiscalQuarter: 3 }
  } else {
    // Jul-Sep = Q4 (covered by 10-K, shouldn't be in 10-Q)
    return { fiscalYear: year, fiscalQuarter: 3 } // Fallback
  }
}

async function main() {
  console.log('10-Q Storage Check')
  console.log('==================\n')

  const supabase = getSupabaseClient()

  // 1. List all files in storage
  console.log('Fetching files from Supabase Storage...')
  const { data: storageFiles, error: storageError } = await supabase.storage
    .from('filings')
    .list('html')

  if (storageError) {
    console.error('Error listing storage:', storageError.message)
    process.exit(1)
  }

  // Separate 10-K and 10-Q files
  const files10K = storageFiles?.filter(f => f.name.toLowerCase().includes('10-k')) || []
  const files10Q = storageFiles?.filter(f => f.name.toLowerCase().includes('10-q')) || []
  const otherFiles = storageFiles?.filter(f =>
    !f.name.toLowerCase().includes('10-k') &&
    !f.name.toLowerCase().includes('10-q')
  ) || []

  console.log(`\nStorage contents:`)
  console.log(`  10-K files: ${files10K.length}`)
  console.log(`  10-Q files: ${files10Q.length}`)
  console.log(`  Other files: ${otherFiles.length}`)

  if (files10K.length > 0) {
    console.log(`\n10-K files in storage:`)
    files10K.forEach(f => console.log(`  - ${f.name}`))
  }

  if (files10Q.length > 0) {
    console.log(`\n10-Q files in storage:`)
    files10Q.forEach(f => console.log(`  - ${f.name}`))
  }

  // 2. Load filing metadata
  console.log('\n\nLoading filing metadata...')
  const metadataPath = path.join(process.cwd(), 'data', 'aapl-filings.json')

  if (!fs.existsSync(metadataPath)) {
    console.error('Filing metadata not found at:', metadataPath)
    process.exit(1)
  }

  const filings: FilingMetadata[] = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
  const filings10Q = filings.filter(f => f.filing_type === '10-Q')
  const filings10K = filings.filter(f => f.filing_type === '10-K')

  console.log(`\nFiling metadata:`)
  console.log(`  10-K filings: ${filings10K.length}`)
  console.log(`  10-Q filings: ${filings10Q.length}`)

  // 3. Calculate expected file names for 10-Q
  console.log('\n\nExpected 10-Q files:')
  console.log('-------------------')

  const expectedFiles: { filename: string; periodEnd: string; url: string }[] = []

  for (const filing of filings10Q) {
    const { fiscalYear, fiscalQuarter } = getFiscalQuarter(filing.period_end_date)
    const filename = `aapl-10-q-${fiscalYear}-q${fiscalQuarter}.html`
    expectedFiles.push({
      filename,
      periodEnd: filing.period_end_date,
      url: filing.document_url,
    })
    console.log(`  ${filename} (period: ${filing.period_end_date})`)
  }

  // 4. Compare expected vs actual
  console.log('\n\nComparison:')
  console.log('-----------')

  const existingFilenames = files10Q.map(f => f.name.toLowerCase())
  const missing: typeof expectedFiles = []
  const present: typeof expectedFiles = []

  for (const expected of expectedFiles) {
    if (existingFilenames.includes(expected.filename.toLowerCase())) {
      present.push(expected)
    } else {
      missing.push(expected)
    }
  }

  console.log(`\nFiles present in storage: ${present.length}`)
  if (present.length > 0) {
    present.forEach(f => console.log(`  ✓ ${f.filename}`))
  }

  console.log(`\nFiles MISSING from storage: ${missing.length}`)
  if (missing.length > 0) {
    missing.forEach(f => console.log(`  ✗ ${f.filename} (${f.periodEnd})`))
  }

  // 5. Summary
  console.log('\n\n==================')
  console.log('SUMMARY')
  console.log('==================')
  console.log(`Total 10-Q filings in metadata: ${filings10Q.length}`)
  console.log(`10-Q files in storage: ${files10Q.length}`)
  console.log(`Expected files present: ${present.length}`)
  console.log(`Expected files missing: ${missing.length}`)

  if (missing.length > 0) {
    console.log('\nNext step: Run download script to fetch missing files')
    console.log('  npx tsx scripts/download-10q-filings.ts')
  } else if (files10Q.length === 0) {
    console.log('\nNo 10-Q files in storage. Need to download all.')
    console.log('  npx tsx scripts/download-10q-filings.ts')
  } else {
    console.log('\nAll expected 10-Q files are present!')
  }

  // Output missing files for download script
  if (missing.length > 0) {
    const outputPath = path.join(process.cwd(), 'data', 'missing-10q-filings.json')
    fs.writeFileSync(outputPath, JSON.stringify(missing, null, 2))
    console.log(`\nMissing files list saved to: ${outputPath}`)
  }
}

main().catch(console.error)
