/**
 * Ingest metrics using Supabase REST API directly
 * This bypasses the schema cache issue
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
}

async function ingestViaRest() {
  console.log('📥 Loading metrics...\n')

  const dataPath = path.join(process.cwd(), 'data/aapl-fmp-metrics.json')
  const metrics: MetricRecord[] = JSON.parse(await fs.readFile(dataPath, 'utf-8'))

  console.log(`✅ Loaded ${metrics.length} records\n`)

  // Use PostgREST bulk upsert
  const BATCH_SIZE = 200
  let inserted = 0

  console.log(`📦 Inserting in batches of ${BATCH_SIZE}...\n`)

  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE)

    // Format for PostgREST upsert
    const payload = batch.map((m) => ({
      symbol: m.symbol,
      year: m.year,
      period: m.period || 'FY',
      metric_name: m.metric_name,
      metric_value: m.metric_value,
      metric_category: m.metric_category || 'Other',
      data_source: m.data_source || 'FMP',
    }))

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/financial_metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates', // Upsert mode
        },
        body: JSON.stringify(payload),
      })

      if (response.ok || response.status === 201) {
        inserted += batch.length
        const progress = ((i + batch.length) / metrics.length) * 100
        console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(metrics.length / BATCH_SIZE)}: ${batch.length} records (${progress.toFixed(1)}%)`)
      } else {
        const error = await response.text()
        console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (${response.status}):`, error)

        // If it's a 404 or schema cache error, wait and retry once
        if (error.includes('schema') || error.includes('not found') || error.includes('404')) {
          console.log(`   ⏳ Waiting 2 seconds for schema cache to refresh...`)
          await new Promise((resolve) => setTimeout(resolve, 2000))

          const retryResponse = await fetch(`${supabaseUrl}/rest/v1/financial_metrics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify(payload),
          })

          if (retryResponse.ok || retryResponse.status === 201) {
            inserted += batch.length
            console.log(`   ✓ Retry successful!`)
          } else {
            console.error(`   ❌ Retry also failed:`, await retryResponse.text())
          }
        }
      }
    } catch (err: any) {
      console.error(`   ❌ Network error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message)
    }
  }

  console.log(`\n✅ Processed ${inserted}/${metrics.length} records`)

  // Verify
  console.log('\n🔍 Verifying data...')

  const verifyResponse = await fetch(
    `${supabaseUrl}/rest/v1/financial_metrics?symbol=eq.AAPL&metric_name=eq.peRatio&order=year.desc&limit=5`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  )

  if (verifyResponse.ok) {
    const data = await verifyResponse.json()
    console.log(`   Found ${data.length} P/E ratio records`)

    if (data.length > 0) {
      console.log('\n📊 Sample - AAPL P/E Ratio:')
      console.table(
        data.map((d: any) => ({
          year: d.year,
          'P/E Ratio': d.metric_value?.toFixed(2),
        }))
      )
    }
  }

  console.log('\n✅ Ingestion complete!')
}

ingestViaRest().catch(console.error)
