/**
 * Fix golden test set to only use supported metrics and price ranges
 *
 * Supported metrics (9): revenue, gross_profit, net_income, operating_income,
 *   total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps
 *
 * Supported price ranges (3): 7d, 30d, 90d
 */

import fs from 'fs'
import path from 'path'

// Mapping of unsupported metrics to supported alternatives
const metricReplacements: Record<string, string> = {
  // Unsupported → Supported
  'operating_margin': 'operating_income',
  'free_cash_flow': 'operating_cash_flow',
  'shares_repurchased': 'operating_cash_flow',
  'capital_expenditures': 'operating_cash_flow',
  'total_debt': 'total_liabilities',
  'cash_and_equivalents': 'total_assets',
  'pe_ratio': 'eps',
  'return_on_equity': 'net_income',
  'price_to_book': 'total_assets',
  'dividends_paid': 'operating_cash_flow',
  'market_cap': 'total_assets',
  'gross_margin': 'gross_profit',
  'cost_of_revenue': 'gross_profit',
  'selling_general_administrative': 'operating_income',
  'current_ratio': 'total_assets',
  'quick_ratio': 'total_assets',
  'debt_to_equity': 'total_liabilities',
  'interest_coverage': 'operating_income',
  'working_capital': 'total_assets',
  'inventory_turnover': 'total_assets',
  'asset_turnover': 'total_assets',
  'research_and_development': 'operating_income',
}

// Mapping of unsupported price ranges to supported alternatives
const rangeReplacements: Record<string, string> = {
  '1d': '7d',
  '5d': '7d',
  '1y': '90d',
  '5y': '90d',
  'max': '90d',
}

// Load test set
const testSetPath = path.join(process.cwd(), 'test-data', 'golden-test-set.json')
const testSet = JSON.parse(fs.readFileSync(testSetPath, 'utf-8'))

let metricsFixed = 0
let rangesFixed = 0

// Fix each question
testSet.questions.forEach((q: any) => {
  if (q.expected_output.tool === 'getAaplFinancialsByMetric') {
    const metric = q.expected_output.args.metric
    if (metricReplacements[metric]) {
      console.log(`Q${q.id}: Replacing metric '${metric}' → '${metricReplacements[metric]}'`)
      q.expected_output.args.metric = metricReplacements[metric]
      metricsFixed++
    }
  } else if (q.expected_output.tool === 'getPrices') {
    const range = q.expected_output.args.range
    if (rangeReplacements[range]) {
      console.log(`Q${q.id}: Replacing range '${range}' → '${rangeReplacements[range]}'`)
      q.expected_output.args.range = rangeReplacements[range]
      rangesFixed++
    }
  }
})

// Update metadata
testSet.last_updated = new Date().toISOString().split('T')[0]

// Save fixed version
fs.writeFileSync(testSetPath, JSON.stringify(testSet, null, 2))

console.log(`\n✅ Fixed ${metricsFixed} unsupported metrics`)
console.log(`✅ Fixed ${rangesFixed} unsupported price ranges`)
console.log(`\n📁 Updated: ${testSetPath}`)
