/**
 * Check GOOGL segment data in company_metrics
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase credentials')
const supabase = createClient(url, key)

async function checkGooglSegments() {
  console.log('=== GOOGL SEGMENT DATA IN company_metrics ===\n')

  // Get all GOOGL segment data
  const { data, error } = await supabase
    .from('company_metrics')
    .select('year, period, metric_name, dimension_type, dimension_value, metric_value')
    .eq('symbol', 'GOOGL')
    .order('year', { ascending: false })
    .order('dimension_value', { ascending: true })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Total GOOGL rows: ${data?.length || 0}\n`)

  if (!data || data.length === 0) {
    console.log('No GOOGL segment data found!')
    return
  }

  // Group by year
  const byYear: Record<number, typeof data> = {}
  for (const row of data) {
    if (!byYear[row.year]) byYear[row.year] = []
    byYear[row.year].push(row)
  }

  for (const year of Object.keys(byYear).map(Number).sort((a, b) => b - a)) {
    console.log(`\n=== FY${year} ===`)
    const rows = byYear[year]

    // Group by dimension type
    const byType: Record<string, typeof rows> = {}
    for (const row of rows) {
      if (!byType[row.dimension_type]) byType[row.dimension_type] = []
      byType[row.dimension_type].push(row)
    }

    for (const [type, typeRows] of Object.entries(byType)) {
      console.log(`\n  ${type}:`)
      for (const row of typeRows) {
        const value = row.metric_value ? (row.metric_value / 1e9).toFixed(1) : 'N/A'
        console.log(`    ${row.dimension_value.padEnd(35)} $${value}B`)
      }
    }
  }
}

checkGooglSegments().catch(console.error)
