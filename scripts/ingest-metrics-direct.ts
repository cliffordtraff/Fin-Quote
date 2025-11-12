/**
 * Ingest metrics using direct SQL INSERT statements
 * Bypasses Supabase's schema cache by using raw SQL
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
}

async function ingestDirect() {
  console.log('📥 Loading metrics from file...\n')

  const dataPath = path.join(process.cwd(), 'data/aapl-fmp-metrics.json')
  const fileContent = await fs.readFile(dataPath, 'utf-8')
  const metrics: MetricRecord[] = JSON.parse(fileContent)

  console.log(`✅ Loaded ${metrics.length} records\n`)

  // Build bulk INSERT statement
  console.log('🔧 Building SQL INSERT statement...')

  const values = metrics.map((m) => {
    const symbol = m.symbol.replace(/'/g, "''")
    const metricName = m.metric_name.replace(/'/g, "''")
    const period = m.period?.replace(/'/g, "''") || 'FY'
    const category = m.metric_category?.replace(/'/g, "''") || 'Other'
    const source = m.data_source?.replace(/'/g, "''") || 'FMP'
    const value = m.metric_value || 'NULL'

    return `('${symbol}', ${m.year}, '${period}', '${metricName}', ${value}, '${category}', '${source}')`
  })

  // Split into batches (PostgreSQL has limits)
  const BATCH_SIZE = 500
  let inserted = 0

  console.log(`📦 Inserting in ${Math.ceil(values.length / BATCH_SIZE)} batches...\n`)

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE)

    const sql = `
      INSERT INTO financial_metrics
      (symbol, year, period, metric_name, metric_value, metric_category, data_source)
      VALUES ${batch.join(', ')}
      ON CONFLICT (symbol, year, period, metric_name)
      DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        metric_category = EXCLUDED.metric_category,
        data_source = EXCLUDED.data_source,
        updated_at = NOW();
    `

    try {
      // Use fetch to call Supabase REST API directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql_query: sql }),
      })

      if (response.ok) {
        inserted += batch.length
        const progress = ((i + batch.length) / values.length) * 100
        console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} records (${progress.toFixed(1)}%)`)
      } else {
        const errorText = await response.text()
        console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, errorText)
      }
    } catch (err: any) {
      console.error(`   ❌ Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message)
    }
  }

  console.log(`\n✅ Inserted ${inserted} records`)

  // Verify using a simple SELECT
  console.log('\n🔍 Verifying data with direct query...')

  const { data, error } = await supabase
    .from('financial_metrics')
    .select('metric_name, year, metric_value')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'peRatio')
    .order('year', { ascending: false })
    .limit(5)

  if (error) {
    console.log('⚠️  Client query failed (cache issue), trying direct SQL...')

    // Try direct SQL query
    const response = await fetch(`${supabaseUrl}/rest/v1/financial_metrics?symbol=eq.AAPL&metric_name=eq.peRatio&order=year.desc&limit=5`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    })

    if (response.ok) {
      const directData = await response.json()
      console.log('\n📊 Sample data - AAPL P/E Ratio:')
      console.table(directData.map((d: any) => ({
        year: d.year,
        'P/E Ratio': d.metric_value?.toFixed(2),
      })))
    }
  } else if (data && data.length > 0) {
    console.log('\n📊 Sample data - AAPL P/E Ratio:')
    console.table(data.map((d: any) => ({
      year: d.year,
      'P/E Ratio': d.metric_value?.toFixed(2),
    })))
  }

  console.log('\n✅ Done!')
}

ingestDirect().catch(console.error)
