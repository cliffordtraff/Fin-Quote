'use client'

import { useEffect, useState } from 'react'
import { getStockOverview } from '@/app/actions/stock-overview'

interface StockPriceHeaderProps {
  symbol: string
  companyName: string
  sector: string
  initialPrice: number
  initialPriceChange: number
  initialPriceChangePercent: number
  initialMarketStatus: 'open' | 'closed' | 'premarket' | 'afterhours'
}

export default function StockPriceHeader({
  symbol,
  companyName,
  sector,
  initialPrice,
  initialPriceChange,
  initialPriceChangePercent,
  initialMarketStatus
}: StockPriceHeaderProps) {
  const [price, setPrice] = useState(initialPrice)
  const [priceChange, setPriceChange] = useState(initialPriceChange)
  const [priceChangePercent, setPriceChangePercent] = useState(initialPriceChangePercent)
  const [marketStatus, setMarketStatus] = useState(initialMarketStatus)

  // Polling effect - refresh price every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getStockOverview(symbol)
        if (data) {
          setPrice(data.currentPrice)
          setPriceChange(data.priceChange)
          setPriceChangePercent(data.priceChangePercent)
          setMarketStatus(data.marketStatus)
        }
      } catch (error) {
        console.error('Failed to refresh stock price:', error)
        // Keep showing last good data on error
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [symbol])

  return (
    <section className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-[rgb(45,45,45)]/90 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center">
        <div className="flex items-center justify-between w-full">
          {/* Company Info */}
          <div className="flex items-end gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none">
              {companyName}
            </h1>
            <span className="text-sm text-gray-500 dark:text-gray-400 leading-none">
              {symbol} · {sector}
            </span>
          </div>

          {/* Price Display */}
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              ${price.toFixed(2)}
            </div>
            <div
              className={`text-sm font-semibold ${
                priceChange >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)} (
              {priceChangePercent.toFixed(2)}%)
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                marketStatus === 'open'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : marketStatus === 'closed'
                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              }`}
            >
              {marketStatus === 'open' && 'Open'}
              {marketStatus === 'closed' && 'Closed'}
              {marketStatus === 'premarket' && 'Pre-Market'}
              {marketStatus === 'afterhours' && 'After Hours'}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
