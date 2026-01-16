/**
 * Test GOOGL segment metrics through the chart API
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase credentials')
const supabase = createClient(url, key)

// Simulate what getMultipleMetrics does for segment metrics
async function testSegmentQuery(symbol: string, dimensionType: string, dimensionValue: string) {
  console.log(`\nQuerying ${symbol} segment: ${dimensionType} = "${dimensionValue}"`)

  const { data, error } = await supabase
    .from('company_metrics')
    .select('year, period, metric_name, dimension_type, dimension_value, metric_value')
    .eq('symbol', symbol)
    .eq('metric_name', 'segment_revenue')
    .eq('dimension_type', dimensionType)
    .eq('dimension_value', dimensionValue)
    .eq('period', 'FY')
    .order('year', { ascending: true })

  if (error) {
    console.error('Error:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('  ❌ No data found!')
    return
  }

  console.log('  ✓ Data found:')
  for (const row of data) {
    const valueB = (row.metric_value / 1e9).toFixed(1)
    console.log(`    FY${row.year}: $${valueB}B`)
  }
}

async function main() {
  console.log('=== Testing GOOGL Segment Metrics ===')

  // Test GOOGL business segments
  await testSegmentQuery('GOOGL', 'product', 'Google Services')
  await testSegmentQuery('GOOGL', 'product', 'Google Cloud')
  await testSegmentQuery('GOOGL', 'product', 'Other Bets')

  // Test GOOGL product breakdown
  await testSegmentQuery('GOOGL', 'product', 'Google Search & Other')
  await testSegmentQuery('GOOGL', 'product', 'YouTube Advertising')
  await testSegmentQuery('GOOGL', 'product', 'Google Network')

  // Test GOOGL geographic
  await testSegmentQuery('GOOGL', 'geographic', 'United States')
  await testSegmentQuery('GOOGL', 'geographic', 'EMEA')
  await testSegmentQuery('GOOGL', 'geographic', 'Asia Pacific')

  console.log('\n=== Testing AAPL Segment Metrics (for comparison) ===')

  // Test AAPL segments
  await testSegmentQuery('AAPL', 'product', 'iPhone')
  await testSegmentQuery('AAPL', 'product', 'Services')
  await testSegmentQuery('AAPL', 'geographic', 'Americas')

  console.log('\n=== Testing Cross-Company Mismatch (should fail) ===')

  // Test that AAPL metrics don't show GOOGL data
  await testSegmentQuery('AAPL', 'product', 'Google Services')
  await testSegmentQuery('GOOGL', 'product', 'iPhone')
}

main().catch(console.error)
