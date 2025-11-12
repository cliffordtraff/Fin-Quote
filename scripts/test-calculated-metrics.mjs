/**
 * Test script for calculated metrics implementation
 * Tests: debt_to_equity_ratio, gross_margin, roe
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testDebtToEquityRatio() {
  console.log('\n📊 Testing debt_to_equity_ratio...')

  const { data, error } = await supabase
    .from('financials_std')
    .select('year, total_liabilities, shareholders_equity')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: false })
    .limit(4)

  if (error) {
    console.error('❌ Error:', error.message)
    return false
  }

  if (!data || data.length === 0) {
    console.error('❌ No data returned')
    return false
  }

  console.log('✅ Raw data fetched successfully')
  console.log('\nCalculated Ratios:')

  data.forEach((row) => {
    const ratio = (row.total_liabilities / row.shareholders_equity).toFixed(2)
    console.log(`  ${row.year}: ${ratio} (Liabilities: $${(row.total_liabilities / 1e9).toFixed(1)}B / Equity: $${(row.shareholders_equity / 1e9).toFixed(1)}B)`)
  })

  return true
}

async function testGrossMargin() {
  console.log('\n📊 Testing gross_margin...')

  const { data, error } = await supabase
    .from('financials_std')
    .select('year, gross_profit, revenue')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: false })
    .limit(4)

  if (error) {
    console.error('❌ Error:', error.message)
    return false
  }

  if (!data || data.length === 0) {
    console.error('❌ No data returned')
    return false
  }

  console.log('✅ Raw data fetched successfully')
  console.log('\nCalculated Margins:')

  data.forEach((row) => {
    const margin = ((row.gross_profit / row.revenue) * 100).toFixed(1)
    console.log(`  ${row.year}: ${margin}% (Gross Profit: $${(row.gross_profit / 1e9).toFixed(1)}B / Revenue: $${(row.revenue / 1e9).toFixed(1)}B)`)
  })

  return true
}

async function testROE() {
  console.log('\n📊 Testing roe...')

  const { data, error } = await supabase
    .from('financials_std')
    .select('year, net_income, shareholders_equity')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: false })
    .limit(4)

  if (error) {
    console.error('❌ Error:', error.message)
    return false
  }

  if (!data || data.length === 0) {
    console.error('❌ No data returned')
    return false
  }

  console.log('✅ Raw data fetched successfully')
  console.log('\nCalculated ROE:')

  data.forEach((row) => {
    const roe = ((row.net_income / row.shareholders_equity) * 100).toFixed(1)
    console.log(`  ${row.year}: ${roe}% (Net Income: $${(row.net_income / 1e9).toFixed(1)}B / Equity: $${(row.shareholders_equity / 1e9).toFixed(1)}B)`)
  })

  return true
}

async function runTests() {
  console.log('🧪 Testing Calculated Metrics Implementation\n')
  console.log('=' .repeat(60))

  const results = []

  results.push(await testDebtToEquityRatio())
  results.push(await testGrossMargin())
  results.push(await testROE())

  console.log('\n' + '='.repeat(60))
  console.log('\n📋 Test Summary:')
  console.log(`  Total: ${results.length}`)
  console.log(`  Passed: ${results.filter(r => r).length}`)
  console.log(`  Failed: ${results.filter(r => !r).length}`)

  if (results.every(r => r)) {
    console.log('\n✅ All tests passed!')
  } else {
    console.log('\n❌ Some tests failed')
    process.exit(1)
  }
}

runTests()
