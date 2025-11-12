/**
 * Check if peRatio and priceEarningsRatio have the same values
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDuplicates() {
  console.log('🔍 Checking if peRatio and priceEarningsRatio are identical...\n')

  // Get both metrics
  const { data: peRatioData } = await supabase
    .from('financial_metrics')
    .select('year, metric_value, data_source')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'peRatio')
    .order('year', { ascending: false })

  const { data: priceEarningsData } = await supabase
    .from('financial_metrics')
    .select('year, metric_value, data_source')
    .eq('symbol', 'AAPL')
    .eq('metric_name', 'priceEarningsRatio')
    .order('year', { ascending: false })

  if (!peRatioData || !priceEarningsData) {
    console.log('❌ Could not fetch data')
    return
  }

  console.log(`📊 Found ${peRatioData.length} years of peRatio data`)
  console.log(`📊 Found ${priceEarningsData.length} years of priceEarningsRatio data\n`)

  // Compare values year by year
  const comparison = []
  const years = new Set([
    ...peRatioData.map(d => d.year),
    ...priceEarningsData.map(d => d.year)
  ])

  for (const year of Array.from(years).sort().reverse()) {
    const peRecord = peRatioData.find(d => d.year === year)
    const priceRecord = priceEarningsData.find(d => d.year === year)

    const peValue = peRecord?.metric_value
    const priceValue = priceRecord?.metric_value

    let status = ''
    if (!peValue && !priceValue) {
      status = '⚠️  Both missing'
    } else if (!peValue) {
      status = '⚠️  peRatio missing'
    } else if (!priceValue) {
      status = '⚠️  priceEarningsRatio missing'
    } else if (peValue === priceValue) {
      status = '✅ IDENTICAL'
    } else if (Math.abs(peValue - priceValue) < 0.01) {
      status = '≈ Nearly same'
    } else {
      status = '❌ DIFFERENT'
    }

    comparison.push({
      Year: year,
      peRatio: peValue?.toFixed(2) || 'N/A',
      priceEarningsRatio: priceValue?.toFixed(2) || 'N/A',
      Status: status,
      'peRatio Source': peRecord?.data_source || '',
      'priceEarningsRatio Source': priceRecord?.data_source || ''
    })
  }

  console.table(comparison.slice(0, 15))

  // Summary
  const identical = comparison.filter(c => c.Status === '✅ IDENTICAL').length
  const different = comparison.filter(c => c.Status === '❌ DIFFERENT').length
  const missing = comparison.filter(c => c.Status.includes('missing')).length

  console.log(`\n📈 Summary:`)
  console.log(`   Identical values: ${identical}`)
  console.log(`   Different values: ${different}`)
  console.log(`   Missing data: ${missing}`)

  if (identical === comparison.length - missing) {
    console.log(`\n✅ Conclusion: They appear to be duplicates from different FMP endpoints`)
    console.log(`   Recommendation: Keep only one (suggest: peRatio from key-metrics)`)
  } else {
    console.log(`\n⚠️  Conclusion: They have different values - investigate further`)
  }
}

checkDuplicates()
