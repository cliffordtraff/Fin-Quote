/**
 * Find all duplicate metric pairs from the alias conflicts warnings
 * Check which ones are truly duplicates (same values) vs different metrics
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

// Duplicate pairs from the stderr warnings
const POTENTIAL_DUPLICATES = [
  ['daysOfInventoryOnHand', 'daysOfInventoryOutstanding'],
  ['daysOfPayablesOutstanding', 'daysPayablesOutstanding'],
  ['daysOfSalesOutstanding', 'daysSalesOutstanding'],
  ['debtRatio', 'debtToAssets'],
  ['debtEquityRatio', 'debtToEquity'],
  ['enterpriseValueMultiple', 'enterpriseValueOverEBITDA'],
  ['marketCap', 'marketCapitalization'],
  ['grahamNetNet', 'netCurrentAssetValue'],
  ['epsdilutedGrowth', 'netIncomeGrowth'],
  ['ebitgrowth', 'operatingIncomeGrowth'],
  ['ebitPerRevenue', 'operatingProfitMargin'],
  ['peRatio', 'priceEarningsRatio'], // We already know this one
  ['pbRatio', 'priceBookValueRatio'],
  ['pbRatio', 'priceToBookRatio'],
  ['pegRatio', 'priceEarningsToGrowthRatio'],
  ['evToSales', 'priceSalesRatio'],
  ['priceBookValueRatio', 'priceToBookRatio'],
  ['pfcfRatio', 'priceToFreeCashFlowsRatio'],
  ['pocfratio', 'priceToOperatingCashFlowsRatio'],
  ['priceSalesRatio', 'priceToSalesRatio'],
  ['rdPerRevenue', 'researchAndDdevelopementToRevenue'],
  ['returnOnEquity', 'roe'],
  ['salesGeneralAndAdministrativeToRevenue', 'sgaToRevenue'],
  ['bookValueperShareGrowth', 'shareholdersEquityGrowth'],
  ['bookValuePerShare', 'shareholdersEquityPerShare'],
  ['weightedAverageSharesDilutedGrowth', 'weightedAverageSharesGrowth'],
]

async function checkDuplicatePair(metric1, metric2) {
  const [data1Result, data2Result] = await Promise.all([
    supabase
      .from('financial_metrics')
      .select('year, metric_value, data_source')
      .eq('symbol', 'AAPL')
      .eq('metric_name', metric1)
      .order('year', { ascending: false }),
    supabase
      .from('financial_metrics')
      .select('year, metric_value, data_source')
      .eq('symbol', 'AAPL')
      .eq('metric_name', metric2)
      .order('year', { ascending: false })
  ])

  const data1 = data1Result.data || []
  const data2 = data2Result.data || []

  if (data1.length === 0 && data2.length === 0) {
    return { status: 'both_missing', identical: 0, different: 0, total: 0 }
  }

  if (data1.length === 0 || data2.length === 0) {
    return {
      status: 'one_missing',
      identical: 0,
      different: 0,
      total: Math.max(data1.length, data2.length),
      missing: data1.length === 0 ? metric1 : metric2
    }
  }

  // Compare values
  const years = new Set([...data1.map(d => d.year), ...data2.map(d => d.year)])
  let identical = 0
  let different = 0
  let oneMissing = 0

  for (const year of years) {
    const val1 = data1.find(d => d.year === year)?.metric_value
    const val2 = data2.find(d => d.year === year)?.metric_value

    if (val1 === undefined || val2 === undefined) {
      oneMissing++
    } else if (Math.abs(val1 - val2) < 0.01) {
      identical++
    } else {
      different++
    }
  }

  const total = identical + different + oneMissing

  if (identical === total) {
    return { status: 'duplicate', identical, different, total, source1: data1[0]?.data_source, source2: data2[0]?.data_source }
  } else if (identical > 0 && different === 0) {
    return { status: 'mostly_duplicate', identical, different, total, oneMissing }
  } else {
    return { status: 'different', identical, different, total }
  }
}

async function analyzeAllDuplicates() {
  console.log('🔍 Analyzing all potential duplicate metric pairs...\n')

  const results = {
    trueDuplicates: [],
    different: [],
    oneMissing: [],
    bothMissing: []
  }

  for (const [metric1, metric2] of POTENTIAL_DUPLICATES) {
    const result = await checkDuplicatePair(metric1, metric2)

    const pair = { metric1, metric2, ...result }

    if (result.status === 'duplicate') {
      results.trueDuplicates.push(pair)
    } else if (result.status === 'different') {
      results.different.push(pair)
    } else if (result.status === 'one_missing') {
      results.oneMissing.push(pair)
    } else if (result.status === 'both_missing') {
      results.bothMissing.push(pair)
    }
  }

  console.log('📊 TRUE DUPLICATES (100% same values):')
  console.log('=====================================\n')

  if (results.trueDuplicates.length === 0) {
    console.log('   None found\n')
  } else {
    results.trueDuplicates.forEach(({ metric1, metric2, identical, source1, source2 }) => {
      console.log(`   ✓ ${metric1} ≡ ${metric2}`)
      console.log(`     ${identical} matching years`)
      console.log(`     Sources: ${source1} vs ${source2}\n`)
    })
  }

  console.log(`\n⚠️  DIFFERENT METRICS (not duplicates):`)
  console.log('=====================================\n')

  if (results.different.length === 0) {
    console.log('   None found\n')
  } else {
    results.different.forEach(({ metric1, metric2, identical, different, total }) => {
      console.log(`   ✗ ${metric1} ≠ ${metric2}`)
      console.log(`     ${identical} matching, ${different} different out of ${total} years\n`)
    })
  }

  console.log(`\n📋 Summary:`)
  console.log(`   True duplicates: ${results.trueDuplicates.length}`)
  console.log(`   Different metrics: ${results.different.length}`)
  console.log(`   One metric missing: ${results.oneMissing.length}`)
  console.log(`   Both missing: ${results.bothMissing.length}`)

  console.log(`\n💡 Recommendation:`)
  console.log(`   Remove these ${results.trueDuplicates.length} duplicate metrics from database:`)
  results.trueDuplicates.forEach(({ metric2 }) => {
    console.log(`   - ${metric2}`)
  })
}

analyzeAllDuplicates()
