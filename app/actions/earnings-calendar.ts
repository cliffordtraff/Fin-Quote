'use server'

export interface EarningsData {
  symbol: string
  name: string
  date: string
  time: 'bmo' | 'amc' | 'dmh' | null  // before market open, after market close, during market hours
  fiscalDateEnding: string
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
}

export async function fetchEarningsCalendar(): Promise<EarningsData[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.error('FMP_API_KEY not set')
    return []
  }

  try {
    // Get earnings for the next 2 weeks
    const today = new Date()
    const twoWeeksLater = new Date(today)
    twoWeeksLater.setDate(today.getDate() + 14)

    const fromDate = today.toISOString().split('T')[0]
    const toDate = twoWeeksLater.toISOString().split('T')[0]

    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromDate}&to=${toDate}&apikey=${apiKey}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    )

    if (!response.ok) {
      console.error('Failed to fetch earnings calendar:', response.status)
      return []
    }

    const data = await response.json()

    // Filter to well-known stocks (by market cap or popularity)
    // FMP returns many small caps, so we'll filter to larger companies
    const popularSymbols = new Set([
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.A', 'BRK.B',
      'JPM', 'JNJ', 'V', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'NFLX',
      'ADBE', 'CRM', 'INTC', 'CSCO', 'PEP', 'KO', 'NKE', 'MRK', 'PFE', 'TMO',
      'ABT', 'ABBV', 'CVX', 'XOM', 'WMT', 'COST', 'MCD', 'WFC', 'BAC', 'GS',
      'MS', 'C', 'IBM', 'ORCL', 'AMD', 'QCOM', 'TXN', 'AVGO', 'NOW', 'UBER',
      'ABNB', 'SQ', 'SNAP', 'SPOT', 'ZM', 'SHOP', 'SE', 'NET', 'DDOG', 'SNOW',
      'BA', 'CAT', 'GE', 'MMM', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'DE',
      'T', 'VZ', 'TMUS', 'CMCSA', 'CHTR', 'F', 'GM', 'TM', 'RIVN', 'LCID',
      'COF', 'AXP', 'SCHW', 'BLK', 'SPGI', 'CME', 'ICE', 'MCO', 'COIN', 'HOOD',
      'FCX', 'NEM', 'GOLD', 'AA', 'CLF', 'X', 'NUE', 'STLD'
    ])

    const filtered = data
      .filter((item: any) => popularSymbols.has(item.symbol))
      .slice(0, 15)
      .map((item: any) => ({
        symbol: item.symbol,
        name: getCompanyName(item.symbol),
        date: item.date,
        time: item.time || null,
        fiscalDateEnding: item.fiscalDateEnding,
        eps: item.eps,
        epsEstimated: item.epsEstimated,
        revenue: item.revenue,
        revenueEstimated: item.revenueEstimated,
      }))

    return filtered
  } catch (error) {
    console.error('Error fetching earnings calendar:', error)
    return []
  }
}

// Simple mapping for popular company names
function getCompanyName(symbol: string): string {
  const names: Record<string, string> = {
    'AAPL': 'Apple',
    'MSFT': 'Microsoft',
    'GOOGL': 'Alphabet',
    'GOOG': 'Alphabet',
    'AMZN': 'Amazon',
    'NVDA': 'NVIDIA',
    'META': 'Meta Platforms',
    'TSLA': 'Tesla',
    'JPM': 'JPMorgan Chase',
    'JNJ': 'Johnson & Johnson',
    'V': 'Visa',
    'PG': 'Procter & Gamble',
    'UNH': 'UnitedHealth',
    'HD': 'Home Depot',
    'MA': 'Mastercard',
    'DIS': 'Walt Disney',
    'PYPL': 'PayPal',
    'NFLX': 'Netflix',
    'ADBE': 'Adobe',
    'CRM': 'Salesforce',
    'INTC': 'Intel',
    'CSCO': 'Cisco',
    'PEP': 'PepsiCo',
    'KO': 'Coca-Cola',
    'NKE': 'Nike',
    'MRK': 'Merck',
    'PFE': 'Pfizer',
    'TMO': 'Thermo Fisher',
    'ABT': 'Abbott',
    'ABBV': 'AbbVie',
    'CVX': 'Chevron',
    'XOM': 'Exxon Mobil',
    'WMT': 'Walmart',
    'COST': 'Costco',
    'MCD': "McDonald's",
    'WFC': 'Wells Fargo',
    'BAC': 'Bank of America',
    'GS': 'Goldman Sachs',
    'MS': 'Morgan Stanley',
    'C': 'Citigroup',
    'IBM': 'IBM',
    'ORCL': 'Oracle',
    'AMD': 'AMD',
    'QCOM': 'Qualcomm',
    'TXN': 'Texas Instruments',
    'AVGO': 'Broadcom',
    'NOW': 'ServiceNow',
    'UBER': 'Uber',
    'ABNB': 'Airbnb',
    'SQ': 'Block',
    'SNAP': 'Snap',
    'SPOT': 'Spotify',
    'ZM': 'Zoom',
    'SHOP': 'Shopify',
    'NET': 'Cloudflare',
    'DDOG': 'Datadog',
    'SNOW': 'Snowflake',
    'BA': 'Boeing',
    'CAT': 'Caterpillar',
    'GE': 'General Electric',
    'MMM': '3M',
    'HON': 'Honeywell',
    'UPS': 'UPS',
    'FDX': 'FedEx',
    'LMT': 'Lockheed Martin',
    'RTX': 'RTX',
    'DE': 'Deere',
    'T': 'AT&T',
    'VZ': 'Verizon',
    'TMUS': 'T-Mobile',
    'CMCSA': 'Comcast',
    'F': 'Ford',
    'GM': 'General Motors',
    'TM': 'Toyota',
    'COF': 'Capital One',
    'AXP': 'American Express',
    'BLK': 'BlackRock',
    'COIN': 'Coinbase',
    'FCX': 'Freeport-McMoRan',
    'NEM': 'Newmont',
    'AA': 'Alcoa',
  }
  return names[symbol] || symbol
}
