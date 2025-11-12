'use server'

export interface MarketBreadthData {
  advanceDeclineRatio: number
  advancing: number
  declining: number
  unchanged: number
  fiftyTwoWeekHighs: number
  fiftyTwoWeekLows: number
  aboveTwoHundredDayMA: number
  totalStocks: number
}

export async function getMarketBreadthData() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Use S&P 500 constituents to calculate market breadth
    // Fetch a sample of actives to get a representative view
    const activesUrl = `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`

    const activesResponse = await fetch(activesUrl, {
      next: { revalidate: 300 } // Cache for 5 minutes (less frequent updates needed)
    })

    if (!activesResponse.ok) {
      throw new Error('Failed to fetch market data')
    }

    const activesData = await activesResponse.json()

    // Get quotes for the most active stocks to determine breadth
    if (Array.isArray(activesData) && activesData.length > 0) {
      const symbols = activesData.slice(0, 100).map((item: any) => item.symbol).join(',')
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${apiKey}`

      const quoteResponse = await fetch(quoteUrl, {
        next: { revalidate: 300 }
      })

      const quoteData = await quoteResponse.json()

      if (!Array.isArray(quoteData)) {
        throw new Error('Invalid quote data')
      }

      // Calculate market breadth metrics
      let advancing = 0
      let declining = 0
      let unchanged = 0
      let fiftyTwoWeekHighs = 0
      let fiftyTwoWeekLows = 0
      let aboveTwoHundredDayMA = 0

      quoteData.forEach((quote: any) => {
        // Advance/Decline
        if (quote.change > 0) {
          advancing++
        } else if (quote.change < 0) {
          declining++
        } else {
          unchanged++
        }

        // 52-week highs and lows (within 2% of the extreme)
        if (quote.price && quote.yearHigh) {
          const percentFromHigh = ((quote.yearHigh - quote.price) / quote.yearHigh) * 100
          if (percentFromHigh <= 2) {
            fiftyTwoWeekHighs++
          }
        }

        if (quote.price && quote.yearLow) {
          const percentFromLow = ((quote.price - quote.yearLow) / quote.yearLow) * 100
          if (percentFromLow <= 2) {
            fiftyTwoWeekLows++
          }
        }

        // Above 200-day MA (use priceAvg200 if available)
        if (quote.price && quote.priceAvg200) {
          if (quote.price > quote.priceAvg200) {
            aboveTwoHundredDayMA++
          }
        }
      })

      const totalStocks = quoteData.length
      const advanceDeclineRatio = declining > 0 ? advancing / declining : advancing

      const breadthData: MarketBreadthData = {
        advanceDeclineRatio,
        advancing,
        declining,
        unchanged,
        fiftyTwoWeekHighs,
        fiftyTwoWeekLows,
        aboveTwoHundredDayMA,
        totalStocks
      }

      return { breadth: breadthData }
    }

    return { error: 'No market data available' }
  } catch (error) {
    console.error('Error fetching market breadth data:', error)
    return { error: 'Failed to load market breadth data' }
  }
}
