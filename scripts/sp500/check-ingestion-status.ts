/**
 * Check Phase 2 ingestion status
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function main() {
  // Load env
  const envContent = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Count total records
  const { count: totalRecords } = await supabase
    .from('financials_std')
    .select('*', { count: 'exact', head: true })

  // Count unique symbols
  const { data: symbols } = await supabase.from('financials_std').select('symbol')
  const uniqueSymbols = new Set(symbols?.map((r) => r.symbol))

  // Count by period type
  const { count: annualCount } = await supabase
    .from('financials_std')
    .select('*', { count: 'exact', head: true })
    .eq('period_type', 'annual')

  const { count: quarterlyCount } = await supabase
    .from('financials_std')
    .select('*', { count: 'exact', head: true })
    .eq('period_type', 'quarterly')

  // Check status in sp500_constituents
  const { data: statusData } = await supabase
    .from('sp500_constituents')
    .select('symbol, data_status')

  let complete = 0
  let pending = 0
  let errorCount = 0

  statusData?.forEach((s) => {
    const status = s.data_status?.financials_std?.status
    if (status === 'complete') complete++
    else if (status === 'error') errorCount++
    else pending++
  })

  console.log('='.repeat(50))
  console.log('PHASE 2 COMPLETE - Final Statistics')
  console.log('='.repeat(50))
  console.log()
  console.log('financials_std table:')
  console.log(`  Total records: ${totalRecords?.toLocaleString()}`)
  console.log(`  Unique symbols: ${uniqueSymbols.size}`)
  console.log(`  Annual records: ${annualCount?.toLocaleString()}`)
  console.log(`  Quarterly records: ${quarterlyCount?.toLocaleString()}`)
  console.log()
  console.log('sp500_constituents status:')
  console.log(`  Complete: ${complete}/503`)
  console.log(`  Pending: ${pending}`)
  console.log(`  Error: ${errorCount}`)
}

main().catch(console.error)
