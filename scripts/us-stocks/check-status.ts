/**
 * Check US Stocks Ingestion Status
 *
 * Shows a summary of how many stocks have been loaded and their ingestion status.
 *
 * Usage:
 *   npx tsx scripts/us-stocks/check-status.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

async function loadEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const envContent = await fs.readFile(envPath, 'utf-8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
  } catch {
    console.error('Error: Could not load .env.local')
    process.exit(1)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('US STOCKS INGESTION STATUS')
  console.log('='.repeat(60))
  console.log()

  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase environment variables')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Check if table exists by querying it
  const { count: totalCount, error: totalError } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })

  if (totalError) {
    if (totalError.message.includes('does not exist')) {
      console.log('Table us_stocks does not exist yet.')
      console.log('\nTo create it, run the migration:')
      console.log('  npx supabase db push')
      console.log('\nOr apply manually in Supabase dashboard:')
      console.log('  supabase/migrations/20260201000003_create_us_stocks_table.sql')
      return
    }
    console.error('Error:', totalError.message)
    process.exit(1)
  }

  if (totalCount === 0) {
    console.log('Table us_stocks exists but is empty.')
    console.log('\nTo load stocks, run:')
    console.log('  npx tsx scripts/us-stocks/load-registry.ts')
    return
  }

  console.log(`Total stocks in registry: ${totalCount}\n`)

  // Get status breakdown
  const statuses = ['pending', 'in_progress', 'complete', 'failed', 'no_data']

  console.log('Financials Ingestion Status:')
  console.log('-'.repeat(40))

  for (const status of statuses) {
    const { count } = await supabase
      .from('us_stocks')
      .select('*', { count: 'exact', head: true })
      .eq('financials_status', status)

    const pct = totalCount ? ((count || 0) / totalCount * 100).toFixed(1) : '0'
    const bar = '█'.repeat(Math.floor(parseFloat(pct) / 5))
    console.log(`  ${status.padEnd(12)} ${String(count || 0).padStart(6)} (${pct.padStart(5)}%) ${bar}`)
  }

  // Get exchange breakdown
  console.log('\nExchange Breakdown:')
  console.log('-'.repeat(40))

  const { data: exchangeData } = await supabase
    .from('us_stocks')
    .select('exchange_short')

  if (exchangeData) {
    const exchangeCounts: Record<string, number> = {}
    exchangeData.forEach((row: any) => {
      const ex = row.exchange_short || 'OTHER'
      exchangeCounts[ex] = (exchangeCounts[ex] || 0) + 1
    })

    Object.entries(exchangeCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([ex, count]) => {
        const pct = totalCount ? (count / totalCount * 100).toFixed(1) : '0'
        console.log(`  ${ex.padEnd(12)} ${String(count).padStart(6)} (${pct.padStart(5)}%)`)
      })
  }

  // Count records in financials_std
  const { count: financialsCount } = await supabase
    .from('financials_std')
    .select('*', { count: 'exact', head: true })

  console.log('\nFinancials Data:')
  console.log('-'.repeat(40))
  console.log(`  Total records in financials_std: ${financialsCount || 0}`)

  // Get complete stocks count
  const { count: completeCount } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('financials_status', 'complete')

  const { count: pendingCount } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('financials_status', 'pending')

  // Recommendations
  console.log('\nNext Steps:')
  console.log('-'.repeat(40))

  if (pendingCount && pendingCount > 0) {
    console.log(`  ${pendingCount} stocks pending financial data ingestion.`)
    console.log('  Run: npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 500')
  }

  const { count: failedCount } = await supabase
    .from('us_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('financials_status', 'failed')

  if (failedCount && failedCount > 0) {
    console.log(`\n  ${failedCount} stocks failed - to retry:`)
    console.log('  Run: npx tsx scripts/us-stocks/batch-ingest-financials.ts --retry')
  }

  if (pendingCount === 0 && failedCount === 0) {
    console.log('  All stocks processed!')
  }

  // Show top 5 by market cap with data
  console.log('\nTop 5 Stocks with Data (by market cap):')
  console.log('-'.repeat(40))

  const { data: topStocks } = await supabase
    .from('us_stocks')
    .select('symbol, name, market_cap, financials_annual_count, financials_quarterly_count')
    .eq('financials_status', 'complete')
    .order('market_cap', { ascending: false, nullsFirst: false })
    .limit(5)

  if (topStocks && topStocks.length > 0) {
    topStocks.forEach((stock: any, i: number) => {
      const cap = stock.market_cap ? `$${(stock.market_cap / 1e12).toFixed(2)}T` : 'N/A'
      console.log(`  ${i + 1}. ${stock.symbol.padEnd(6)} ${cap.padEnd(10)} ${stock.financials_annual_count}A/${stock.financials_quarterly_count}Q records`)
    })
  } else {
    console.log('  No stocks with complete data yet.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
