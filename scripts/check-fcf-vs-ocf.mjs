import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('Comparing Free Cash Flow vs Operating Cash Flow for AAPL:\n')

// Get FCF
const { data: fcf } = await supabase
  .from('financial_metrics')
  .select('year, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'freeCashFlow')
  .order('year', { ascending: false })
  .limit(5)

// Get OCF  
const { data: ocf } = await supabase
  .from('financials_std')
  .select('year, operating_cash_flow')
  .eq('symbol', 'AAPL')
  .order('year', { ascending: false })
  .limit(5)

console.log('Year | Free Cash Flow | Operating Cash Flow | Difference')
console.log('-----|----------------|---------------------|------------')
for (let i = 0; i < 5; i++) {
  const year = fcf[i].year
  const fcfVal = (fcf[i].metric_value / 1e9).toFixed(1)
  const ocfVal = (ocf[i].operating_cash_flow / 1e9).toFixed(1)
  const diff = ((ocf[i].operating_cash_flow - fcf[i].metric_value) / 1e9).toFixed(1)
  console.log(`${year} | $${fcfVal}B | $${ocfVal}B | $${diff}B`)
}

console.log('\n📊 The chart showed "Operating Cash Flow" but the text mentioned $111.48B for 2025.')
console.log('Checking: Is $111.48B closer to FCF or OCF?')
console.log(`- Free Cash Flow 2025: $${(fcf[0].metric_value / 1e9).toFixed(2)}B`)
console.log(`- Operating Cash Flow 2025: $${(ocf[0].operating_cash_flow / 1e9).toFixed(2)}B`)
