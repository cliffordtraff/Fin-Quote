import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

async function check() {
  // Check financials_std for quarterly data
  const { data: quarterly, error: qe } = await supabase
    .from('financials_std')
    .select('period_type, fiscal_quarter, fiscal_label, year')
    .eq('symbol', 'AAPL')
    .eq('period_type', 'quarterly')
    .limit(5)

  console.log('Quarterly data in financials_std:', quarterly?.length || 0, 'rows')
  if (qe) console.log('Error:', qe.message)
  if (quarterly && quarterly.length > 0) console.log('Sample:', quarterly)

  // Check financial_metrics for quarterly data
  const { data: metrics, error: me } = await supabase
    .from('financial_metrics')
    .select('period_type, fiscal_quarter, year, metric_name')
    .eq('symbol', 'AAPL')
    .eq('period_type', 'quarterly')
    .limit(5)

  console.log('\nQuarterly data in financial_metrics:', metrics?.length || 0, 'rows')
  if (me) console.log('Error:', me.message)
  if (metrics && metrics.length > 0) console.log('Sample:', metrics)

  // Check what period_types exist in financials_std
  const { data: types } = await supabase
    .from('financials_std')
    .select('period_type')
    .eq('symbol', 'AAPL')

  const uniqueTypes = [...new Set(types?.map(t => t.period_type))]
  console.log('\nPeriod types in financials_std:', uniqueTypes)

  // Check what period_types exist in financial_metrics
  const { data: metricTypes } = await supabase
    .from('financial_metrics')
    .select('period_type')
    .eq('symbol', 'AAPL')

  const uniqueMetricTypes = [...new Set(metricTypes?.map(t => t.period_type))]
  console.log('Period types in financial_metrics:', uniqueMetricTypes)
}

check()
