/**
 * Phase 0: Backup existing AAPL and GOOGL data before S&P 500 expansion
 *
 * Creates JSON backups of all existing financial tables:
 * - financials_std (core financial metrics)
 * - financial_metrics (extended metrics)
 * - company_metrics (segment data)
 * - company (company metadata)
 *
 * Usage:
 *   npx tsx scripts/sp500/backup-existing-data.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

const TABLES_TO_BACKUP = [
  'financials_std',
  'financial_metrics',
  'company_metrics',
  'company',
] as const

type TableName = (typeof TABLES_TO_BACKUP)[number]

interface BackupResult {
  table: string
  rowCount: number
  filename: string
  success: boolean
  error?: string
}

async function backupTable(
  supabase: ReturnType<typeof createClient>,
  table: TableName,
  backupDir: string
): Promise<BackupResult> {
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `${table}-backup-${timestamp}.json`
  const filepath = path.join(backupDir, filename)

  try {
    // Fetch all rows from the table
    const { data, error } = await supabase.from(table).select('*')

    if (error) {
      return {
        table,
        rowCount: 0,
        filename,
        success: false,
        error: error.message,
      }
    }

    // Write to JSON file
    await fs.writeFile(filepath, JSON.stringify(data, null, 2))

    return {
      table,
      rowCount: data?.length || 0,
      filename,
      success: true,
    }
  } catch (err) {
    return {
      table,
      rowCount: 0,
      filename,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

async function verifyBackup(backupDir: string, result: BackupResult): Promise<boolean> {
  if (!result.success) return false

  try {
    const filepath = path.join(backupDir, result.filename)
    const content = await fs.readFile(filepath, 'utf-8')
    const data = JSON.parse(content)

    if (!Array.isArray(data)) {
      console.error(`  ✗ ${result.table}: Backup file is not a valid array`)
      return false
    }

    if (data.length !== result.rowCount) {
      console.error(`  ✗ ${result.table}: Row count mismatch (file: ${data.length}, expected: ${result.rowCount})`)
      return false
    }

    return true
  } catch (err) {
    console.error(`  ✗ ${result.table}: Failed to verify backup - ${err}`)
    return false
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('PHASE 0: Backup Existing Data')
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

  // Create backup directory
  const backupDir = path.join(process.cwd(), 'data', 'backups')
  await fs.mkdir(backupDir, { recursive: true })
  console.log(`Backup directory: ${backupDir}\n`)

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Backup each table
  console.log('Backing up tables...\n')
  const results: BackupResult[] = []

  for (const table of TABLES_TO_BACKUP) {
    process.stdout.write(`  ${table}... `)
    const result = await backupTable(supabase, table, backupDir)
    results.push(result)

    if (result.success) {
      console.log(`✓ ${result.rowCount} rows`)
    } else {
      console.log(`✗ Error: ${result.error}`)
    }
  }

  // Verify backups
  console.log('\nVerifying backups...\n')
  let allVerified = true

  for (const result of results) {
    if (result.success) {
      const verified = await verifyBackup(backupDir, result)
      if (verified) {
        console.log(`  ✓ ${result.table}: Verified (${result.rowCount} rows)`)
      } else {
        allVerified = false
      }
    } else {
      console.log(`  ✗ ${result.table}: Skipped (backup failed)`)
      allVerified = false
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('BACKUP SUMMARY')
  console.log('='.repeat(60))

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(`\nSuccessful: ${successful.length}/${TABLES_TO_BACKUP.length}`)
  console.log(`Failed: ${failed.length}/${TABLES_TO_BACKUP.length}`)
  console.log(`All verified: ${allVerified ? 'Yes' : 'No'}`)

  if (successful.length > 0) {
    console.log('\nBackup files created:')
    for (const result of successful) {
      console.log(`  - ${result.filename} (${result.rowCount} rows)`)
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed tables:')
    for (const result of failed) {
      console.log(`  - ${result.table}: ${result.error}`)
    }
    process.exit(1)
  }

  console.log('\n✓ Phase 0 backup complete!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
