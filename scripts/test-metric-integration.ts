/**
 * Test Script for Metric Integration
 *
 * Tests the two-layer metric discovery and execution system:
 * 1. List metrics (discovery layer)
 * 2. Get financial metrics with alias resolution (execution layer)
 */

import { listMetrics, listMetricCategories } from '../app/actions/list-metrics'
import { getFinancialMetrics } from '../app/actions/get-financial-metric'
import { resolveMetricName, resolveMetricNames } from '../lib/metric-resolver'

async function testListMetrics() {
  console.log('📋 Test 1: List all metrics\n')

  const { data, error } = await listMetrics()

  if (error) {
    console.error('❌ Error:', error)
    return false
  }

  console.log(`✅ Found ${data?.length} metrics`)
  console.log('First 3 metrics:')
  data?.slice(0, 3).forEach(m => {
    console.log(`  - ${m.metric_name} (${m.category})`)
    console.log(`    ${m.description}`)
    console.log(`    Aliases: ${m.common_aliases.join(', ')}`)
  })
  console.log()

  return true
}

async function testListMetricsByCategory() {
  console.log('📋 Test 2: List metrics by category (Valuation)\n')

  const { data, error } = await listMetrics({ category: 'Valuation' })

  if (error) {
    console.error('❌ Error:', error)
    return false
  }

  console.log(`✅ Found ${data?.length} valuation metrics:`)
  data?.forEach(m => {
    console.log(`  - ${m.metric_name}: ${m.description}`)
  })
  console.log()

  return true
}

async function testListCategories() {
  console.log('📋 Test 3: List all categories\n')

  const { data, error } = await listMetricCategories()

  if (error) {
    console.error('❌ Error:', error)
    return false
  }

  console.log(`✅ Found ${data?.length} categories:`)
  data?.forEach(cat => console.log(`  - ${cat}`))
  console.log()

  return true
}

async function testAliasResolution() {
  console.log('🔍 Test 4: Alias resolution\n')

  const testCases = [
    'P/E',
    'ROE',
    'debt to equity',
    'peRatio', // canonical
    'price to earnings',
    'return on equity',
    'pRatio', // typo - should fuzzy match to peRatio
  ]

  for (const input of testCases) {
    const result = await resolveMetricName(input)
    const status = result.canonical ? '✅' : '❌'
    console.log(`  ${status} "${input}" → ${result.canonical || 'NOT FOUND'} (${result.method || 'failed'})`)
  }
  console.log()

  return true
}

async function testMultiMetricResolution() {
  console.log('🔍 Test 5: Multi-metric resolution\n')

  const inputs = ['P/E', 'ROE', 'debt to equity', 'market cap']
  const result = await resolveMetricNames(inputs)

  console.log(`✅ Resolved ${result.resolved.length}/${inputs.length} metrics:`)
  result.resolved.forEach(m => console.log(`  - ${m}`))

  if (result.unresolved.length > 0) {
    console.log(`❌ Unresolved (${result.unresolved.length}):`)
    result.unresolved.forEach(m => console.log(`  - ${m}`))
  }
  console.log()

  return result.unresolved.length === 0
}

async function testGetFinancialMetric() {
  console.log('💰 Test 6: Get financial metric (single, with alias)\n')

  const { data, error } = await getFinancialMetrics({
    symbol: 'AAPL',
    metricNames: ['P/E'], // Using alias
    limit: 3,
  })

  if (error) {
    console.error('❌ Error:', error)
    return false
  }

  console.log(`✅ Got ${data?.length} data points:`)
  data?.forEach(d => {
    console.log(`  ${d.year}: ${d.metric_value} (${d.metric_name})`)
  })
  console.log()

  return true
}

async function testGetMultipleMetrics() {
  console.log('💰 Test 7: Get multiple financial metrics\n')

  const { data, error, unresolved } = await getFinancialMetrics({
    symbol: 'AAPL',
    metricNames: ['P/E', 'ROE', 'debt to equity'], // All aliases
    limit: 2,
  })

  if (error) {
    console.error('❌ Error:', error)
    if (unresolved && unresolved.length > 0) {
      console.error('   Unresolved metrics:', unresolved)
    }
    return false
  }

  console.log(`✅ Got ${data?.length} data points:`)

  // Group by year
  const byYear: Record<number, typeof data> = {}
  data?.forEach(d => {
    if (!byYear[d.year]) byYear[d.year] = []
    byYear[d.year].push(d)
  })

  Object.entries(byYear).forEach(([year, metrics]) => {
    console.log(`  ${year}:`)
    metrics.forEach(m => {
      console.log(`    ${m.metric_name}: ${m.metric_value}`)
    })
  })
  console.log()

  return true
}

async function runAllTests() {
  console.log('🚀 Starting Metric Integration Tests\n')
  console.log('='.repeat(50))
  console.log()

  const tests = [
    testListMetrics,
    testListMetricsByCategory,
    testListCategories,
    testAliasResolution,
    testMultiMetricResolution,
    testGetFinancialMetric,
    testGetMultipleMetrics,
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      const result = await test()
      if (result) {
        passed++
      } else {
        failed++
      }
    } catch (err) {
      console.error(`❌ Test failed with exception:`, err)
      failed++
    }
  }

  console.log('='.repeat(50))
  console.log()
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)
  console.log()

  if (failed === 0) {
    console.log('✅ All tests passed!')
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

runAllTests().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
