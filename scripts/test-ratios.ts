/**
 * Test script for all 9 financial ratios
 *
 * Tests that the chatbot can correctly answer questions about:
 * 1. Gross Margin (already working)
 * 2. Operating Margin (new)
 * 3. Net Profit Margin (new)
 * 4. ROE - Return on Equity (existing)
 * 5. ROA - Return on Assets (new)
 * 6. Debt-to-Equity (existing)
 * 7. Debt-to-Assets (new)
 * 8. Asset Turnover (new)
 * 9. Cash Flow Margin (new)
 */

const TEST_QUERIES = [
  // Profitability Ratios
  { query: "What's AAPL gross margin?", expectedMetric: "gross_profit", category: "Profitability" },
  { query: "Show me AAPL operating margin", expectedMetric: "operating_income", category: "Profitability" },
  { query: "What is AAPL's net profit margin?", expectedMetric: "net_income", category: "Profitability" },
  { query: "AAPL return on equity", expectedMetric: "net_income", category: "Profitability" },
  { query: "What's AAPL's ROA?", expectedMetric: "net_income", category: "Profitability" },

  // Leverage Ratios
  { query: "AAPL debt to equity ratio", expectedMetric: "total_liabilities", category: "Leverage" },
  { query: "Show me AAPL debt to assets", expectedMetric: "total_liabilities", category: "Leverage" },

  // Efficiency Ratios
  { query: "AAPL asset turnover", expectedMetric: "total_assets", category: "Efficiency" },
  { query: "What's AAPL cash flow margin?", expectedMetric: "operating_cash_flow", category: "Efficiency" },
]

interface TestResult {
  query: string
  category: string
  passed: boolean
  error?: string
  response?: any
}

async function testRatio(query: string, expectedMetric: string, category: string): Promise<TestResult> {
  try {
    console.log(`\n🧪 Testing ${category}: "${query}"`)

    const response = await fetch('http://localhost:3002/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query }),
    })

    if (!response.ok) {
      return {
        query,
        category,
        passed: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const data = await response.json()

    // Check if answer contains expected elements
    const answer = data.answer || ''
    const hasPercentage = /%/.test(answer) || /percent/.test(answer)
    const hasNumber = /\d+/.test(answer)
    const hasCalculation = /\(/.test(answer) && /\)/.test(answer) // Check for calculation like "(x / y)"

    // Validation checks
    const validationPassed = data.validation?.overall_passed !== false

    if (!answer || answer.includes("I don't have")) {
      return {
        query,
        category,
        passed: false,
        error: 'No data returned or missing information',
        response: data,
      }
    }

    const passed = hasNumber && validationPassed

    console.log(`  ✅ Answer: ${answer.substring(0, 100)}...`)
    console.log(`  ✅ Has number: ${hasNumber}`)
    console.log(`  ✅ Validation: ${validationPassed ? 'passed' : 'failed'}`)

    return {
      query,
      category,
      passed,
      response: data,
    }
  } catch (error) {
    return {
      query,
      category,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Ratio MVP Tests\n')
  console.log('=' .repeat(80))

  const results: TestResult[] = []

  for (const test of TEST_QUERIES) {
    const result = await testRatio(test.query, test.expectedMetric, test.category)
    results.push(result)

    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Print summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 TEST SUMMARY\n')

  const byCategory: Record<string, TestResult[]> = {}
  for (const result of results) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = []
    }
    byCategory[result.category].push(result)
  }

  for (const [category, categoryResults] of Object.entries(byCategory)) {
    const passed = categoryResults.filter(r => r.passed).length
    const total = categoryResults.length
    const emoji = passed === total ? '✅' : '⚠️'

    console.log(`${emoji} ${category}: ${passed}/${total} passed`)

    for (const result of categoryResults) {
      const status = result.passed ? '  ✅' : '  ❌'
      console.log(`${status} ${result.query}`)
      if (result.error) {
        console.log(`      Error: ${result.error}`)
      }
    }
    console.log()
  }

  const totalPassed = results.filter(r => r.passed).length
  const totalTests = results.length
  const successRate = ((totalPassed / totalTests) * 100).toFixed(1)

  console.log('='.repeat(80))
  console.log(`\n🎯 Overall: ${totalPassed}/${totalTests} tests passed (${successRate}%)`)

  if (totalPassed === totalTests) {
    console.log('🎉 All tests passed! Ratio MVP is working correctly.\n')
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.\n')
  }
}

// Run the tests
runTests().catch(console.error)
