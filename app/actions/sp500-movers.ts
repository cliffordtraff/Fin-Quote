'use server'

export interface SP500MoverData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

// S&P 500 constituent symbols (top ~500 companies)
const SP500_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'GOOG', 'BRK.B', 'TSLA', 'UNH',
  'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV',
  'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO', 'ACN',
  'ABT', 'DHR', 'NEE', 'LIN', 'ADBE', 'WFC', 'NKE', 'PM', 'TXN', 'CRM',
  'VZ', 'RTX', 'CMCSA', 'BMY', 'HON', 'ORCL', 'QCOM', 'COP', 'T', 'UPS',
  'MS', 'LOW', 'UNP', 'INTC', 'ELV', 'SPGI', 'IBM', 'CAT', 'PLD', 'BA',
  'AMD', 'GE', 'INTU', 'AMAT', 'DE', 'AMGN', 'GS', 'SBUX', 'ISRG', 'MDT',
  'AXP', 'BKNG', 'BLK', 'GILD', 'ADI', 'SYK', 'MDLZ', 'TJX', 'CVS', 'ADP',
  'REGN', 'LMT', 'CI', 'VRTX', 'PGR', 'MMC', 'SCHW', 'CB', 'ETN', 'ZTS',
  'MO', 'SO', 'DUK', 'BSX', 'BDX', 'TMUS', 'FI', 'CME', 'EOG', 'SLB',
  'NOC', 'PNC', 'MU', 'CL', 'ITW', 'AON', 'LRCX', 'CSX', 'EQIX', 'ICE',
  'WM', 'SHW', 'SNPS', 'CDNS', 'HUM', 'MCK', 'FCX', 'APD', 'KLAC', 'ORLY',
  'NSC', 'GD', 'EMR', 'MCO', 'PXD', 'PSA', 'NXPI', 'USB', 'MAR', 'ROP',
  'MNST', 'MSI', 'CTAS', 'AJG', 'ADSK', 'GM', 'F', 'AZO', 'HCA', 'PCAR',
  'OXY', 'TGT', 'MCHP', 'MSCI', 'TEL', 'TT', 'PAYX', 'AEP', 'KMB', 'TDG',
  'ANET', 'MET', 'SRE', 'PSX', 'CCI', 'D', 'O', 'KDP', 'APH', 'ECL',
  'PH', 'WELL', 'CMG', 'AIG', 'CARR', 'AFL', 'STZ', 'IDXX', 'COF', 'HLT',
  'DVN', 'DXCM', 'FTNT', 'ODFL', 'NEM', 'TRV', 'SPG', 'ALL', 'ROST', 'GWW',
  'WMB', 'BK', 'KMI', 'IQV', 'PRU', 'HSY', 'DLR', 'CTVA', 'YUM', 'A',
  'AME', 'KEYS', 'EXC', 'FAST', 'ON', 'EW', 'CPRT', 'DOW', 'DD', 'XEL',
  'PCG', 'VRSK', 'PPG', 'ED', 'EA', 'AWK', 'HPQ', 'ROK', 'KR', 'GIS',
  'VICI', 'CSGP', 'EXR', 'DHI', 'OKE', 'WEC', 'MLM', 'LEN', 'VMC', 'CTSH',
  'HAL', 'BIIB', 'BKR', 'ANSS', 'CDW', 'GLW', 'EBAY', 'RMD', 'CBRE', 'MTD',
  'ACGL', 'FTV', 'ZBH', 'HES', 'FANG', 'DAL', 'DLTR', 'DFS', 'TSCO', 'WTW',
  'HPE', 'EFX', 'ALGN', 'LH', 'AVB', 'GPN', 'TROW', 'WY', 'CAH', 'EIX',
  'STT', 'FE', 'ENPH', 'LYB', 'ES', 'MTB', 'WAB', 'HOLX', 'ILMN', 'RJF',
  'IR', 'DTE', 'ETR', 'DOV', 'FITB', 'NTRS', 'VTR', 'ARE', 'IFF', 'PPL',
  'CHD', 'BAX', 'CINF', 'SBAC', 'CLX', 'EXPD', 'PTC', 'TSN', 'AEE', 'LUV',
  'TDY', 'PKI', 'MKC', 'DRI', 'STLD', 'K', 'STE', 'RF', 'ESS', 'NVR',
  'HBAN', 'EQR', 'NDAQ', 'GRMN', 'COO', 'WAT', 'CNP', 'TRGP', 'ATO', 'MAA',
  'J', 'CFG', 'AMCR', 'JBHT', 'IP', 'FMC', 'SWK', 'WRB', 'SYY', 'EXPE',
  'SEDG', 'CE', 'LKQ', 'TXT', 'BBY', 'FDS', 'CMS', 'AES', 'KEY', 'NTAP',
  'URI', 'BALL', 'MOH', 'BR', 'DGX', 'SNA', 'IEX', 'L', 'TECH', 'OMC',
  'MAS', 'CF', 'POOL', 'AKAM', 'BRO', 'TER', 'LNT', 'CAG', 'GPC', 'AVY',
  'NI', 'UDR', 'SWKS', 'EVRG', 'VTRS', 'HST', 'KIM', 'WDC', 'CHRW', 'MGM',
  'HRL', 'PEAK', 'CPB', 'TPR', 'TFC', 'NRG', 'LDOS', 'GL', 'PNR', 'BXP',
  'JKHY', 'RCL', 'AAP', 'CZR', 'WYNN', 'PNW', 'NWS', 'NWSA', 'ROL', 'REG',
  'BEN', 'MOS', 'PHM', 'HSIC', 'FFIV', 'AAL', 'CCL', 'CPT', 'CRL', 'BWA',
  'CTLT', 'AIZ', 'WHR', 'DISH', 'IVZ', 'XRAY', 'SEE', 'ALK', 'NCLH', 'HII',
  'FRT', 'MKTX', 'EMN', 'PFG', 'APA', 'ALLE', 'HAS', 'TAP', 'QRVO', 'LW',
  'BBWI', 'DXC', 'ZION', 'WBA', 'VFC', 'PARA', 'LUMN', 'DVA', 'PAYC', 'CMA',
  'GNRC', 'BIO', 'INCY', 'UHS', 'ETSY', 'FOXA', 'FOX', 'NWL', 'MTCH', 'RL'
]

/**
 * Fetch S&P 500 gainers - top performers by percentage change
 */
export async function getSP500Gainers(): Promise<{ gainers?: SP500MoverData[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Fetch quotes for all S&P 500 stocks in batches
    const batchSize = 100
    const allQuotes: any[] = []

    for (let i = 0; i < SP500_SYMBOLS.length; i += batchSize) {
      const batch = SP500_SYMBOLS.slice(i, i + batchSize)
      const symbols = batch.join(',')
      const url = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${apiKey}`

      const response = await fetch(url, {
        next: { revalidate: 60 }
      })

      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          allQuotes.push(...data)
        }
      }
    }

    // Sort by percentage change (descending) and take top 15
    const gainers = allQuotes
      .filter((q: any) => q.changesPercentage > 0 && q.price > 0)
      .sort((a: any, b: any) => b.changesPercentage - a.changesPercentage)
      .slice(0, 15)
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage
      }))

    return { gainers }
  } catch (error) {
    console.error('Error fetching S&P 500 gainers:', error)
    return { error: 'Failed to load S&P 500 gainers' }
  }
}

/**
 * Fetch S&P 500 losers - worst performers by percentage change
 */
export async function getSP500Losers(): Promise<{ losers?: SP500MoverData[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Fetch quotes for all S&P 500 stocks in batches
    const batchSize = 100
    const allQuotes: any[] = []

    for (let i = 0; i < SP500_SYMBOLS.length; i += batchSize) {
      const batch = SP500_SYMBOLS.slice(i, i + batchSize)
      const symbols = batch.join(',')
      const url = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${apiKey}`

      const response = await fetch(url, {
        next: { revalidate: 60 }
      })

      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          allQuotes.push(...data)
        }
      }
    }

    // Sort by percentage change (ascending) and take bottom 15
    const losers = allQuotes
      .filter((q: any) => q.changesPercentage < 0 && q.price > 0)
      .sort((a: any, b: any) => a.changesPercentage - b.changesPercentage)
      .slice(0, 15)
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage
      }))

    return { losers }
  } catch (error) {
    console.error('Error fetching S&P 500 losers:', error)
    return { error: 'Failed to load S&P 500 losers' }
  }
}
