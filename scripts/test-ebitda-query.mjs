import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('🔍 Querying EBITDA margin from database...\n')

const { data, error } = await supabase
  .from('financial_metrics')
  .select('year, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'ebitdaMargin')
  .order('year', { ascending: false })
  .limit(5)

if (error) {
  console.error('❌ Error:', error)
} else {
  console.log('✅ EBITDA Margin for AAPL (last 5 years):')
  console.table(data.map(d => ({
    year: d.year,
    'EBITDA Margin': `${(d.metric_value * 100).toFixed(2)}%`
  })))
}
