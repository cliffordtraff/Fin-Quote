'use server'

export interface TrendingStock {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  headline: string
  source: string
  publishedDate: string
}

/**
 * Fetch trending stocks with their latest news headlines
 * Combines most active stocks data with stock-specific news
 */
export async function getTrendingStocksData(): Promise<{ trending?: TrendingStock[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // First, get most active stocks
    const activeUrl = `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`
    const activeResponse = await fetch(activeUrl, {
      next: { revalidate: 60 }
    })

    if (!activeResponse.ok) {
      throw new Error('Failed to fetch active stocks')
    }

    const activeData = await activeResponse.json()

    if (!Array.isArray(activeData) || activeData.length === 0) {
      return { trending: [] }
    }

    // Take top 10 most active stocks
    const topStocks = activeData.slice(0, 10).filter((item: any) => item.price > 0)
    const symbols = topStocks.map((s: any) => s.symbol)

    // Fetch news for these symbols
    const newsUrl = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbols.join(',')}&limit=30&apikey=${apiKey}`
    const newsResponse = await fetch(newsUrl, {
      next: { revalidate: 300 } // Cache news for 5 minutes
    })

    const newsData = newsResponse.ok ? await newsResponse.json() : []

    // Create a map of symbol to latest news
    const newsMap = new Map<string, { title: string; site: string; publishedDate: string }>()
    if (Array.isArray(newsData)) {
      for (const news of newsData) {
        if (news.symbol && !newsMap.has(news.symbol)) {
          newsMap.set(news.symbol, {
            title: news.title || '',
            site: news.site || '',
            publishedDate: news.publishedDate || ''
          })
        }
      }
    }

    // Combine stock data with news
    const trending: TrendingStock[] = topStocks.map((stock: any) => {
      const news = newsMap.get(stock.symbol)
      return {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        change: stock.change,
        changesPercentage: stock.changesPercentage,
        headline: news?.title || '',
        source: news?.site || '',
        publishedDate: news?.publishedDate || ''
      }
    })

    return { trending }
  } catch (error) {
    console.error('Error fetching trending stocks:', error)
    return { error: 'Failed to load trending stocks' }
  }
}
