/**
 * Test the 5 new cash flow metrics
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const metrics = [
  { name: 'freeCashFlow', display: 'Free Cash Flow' },
  { name: 'capitalExpenditure', display: 'Capital Expenditures (Capex)' },
  { name: 'commonStockRepurchased', display: 'Stock Buybacks' },
  { name: 'dividendsPaid', display: 'Dividends Paid' },
  { name: 'stockBasedCompensation', display: 'Stock-Based Compensation' },
]

console.log('🧪 Testing 5 New Cash Flow Metrics...\n')

for (const metric of metrics) {
  const { data, error } = await supabase
    .from('financial_metrics')
    .select('year, metric_value')
    .eq('symbol', 'AAPL')
    .eq('metric_name', metric.name)
    .order('year', { ascending: false })
    .limit(5)

  if (error) {
    console.error(`❌ ${metric.display}: Error -`, error)
  } else if (!data || data.length === 0) {
    console.error(`❌ ${metric.display}: No data found`)
  } else {
    console.log(`✅ ${metric.display}:`)
    console.table(data.map(d => ({
      Year: d.year,
      Value: `$${(d.metric_value / 1e9).toFixed(1)}B`
    })))
    console.log()
  }
}

console.log('🎉 All tests complete!')
