/**
 * Apply us_stocks migration directly via Supabase client
 * Bypasses the migration system to avoid conflicts with other pending migrations
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function loadEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = await fs.readFile(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
}

async function main() {
  console.log('Applying us_stocks table migration...\n')

  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: Need SUPABASE_SERVICE_ROLE_KEY for DDL operations')
    console.error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local (find it in Supabase dashboard > Settings > API)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Check if table already exists
  const { data: existingTable } = await supabase
    .from('us_stocks')
    .select('symbol')
    .limit(1)

  if (existingTable !== null) {
    console.log('Table us_stocks already exists!')

    const { count } = await supabase
      .from('us_stocks')
      .select('*', { count: 'exact', head: true })

    console.log(`Current row count: ${count}`)
    return
  }

  console.log('Table does not exist. Please apply the migration manually:')
  console.log('\n1. Go to: https://supabase.com/dashboard/project/hccwmbmnmbmhuslmbymq/sql/new')
  console.log('\n2. Paste and run the SQL from:')
  console.log('   supabase/migrations/20260201000003_create_us_stocks_table.sql')
}

main().catch(console.error)
