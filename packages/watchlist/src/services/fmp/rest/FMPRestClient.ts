interface FMPQuote {
  symbol: string
  name: string
  price: number
  changesPercentage: number
  change: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  marketCap: number
  priceAvg50: number
  priceAvg200: number
  exchange: string
  volume: number
  avgVolume: number
  open: number
  previousClose: number
  eps: number
  pe: number
  sharesOutstanding: number
  timestamp: number
}

interface FMPCompanyProfile {
  symbol: string
  price: number
  beta: number
  volAvg: number
  mktCap: number
  lastDiv: number
  range: string
  changes: number
  companyName: string
  currency: string
  cik: string
  isin: string
  cusip: string
  exchange: string
  exchangeShortName: string
  industry: string
  website: string
  description: string
  ceo: string
  sector: string
  country: string
  fullTimeEmployees: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  dcfDiff: number
  dcf: number
  image: string
  ipoDate: string
  defaultImage: boolean
  isEtf: boolean
  isActivelyTrading: boolean
  isAdr: boolean
  isFund: boolean
}

interface FMPNews {
  symbol: string
  publishedDate: string
  title: string
  image: string
  site: string
  text: string
  url: string
}

interface FMPDividend {
  date: string
  label: string
  adjDividend: number
  symbol: string
  dividend: number
  recordDate: string
  paymentDate: string
  declarationDate: string
}

interface FMPExtendedHoursQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  timestamp: number
}

export class FMPRestClient {
  private apiKey: string
  private baseUrl: string = 'https://financialmodelingprep.com/api'
  private cache: Map<string, { data: any, timestamp: number }> = new Map()

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private getCacheKey(endpoint: string, params?: Record<string, any>): string {
    return `${endpoint}:${JSON.stringify(params || {})}`
  }

  private async fetchWithCache<T>(
    endpoint: string,
    params?: Record<string, any>,
    cacheTTL: number = 60000 // Default 1 minute
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.data
    }

    const url = new URL(`${this.baseUrl}${endpoint}`)
    url.searchParams.append('apikey', this.apiKey)
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value))
      })
    }

    try {
      const response = await fetch(url.toString())
      
      if (!response.ok) {
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      })

      return data
    } catch (error) {
      console.error(`Error fetching from FMP API: ${endpoint}`, error)
      throw error
    }
  }

  // Get real-time quote for stocks/ETFs/indexes
  async getQuote(symbol: string): Promise<FMPQuote> {
    const data = await this.fetchWithCache<FMPQuote[]>(
      `/v3/quote/${symbol}`,
      undefined,
      5000 // 5 second cache for quotes
    )
    return data[0]
  }

  // Get batch quotes for multiple symbols
  async getBatchQuotes(symbols: string[]): Promise<FMPQuote[]> {
    const symbolString = symbols.join(',')
    return this.fetchWithCache<FMPQuote[]>(
      `/v3/quote/${symbolString}`,
      undefined,
      5000 // 5 second cache
    )
  }

  // Get company profile with fundamentals
  async getCompanyProfile(symbol: string): Promise<FMPCompanyProfile> {
    const data = await this.fetchWithCache<FMPCompanyProfile[]>(
      `/v3/profile/${symbol}`,
      undefined,
      3600000 // 1 hour cache for company profiles
    )
    return data[0]
  }

  // Get latest news for a symbol
  async getStockNews(symbol: string, limit: number = 10): Promise<FMPNews[]> {
    return this.fetchWithCache<FMPNews[]>(
      `/v3/stock_news`,
      { tickers: symbol, limit },
      300000 // 5 minute cache for news
    )
  }

  // Get market news
  async getMarketNews(limit: number = 20): Promise<FMPNews[]> {
    return this.fetchWithCache<FMPNews[]>(
      `/v4/general_news`,
      { limit },
      300000 // 5 minute cache
    )
  }

  // Get dividend calendar for a symbol
  async getDividendCalendar(symbol: string): Promise<FMPDividend[]> {
    return this.fetchWithCache<FMPDividend[]>(
      `/v3/historical-price-full/stock_dividend/${symbol}`,
      undefined,
      86400000 // 24 hour cache for dividends
    )
  }

  // Search for symbols
  async searchSymbols(query: string, limit: number = 10): Promise<any[]> {
    return this.fetchWithCache<any[]>(
      `/v3/search`,
      { query, limit },
      60000 // 1 minute cache for search
    )
  }

  // Get historical prices
  async getHistoricalPrices(
    symbol: string,
    from?: string,
    to?: string
  ): Promise<any[]> {
    const params: Record<string, any> = {}
    if (from) params.from = from
    if (to) params.to = to

    const data = await this.fetchWithCache<any>(
      `/v3/historical-price-full/${symbol}`,
      params,
      3600000 // 1 hour cache
    )
    
    return data.historical || []
  }

  // Get extended hours quote (pre-market or after-hours)
  async getExtendedHoursQuote(symbol: string): Promise<FMPExtendedHoursQuote | null> {
    try {
      const data = await this.fetchWithCache<FMPExtendedHoursQuote[]>(
        `/v4/extended-hours-quote/${symbol}`,
        undefined,
        60000 // 1 minute cache for extended hours
      )
      return data && data.length > 0 ? data[0] : null
    } catch (error) {
      console.error(`Error fetching extended hours quote for ${symbol}:`, error)
      return null
    }
  }

  // Get batch extended hours quotes
  async getBatchExtendedHoursQuotes(symbols: string[]): Promise<Map<string, FMPExtendedHoursQuote>> {
    const result = new Map<string, FMPExtendedHoursQuote>()

    // FMP's extended hours endpoint doesn't support batch, so we fetch individually
    // We'll do this in parallel to optimize performance
    const promises = symbols.map(async (symbol) => {
      const quote = await this.getExtendedHoursQuote(symbol)
      if (quote) {
        result.set(symbol, quote)
      }
    })

    await Promise.all(promises)
    return result
  }

  // Clear cache for a specific endpoint or all
  clearCache(endpoint?: string): void {
    if (endpoint) {
      const keysToDelete = Array.from(this.cache.keys()).filter(key =>
        key.startsWith(endpoint)
      )
      keysToDelete.forEach(key => this.cache.delete(key))
    } else {
      this.cache.clear()
    }
  }
}