/**
 * SEC Insider Transactions Bulk Ingestion Script
 *
 * Downloads and ingests SEC quarterly insider transaction data from:
 * https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-insiders.ts                    # Current year
 *   npx tsx scripts/ingest-sec-insiders.ts --year 2024        # Specific year
 *   npx tsx scripts/ingest-sec-insiders.ts --year 2023 --quarter 4  # Specific quarter
 *   npx tsx scripts/ingest-sec-insiders.ts --years 2023,2024  # Multiple years
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

// Load environment variables from .env.local
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// SEC data URL pattern
const SEC_BASE_URL = 'https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets'

// Temp directory for downloads
const TEMP_DIR = path.join(process.cwd(), 'temp', 'sec-insider-data')

// Batch size for database inserts
const BATCH_SIZE = 500

interface SubmissionRow {
  ACCESSION_NUMBER: string
  FILING_DATE: string
  DOCUMENT_TYPE: string
  PERIOD_OF_REPORT: string
  ISSUER_CIK: string
  ISSUER_NAME: string
  ISSUER_TRADING_SYMBOL: string
}

interface ReportingOwnerRow {
  ACCESSION_NUMBER: string
  RPTOWNER_CIK: string
  RPTOWNER_NAME: string
  RPTOWNER_RELATIONSHIP_ISDIRECTOR: string
  RPTOWNER_RELATIONSHIP_ISOFFICER: string
  RPTOWNER_RELATIONSHIP_ISTENPERCENTOWNER: string
  RPTOWNER_RELATIONSHIP_ISOTHER: string
  RPTOWNER_RELATIONSHIP_OFFICERTITLE: string
}

interface NonderivTransRow {
  ACCESSION_NUMBER: string
  SECURITY_TITLE: string
  TRANS_DATE: string
  TRANS_CODING_CODE: string
  TRANS_CODING_ACQUIREDORDISPOSED: string
  TRANS_AMOUNTS_SHARES: string
  TRANS_AMOUNTS_PRICEPERSH: string
  POST_TRANS_AMOUNTS_SHARESOWNEDFOLLOWINGTRANS: string
  DIRECT_OR_INDIRECT_OWNERSHIP: string
}

interface ParsedTransaction {
  symbol: string
  accession_number: string
  filing_date: string
  transaction_date: string
  transaction_type: string | null
  transaction_code: string | null
  acquisition_disposition: string | null
  shares: number
  price: number | null
  shares_owned_after: number | null
  reporting_name: string
  reporting_cik: string | null
  owner_type: string | null
  officer_title: string | null
  security_name: string | null
  form_type: string
  source: 'sec'
  sec_link: string
}

async function downloadQuarterlyData(year: number, quarter: number): Promise<string | null> {
  const fileName = `${year}q${quarter}_form345.zip`
  const url = `${SEC_BASE_URL}/${fileName}`
  const localPath = path.join(TEMP_DIR, fileName)
  const extractDir = path.join(TEMP_DIR, `${year}q${quarter}`)

  // Create temp directory if needed
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }

  console.log(`Downloading ${url}...`)

  try {
    // Download using curl (handles redirects and SSL better)
    execSync(`curl -L -o "${localPath}" "${url}" --silent --fail`, { stdio: 'pipe' })
  } catch (error) {
    console.log(`  Quarter ${year}Q${quarter} not available (may not be published yet)`)
    return null
  }

  // Check if file was downloaded
  if (!fs.existsSync(localPath) || fs.statSync(localPath).size < 1000) {
    console.log(`  Download failed or file too small for ${year}Q${quarter}`)
    return null
  }

  console.log(`  Downloaded ${(fs.statSync(localPath).size / 1024 / 1024).toFixed(2)} MB`)

  // Extract ZIP
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true })
  }

  try {
    execSync(`unzip -o "${localPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    console.log(`  Extracted to ${extractDir}`)
  } catch (error) {
    console.error(`  Failed to extract ${localPath}`)
    return null
  }

  return extractDir
}

function parseTSV<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filePath}`)
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length < 2) {
    return []
  }

  const headers = lines[0].split('\t').map(h => h.trim())
  const rows: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const row: Record<string, string> = {}

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() || ''
    }

    rows.push(row as T)
  }

  return rows
}

function buildOwnerType(owner: ReportingOwnerRow): string {
  const types: string[] = []

  if (owner.RPTOWNER_RELATIONSHIP_ISDIRECTOR === '1') types.push('director')
  if (owner.RPTOWNER_RELATIONSHIP_ISOFFICER === '1') types.push('officer')
  if (owner.RPTOWNER_RELATIONSHIP_ISTENPERCENTOWNER === '1') types.push('10% owner')
  if (owner.RPTOWNER_RELATIONSHIP_ISOTHER === '1') types.push('other')

  return types.join(', ') || 'other'
}

function buildSecLink(accessionNumber: string, issuerCik: string): string {
  // Format: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001234567&type=4
  const formattedAccession = accessionNumber.replace(/-/g, '')
  const paddedCik = issuerCik.padStart(10, '0')
  return `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${formattedAccession}`
}

async function processQuarter(extractDir: string): Promise<{
  inserted: number
  skipped: number
  errors: number
}> {
  let inserted = 0
  let skipped = 0
  let errors = 0

  // Find the TSV files (they might be in subdirectories or root)
  const findFile = (name: string): string | null => {
    const direct = path.join(extractDir, name)
    if (fs.existsSync(direct)) return direct

    // Check subdirectories
    const dirs = fs.readdirSync(extractDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const dir of dirs) {
      const nested = path.join(extractDir, dir, name)
      if (fs.existsSync(nested)) return nested
    }

    return null
  }

  const submissionFile = findFile('SUBMISSION.tsv')
  const ownerFile = findFile('REPORTINGOWNER.tsv')
  const nonderivFile = findFile('NONDERIV_TRANS.tsv')

  if (!submissionFile || !ownerFile || !nonderivFile) {
    console.log('  Required TSV files not found')
    console.log(`    SUBMISSION.tsv: ${submissionFile ? 'found' : 'MISSING'}`)
    console.log(`    REPORTINGOWNER.tsv: ${ownerFile ? 'found' : 'MISSING'}`)
    console.log(`    NONDERIV_TRANS.tsv: ${nonderivFile ? 'found' : 'MISSING'}`)
    return { inserted: 0, skipped: 0, errors: 1 }
  }

  console.log('  Parsing TSV files...')

  const submissions = parseTSV<SubmissionRow>(submissionFile)
  const owners = parseTSV<ReportingOwnerRow>(ownerFile)
  const transactions = parseTSV<NonderivTransRow>(nonderivFile)

  console.log(`    Submissions: ${submissions.length}`)
  console.log(`    Owners: ${owners.length}`)
  console.log(`    Transactions: ${transactions.length}`)

  // Build lookup maps
  const submissionMap = new Map<string, SubmissionRow>()
  for (const sub of submissions) {
    submissionMap.set(sub.ACCESSION_NUMBER, sub)
  }

  const ownerMap = new Map<string, ReportingOwnerRow[]>()
  for (const owner of owners) {
    const existing = ownerMap.get(owner.ACCESSION_NUMBER) || []
    existing.push(owner)
    ownerMap.set(owner.ACCESSION_NUMBER, existing)
  }

  // Process transactions in batches
  const parsedTransactions: ParsedTransaction[] = []

  for (const trans of transactions) {
    const submission = submissionMap.get(trans.ACCESSION_NUMBER)
    const transOwners = ownerMap.get(trans.ACCESSION_NUMBER) || []
    const primaryOwner = transOwners[0]

    if (!submission || !primaryOwner) {
      skipped++
      continue
    }

    // Skip if no symbol
    const symbol = submission.ISSUER_TRADING_SYMBOL?.trim().toUpperCase()
    if (!symbol || symbol.length === 0 || symbol.length > 10) {
      skipped++
      continue
    }

    // Parse shares and price
    const shares = parseFloat(trans.TRANS_AMOUNTS_SHARES) || 0
    if (shares === 0) {
      skipped++
      continue
    }

    const price = parseFloat(trans.TRANS_AMOUNTS_PRICEPERSH) || null
    const sharesAfter = parseFloat(trans.POST_TRANS_AMOUNTS_SHARESOWNEDFOLLOWINGTRANS) || null

    const parsed: ParsedTransaction = {
      symbol,
      accession_number: trans.ACCESSION_NUMBER,
      filing_date: submission.FILING_DATE,
      transaction_date: trans.TRANS_DATE || submission.FILING_DATE,
      transaction_type: trans.TRANS_CODING_CODE || null,
      transaction_code: trans.TRANS_CODING_CODE?.charAt(0) || null,
      acquisition_disposition: trans.TRANS_CODING_ACQUIREDORDISPOSED?.charAt(0) || null,
      shares: Math.abs(shares),
      price,
      shares_owned_after: sharesAfter,
      reporting_name: primaryOwner.RPTOWNER_NAME,
      reporting_cik: primaryOwner.RPTOWNER_CIK || null,
      owner_type: buildOwnerType(primaryOwner),
      officer_title: primaryOwner.RPTOWNER_RELATIONSHIP_OFFICERTITLE || null,
      security_name: trans.SECURITY_TITLE || null,
      form_type: submission.DOCUMENT_TYPE || '4',
      source: 'sec',
      sec_link: buildSecLink(trans.ACCESSION_NUMBER, submission.ISSUER_CIK)
    }

    parsedTransactions.push(parsed)
  }

  console.log(`  Inserting ${parsedTransactions.length} transactions...`)

  // Insert in batches
  for (let i = 0; i < parsedTransactions.length; i += BATCH_SIZE) {
    const batch = parsedTransactions.slice(i, i + BATCH_SIZE)

    // First, get or create insiders
    const insiderIds = new Map<string, string>()

    for (const trans of batch) {
      const key = trans.reporting_name.toLowerCase().trim()
      if (!insiderIds.has(key)) {
        const { data } = await supabase.rpc('get_or_create_insider', {
          p_name: trans.reporting_name,
          p_cik: trans.reporting_cik
        })
        if (data) {
          insiderIds.set(key, data)
        }
      }
    }

    // Prepare records for insert
    const records = batch.map(trans => ({
      insider_id: insiderIds.get(trans.reporting_name.toLowerCase().trim()) || null,
      symbol: trans.symbol,
      accession_number: trans.accession_number,
      filing_date: trans.filing_date,
      transaction_date: trans.transaction_date,
      transaction_type: trans.transaction_type,
      transaction_code: trans.transaction_code,
      acquisition_disposition: trans.acquisition_disposition,
      shares: trans.shares,
      price: trans.price,
      shares_owned_after: trans.shares_owned_after,
      reporting_name: trans.reporting_name,
      owner_type: trans.owner_type,
      officer_title: trans.officer_title,
      security_name: trans.security_name,
      form_type: trans.form_type,
      source: trans.source,
      source_id: trans.accession_number,
      sec_link: trans.sec_link
    }))

    // Upsert (insert with conflict handling)
    const { error } = await supabase
      .from('insider_transactions')
      .upsert(records, {
        onConflict: 'accession_number,reporting_name,transaction_date,transaction_code,shares',
        ignoreDuplicates: true
      })

    if (error) {
      console.error(`    Batch error:`, error.message)
      errors += batch.length
    } else {
      inserted += batch.length
    }

    // Progress indicator
    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= parsedTransactions.length) {
      console.log(`    Progress: ${Math.min(i + BATCH_SIZE, parsedTransactions.length)}/${parsedTransactions.length}`)
    }
  }

  return { inserted, skipped, errors }
}

async function main() {
  const args = process.argv.slice(2)
  let years: number[] = []
  let specificQuarter: number | null = null

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      years = [parseInt(args[i + 1])]
      i++
    } else if (args[i] === '--years' && args[i + 1]) {
      years = args[i + 1].split(',').map(y => parseInt(y.trim()))
      i++
    } else if (args[i] === '--quarter' && args[i + 1]) {
      specificQuarter = parseInt(args[i + 1])
      i++
    }
  }

  // Default to current year
  if (years.length === 0) {
    years = [new Date().getFullYear()]
  }

  console.log('SEC Insider Transactions Bulk Ingestion')
  console.log('=======================================')
  console.log(`Years: ${years.join(', ')}`)
  if (specificQuarter) {
    console.log(`Quarter: Q${specificQuarter}`)
  }
  console.log('')

  // Create ingestion log
  const startTime = Date.now()
  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({
      source: 'sec_backfill',
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  const logId = logEntry?.id

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  try {
    for (const year of years) {
      const quarters = specificQuarter ? [specificQuarter] : [1, 2, 3, 4]

      for (const quarter of quarters) {
        console.log(`\nProcessing ${year} Q${quarter}...`)

        const extractDir = await downloadQuarterlyData(year, quarter)
        if (!extractDir) continue

        const result = await processQuarter(extractDir)
        totalInserted += result.inserted
        totalSkipped += result.skipped
        totalErrors += result.errors

        console.log(`  Results: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors} errors`)

        // Clean up extracted files (keep ZIPs for re-runs)
        try {
          fs.rmSync(extractDir, { recursive: true })
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    const duration = Date.now() - startTime

    // Update log entry
    if (logId) {
      await supabase
        .from('ingestion_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: totalErrors > 0 ? 'partial' : 'success',
          rows_inserted: totalInserted,
          rows_skipped: totalSkipped,
          error_message: totalErrors > 0 ? `${totalErrors} errors during ingestion` : null,
          duration_ms: duration
        })
        .eq('id', logId)
    }

    console.log('\n=======================================')
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
