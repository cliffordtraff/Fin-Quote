/**
 * Fetch 96 financial metrics from FMP API for AAPL
 * Covers: key-metrics, ratios, financial-growth, enterprise-values
 * Supports both annual and quarterly data
 * Saves to data/aapl-fmp-metrics.json for ingestion into financial_metrics table
 *
 * Usage:
 *   npx tsx scripts/fetch-fmp-metrics.ts           # Fetch annual only (default)
 *   npx tsx scripts/fetch-fmp-metrics.ts quarterly # Fetch quarterly only
 *   npx tsx scripts/fetch-fmp-metrics.ts both      # Fetch both annual and quarterly
 */

import dotenv from 'dotenv'
import * as fs from 'fs/promises'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY || '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'
const SYMBOL = 'AAPL'

// Command line argument for period type
type FetchMode = 'annual' | 'quarterly' | 'both'
const mode: FetchMode = (process.argv[2] as FetchMode) || 'annual'

/**
 * Metrics to skip during ingestion (duplicates from different FMP endpoints)
 * We prefer the shorter/cleaner names:
 * - peRatio (not priceEarningsRatio)
 * - pbRatio (not priceBookValueRatio or priceToBookRatio)
 * - etc.
 */
const SKIP_METRICS = new Set([
  'daysOfInventoryOutstanding', // Duplicate of daysOfInventoryOnHand
  'daysPayablesOutstanding', // Duplicate of daysOfPayablesOutstanding
  'daysSalesOutstanding', // Duplicate of daysOfSalesOutstanding
  'debtToAssets', // Duplicate of debtRatio
  'debtToEquity', // Duplicate of debtEquityRatio
  'enterpriseValueOverEBITDA', // Duplicate of enterpriseValueMultiple
  'operatingProfitMargin', // Duplicate of ebitPerRevenue
  'priceEarningsRatio', // Duplicate of peRatio
  'priceBookValueRatio', // Duplicate of pbRatio
  'priceToBookRatio', // Duplicate of pbRatio
  'priceToFreeCashFlowsRatio', // Duplicate of pfcfRatio
  'priceToOperatingCashFlowsRatio', // Duplicate of pocfratio
  'priceToSalesRatio', // Duplicate of priceSalesRatio
  'roe', // Duplicate of returnOnEquity
  'shareholdersEquityPerShare', // Duplicate of bookValuePerShare
])

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
  ebitdaMargin: 'Profitability & Returns',

  // Cash Flow
  freeCashFlow: 'Cash Flow',
  capitalExpenditure: 'Cash Flow',
  stockBasedCompensation: 'Other',
  commonStockRepurchased: 'Capital Returns & Share Data',
  dividendsPaid: 'Capital Returns & Share Data',

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

interface FMPIncomeStatement {
  date: string
  symbol: string
  period: string
  ebitda: number
  ebitdaratio: number
  depreciationAndAmortization: number
}

interface FMPCashFlowStatement {
  date: string
  symbol: string
  period: string
  freeCashFlow: number
  capitalExpenditure: number
  commonStockRepurchased: number
  dividendsPaid: number
  stockBasedCompensation: number
}

interface MetricRecord {
  symbol: string
  year: number
  period: string
  metric_name: string
  metric_value: number
  metric_category: string
  data_source: string
  // New quarterly support fields
  period_type: 'annual' | 'quarterly'
  fiscal_quarter: number | null
  fiscal_label: string | null
  period_end_date: string | null
}

// Helper to extract fiscal quarter from FMP period string (e.g., "Q1", "Q2", "FY")
function extractFiscalQuarter(period: string): number | null {
  const match = period.match(/Q(\d)/)
  return match ? parseInt(match[1], 10) : null
}

// Helper to generate fiscal label (e.g., "2024-Q2")
function generateFiscalLabel(year: number, quarter: number | null): string | null {
  return quarter ? `${year}-Q${quarter}` : null
}

// Fetch data for a specific period type
async function fetchForPeriod(periodType: 'annual' | 'quarterly'): Promise<{
  keyMetrics: FMPKeyMetrics[]
  ratios: FMPRatios[]
  growth: FMPGrowth[]
  enterpriseValues: FMPEnterpriseValue[]
  incomeStatements: FMPIncomeStatement[]
  cashFlowStatements: FMPCashFlowStatement[]
}> {
  const periodParam = periodType === 'quarterly' ? 'quarter' : 'annual'
  const limit = periodType === 'quarterly' ? 40 : 20

  const endpoints = {
    keyMetrics: `https://financialmodelingprep.com/api/v3/key-metrics/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
    ratios: `https://financialmodelingprep.com/api/v3/ratios/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
    growth: `https://financialmodelingprep.com/api/v3/financial-growth/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
    enterpriseValue: `https://financialmodelingprep.com/api/v3/enterprise-values/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
    incomeStatement: `https://financialmodelingprep.com/api/v3/income-statement/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
    cashFlowStatement: `https://financialmodelingprep.com/api/v3/cash-flow-statement/${SYMBOL}?period=${periodParam}&limit=${limit}&apikey=${FMP_API_KEY}`,
  }

  const [keyMetrics, ratios, growth, enterpriseValues, incomeStatements, cashFlowStatements] = await Promise.all([
    fetch(endpoints.keyMetrics).then((r) => r.json()) as Promise<FMPKeyMetrics[]>,
    fetch(endpoints.ratios).then((r) => r.json()) as Promise<FMPRatios[]>,
    fetch(endpoints.growth).then((r) => r.json()) as Promise<FMPGrowth[]>,
    fetch(endpoints.enterpriseValue).then((r) => r.json()) as Promise<FMPEnterpriseValue[]>,
    fetch(endpoints.incomeStatement).then((r) => r.json()) as Promise<FMPIncomeStatement[]>,
    fetch(endpoints.cashFlowStatement).then((r) => r.json()) as Promise<FMPCashFlowStatement[]>,
  ])

  return { keyMetrics, ratios, growth, enterpriseValues, incomeStatements, cashFlowStatements }
}

async function fetchFMPData() {
  console.log(`📊 Fetching financial metrics from FMP API (mode: ${mode})...\\n`)

  const periodsToFetch: Array<'annual' | 'quarterly'> =
    mode === 'both' ? ['annual', 'quarterly'] : [mode === 'quarterly' ? 'quarterly' : 'annual']

  let allKeyMetrics: FMPKeyMetrics[] = []
  let allRatios: FMPRatios[] = []
  let allGrowth: FMPGrowth[] = []
  let allEnterpriseValues: FMPEnterpriseValue[] = []
  let allIncomeStatements: FMPIncomeStatement[] = []
  let allCashFlowStatements: FMPCashFlowStatement[] = []

  for (const periodType of periodsToFetch) {
    console.log(`\n📅 Fetching ${periodType} data...`)
    const data = await fetchForPeriod(periodType)

    allKeyMetrics = [...allKeyMetrics, ...data.keyMetrics]
    allRatios = [...allRatios, ...data.ratios]
    allGrowth = [...allGrowth, ...data.growth]
    allEnterpriseValues = [...allEnterpriseValues, ...data.enterpriseValues]
    allIncomeStatements = [...allIncomeStatements, ...data.incomeStatements]
    allCashFlowStatements = [...allCashFlowStatements, ...data.cashFlowStatements]

    console.log(`✅ Key Metrics: ${data.keyMetrics.length} periods`)
    console.log(`✅ Ratios: ${data.ratios.length} periods`)
    console.log(`✅ Growth: ${data.growth.length} periods`)
    console.log(`✅ Enterprise Values: ${data.enterpriseValues.length} periods`)
    console.log(`✅ Income Statements: ${data.incomeStatements.length} periods`)
    console.log(`✅ Cash Flow Statements: ${data.cashFlowStatements.length} periods`)
  }

  const keyMetrics = allKeyMetrics
  const ratios = allRatios
  const growth = allGrowth
  const enterpriseValues = allEnterpriseValues
  const incomeStatements = allIncomeStatements
  const cashFlowStatements = allCashFlowStatements

  console.log(`\\n📊 Total data fetched:`)
  console.log(`   Key Metrics: ${keyMetrics.length} periods`)
  console.log(`   Ratios: ${ratios.length} periods`)
  console.log(`   Growth: ${growth.length} periods`)
  console.log(`   Enterprise Values: ${enterpriseValues.length} periods`)
  console.log(`   Income Statements: ${incomeStatements.length} periods`)
  console.log(`   Cash Flow Statements: ${cashFlowStatements.length} periods\\n`)

  // Transform to key-value format
  const metrics: MetricRecord[] = []

  // Process Key Metrics
  keyMetrics.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    const periodStr = item.period || 'FY'
    const isQuarterly = periodStr.startsWith('Q')
    const fiscalQuarter = extractFiscalQuarter(periodStr)
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      metrics.push({
        symbol: SYMBOL,
        year,
        period: periodStr,
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:key-metrics',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Process Ratios
  ratios.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    const periodStr = item.period || 'FY'
    const isQuarterly = periodStr.startsWith('Q')
    const fiscalQuarter = extractFiscalQuarter(periodStr)
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      // Skip duplicates from key-metrics (same year, quarter, and metric)
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key && m.fiscal_quarter === fiscalQuarter
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: periodStr,
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:ratios',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Process Growth
  growth.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    const periodStr = item.period || 'FY'
    const isQuarterly = periodStr.startsWith('Q')
    const fiscalQuarter = extractFiscalQuarter(periodStr)
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol' || key === 'period') return
      if (typeof value !== 'number' || value === null) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      metrics.push({
        symbol: SYMBOL,
        year,
        period: periodStr,
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Growth',
        data_source: 'FMP:growth',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Process Enterprise Values
  // Note: Enterprise values don't have a period field from FMP, so we determine it based on the data pattern
  // When fetching quarterly, FMP returns quarterly snapshots
  enterpriseValues.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    // Infer period type based on how many records exist for this year
    // If multiple records for same year in enterpriseValues, it's quarterly
    const sameYearCount = enterpriseValues.filter(e => new Date(e.date).getFullYear() === year).length
    const isQuarterly = sameYearCount > 1

    // For quarterly, try to determine quarter from date
    const date = new Date(item.date)
    const month = date.getMonth() + 1 // 0-indexed
    // Apple fiscal quarters: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
    let fiscalQuarter: number | null = null
    if (isQuarterly) {
      if (month >= 10 || month <= 12) fiscalQuarter = 1
      else if (month >= 1 && month <= 3) fiscalQuarter = 2
      else if (month >= 4 && month <= 6) fiscalQuarter = 3
      else fiscalQuarter = 4
    }
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    Object.entries(item).forEach(([key, value]) => {
      if (key === 'date' || key === 'symbol') return
      if (typeof value !== 'number' || value === null) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      // Skip duplicates (same year, quarter, and metric)
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key && m.fiscal_quarter === fiscalQuarter
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: isQuarterly ? `Q${fiscalQuarter}` : 'FY',
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Other',
        data_source: 'FMP:enterprise-values',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Process Income Statements (for EBITDA metrics)
  incomeStatements.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    const periodStr = item.period || 'FY'
    const isQuarterly = periodStr.startsWith('Q')
    const fiscalQuarter = extractFiscalQuarter(periodStr)
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    const ebitdaMetrics = {
      ebitda: item.ebitda,
      ebitdaMargin: item.ebitdaratio, // Rename ebitdaratio to ebitdaMargin for clarity
      depreciationAndAmortization: item.depreciationAndAmortization,
    }

    Object.entries(ebitdaMetrics).forEach(([key, value]) => {
      if (typeof value !== 'number' || value === null) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      // Skip duplicates (same year, quarter, and metric)
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key && m.fiscal_quarter === fiscalQuarter
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: periodStr,
        metric_name: key,
        metric_value: value,
        metric_category: key === 'ebitdaMargin' ? 'Profitability & Returns' : 'Other',
        data_source: 'FMP:income-statement',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Process Cash Flow Statements (for FCF and capital allocation)
  cashFlowStatements.forEach((item) => {
    const year = new Date(item.date).getFullYear()
    const periodStr = item.period || 'FY'
    const isQuarterly = periodStr.startsWith('Q')
    const fiscalQuarter = extractFiscalQuarter(periodStr)
    const fiscalLabel = generateFiscalLabel(year, fiscalQuarter)

    const cashFlowMetrics = {
      freeCashFlow: item.freeCashFlow,
      capitalExpenditure: Math.abs(item.capitalExpenditure), // Make positive (FMP returns negative)
      commonStockRepurchased: Math.abs(item.commonStockRepurchased), // Make positive (FMP returns negative)
      dividendsPaid: Math.abs(item.dividendsPaid), // Make positive (FMP returns negative)
      stockBasedCompensation: item.stockBasedCompensation,
    }

    Object.entries(cashFlowMetrics).forEach(([key, value]) => {
      if (typeof value !== 'number' || value === null || isNaN(value)) return
      if (SKIP_METRICS.has(key)) return // Skip known duplicates

      // Skip duplicates (same year, quarter, and metric)
      const isDuplicate = metrics.some(
        (m) => m.year === year && m.metric_name === key && m.fiscal_quarter === fiscalQuarter
      )
      if (isDuplicate) return

      metrics.push({
        symbol: SYMBOL,
        year,
        period: periodStr,
        metric_name: key,
        metric_value: value,
        metric_category: CATEGORY_MAP[key] || 'Cash Flow',
        data_source: 'FMP:cash-flow-statement',
        period_type: isQuarterly ? 'quarterly' : 'annual',
        fiscal_quarter: fiscalQuarter,
        fiscal_label: fiscalLabel,
        period_end_date: item.date,
      })
    })
  })

  // Sort by year (newest first), then fiscal quarter (newest first), then metric name
  metrics.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    // Sort by quarter descending (Q4 before Q3, etc.), nulls (annual) first
    const aQuarter = a.fiscal_quarter ?? 5 // Put annual (null) at the top
    const bQuarter = b.fiscal_quarter ?? 5
    if (bQuarter !== aQuarter) return bQuarter - aQuarter
    return a.metric_name.localeCompare(b.metric_name)
  })

  console.log(`📊 Total metrics collected: ${metrics.length}`)
  console.log(`📅 Years covered: ${Math.min(...metrics.map((m) => m.year))} - ${Math.max(...metrics.map((m) => m.year))}`)

  // Count unique metrics
  const uniqueMetrics = new Set(metrics.map((m) => m.metric_name))
  console.log(`🔢 Unique metric types: ${uniqueMetrics.size}`)

  // Period type breakdown
  const annualCount = metrics.filter(m => m.period_type === 'annual').length
  const quarterlyCount = metrics.filter(m => m.period_type === 'quarterly').length
  console.log(`📆 Period breakdown: ${annualCount} annual, ${quarterlyCount} quarterly\\n`)

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
    period: m.period_type,
    quarter: m.fiscal_quarter ?? 'FY',
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
