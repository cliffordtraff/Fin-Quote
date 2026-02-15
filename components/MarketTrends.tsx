'use client'

import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { MostActiveStock } from '@/app/actions/most-active'
import type { TrendingStock } from '@/app/actions/trending-stocks'
import TickerLink from '@/components/TickerLink'

interface MarketTrendsProps {
  mostActive: MostActiveStock[]
  gainers: GainerData[]
  losers: LoserData[]
  trending: TrendingStock[]
}

interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

function MiniTable({ title, stocks, colorMode }: { title: string; stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden" style={{ width: '340px' }}>
      <div className="px-2 py-1.5 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-cream-300 dark:border-gray-700">
            <th className="text-left py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Price</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Chg%</th>
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
                className="border-b border-cream-200 dark:border-gray-800 last:border-b-0 hover:bg-cream-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1 px-2">
                  <TickerLink
                    symbol={stock.symbol}
                    className="font-medium text-gray-900 dark:text-gray-100"
                  />
                </td>
                <td className="py-1 px-2 text-right text-gray-900 dark:text-gray-100">
                  ${stock.price.toFixed(2)}
                </td>
                <td className={`py-1 px-2 text-right font-medium ${changeColor}`}>
                  {isPositive ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function MarketTrends({ mostActive, gainers, losers }: MarketTrendsProps) {
  return (
    <div className="flex gap-2">
      <MiniTable
        title="Most Active"
        stocks={mostActive.slice(0, 17)}
        colorMode="neutral"
      />
      <MiniTable
        title="Gainers"
        stocks={gainers.slice(0, 17)}
        colorMode="green"
      />
      <MiniTable
        title="Losers"
        stocks={losers.slice(0, 17)}
        colorMode="red"
      />
    </div>
  )
}
