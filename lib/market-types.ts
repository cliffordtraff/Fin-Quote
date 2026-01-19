// Shared types for market data used by both server and client components

export interface MarketData {
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

export interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

// Re-export types from server actions for convenience
export type { GainerData } from '@/app/actions/gainers'
export type { LoserData } from '@/app/actions/losers'
export type { StockData } from '@/app/actions/stocks'
export type { SectorData } from '@/app/actions/sectors'
export type { VIXData } from '@/app/actions/vix'
export type { EconomicEvent } from '@/app/actions/economic-calendar'

// Aggregated market data structure passed from server to client
export interface AllMarketData {
  spx: MarketData | null
  nasdaq: MarketData | null
  dow: MarketData | null
  russell: MarketData | null
  futures: FutureData[]
  gainers: import('@/app/actions/gainers').GainerData[]
  losers: import('@/app/actions/losers').LoserData[]
  stocks: import('@/app/actions/stocks').StockData[]
  sectors: import('@/app/actions/sectors').SectorData[]
  vix: import('@/app/actions/vix').VIXData | null
  economicEvents: import('@/app/actions/economic-calendar').EconomicEvent[]
}
