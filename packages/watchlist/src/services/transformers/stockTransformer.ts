import { Stock } from '@watchlist/types'

// Transform FMP WebSocket message to our Stock interface
export function transformWebSocketData(wsData: any): Partial<Stock> {
  return {
    symbol: wsData.symbol?.toUpperCase() || wsData.s?.toUpperCase(),
    price: wsData.price || wsData.p,
    bid: wsData.bid || wsData.b,
    ask: wsData.ask || wsData.a,
    bidSize: wsData.bidSize || wsData.bs,
    askSize: wsData.askSize || wsData.as,
    volume: wsData.volume || wsData.v,
    lastUpdated: new Date(wsData.timestamp || wsData.t || Date.now())
  }
}

// Transform FMP REST quote data to our Stock interface
export function transformQuoteData(fmpQuote: any): Stock {
  const changePercent = fmpQuote.changesPercentage || 0
  const change = fmpQuote.change || 0
  
  return {
    symbol: fmpQuote.symbol,
    name: fmpQuote.name || '',
    price: fmpQuote.price || 0,
    change: change,
    changePercent: changePercent,
    volume: fmpQuote.volume || 0,
    // Use actual bid/ask from FMP if available, otherwise fallback to price ± spread
    bid: fmpQuote.bid ?? (fmpQuote.price - 0.01),
    ask: fmpQuote.ask ?? (fmpQuote.price + 0.01),
    bidSize: fmpQuote.bidSize ?? 0,
    askSize: fmpQuote.askSize ?? 0,
    dayLow: fmpQuote.dayLow || 0,
    dayHigh: fmpQuote.dayHigh || 0,
    weekLow52: fmpQuote.yearLow || 0,
    weekHigh52: fmpQuote.yearHigh || 0,
    marketCap: fmpQuote.marketCap || 0,
    peRatio: fmpQuote.pe || null,
    eps: fmpQuote.eps || null,
    dividendYield: null, // Will be populated from company profile
    exDividendDate: null, // Will be populated from dividend calendar
    lastUpdated: new Date()
  }
}

// Transform FMP company profile to enrich Stock data
export function enrichWithCompanyProfile(stock: Stock, profile: any): Stock {
  return {
    ...stock,
    name: profile.companyName || stock.name,
    marketCap: profile.mktCap || stock.marketCap,
    peRatio: profile.pe || stock.peRatio,
    eps: profile.eps || stock.eps,
    dividendYield: profile.lastDiv ? (profile.lastDiv / profile.price) * 100 : null
  }
}

// Transform FMP dividend data to get ex-dividend date
export function enrichWithDividendData(stock: Stock, dividends: any[]): Stock {
  if (!dividends || dividends.length === 0) {
    return stock
  }

  // Find the next ex-dividend date
  const today = new Date()
  const futureDividends = dividends.filter(d => 
    new Date(d.date) >= today
  ).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  if (futureDividends.length > 0) {
    return {
      ...stock,
      exDividendDate: futureDividends[0].date
    }
  }

  // If no future dividends, get the most recent one
  const pastDividends = dividends.filter(d => 
    new Date(d.date) < today
  ).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return {
    ...stock,
    exDividendDate: pastDividends[0]?.date || null
  }
}

// Merge WebSocket real-time data with cached fundamental data
export function mergeRealtimeWithFundamentals(
  realtimeData: Partial<Stock>,
  fundamentalData: Stock
): Stock {
  return {
    ...fundamentalData,
    ...realtimeData,
    // Calculate change and changePercent from real-time price
    change: realtimeData.price && fundamentalData.price 
      ? realtimeData.price - fundamentalData.price 
      : fundamentalData.change,
    changePercent: realtimeData.price && fundamentalData.price && fundamentalData.price !== 0
      ? ((realtimeData.price - fundamentalData.price) / fundamentalData.price) * 100
      : fundamentalData.changePercent,
    lastUpdated: new Date()
  }
}