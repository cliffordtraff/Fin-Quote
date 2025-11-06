/**
 * Find Missing Metadata
 *
 * Compares all metrics in the database with metadata definitions
 * to identify which metrics need metadata added.
 */

import { createClient } from '@supabase/supabase-js'
import { METRIC_METADATA } from '../lib/metric-metadata'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function findMissingMetadata() {
  console.log('🔍 Finding metrics missing metadata...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Get all unique metrics from database
  const { data } = await supabase
    .from('financial_metrics')
    .select('metric_name, metric_category')
    .eq('symbol', 'AAPL')
    .limit(10000)

  const uniqueMetrics = Array.from(
    new Map(data!.map(m => [m.metric_name, m])).values()
  )

  console.log(`📊 Database has ${uniqueMetrics.length} unique metrics`)
  console.log(`📝 Metadata defined for ${Object.keys(METRIC_METADATA).length} metrics\n`)

  // Find missing
  const missing = uniqueMetrics.filter(
    m => !METRIC_METADATA[m.metric_name]
  )

  if (missing.length === 0) {
    console.log('✅ All metrics have metadata!')
    return
  }

  console.log(`❌ Missing metadata for ${missing.length} metrics:\n`)

  // Group by category
  const byCategory: Record<string, typeof missing> = {}
  missing.forEach(m => {
    if (!byCategory[m.metric_category]) {
      byCategory[m.metric_category] = []
    }
    byCategory[m.metric_category].push(m)
  })

  // Print by category
  Object.entries(byCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([category, metrics]) => {
      console.log(`\n${category} (${metrics.length}):`)
      metrics.forEach(m => {
        console.log(`  - ${m.metric_name}`)
      })
    })

  console.log(`\n\n📋 Summary:`)
  console.log(`   Total metrics in DB: ${uniqueMetrics.length}`)
  console.log(`   With metadata: ${Object.keys(METRIC_METADATA).length}`)
  console.log(`   Missing metadata: ${missing.length}`)
  console.log(`\n💡 To add metadata, edit: lib/metric-metadata.ts`)
}

findMissingMetadata()
