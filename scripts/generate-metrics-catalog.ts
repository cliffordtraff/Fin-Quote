/**
 * Generate Metrics Catalog
 *
 * This script automatically generates the metrics catalog JSON file by:
 * 1. Querying the database for all unique metrics
 * 2. Merging with manually-curated metadata from lib/metric-metadata.ts
 * 3. Calculating data coverage from min/max years
 * 4. Writing to data/metrics-catalog.json
 *
 * Run this script whenever:
 * - New metrics are added to the financial_metrics table
 * - Metadata is updated in lib/metric-metadata.ts
 * - You need to regenerate the catalog
 *
 * Usage: npm run generate:catalog
 */

import { createClient } from '@supabase/supabase-js'
import { METRIC_METADATA, type MetricMetadata } from '../lib/metric-metadata'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

interface MetricCatalogEntry {
  metric_name: string
  category: string
  description: string
  unit: string
  data_coverage: string
  common_aliases: string[]
}

async function generateCatalog() {
  console.log('📊 Generating metrics catalog...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Query database for all unique metrics
  console.log('1️⃣  Fetching metrics from database...')

  // Fetch metrics from the most recent year to get the complete list
  // (All 139 metrics exist in recent years, so we only need one year to get the full set)
  const { data: metricsData, error: metricsError } = await supabase
    .from('financial_metrics')
    .select('metric_name, metric_category')
    .eq('symbol', 'AAPL')
    .eq('year', 2025) // Use most recent year to get all metrics
    .order('metric_category, metric_name')

  if (metricsError) {
    console.error('❌ Failed to fetch metrics:', metricsError)
    process.exit(1)
  }

  // All metrics from single year are already unique
  const uniqueMetrics = metricsData

  console.log(`   ✅ Found ${uniqueMetrics.length} unique metrics\n`)

  // 2. Get year range for data coverage
  console.log('2️⃣  Calculating data coverage...')
  const { data: yearData, error: yearError } = await supabase
    .from('financial_metrics')
    .select('year')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: true })

  if (yearError) {
    console.error('❌ Failed to fetch year data:', yearError)
    process.exit(1)
  }

  const minYear = yearData?.[0]?.year || 2006
  const maxYear = yearData?.[yearData.length - 1]?.year || 2025
  const dataCoverage = `${minYear}-${maxYear}`

  console.log(`   ✅ Data coverage: ${dataCoverage}\n`)

  // 3. Merge with metadata
  console.log('3️⃣  Merging with metadata...')
  const catalog: MetricCatalogEntry[] = uniqueMetrics.map(metric => {
    const metadata: MetricMetadata = METRIC_METADATA[metric.metric_name] || {
      description: metric.metric_name, // Fallback to metric name if no metadata
      unit: 'number',
      commonAliases: []
    }

    return {
      metric_name: metric.metric_name,
      category: metric.metric_category,
      description: metadata.description,
      unit: metadata.unit,
      data_coverage: dataCoverage,
      common_aliases: metadata.commonAliases
    }
  })

  // Check for missing metadata
  const missingMetadata = catalog.filter(m => m.description === m.metric_name)
  if (missingMetadata.length > 0) {
    console.log(`   ⚠️  Warning: ${missingMetadata.length} metrics missing metadata:`)
    missingMetadata.forEach(m => console.log(`      - ${m.metric_name}`))
    console.log()
  } else {
    console.log(`   ✅ All metrics have metadata\n`)
  }

  // 4. Write to JSON file
  console.log('4️⃣  Writing to data/metrics-catalog.json...')
  const outputPath = path.join(process.cwd(), 'data', 'metrics-catalog.json')

  try {
    fs.writeFileSync(
      outputPath,
      JSON.stringify(catalog, null, 2) + '\n' // Add trailing newline
    )
    console.log(`   ✅ Catalog written successfully\n`)
  } catch (error) {
    console.error('❌ Failed to write catalog file:', error)
    process.exit(1)
  }

  // 5. Summary
  console.log('📊 Summary:')
  console.log(`   • Total metrics: ${catalog.length}`)
  console.log(`   • Data coverage: ${dataCoverage}`)
  console.log(`   • Output: ${outputPath}`)

  // Group by category
  const categoryCounts: Record<string, number> = {}
  catalog.forEach(m => {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1
  })

  console.log('\n📁 By category:')
  Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`   • ${cat}: ${count}`)
    })

  console.log('\n✅ Catalog generation complete!')
}

generateCatalog().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
