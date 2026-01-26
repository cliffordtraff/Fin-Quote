/**
 * Backfill shares_outstanding for all existing records in financials_std
 * Fetches data directly from FMP and updates Supabase
 *
 * Usage: npx tsx scripts/backfill-shares-outstanding.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs/promises'
import * as path from 'path'

const FMP_API_KEY = process.env.FMP_API_KEY || '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'

interface IncomeStatementItem {
  date: string
  period: string
  weightedAverageShsOut: number
}

async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')

    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Error loading .env.local:', error)
  }
}

async function fetchSharesOutstanding(symbol: string): Promise<Map<string, number>> {
  const sharesMap = new Map<string, number>()

  // Fetch annual data
  const annualUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=25&apikey=${FMP_API_KEY}`
  const annualRes = await fetch(annualUrl)
  const annualData: IncomeStatementItem[] = await annualRes.json()

  if (Array.isArray(annualData)) {
    for (const item of annualData) {
      if (item.weightedAverageShsOut) {
        // Key: date (period_end_date)
        sharesMap.set(item.date, item.weightedAverageShsOut)
      }
    }
  }

  // Fetch quarterly data
  const quarterlyUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=50&period=quarter&apikey=${FMP_API_KEY}`
  const quarterlyRes = await fetch(quarterlyUrl)
  const quarterlyData: IncomeStatementItem[] = await quarterlyRes.json()

  if (Array.isArray(quarterlyData)) {
    for (const item of quarterlyData) {
      if (item.weightedAverageShsOut) {
        sharesMap.set(item.date, item.weightedAverageShsOut)
      }
    }
  }

  return sharesMap
}

async function main() {
  await loadEnv()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase credentials')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Get all unique symbols from financials_std
  const { data: symbolsData, error: symbolsError } = await supabase
    .from('financials_std')
    .select('symbol')

  if (symbolsError) {
    console.error('Error fetching symbols:', symbolsError.message)
    return
  }

  const symbols = [...new Set(symbolsData?.map(s => s.symbol) || [])]
  console.log(`Found ${symbols.length} symbols to process: ${symbols.join(', ')}\n`)

  let totalUpdated = 0

  for (const symbol of symbols) {
    console.log(`Processing ${symbol}...`)

    try {
      // Fetch shares outstanding from FMP
      const sharesMap = await fetchSharesOutstanding(symbol)
      console.log(`  Fetched ${sharesMap.size} records from FMP`)

      // Get existing records for this symbol
      const { data: records, error: fetchError } = await supabase
        .from('financials_std')
        .select('id, period_end_date, shares_outstanding')
        .eq('symbol', symbol)

      if (fetchError) {
        console.error(`  Error fetching records for ${symbol}:`, fetchError.message)
        continue
      }

      // Update records that have matching dates
      let updated = 0
      for (const record of records || []) {
        if (record.period_end_date && sharesMap.has(record.period_end_date)) {
          const shares = sharesMap.get(record.period_end_date)!

          // Only update if not already set or different
          if (record.shares_outstanding !== shares) {
            const { error: updateError } = await supabase
              .from('financials_std')
              .update({ shares_outstanding: shares })
              .eq('id', record.id)

            if (updateError) {
              console.error(`  Error updating record ${record.id}:`, updateError.message)
            } else {
              updated++
            }
          }
        }
      }

      console.log(`  Updated ${updated} records`)
      totalUpdated += updated

      // Rate limiting - wait 200ms between symbols
      await new Promise(resolve => setTimeout(resolve, 200))

    } catch (error) {
      console.error(`  Error processing ${symbol}:`, error)
    }
  }

  console.log(`\n✓ Done! Total records updated: ${totalUpdated}`)
}

main().catch(console.error)
