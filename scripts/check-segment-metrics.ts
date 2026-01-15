import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase credentials')
const supabase = createClient(url, key)

async function checkQuarterlyYears() {
  console.log('=== QUARTERLY DATA BY YEAR ===\n')

  const { data } = await supabase
    .from('company_metrics')
    .select('year, period')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'segment_revenue')
    .in('period', ['Q1', 'Q2', 'Q3', 'Q4'])
    .order('year', { ascending: true })

  const byYear: Record<number, Set<string>> = {}
  for (const row of data || []) {
    if (byYear[row.year] === undefined) byYear[row.year] = new Set()
    byYear[row.year].add(row.period)
  }

  console.log('Quarterly Data by Fiscal Year:')
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
  for (const year of years) {
    const qs = Array.from(byYear[year]).sort().join(', ')
    const complete = byYear[year].size === 4 ? '✓' : '(partial)'
    console.log(`  FY${year}: ${qs} ${complete}`)
  }

  console.log(`\nRange: FY${years[0]} - FY${years[years.length - 1]}`)
}

checkQuarterlyYears().catch(console.error)
