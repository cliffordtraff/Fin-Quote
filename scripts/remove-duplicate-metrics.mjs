/**
 * Remove duplicate metrics from database
 * Keeps the preferred (shorter) metric names, removes the duplicates
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass RLS

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Metrics to remove (16 duplicates)
const METRICS_TO_REMOVE = [
  'daysOfInventoryOutstanding',
  'daysPayablesOutstanding',
  'daysSalesOutstanding',
  'debtToAssets',
  'debtToEquity',
  'enterpriseValueOverEBITDA',
  'operatingProfitMargin',
  'priceEarningsRatio',
  'priceBookValueRatio',
  'priceToBookRatio',
  'priceToFreeCashFlowsRatio',
  'priceToOperatingCashFlowsRatio',
  'priceToSalesRatio',
  'roe',
  'shareholdersEquityPerShare',
]

async function removeDuplicates() {
  console.log('🗑️  Removing duplicate metrics from database...\n')

  // First, count how many records will be deleted
  const { count: totalCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'AAPL')
    .in('metric_name', METRICS_TO_REMOVE)

  console.log(`📊 Found ${totalCount} records to delete\n`)

  if (totalCount === 0) {
    console.log('✅ No duplicate records found. Already clean!\n')
    return
  }

  // Show breakdown by metric
  console.log('Breakdown by metric:')
  for (const metricName of METRICS_TO_REMOVE) {
    const { count } = await supabase
      .from('financial_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', 'AAPL')
      .eq('metric_name', metricName)

    if (count && count > 0) {
      console.log(`  - ${metricName}: ${count} records`)
    }
  }

  console.log('\n⚠️  This will permanently delete these records.\n')

  // Delete all duplicate metrics
  const { error, count: deletedCount } = await supabase
    .from('financial_metrics')
    .delete({ count: 'exact' })
    .eq('symbol', 'AAPL')
    .in('metric_name', METRICS_TO_REMOVE)

  if (error) {
    console.error('❌ Error deleting records:', error.message)
    process.exit(1)
  }

  console.log(`\n✅ Successfully deleted ${deletedCount} duplicate records\n`)

  // Verify deletion
  const { count: remainingCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'AAPL')
    .in('metric_name', METRICS_TO_REMOVE)

  console.log(`🔍 Verification: ${remainingCount} duplicate records remaining (should be 0)\n`)

  if (remainingCount === 0) {
    console.log('✅ All duplicates successfully removed!')
  } else {
    console.error('⚠️  Some duplicates still remain. Please check manually.')
  }

  // Show updated metrics count
  const { count: finalCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'AAPL')

  const { data: uniqueMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_name')
    .eq('symbol', 'AAPL')

  const uniqueCount = uniqueMetrics ? new Set(uniqueMetrics.map(m => m.metric_name)).size : 0

  console.log(`\n📊 Updated database stats:`)
  console.log(`   Total records: ${finalCount}`)
  console.log(`   Unique metrics: ${uniqueCount}`)
  console.log(`   Deleted: ${deletedCount} records`)
}

removeDuplicates()
