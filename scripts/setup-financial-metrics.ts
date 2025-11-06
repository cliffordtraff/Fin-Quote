/**
 * Complete setup for financial_metrics:
 * 1. Check if table exists
 * 2. Fetch data from FMP API (if needed)
 * 3. Ingest into Supabase
 *
 * Usage: npx tsx scripts/setup-financial-metrics.ts
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const execAsync = promisify(exec)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey)

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
}

async function setup() {
  console.log('🚀 Setting up financial_metrics system...\n')

  // Step 1: Check if table exists
  console.log('1️⃣  Checking if financial_metrics table exists...')
  const { error: tableError } = await supabase
    .from('financial_metrics')
    .select('id', { count: 'exact', head: true })

  if (tableError) {
    console.error('❌ Table does not exist!')
    console.log('\n📋 Please run the migration first:')
    console.log('   npx tsx scripts/apply-migration.ts')
    console.log('\n   Or manually in Supabase Dashboard:\n')
    console.log('   https://supabase.com/dashboard/project/hccwmbmnmbmhuslmbymq/sql\n')
    process.exit(1)
  }

  console.log('✅ Table exists!\n')

  // Step 2: Check if data file exists, if not fetch it
  const dataPath = path.join(process.cwd(), 'data/aapl-fmp-metrics.json')
  let needsFetch = false

  try {
    await fs.access(dataPath)
    console.log('2️⃣  Found existing data file: data/aapl-fmp-metrics.json')
  } catch {
    console.log('2️⃣  Data file not found, fetching from FMP API...')
    needsFetch = true
  }

  if (needsFetch) {
    console.log('   Running fetch-fmp-metrics.ts...\n')
    try {
      const { stdout, stderr } = await execAsync('npx tsx scripts/fetch-fmp-metrics.ts')
      console.log(stdout)
      if (stderr) console.error(stderr)
    } catch (err: any) {
      console.error('❌ Fetch failed:', err.message)
      process.exit(1)
    }
  }

  // Step 3: Load and ingest data
  console.log('\n3️⃣  Loading metrics data...')
  const fileContent = await fs.readFile(dataPath, 'utf-8')
  const metrics: MetricRecord[] = JSON.parse(fileContent)

  console.log(`✅ Loaded ${metrics.length} metric records`)
  console.log(`📅 Years: ${Math.min(...metrics.map((m) => m.year))} - ${Math.max(...metrics.map((m) => m.year))}`)
  console.log(`🔢 Unique metrics: ${new Set(metrics.map((m) => m.metric_name)).size}\n`)

  // Step 4: Check existing data
  const { count: existingCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })

  console.log(`4️⃣  Current records in database: ${existingCount || 0}`)

  if (existingCount && existingCount > 0) {
    console.log('   ⚠️  Table has data. Will UPSERT (update existing, insert new).\n')
  }

  // Step 5: Insert in batches
  console.log('5️⃣  Inserting metrics into Supabase...')
  const BATCH_SIZE = 500
  let inserted = 0

  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('financial_metrics')
      .upsert(batch, {
        onConflict: 'symbol,year,period,metric_name',
      })

    if (error) {
      console.error(`   ❌ Batch ${i / BATCH_SIZE + 1} failed:`, error.message)
    } else {
      inserted += batch.length
      const progress = ((i + batch.length) / metrics.length) * 100
      console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(metrics.length / BATCH_SIZE)}: ${batch.length} records (${progress.toFixed(1)}%)`)
    }
  }

  // Step 6: Verify
  console.log('\n6️⃣  Verifying data...')
  const { count: finalCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })

  console.log(`   Total records: ${finalCount}`)

  // Sample query
  const { data: sampleData } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'peRatio')
    .order('year', { ascending: false })
    .limit(3)

  if (sampleData && sampleData.length > 0) {
    console.log('\n📊 Sample data - AAPL P/E Ratio (recent years):')
    console.table(sampleData.map((d: any) => ({
      year: d.year,
      'P/E Ratio': d.metric_value?.toFixed(2),
      category: d.metric_category,
    })))
  }

  console.log('\n✅ Setup complete!')
  console.log('\n📝 Next steps:')
  console.log('   1. Create server action: app/actions/get-financial-metric.ts')
  console.log('   2. Update lib/tools.ts to support new metrics')
  console.log('   3. Test with queries like "What\'s AAPL\'s P/E ratio in 2024?"')
}

setup().catch(console.error)
