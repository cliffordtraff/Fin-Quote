'use server'

const FMP_API_KEY = process.env.FMP_API_KEY

export interface IncomeStatementData {
  date: string
  symbol: string
  period: string
  calendarYear: string

  // Revenue & Cost
  revenue: number
  costOfRevenue: number
  grossProfit: number
  grossProfitRatio: number

  // Operating Expenses
  researchAndDevelopmentExpenses: number
  generalAndAdministrativeExpenses: number
  sellingAndMarketingExpenses: number
  sellingGeneralAndAdministrativeExpenses: number
  otherExpenses: number
  operatingExpenses: number
  costAndExpenses: number

  // Operating Income
  interestIncome: number
  interestExpense: number
  depreciationAndAmortization: number
  ebitda: number
  ebitdaratio: number
  operatingIncome: number
  operatingIncomeRatio: number
  totalOtherIncomeExpensesNet: number

  // Pre-tax & Tax
  incomeBeforeTax: number
  incomeBeforeTaxRatio: number
  incomeTaxExpense: number

  // Net Income
  netIncome: number
  netIncomeRatio: number

  // EPS
  eps: number
  epsdiluted: number

  // Share counts
  weightedAverageShsOut: number
  weightedAverageShsOutDil: number

  // Additional fields
  link: string
  finalLink: string
}

export interface ComprehensiveIncomeStatement {
  years: number[]
  ttm: IncomeStatementData | null
  annual: IncomeStatementData[]
}

/**
 * Fetch comprehensive income statement from FMP API
 * Returns annual data for last 7 years plus TTM
 * @param symbol - Stock symbol (e.g., 'AAPL', 'MSFT')
 * @param limit - Number of years to fetch (default: 7)
 */
export async function getComprehensiveIncomeStatement(
  symbol: string,
  limit: number = 7
): Promise<ComprehensiveIncomeStatement> {
  try {
    if (!FMP_API_KEY) {
      throw new Error('FMP_API_KEY not configured')
    }

    // Fetch annual income statements
    const annualUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=${limit}&apikey=${FMP_API_KEY}`
    const annualResponse = await fetch(annualUrl, { next: { revalidate: 3600 } }) // Cache for 1 hour

    if (!annualResponse.ok) {
      throw new Error(`FMP API error: ${annualResponse.statusText}`)
    }

    const annualData: IncomeStatementData[] = await annualResponse.json()

    // Fetch TTM (quarterly, period="FY" for trailing twelve months)
    const ttmUrl = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=4&apikey=${FMP_API_KEY}`
    const ttmResponse = await fetch(ttmUrl, { next: { revalidate: 3600 } })

    let ttmData: IncomeStatementData | null = null
    if (ttmResponse.ok) {
      const quarterlyData: IncomeStatementData[] = await ttmResponse.json()

      // Calculate TTM by summing last 4 quarters
      if (quarterlyData && quarterlyData.length === 4) {
        ttmData = {
          ...quarterlyData[0],
          date: new Date().toISOString().split('T')[0],
          period: 'TTM',
          revenue: quarterlyData.reduce((sum, q) => sum + (q.revenue || 0), 0),
          costOfRevenue: quarterlyData.reduce((sum, q) => sum + (q.costOfRevenue || 0), 0),
          grossProfit: quarterlyData.reduce((sum, q) => sum + (q.grossProfit || 0), 0),
          researchAndDevelopmentExpenses: quarterlyData.reduce((sum, q) => sum + (q.researchAndDevelopmentExpenses || 0), 0),
          generalAndAdministrativeExpenses: quarterlyData.reduce((sum, q) => sum + (q.generalAndAdministrativeExpenses || 0), 0),
          sellingAndMarketingExpenses: quarterlyData.reduce((sum, q) => sum + (q.sellingAndMarketingExpenses || 0), 0),
          sellingGeneralAndAdministrativeExpenses: quarterlyData.reduce((sum, q) => sum + (q.sellingGeneralAndAdministrativeExpenses || 0), 0),
          otherExpenses: quarterlyData.reduce((sum, q) => sum + (q.otherExpenses || 0), 0),
          operatingExpenses: quarterlyData.reduce((sum, q) => sum + (q.operatingExpenses || 0), 0),
          costAndExpenses: quarterlyData.reduce((sum, q) => sum + (q.costAndExpenses || 0), 0),
          interestIncome: quarterlyData.reduce((sum, q) => sum + (q.interestIncome || 0), 0),
          interestExpense: quarterlyData.reduce((sum, q) => sum + (q.interestExpense || 0), 0),
          depreciationAndAmortization: quarterlyData.reduce((sum, q) => sum + (q.depreciationAndAmortization || 0), 0),
          ebitda: quarterlyData.reduce((sum, q) => sum + (q.ebitda || 0), 0),
          operatingIncome: quarterlyData.reduce((sum, q) => sum + (q.operatingIncome || 0), 0),
          totalOtherIncomeExpensesNet: quarterlyData.reduce((sum, q) => sum + (q.totalOtherIncomeExpensesNet || 0), 0),
          incomeBeforeTax: quarterlyData.reduce((sum, q) => sum + (q.incomeBeforeTax || 0), 0),
          incomeTaxExpense: quarterlyData.reduce((sum, q) => sum + (q.incomeTaxExpense || 0), 0),
          netIncome: quarterlyData.reduce((sum, q) => sum + (q.netIncome || 0), 0),
          eps: quarterlyData.reduce((sum, q) => sum + (q.eps || 0), 0),
          epsdiluted: quarterlyData.reduce((sum, q) => sum + (q.epsdiluted || 0), 0),
          weightedAverageShsOut: quarterlyData[0].weightedAverageShsOut,
          weightedAverageShsOutDil: quarterlyData[0].weightedAverageShsOutDil,
        }

        // Recalculate ratios
        if (ttmData.revenue > 0) {
          ttmData.grossProfitRatio = (ttmData.grossProfit / ttmData.revenue) * 100
          ttmData.operatingIncomeRatio = (ttmData.operatingIncome / ttmData.revenue) * 100
          ttmData.netIncomeRatio = (ttmData.netIncome / ttmData.revenue) * 100
          ttmData.ebitdaratio = (ttmData.ebitda / ttmData.revenue) * 100
          ttmData.incomeBeforeTaxRatio = (ttmData.incomeBeforeTax / ttmData.revenue) * 100
        }
      }
    }

    // Extract years
    const years = annualData.map(item => parseInt(item.calendarYear)).filter(Boolean)

    return {
      years,
      ttm: ttmData,
      annual: annualData,
    }
  } catch (error) {
    console.error('Error fetching comprehensive income statement:', error)
    return {
      years: [],
      ttm: null,
      annual: [],
    }
  }
}
