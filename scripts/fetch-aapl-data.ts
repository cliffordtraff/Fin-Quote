/**
 * One-time script to fetch AAPL financial data from FMP API
 * Saves to data/aapl-financials.json for ingestion
 */

const FMP_API_KEY = '9gzCQWZosEJN8I2jjsYP4FBy444nU7Mc'

async function fetchFinancials() {
  const endpoints = {
    incomeStatement: `https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=10&apikey=${FMP_API_KEY}`,
    balanceSheet: `https://financialmodelingprep.com/api/v3/balance-sheet-statement/AAPL?limit=10&apikey=${FMP_API_KEY}`,
    cashFlow: `https://financialmodelingprep.com/api/v3/cash-flow-statement/AAPL?limit=10&apikey=${FMP_API_KEY}`,
  }

  console.log('Fetching AAPL financial data from FMP API...\n')

  const [incomeData, balanceData, cashFlowData] = await Promise.all([
    fetch(endpoints.incomeStatement).then((r) => r.json()),
    fetch(endpoints.balanceSheet).then((r) => r.json()),
    fetch(endpoints.cashFlow).then((r) => r.json()),
  ])

  console.log(`✓ Fetched ${incomeData.length} years of income statements`)
  console.log(`✓ Fetched ${balanceData.length} years of balance sheets`)
  console.log(`✓ Fetched ${cashFlowData.length} years of cash flow statements\n`)

  // Combine by year
  const combinedByYear: Record<number, any> = {}

  incomeData.forEach((item: any) => {
    const year = new Date(item.date).getFullYear()
    combinedByYear[year] = {
      symbol: 'AAPL',
      year,
      revenue: item.revenue,
      gross_profit: item.grossProfit,
      net_income: item.netIncome,
      operating_income: item.operatingIncome,
      eps: item.eps,
    }
  })

  balanceData.forEach((item: any) => {
    const year = new Date(item.date).getFullYear()
    if (combinedByYear[year]) {
      combinedByYear[year].total_assets = item.totalAssets
      combinedByYear[year].total_liabilities = item.totalLiabilities
      combinedByYear[year].shareholders_equity = item.totalStockholdersEquity
    }
  })

  cashFlowData.forEach((item: any) => {
    const year = new Date(item.date).getFullYear()
    if (combinedByYear[year]) {
      combinedByYear[year].operating_cash_flow = item.operatingCashFlow
    }
  })

  const financials = Object.values(combinedByYear).sort((a: any, b: any) => b.year - a.year)

  // Save to file
  const fs = await import('fs/promises')
  const path = await import('path')

  const dataDir = path.join(process.cwd(), 'data')
  await fs.mkdir(dataDir, { recursive: true })

  const filePath = path.join(dataDir, 'aapl-financials.json')
  await fs.writeFile(filePath, JSON.stringify(financials, null, 2))

  console.log(`✓ Saved ${financials.length} years to data/aapl-financials.json\n`)
  console.log('Sample data (most recent year):')
  console.log(JSON.stringify(financials[0], null, 2))
}

fetchFinancials().catch(console.error)
