'use server'

export interface InsiderTrade {
  symbol: string
  filingDate: string
  transactionDate: string
  reportingName: string
  typeOfOwner: string
  transactionType: string
  securitiesTransacted: number
  price: number | null
  securitiesOwned: number
  securityName: string
  link: string
  acquistionOrDisposition: string
  formType: string
}

/**
 * Fetch latest insider trades from FMP API
 */
export async function getLatestInsiderTrades(
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v4/insider-trading?limit=${limit}&apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 300 } // Cache for 5 minutes
    })

    if (!response.ok) {
      throw new Error('Failed to fetch insider trading data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const trades: InsiderTrade[] = data
        .filter((item: any) => item.symbol && item.reportingName)
        .map((item: any) => ({
          symbol: item.symbol,
          filingDate: item.filingDate,
          transactionDate: item.transactionDate,
          reportingName: item.reportingName,
          typeOfOwner: item.typeOfOwner || '',
          transactionType: item.transactionType || '',
          securitiesTransacted: item.securitiesTransacted || 0,
          price: item.price || null,
          securitiesOwned: item.securitiesOwned || 0,
          securityName: item.securityName || '',
          link: item.link || '',
          acquistionOrDisposition: item.acquistionOrDisposition || '',
          formType: item.formType || '',
        }))

      return { trades }
    }

    return { trades: [] }
  } catch (error) {
    console.error('Error fetching insider trading data:', error)
    return { error: 'Failed to load insider trading data' }
  }
}

/**
 * Fetch insider trades for a specific symbol from FMP API
 */
export async function getInsiderTradesBySymbol(
  symbol: string,
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  if (!symbol || symbol.trim() === '') {
    return { error: 'Symbol is required' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol.toUpperCase()}&limit=${limit}&apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 300 } // Cache for 5 minutes
    })

    if (!response.ok) {
      throw new Error('Failed to fetch insider trading data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const trades: InsiderTrade[] = data
        .filter((item: any) => item.symbol && item.reportingName)
        .map((item: any) => ({
          symbol: item.symbol,
          filingDate: item.filingDate,
          transactionDate: item.transactionDate,
          reportingName: item.reportingName,
          typeOfOwner: item.typeOfOwner || '',
          transactionType: item.transactionType || '',
          securitiesTransacted: item.securitiesTransacted || 0,
          price: item.price || null,
          securitiesOwned: item.securitiesOwned || 0,
          securityName: item.securityName || '',
          link: item.link || '',
          acquistionOrDisposition: item.acquistionOrDisposition || '',
          formType: item.formType || '',
        }))

      return { trades }
    }

    return { trades: [] }
  } catch (error) {
    console.error('Error fetching insider trading data for symbol:', error)
    return { error: 'Failed to load insider trading data' }
  }
}
