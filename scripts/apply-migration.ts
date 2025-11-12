/**
 * Apply database migration by reading SQL file and providing execution options
 * Usage: npx tsx scripts/apply-migration.ts [migration-filename]
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const execAsync = promisify(exec)

async function applyMigration() {
  // Get migration filename from args, or use the latest one
  const migrationFile = process.argv[2] || '20241106000001_create_financial_metrics_table.sql'

  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations',
    migrationFile
  )

  console.log(`📋 Applying migration: ${migrationFile}\n`)

  // Read SQL file
  let sqlContent: string
  try {
    sqlContent = await fs.readFile(migrationPath, 'utf-8')
    console.log(`✅ Loaded SQL file (${sqlContent.length} characters)\n`)
  } catch (err) {
    console.error(`❌ Could not read migration file: ${migrationPath}`)
    console.error(err)
    process.exit(1)
  }

  // Try to get database URL from environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

  console.log('🔧 Attempting to apply migration...\n')

  // Check if supabase CLI is available
  try {
    const { stdout } = await execAsync('supabase --version')
    console.log(`✅ Supabase CLI found: ${stdout.trim()}`)

    // Try to apply with supabase CLI
    console.log(`\n⚙️  Running: supabase db push...\n`)

    try {
      const { stdout: pushOutput, stderr } = await execAsync(
        `supabase db push`,
        { cwd: process.cwd() }
      )
      console.log(pushOutput)
      if (stderr) console.error(stderr)

      console.log(`\n✅ Migration applied successfully via Supabase CLI!`)
      return
    } catch (pushError: any) {
      console.log(`⚠️  supabase db push failed: ${pushError.message}`)
      console.log(`   Trying alternative method...\n`)
    }
  } catch (err) {
    console.log(`ℹ️  Supabase CLI not found (that's okay)`)
  }

  // Fallback: Check if psql is available
  try {
    await execAsync('psql --version')
    console.log(`✅ PostgreSQL psql client found\n`)

    if (projectRef) {
      console.log(`📝 To apply migration using psql, run:\n`)
      console.log(`psql postgresql://postgres:[YOUR-PASSWORD]@db.${projectRef}.supabase.co:5432/postgres < ${migrationPath}\n`)
    }
  } catch (err) {
    console.log(`ℹ️  psql client not found\n`)
  }

  // Final fallback: Manual instructions
  console.log(`\n📋 Manual Application (Supabase Dashboard):`)
  console.log(`\n1. Go to: https://supabase.com/dashboard/project/${projectRef || 'YOUR-PROJECT'}/sql`)
  console.log(`2. Copy and paste the SQL below:`)
  console.log(`\n${'='.repeat(80)}`)
  console.log(sqlContent)
  console.log(`${'='.repeat(80)}\n`)
  console.log(`3. Click "Run" to execute\n`)

  console.log(`✅ SQL content ready for manual execution`)
}

applyMigration().catch(console.error)
