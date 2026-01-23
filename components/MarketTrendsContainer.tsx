'use client'

import { useState } from 'react'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SP500MoverData } from '@/app/actions/sp500-movers'

type TrendCategory = 'indexes' | 'gainers' | 'losers' | 'sp500-gainers' | 'sp500-losers'

interface MarketTrendsContainerProps {
  gainers: GainerData[]
  losers: LoserData[]
  sp500Gainers: SP500MoverData[]
  sp500Losers: SP500MoverData[]
}

interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

const CATEGORIES: { key: TrendCategory; label: string; icon: string }[] = [
  { key: 'indexes', label: 'Market indexes', icon: '📈' },
  { key: 'gainers', label: 'Gainers', icon: '📈' },
  { key: 'losers', label: 'Losers', icon: '📉' },
  { key: 'sp500-gainers', label: 'S&P 500 Gainers', icon: '🏆' },
  { key: 'sp500-losers', label: 'S&P 500 Losers', icon: '📉' },
]

function StockTable({ stocks, colorMode }: { stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Symbol</th>
          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
          <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Price</th>
          <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Change</th>
        </tr>
      </thead>
      <tbody>
        {stocks.map((stock) => {
          const isPositive = stock.changesPercentage >= 0
          let changeColor: string
          if (colorMode === 'green') {
            changeColor = 'text-green-600 dark:text-green-400'
          } else if (colorMode === 'red') {
            changeColor = 'text-red-600 dark:text-red-400'
          } else {
            changeColor = isPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }

          return (
            <tr
              key={stock.symbol}
              className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">
                {stock.symbol}
              </td>
              <td className="py-2 px-3 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                {stock.name}
              </td>
              <td className="py-2 px-3 text-right text-gray-900 dark:text-gray-100">
                ${stock.price.toFixed(2)}
              </td>
              <td className={`py-2 px-3 text-right font-medium ${changeColor}`}>
                {isPositive ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function MarketTrendsContainer({ gainers, losers, sp500Gainers, sp500Losers }: MarketTrendsContainerProps) {
  const [activeCategory, setActiveCategory] = useState<TrendCategory>('gainers')

  const renderContent = () => {
    switch (activeCategory) {
      case 'indexes':
        return (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            Market indexes coming soon
          </div>
        )
      case 'gainers':
        return <StockTable stocks={gainers.slice(0, 15)} colorMode="green" />
      case 'losers':
        return <StockTable stocks={losers.slice(0, 15)} colorMode="red" />
      case 'sp500-gainers':
        return <StockTable stocks={sp500Gainers.slice(0, 15)} colorMode="green" />
      case 'sp500-losers':
        return <StockTable stocks={sp500Losers.slice(0, 15)} colorMode="red" />
      default:
        return null
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '500px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Market trends</h2>
      </div>

      {/* Category Buttons */}
      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              activeCategory === cat.key
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}
