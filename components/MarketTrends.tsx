'use client'

import { useState } from 'react'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { MostActiveStock } from '@/app/actions/most-active'
import type { TrendingStock } from '@/app/actions/trending-stocks'

type TabType = 'most-active' | 'gainers' | 'losers'

interface MarketTrendsProps {
  mostActive: MostActiveStock[]
  gainers: GainerData[]
  losers: LoserData[]
  trending: TrendingStock[]
}

function formatRelativeTime(dateString: string): string {
  if (!dateString) return ''

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  }
}

interface StockRowProps {
  symbol: string
  name: string
  price: number
  changesPercentage: number
  headline?: string
  source?: string
  publishedDate?: string
}

function StockRow({ symbol, name, price, changesPercentage, headline, source, publishedDate }: StockRowProps) {
  const isPositive = changesPercentage >= 0

  return (
    <div className="flex items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Symbol Badge */}
      <div className="w-16 flex-shrink-0">
        <span className="inline-block px-2 py-1 text-xs font-semibold text-white bg-gray-800 dark:bg-gray-600 rounded">
          {symbol}
        </span>
      </div>

      {/* Name & Headline */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
          {name}
        </div>
        {headline && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {headline}
            {source && publishedDate && (
              <span className="text-gray-400 dark:text-gray-500">
                {' '}{source} · {formatRelativeTime(publishedDate)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="w-24 text-right font-medium text-sm text-gray-900 dark:text-gray-100">
        ${price.toFixed(2)}
      </div>

      {/* Change Percentage */}
      <div className="w-24 text-right">
        <span
          className={`inline-block px-2 py-1 text-xs font-medium rounded ${
            isPositive
              ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
              : 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
          }`}
        >
          {isPositive ? '↑' : '↓'} {Math.abs(changesPercentage).toFixed(2)}%
        </span>
      </div>

      {/* Add Button */}
      <div className="w-10 text-right pl-2">
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path strokeLinecap="round" strokeWidth="2" d="M12 8v8M8 12h8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function MarketTrends({ mostActive, gainers, losers, trending }: MarketTrendsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('most-active')

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'most-active', label: 'Most active', icon: '📊' },
    { key: 'gainers', label: 'Gainers', icon: '📈' },
    { key: 'losers', label: 'Losers', icon: '📉' },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'most-active':
        return mostActive.slice(0, 8).map((stock) => {
          const trendingStock = trending.find(t => t.symbol === stock.symbol)
          return (
            <StockRow
              key={stock.symbol}
              symbol={stock.symbol}
              name={stock.name}
              price={stock.price}
              changesPercentage={stock.changesPercentage}
              headline={trendingStock?.headline}
              source={trendingStock?.source}
              publishedDate={trendingStock?.publishedDate}
            />
          )
        })
      case 'gainers':
        return gainers.slice(0, 8).map((stock) => {
          const trendingStock = trending.find(t => t.symbol === stock.symbol)
          return (
            <StockRow
              key={stock.symbol}
              symbol={stock.symbol}
              name={stock.name}
              price={stock.price}
              changesPercentage={stock.changesPercentage}
              headline={trendingStock?.headline}
              source={trendingStock?.source}
              publishedDate={trendingStock?.publishedDate}
            />
          )
        })
      case 'losers':
        return losers.slice(0, 8).map((stock) => {
          const trendingStock = trending.find(t => t.symbol === stock.symbol)
          return (
            <StockRow
              key={stock.symbol}
              symbol={stock.symbol}
              name={stock.name}
              price={stock.price}
              changesPercentage={stock.changesPercentage}
              headline={trendingStock?.headline}
              source={trendingStock?.source}
              publishedDate={trendingStock?.publishedDate}
            />
          )
        })
      default:
        return null
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[rgb(28,28,28)] overflow-hidden flex-1">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Market Trends</h2>
      </div>

      {/* Tabs */}
      <div className="px-4 pb-2 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {renderContent()}
      </div>
    </div>
  )
}
