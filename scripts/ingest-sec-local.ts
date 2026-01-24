/**
 * SEC Insider Trades Local Ingestion Script
 *
 * Parses SEC insider trading TSV files downloaded from:
 * https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets
 *
 * Usage:
 *   1. Download ZIP files from SEC website
 *   2. Extract them to data/sec-insiders/
 *   3. Run: npx tsx scripts/ingest-sec-local.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DATA_DIR = path.join(process.cwd(), 'data', 'sec-insiders')

// Parse a TSV file into a map keyed by ACCESSION_NUMBER
async function parseTsvToMap(filePath: string): Promise<Map<string, Record<string, string>[]>> {
  const map = new Map<string, Record<string, string>[]>()

  if (!fs.existsSync(filePath)) {
    return map
  }

  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  let headers: string[] = []
  let isFirst = true

  for await (const line of rl) {
    if (isFirst) {
      headers = line.split('\t')
      isFirst = false
      continue
    }

    const values = line.split('\t')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = values[i] || ''
    })

    const accession = row.ACCESSION_NUMBER
    if (accession) {
      if (!map.has(accession)) {
        map.set(accession, [])
      }
      map.get(accession)!.push(row)
    }
  }

  return map
}

// Parse date from SEC format (DD-MON-YYYY) to ISO format
function parseSecDate(dateStr: string): string | null {
  if (!dateStr) return null

  // Format: 29-DEC-2025
  const months: Record<string, string> = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  }

  const parts = dateStr.split('-')
  if (parts.length !== 3) return null

  const day = parts[0].padStart(2, '0')
  const month = months[parts[1].toUpperCase()]
  const year = parts[2]

  if (!month) return null

  return `${year}-${month}-${day}`
}

// Get transaction type description
function getTransactionType(code: string): string {
  const types: Record<string, string> = {
    'P': 'P-Purchase',
    'S': 'S-Sale',
    'A': 'A-Award',
    'D': 'D-Disposition',
    'F': 'F-Tax',
    'I': 'I-Discretionary',
    'M': 'M-Option Exercise',
    'C': 'C-Conversion',
    'E': 'E-Expiration',
    'G': 'G-Gift',
    'H': 'H-Expiration',
    'O': 'O-Other',
    'X': 'X-Exercise',
    'J': 'J-Other',
    'K': 'K-Equity Swap',
    'U': 'U-Tender',
    'W': 'W-Will',
    'Z': 'Z-Trust',
  }
  return types[code?.toUpperCase()] || code
}

async function processQuarter(quarterDir: string): Promise<{ inserted: number; skipped: number; errors: number }> {
  console.log(`\nProcessing: ${path.basename(quarterDir)}`)

  // Load all the TSV files
  console.log('  Loading SUBMISSION.tsv...')
  const submissions = await parseTsvToMap(path.join(quarterDir, 'SUBMISSION.tsv'))
  console.log(`    ${submissions.size} submissions`)

  console.log('  Loading REPORTINGOWNER.tsv...')
  const owners = await parseTsvToMap(path.join(quarterDir, 'REPORTINGOWNER.tsv'))
  console.log(`    ${owners.size} owner records`)

  console.log('  Loading NONDERIV_TRANS.tsv...')
  const transactions = await parseTsvToMap(path.join(quarterDir, 'NONDERIV_TRANS.tsv'))
  console.log(`    ${transactions.size} transaction groups`)

  let inserted = 0
  let skipped = 0
  let errors = 0
  let processed = 0

  // Process each accession number
  for (const [accession, transList] of transactions) {
    const submissionList = submissions.get(accession)
    const ownerList = owners.get(accession)

    if (!submissionList || submissionList.length === 0) {
      skipped += transList.length
      continue
    }

    const submission = submissionList[0]
    const symbol = submission.ISSUERTRADINGSYMBOL?.toUpperCase()
    const filingDateStr = parseSecDate(submission.FILING_DATE)

    if (!symbol || !filingDateStr) {
      skipped += transList.length
      continue
    }

    // Get owner info (may have multiple owners per filing)
    const ownerMap = new Map<string, Record<string, string>>()
    if (ownerList) {
      for (const owner of ownerList) {
        ownerMap.set(owner.RPTOWNERCIK, owner)
      }
    }

    // Process each transaction in this filing
    for (const trans of transList) {
      const shares = parseFloat(trans.TRANS_SHARES) || 0
      if (shares === 0) {
        skipped++
        continue
      }

      const transDateStr = parseSecDate(trans.TRANS_DATE)
      if (!transDateStr) {
        skipped++
        continue
      }

      // Get owner for this transaction (use first owner if multiple)
      const owner = ownerList && ownerList.length > 0 ? ownerList[0] : null
      const ownerName = owner?.RPTOWNERNAME || 'Unknown'
      const ownerCik = owner?.RPTOWNERCIK || null
      const ownerTitle = owner?.RPTOWNER_TITLE || null
      const ownerRelationship = owner?.RPTOWNER_RELATIONSHIP || null

      // Get or create insider
      const { data: insiderId } = await supabase.rpc('get_or_create_insider', {
        p_name: ownerName,
        p_cik: ownerCik
      })

      const price = parseFloat(trans.TRANS_PRICEPERSHARE) || null
      const sharesOwned = parseFloat(trans.SHRS_OWND_FOLWNG_TRANS) || null
      const transCode = trans.TRANS_CODE?.charAt(0)?.toUpperCase() || null
      const acqDisp = trans.TRANS_ACQUIRED_DISP_CD?.charAt(0)?.toUpperCase() || null

      const record = {
        insider_id: insiderId || null,
        symbol: symbol,
        accession_number: accession,
        filing_date: filingDateStr,
        transaction_date: transDateStr,
        transaction_type: getTransactionType(transCode || ''),
        transaction_code: transCode,
        acquisition_disposition: acqDisp,
        shares: Math.abs(shares),
        price: price,
        shares_owned_after: sharesOwned,
        reporting_name: ownerName,
        owner_type: ownerRelationship || 'other',
        officer_title: ownerTitle,
        security_name: trans.SECURITY_TITLE || null,
        form_type: trans.TRANS_FORM_TYPE || '4',
        source: 'sec',
        source_id: `${accession}-${trans.NONDERIV_TRANS_SK}`,
        sec_link: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ownerCik}&type=4`
      }

      // Insert (duplicates will fail on unique constraint)
      const { error: insertError } = await supabase
        .from('insider_transactions')
        .insert(record)

      if (insertError) {
        if (insertError.code === '23505') {
          skipped++ // Duplicate
        } else {
          errors++
          if (errors <= 5) {
            console.error(`  Error: ${insertError.message}`)
          }
        }
      } else {
        inserted++
      }

      processed++
      if (processed % 5000 === 0) {
        console.log(`  Progress: ${processed} transactions, ${inserted} inserted, ${skipped} skipped`)
      }
    }
  }

  console.log(`  Complete: ${processed} transactions, ${inserted} inserted, ${skipped} skipped, ${errors} errors`)
  return { inserted, skipped, errors }
}

async function findQuarterDirs(dir: string): Promise<string[]> {
  const dirs: string[] = []

  if (!fs.existsSync(dir)) {
    return dirs
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name)
      // Check if it has the expected TSV files
      if (fs.existsSync(path.join(fullPath, 'NONDERIV_TRANS.tsv'))) {
        dirs.push(fullPath)
      }
    }
  }

  return dirs.sort()
}

async function main() {
  console.log('SEC Insider Trades Local Ingestion')
  console.log('===================================')
  console.log(`Data directory: ${DATA_DIR}`)
  console.log('')

  // Find all quarter directories
  const quarterDirs = await findQuarterDirs(DATA_DIR)

  if (quarterDirs.length === 0) {
    console.log('No SEC data directories found!')
    console.log('')
    console.log('Instructions:')
    console.log('1. Go to: https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets')
    console.log('2. Download the ZIP files (e.g., 2024q4_form345.zip)')
    console.log('3. Extract them to: data/sec-insiders/')
    console.log('4. Run this script again')
    process.exit(0)
  }

  console.log(`Found ${quarterDirs.length} quarter(s):`)
  quarterDirs.forEach(d => console.log(`  - ${path.basename(d)}`))

  // Create ingestion log
  const startTime = Date.now()
  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'sec-local',
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  const logId = logEntry?.id

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  try {
    // Process each quarter
    for (const quarterDir of quarterDirs) {
      const result = await processQuarter(quarterDir)
      totalInserted += result.inserted
      totalSkipped += result.skipped
      totalErrors += result.errors
    }

    const duration = Date.now() - startTime

    // Update log
    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: totalErrors > 0 ? 'partial' : 'success',
          rows_inserted: totalInserted,
          rows_skipped: totalSkipped,
          error_message: totalErrors > 0 ? `${totalErrors} errors` : null,
          duration_ms: duration
        })
        .eq('id', logId)
    }

    console.log('')
    console.log('===================================')
    console.log('COMPLETE')
    console.log(`  Total inserted: ${totalInserted}`)
    console.log(`  Total skipped: ${totalSkipped}`)
    console.log(`  Total errors: ${totalErrors}`)
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)

  } catch (error) {
    console.error('Fatal error:', error)

    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startTime
        })
        .eq('id', logId)
    }

    process.exit(1)
  }
}

main()
