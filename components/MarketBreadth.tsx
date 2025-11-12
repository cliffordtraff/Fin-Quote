'use client'

interface MarketBreadthData {
  advanceDeclineRatio: number
  advancing: number
  declining: number
  unchanged: number
  fiftyTwoWeekHighs: number
  fiftyTwoWeekLows: number
  aboveTwoHundredDayMA: number
  totalStocks: number
}

interface MarketBreadthProps {
  breadth: MarketBreadthData | null
}

export default function MarketBreadth({ breadth }: MarketBreadthProps) {
  if (!breadth) {
    return (
      <div className="w-full max-w-4xl">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center text-gray-500 dark:text-gray-400">
            Loading market breadth data...
          </div>
        </div>
      </div>
    )
  }

  const advancingPercent = (breadth.advancing / breadth.totalStocks) * 100
  const aboveMAPercent = (breadth.aboveTwoHundredDayMA / breadth.totalStocks) * 100

  // Determine market sentiment
  const getSentiment = () => {
    if (advancingPercent >= 60) return { label: 'Bullish', color: 'text-green-500' }
    if (advancingPercent >= 45) return { label: 'Neutral', color: 'text-yellow-500' }
    return { label: 'Bearish', color: 'text-red-500' }
  }

  const sentiment = getSentiment()

  return (
    <div className="w-full max-w-4xl">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Market Breadth Indicators
        </h3>

        <div className="grid grid-cols-3 gap-6">
          {/* Advance/Decline Ratio */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Advance/Decline Ratio
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {breadth.advanceDeclineRatio.toFixed(2)}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span className="text-green-500">{breadth.advancing} advancing</span>
              {' / '}
              <span className="text-red-500">{breadth.declining} declining</span>
            </div>
            <div className={`text-sm font-semibold mt-2 ${sentiment.color}`}>
              {sentiment.label}
            </div>
          </div>

          {/* 52-Week Highs vs Lows */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              52-Week Highs vs Lows
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {breadth.fiftyTwoWeekHighs} / {breadth.fiftyTwoWeekLows}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Stocks near extremes
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{
                  width: `${(breadth.fiftyTwoWeekHighs / (breadth.fiftyTwoWeekHighs + breadth.fiftyTwoWeekLows || 1)) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Stocks Above 200-Day MA */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Above 200-Day MA
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {aboveMAPercent.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {breadth.aboveTwoHundredDayMA} of {breadth.totalStocks} stocks
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full ${aboveMAPercent >= 50 ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${aboveMAPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
