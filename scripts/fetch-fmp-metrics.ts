/**
 * Fetch 96 financial metrics from FMP API for AAPL
 * Covers: key-metrics, ratios, financial-growth, enterprise-values
 * Saves to data/aapl-fmp-metrics.json for ingestion into financial_metrics table
 */

import dotenv from 'dotenv'
import * as fs from 'fs/promises'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY || '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'
const SYMBOL = 'AAPL'

// Category mapping based on stock_metrics_master.csv
const CATEGORY_MAP: Record<string, string> = {
  // Valuation metrics
  marketCap: 'Valuation',
  enterpriseValue: 'Valuation',
  peRatio: 'Valuation',
  priceToSalesRatio: 'Valuation',
  priceToBookRatio: 'Valuation',
  evToSales: 'Valuation',
  evToEbitda: 'Valuation',
  evToOperatingCashFlow: 'Valuation',
  evToFreeCashFlow: 'Valuation',
  earningsYield: 'Valuation',
  freeCashFlowYield: 'Valuation',
  pegRatio: 'Valuation',
  priceToFreeCashFlowsRatio: 'Valuation',

  // Profitability & Returns
  returnOnEquity: 'Profitability & Returns',
  returnOnAssets: 'Profitability & Returns',
  returnOnCapitalEmployed: 'Profitability & Returns',
  roic: 'Profitability & Returns',
  netIncomePerEBT: 'Profitability & Returns',
  ebtPerEbit: 'Profitability & Returns',
  ebitPerRevenue: 'Profitability & Returns',

  // Per-Share Metrics
  revenuePerShare: 'Per-Share Metrics',
  netIncomePerShare: 'Per-Share Metrics',
  operatingCashFlowPerShare: 'Per-Share Metrics',
  freeCashFlowPerShare: 'Per-Share Metrics',
  cashPerShare: 'Per-Share Metrics',
  bookValuePerShare: 'Per-Share Metrics',
  tangibleBookValuePerShare: 'Per-Share Metrics',

  // Profitability Margins
  grossProfitMargin: 'Profitability & Returns',
  operatingProfitMargin: 'Profitability & Returns',
  pretaxProfitMargin: 'Profitability & Returns',
  netProfitMargin: 'Profitability & Returns',

  // Leverage & Solvency
  debtRatio: 'Leverage & Solvency',
  debtEquityRatio: 'Leverage & Solvency',
  longTermDebtToCapitalization: 'Leverage & Solvency',
  totalDebtToCapitalization: 'Leverage & Solvency',
  interestCoverage: 'Leverage & Solvency',
  cashFlowToDebtRatio: 'Leverage & Solvency',
  currentRatio: 'Leverage & Solvency',
  quickRatio: 'Leverage & Solvency',
  cashRatio: 'Leverage & Solvency',

  // Efficiency & Working Capital
  daysOfSalesOutstanding: 'Efficiency & Working Capital',
  daysOfInventoryOutstanding: 'Efficiency & Working Capital',
  daysOfPayablesOutstanding: 'Efficiency & Working Capital',
  cashConversionCycle: 'Efficiency & Working Capital',
  assetTurnover: 'Efficiency & Working Capital',
  fixedAssetTurnover: 'Efficiency & Working Capital',
  inventoryTurnover: 'Efficiency & Working Capital',
  receivablesTurnover: 'Efficiency & Working Capital',
  payablesTurnover: 'Efficiency & Working Capital',

  // Growth metrics
  revenueGrowth: 'Growth',
  epsgrowth: 'Growth',
  operatingIncomeGrowth: 'Growth',
  netIncomeGrowth: 'Growth',
  freeCashFlowGrowth: 'Growth',

  // Capital Returns & Share Data
  dividendYield: 'Capital Returns & Share Data',
  payoutRatio: 'Capital Returns & Share Data',
  dividendPerShare: 'Capital Returns & Share Data',

  // Enterprise Value components
  numberOfShares: 'Capital Returns & Share Data',

  // Other
  stockBasedCompensationToRevenue: 'Other',
  grahamNumber: 'Other',
  capexToOperatingCashFlow: 'Other',
  capexToRevenue: 'Other',
  capexToDepreciation: 'Other',
  stockPrice: 'Market Data',
}

interface FMPKeyMetrics {
  date: string
  symbol: string
  period: string
  revenuePerShare: number
  netIncomePerShare: number
  operatingCashFlowPerShare: number
  freeCashFlowPerShare: number
  cashPerShare: number
  bookValuePerShare: number
  tangibleBookValuePerShare: number
  shareholdersEquityPerShare: number
  interestDebtPerShare: number
  marketCap: number
  enterpriseValue: number
  peRatio: number
  priceToSalesRatio: number
  pocfratio: number
  pfcfRatio: number
  pbRatio: number
  ptbRatio: number
  evToSales: number
  enterpriseValueOverEBITDA: number
  evToOperatingCashFlow: number
  evToFreeCashFlow: number
  earningsYield: number
  freeCashFlowYield: number
  debtToEquity: number
  debtToAssets: number
  netDebtToEBITDA: number
  currentRatio: number
  interestCoverage: number
  incomeQuality: number
  dividendYield: number
  payoutRatio: number
  salesGeneralAndAdministrativeToRevenue: number
  researchAndDdevelopementToRevenue: number
  intangiblesToTotalAssets: number
  capexToOperatingCashFlow: number
  capexToRevenue: number
  capexToDepreciation: number
  stockBasedCompensationToRevenue: number
  grahamNumber: number
  roic: number
  returnOnTangibleAssets: number
  grahamNetNet: number
  workingCapital: number
  tangibleAssetValue: number
  netCurrentAssetValue: number
  investedCapital: number
  averageReceivables: number
  averagePayables: number
  averageInventory: number
  daysSalesOutstanding: number
  daysPayablesOutstanding: number
  daysOfInventoryOnHand: number
  receivablesTurnover: number
  payablesTurnover: number
  inventoryTurnover: number
  roe: number
  capexPerShare: number
}

interface FMPRatios {
  date: string
  symbol: string
  period: string
  currentRatio: number
  quickRatio: number
  cashRatio: number
  daysOfSalesOutstanding: number
  daysOfInventoryOutstanding: number
  operatingCycle: number
  daysOfPayablesOutstanding: number
  cashConversionCycle: number
  grossProfitMargin: number
  operatingProfitMargin: number
  pretaxProfitMargin: number
  netProfitMargin: number
  effectiveTaxRate: number
  returnOnAssets: number
  returnOnEquity: number
  returnOnCapitalEmployed: number
  netIncomePerEBT: number
  ebtPerEbit: number
  ebitPerRevenue: number
  debtRatio: number
  debtEquityRatio: number
  longTermDebtToCapitalization: number
  totalDebtToCapitalization: number
  interestCoverage: number
  cashFlowToDebtRatio: number
  companyEquityMultiplier: number
  receivablesTurnover: number
  payablesTurnover: number
  inventoryTurnover: number
  fixedAssetTurnover: number
  assetTurnover: number
  operatingCashFlowPerShare: number
  freeCashFlowPerShare: number
  cashPerShare: number
  payoutRatio: number
  operatingCashFlowSalesRatio: number
  freeCashFlowOperatingCashFlowRatio: number
  cashFlowCoverageRatios: number
  shortTermCoverageRatios: number
  capitalExpenditureCoverageRatio: number
  dividendPaidAndCapexCoverageRatio: number
  dividendPayoutRatio: number
  priceBookValueRatio: number
  priceToBookRatio: number
  priceToSalesRatio: number
  priceEarningsRatio: number
  priceToFreeCashFlowsRatio: number
  priceToOperatingCashFlowsRatio: number
  priceCashFlowRatio: number
  priceEarningsToGrowthRatio: number
  priceSalesRatio: number
  dividendYield: number
  enterpriseValueMultiple: number
  priceFairValue: number
}

interface FMPGrowth {
  date: string
  symbol: string
  period: string
  revenueGrowth: number
  grossProfitGrowth: number
  ebitgrowth: number
  operatingIncomeGrowth: number
  netIncomeGrowth: number
  epsgrowth: number
  epsdilutedGrowth: number
  weightedAverageSharesGrowth: number
  weightedAverageSharesDilutedGrowth: number
  dividendsperShareGrowth: number
  operatingCashFlowGrowth: number
  freeCashFlowGrowth: number
  tenYRevenueGrowthPerShare: number
  fiveYRevenueGrowthPerShare: number
  threeYRevenueGrowthPerShare: number
  tenYOperatingCFGrowthPerShare: number
  fiveYOperatingCFGrowthPerShare: number
  threeYOperatingCFGrowthPerShare: number
  tenYNetIncomeGrowthPerShare: number
  fiveYNetIncomeGrowthPerShare: number
  threeYNetIncomeGrowthPerShare: number
  tenYShareholdersEquityGrowthPerShare: number
  fiveYShareholdersEquityGrowthPerShare: number
  threeYShareholdersEquityGrowthPerShare: number
  tenYDividendperShareGrowthPerShare: number
  fiveYDividendperShareGrowthPerShare: number
  threeYDividendperShareGrowthPerShare: number
  receivablesGrowth: number
  inventoryGrowth: number
  assetGrowth: number
  bookValueperShareGrowth: number
  debtGrowth: number
  rdexpenseGrowth: number
  sgaexpensesGrowth: number
}

interface FMPEnterpriseValue {
  symbol: string
  date: string
  stockPrice: number
  numberOfShares: number
  marketCapitalization: number
  minusCashAndCashEquivalents: number
  addTotalDebt: number
  enterpriseValue: number
}

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
}

async function fetchFMPData() {
  console.log('📊 Fetching financial metrics from FMP API...\\n')

  const endpoints = {
    keyMetrics: `https://financialmodelingprep.com/api/v3/key-metrics/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`,
    ratios: `https://financialmodelingprep.com/api/v3/ratios/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`,
    growth: `https://financialmodelingprep.com/api/v3/financial-growth/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`,
    enterpriseValue: `https://financialmodelingprep.com/api/v3/enterprise-values/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`,
  }

  // Fetch all endpoints in parallel
  const [keyMetrics, ratios, growth, enterpriseValues] = await Promise.all([
    fetch(endpoints.keyMetrics).then((r) => r.json()) as Promise<FMPKeyMetrics[]>,
    fetch(endpoints.ratios).then((r) => r.json()) as Promise<FMPRatios[]>,
    fetch(endpoints.growth).then((r) => r.json()) as Promise<FMPGrowth[]>,
    fetch(endpoints.enterpriseValue).then((r) => r.json()) as Promise<FMPEnterpriseValue[]>,
  ])

  console.log(`✅ Key Metrics: ${keyMetrics.length} years`)
  console.log(`✅ Ratios: ${ratios.length} years`)
  console.log(`✅ Growth: ${growth.length} years`)
  console.log(`✅ Enterprise Values: ${enterpriseValues.length} years\\n`)

  // Transform to key-value format
  const metrics: MetricRecord[] = []

  // Process Key Metrics
  keyMetrics.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: item.period || 'FY',
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:key-metrics',
      })
    })
  })

  // Process Ratios
  ratios.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return

      // Skip duplicates from key-metrics
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: item.period || 'FY',
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:ratios',
      })
    })
  })

  // Process Growth
  growth.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: item.period || 'FY',
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Growth',
        data_source: 'FMP:growth',
      })
    })
  })

  // Process Enterprise Values
  enterpriseValues.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol') return
      if (typeof value !== 'number' || value === null) return

      // Skip duplicates
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: 'FY',
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:enterprise-values',
      })
    })
  })

  // Sort by year (newest first), then metric name
  metrics.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return a.metric_name.localeCompare(b.metric_name)
  })

  console.log(`📊 Total metrics collected: ${metrics.length}`)
  console.log(`📅 Years covered: ${Math.min(...metrics.map((m) => m.year))} - ${Math.max(...metrics.map((m) => m.year))}`)

  // Count unique metrics
  const uniqueMetrics = new Set(metrics.map((m) => m.metric_name))
  console.log(`🔢 Unique metric types: ${uniqueMetrics.size}\\n`)

  // Save to file
  const dataDir = path.join(process.cwd(), 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const filePath = path.join(dataDir, 'aapl-fmp-metrics.json')
  await fs.writeFile(filePath, JSON.stringify(metrics, null, 2))

  console.log(`✅ Saved to: data/aapl-fmp-metrics.json`)
  console.log(`\\n📋 Sample metrics (2024):`)
  const sample2024 = metrics.filter((m) => m.year === 2024).slice(0, 10)
  console.table(sample2024.map(m => ({
    metric: m.metric_name,
    value: m.metric_value,
    category: m.metric_category,
  })))

  // Category breakdown
  console.log(`\\n📊 Metrics by category:`)
  const categoryCount: Record<string, number> = {}
  metrics.forEach((m) => {
    categoryCount[m.metric_category] = (categoryCount[m.metric_category] || 0) + 1
  })
  Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count} records`)
    })

  return metrics
}

fetchFMPData().catch(console.error)
