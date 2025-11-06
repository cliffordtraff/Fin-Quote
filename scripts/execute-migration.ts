/**
 * Execute migration by creating SQL statements via Supabase client
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function executeMigration() {
  console.log('🔧 Executing migration via Supabase client...\n')

  // Try to create the table directly through a test query first
  // This will tell us if the table already exists

  console.log('1️⃣  Testing connection...')
  const { data: testData, error: testError } = await supabase
    .from('financials_std')
    .select('symbol')
    .limit(1)

  if (testError) {
    console.error('❌ Connection test failed:', testError.message)
    process.exit(1)
  }

  console.log('✅ Connection successful\n')

  console.log('2️⃣  Checking if financial_metrics table exists...')

  // Try to select from the table
  const { error: tableCheckError } = await supabase
    .from('financial_metrics')
    .select('id', { count: 'exact', head: true })

  if (!tableCheckError) {
    console.log('✅ Table already exists!')

    const { count } = await supabase
      .from('financial_metrics')
      .select('*', { count: 'exact', head: true })

    console.log(`   Current records: ${count || 0}\n`)
    console.log('✅ Migration already applied. Ready to proceed with ingestion!')
    return true
  }

  // Table doesn't exist - we need to create it
  console.log('⚠️  Table does not exist yet\n')

  // Unfortunately, we can't execute DDL statements through the Supabase client directly
  // We need to open the browser manually

  console.log('📋 Please apply the migration manually:\n')
  console.log('1. Open: https://supabase.com/dashboard/project/hccwmbmnmbmhuslmbymq/sql')
  console.log('2. Copy the SQL from: supabase/migrations/20241106000001_create_financial_metrics_table.sql')
  console.log('3. Paste and click "Run"\n')

  // Read and display the SQL
  const sqlPath = path.join(process.cwd(), 'supabase/migrations/20241106000001_create_financial_metrics_table.sql')
  const sql = await fs.readFile(sqlPath, 'utf-8')

  console.log('📄 SQL to execute:')
  console.log('=' .repeat(80))
  console.log(sql)
  console.log('='.repeat(80))
  console.log('')

  return false
}

executeMigration()
  .then((success) => {
    if (success) {
      console.log('\n✅ Ready to run: npm run setup:metrics')
      process.exit(0)
    } else {
      console.log('\n⏸️  Waiting for manual migration...')
      console.log('   After applying migration, run: npm run setup:metrics')
      process.exit(0)
    }
  })
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
