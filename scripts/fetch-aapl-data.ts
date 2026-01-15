/**
 * Script to fetch AAPL financial data from FMP API
 * Supports both annual and quarterly data
 * Saves to data/aapl-financials.json for ingestion
 *
 * Usage:
 *   npx tsx scripts/fetch-aapl-data.ts           # Fetch annual data (default)
 *   npx tsx scripts/fetch-aapl-data.ts annual    # Fetch annual data
 *   npx tsx scripts/fetch-aapl-data.ts quarterly # Fetch quarterly data
 *   npx tsx scripts/fetch-aapl-data.ts both      # Fetch both annual and quarterly
 */

const FMP_API_KEY = '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'

type PeriodType = 'annual' | 'quarterly'

interface FinancialRecord {
  symbol: string
  year: number
  period_type: PeriodType
  fiscal_quarter: number | null
  fiscal_label: string | null
  period_end_date: string | null
  revenue: number
  gross_profit: number
  net_income: number
  operating_income: number
  total_assets: number
  total_liabilities: number
  shareholders_equity: number
  operating_cash_flow: number
  eps: number
}

/**
 * Parse FMP period string to extract fiscal quarter
 * FMP returns period as "FY" for annual, "Q1", "Q2", "Q3", "Q4" for quarterly
 */
function parseFiscalQuarter(period: string): number | null {
  const match = period.match(/^Q(\d)$/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Get fiscal year from Apple's fiscal calendar
 * Apple's fiscal year ends in September, so Q1 is Oct-Dec
 */
function getFiscalYear(date: string, period: string): number {
  const dateObj = new Date(date)
  const calendarYear = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1 // 1-12

  // For annual data, use the calendar year from FMP
  if (period === 'FY') {
    return calendarYear
  }

  // For quarterly: Apple's fiscal year starts in October
  // Q1 (Oct-Dec) belongs to the next calendar year's fiscal year
  // e.g., Oct 2023 - Dec 2023 is Q1 FY2024
  if (month >= 10) {
    return calendarYear + 1
  }
  return calendarYear
}

async function fetchFinancials(periodType: PeriodType): Promise<FinancialRecord[]> {
  const periodParam = periodType === 'quarterly' ? '&period=quarter' : ''
  const limit = periodType === 'quarterly' ? 40 : 20 // ~10 years of quarters

  const endpoints = {
    incomeStatement: `https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=${limit}${periodParam}&apikey=${FMP_API_KEY}`,
    balanceSheet: `https://financialmodelingprep.com/api/v3/balance-sheet-statement/AAPL?limit=${limit}${periodParam}&apikey=${FMP_API_KEY}`,
    cashFlow: `https://financialmodelingprep.com/api/v3/cash-flow-statement/AAPL?limit=${limit}${periodParam}&apikey=${FMP_API_KEY}`,
  }

  console.log(`Fetching AAPL ${periodType} financial data from FMP API...\n`)

  const [incomeData, balanceData, cashFlowData] = await Promise.all([
    fetch(endpoints.incomeStatement).then((r) => r.json()),
    fetch(endpoints.balanceSheet).then((r) => r.json()),
    fetch(endpoints.cashFlow).then((r) => r.json()),
  ])

  console.log(`✓ Fetched ${incomeData.length} ${periodType} income statements`)
  console.log(`✓ Fetched ${balanceData.length} ${periodType} balance sheets`)
  console.log(`✓ Fetched ${cashFlowData.length} ${periodType} cash flow statements\n`)

  // Create unique key for each period
  const getKey = (date: string, period: string) => {
    const fiscalYear = getFiscalYear(date, period)
    const fiscalQuarter = parseFiscalQuarter(period)
    return fiscalQuarter ? `${fiscalYear}-Q${fiscalQuarter}` : `${fiscalYear}-FY`
  }

  // Combine by period key
  const combinedByPeriod: Record<string, FinancialRecord> = {}

  incomeData.forEach((item: any) => {
    const period = item.period || 'FY'
    const key = getKey(item.date, period)
    const fiscalYear = getFiscalYear(item.date, period)
    const fiscalQuarter = parseFiscalQuarter(period)

    combinedByPeriod[key] = {
      symbol: 'AAPL',
      year: fiscalYear,
      period_type: periodType,
      fiscal_quarter: fiscalQuarter,
      fiscal_label: fiscalQuarter ? `${fiscalYear}-Q${fiscalQuarter}` : null,
      period_end_date: item.date,
      revenue: item.revenue,
      gross_profit: item.grossProfit,
      net_income: item.netIncome,
      operating_income: item.operatingIncome,
      total_assets: 0,
      total_liabilities: 0,
      shareholders_equity: 0,
      operating_cash_flow: 0,
      eps: item.eps,
    }
  })

  balanceData.forEach((item: any) => {
    const period = item.period || 'FY'
    const key = getKey(item.date, period)
    if (combinedByPeriod[key]) {
      combinedByPeriod[key].total_assets = item.totalAssets
      combinedByPeriod[key].total_liabilities = item.totalLiabilities
      combinedByPeriod[key].shareholders_equity = item.totalStockholdersEquity
    }
  })

  cashFlowData.forEach((item: any) => {
    const period = item.period || 'FY'
    const key = getKey(item.date, period)
    if (combinedByPeriod[key]) {
      combinedByPeriod[key].operating_cash_flow = item.operatingCashFlow
    }
  })

  return Object.values(combinedByPeriod).sort((a, b) => {
    // Sort by year descending, then quarter descending
    if (a.year !== b.year) return b.year - a.year
    return (b.fiscal_quarter || 0) - (a.fiscal_quarter || 0)
  })
}

function validateCompleteness(financials: FinancialRecord[]): void {
  if (financials.length === 0) return

  const periodType = financials[0].period_type

  if (periodType === 'quarterly') {
    // Check for missing quarters per year
    const byYear: Record<number, number[]> = {}
    financials.forEach((f) => {
      if (!byYear[f.year]) byYear[f.year] = []
      if (f.fiscal_quarter) byYear[f.year].push(f.fiscal_quarter)
    })

    console.log('Quarterly data completeness check:')
    Object.entries(byYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .forEach(([year, quarters]) => {
        const missing = [1, 2, 3, 4].filter((q) => !quarters.includes(q))
        if (missing.length > 0) {
          console.log(`  ${year}: Q${quarters.sort().join(', Q')} present; Q${missing.join(', Q')} missing`)
        } else {
          console.log(`  ${year}: All quarters present`)
        }
      })
    console.log()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args[0] || 'annual'

  let financials: FinancialRecord[] = []

  if (mode === 'both') {
    const [annual, quarterly] = await Promise.all([
      fetchFinancials('annual'),
      fetchFinancials('quarterly'),
    ])
    financials = [...annual, ...quarterly]
  } else if (mode === 'quarterly') {
    financials = await fetchFinancials('quarterly')
  } else {
    financials = await fetchFinancials('annual')
  }

  // Validate completeness
  const annualData = financials.filter((f) => f.period_type === 'annual')
  const quarterlyData = financials.filter((f) => f.period_type === 'quarterly')

  if (quarterlyData.length > 0) {
    validateCompleteness(quarterlyData)
  }

  // Save to file
  const fs = await import('fs/promises')
  const path = await import('path')

  const dataDir = path.join(process.cwd(), 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const filename = mode === 'both'
    ? 'aapl-financials-all.json'
    : mode === 'quarterly'
      ? 'aapl-financials-quarterly.json'
      : 'aapl-financials.json'

  const filePath = path.join(dataDir, filename)
  await fs.writeFile(filePath, JSON.stringify(financials, null, 2))

  console.log(`✓ Saved ${financials.length} records to data/${filename}`)
  if (annualData.length > 0) console.log(`  - ${annualData.length} annual records`)
  if (quarterlyData.length > 0) console.log(`  - ${quarterlyData.length} quarterly records`)
  console.log('\nSample data (most recent record):')
  console.log(JSON.stringify(financials[0], null, 2))
}

main().catch(console.error)
