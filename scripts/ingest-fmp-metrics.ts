/**
 * Ingest FMP metrics from data/aapl-fmp-metrics.json into Supabase
 * Loads into financial_metrics table (key-value format)
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role to bypass RLS

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

async function ingestMetrics() {
  console.log('📥 Loading FMP metrics from file...\\n')

  // Load JSON file
  const filePath = path.join(process.cwd(), 'data/aapl-fmp-metrics.json')
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const metrics: MetricRecord[] = JSON.parse(fileContent)

  console.log(`✅ Loaded ${metrics.length} metric records`)
  console.log(`📅 Years: ${Math.min(...metrics.map((m) => m.year))} - ${Math.max(...metrics.map((m) => m.year))}`)
  console.log(`🔢 Unique metrics: ${new Set(metrics.map((m) => m.metric_name)).size}\\n`)

  // Check if table exists and has data
  const { count: existingCount, error: countError } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('❌ Error checking table:', countError.message)
    console.log('\\n💡 Make sure you\'ve run the migration:')
    console.log('   supabase/migrations/20241106000001_create_financial_metrics_table.sql')
    console.log('   Run it in Supabase Dashboard > SQL Editor\\n')
    process.exit(1)
  }

  console.log(`📊 Current records in table: ${existingCount || 0}`)

  if (existingCount && existingCount > 0) {
    console.log('\\n⚠️  Table already has data. This will UPSERT (insert or update).')
    console.log('   Existing records with same symbol/year/period/metric_name will be updated.\\n')
  }

  // Batch insert with progress tracking
  const BATCH_SIZE = 500
  let inserted = 0
  let updated = 0
  let errors = 0

  console.log(`📦 Inserting in batches of ${BATCH_SIZE}...\\n`)

  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('financial_metrics')
      .upsert(batch, {
        onConflict: 'symbol,year,period,metric_name', // Unique constraint
      })

    if (error) {
      console.error(`❌ Error in batch ${i / BATCH_SIZE + 1}:`, error.message)
      errors += batch.length
    } else {
      inserted += batch.length
      const progress = ((i + batch.length) / metrics.length) * 100
      console.log(`   ✓ Batch ${i / BATCH_SIZE + 1}: ${batch.length} records (${progress.toFixed(1)}%)`)
    }
  }

  console.log(`\\n✅ Ingestion complete!`)
  console.log(`   Processed: ${inserted} records`)
  console.log(`   Errors: ${errors} records`)

  // Verify data
  console.log(`\\n🔍 Verifying data in Supabase...`)

  const { count: finalCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })

  console.log(`   Total records in table: ${finalCount}`)

  // Sample query - get P/E ratio for 2024
  const { data: sampleData, error: sampleError } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'peRatio')
    .order('year', { ascending: false })
    .limit(5)

  if (!sampleError && sampleData && sampleData.length > 0) {
    console.log(`\\n📊 Sample query - AAPL P/E Ratio (last 5 years):`)
    console.table(sampleData.map((d: any) => ({
      year: d.year,
      value: d.metric_value?.toFixed(2),
      category: d.metric_category,
      source: d.data_source,
    })))
  }

  // Get unique metrics count
  const { data: uniqueMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_name')
    .eq('symbol', 'AAPL')

  if (uniqueMetrics) {
    const uniqueCount = new Set(uniqueMetrics.map((m: any) => m.metric_name)).size
    console.log(`\\n🎯 Unique metrics in database: ${uniqueCount}`)
  }

  console.log(`\\n✅ Done! You can now query financial_metrics table.`)
}

ingestMetrics().catch(console.error)
