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

export interface FutureDataWithSparkline extends FutureData {
  ytdPriceHistory: Array<{ date: string; close: number }>
  ytdChangePercent: number
}

export interface FutureMarketData {
  symbol: string
  name: string
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

// Re-export types from server actions for convenience
export type { GainerData } from '@/app/actions/gainers'
export type { LoserData } from '@/app/actions/losers'
export type { StockData } from '@/app/actions/stocks'
export type { SectorData } from '@/app/actions/sectors'
export type { VIXData } from '@/app/actions/vix'
export type { EconomicEvent } from '@/app/actions/economic-calendar'
export type { MarketNewsItem } from '@/app/actions/get-market-news'
export type { SparklineIndexData } from '@/app/actions/sparkline-indices'
export type { MostActiveStock } from '@/app/actions/most-active'
export type { TrendingStock } from '@/app/actions/trending-stocks'
export type { SP500MoverData } from '@/app/actions/sp500-movers'
export type { EarningsData } from '@/app/actions/earnings-calendar'
export type { SP500GainerSparklineData } from '@/app/actions/sp500-gainer-sparklines'
export type { SP500LoserSparklineData } from '@/app/actions/sp500-loser-sparklines'
export type { StockSparklineData } from '@/app/actions/stock-sparkline'
export type { ForexBondData } from '@/app/actions/forex-bonds'
export type { LargeInsiderTrade } from '@/app/actions/insider-trading'
export type { GlobalIndexQuote, FuturesQuote } from '@/app/actions/global-indices'

// Aggregated market data structure passed from server to client
export interface AllMarketData {
  spx: MarketData | null
  nasdaq: MarketData | null
  dow: MarketData | null
  russell: MarketData | null
  esFutures: MarketData | null
  futures: FutureDataWithSparkline[]
  futuresWithHistory: FutureMarketData[]
  gainers: import('@/app/actions/gainers').GainerData[]
  losers: import('@/app/actions/losers').LoserData[]
  stocks: import('@/app/actions/stocks').StockData[]
  sectors: import('@/app/actions/sectors').SectorData[]
  vix: import('@/app/actions/vix').VIXData | null
  economicEvents: import('@/app/actions/economic-calendar').EconomicEvent[]
  marketNews: import('@/app/actions/get-market-news').MarketNewsItem[]
  sparklineIndices: import('@/app/actions/sparkline-indices').SparklineIndexData[]
  mostActive: import('@/app/actions/most-active').MostActiveStock[]
  trending: import('@/app/actions/trending-stocks').TrendingStock[]
  sp500Gainers: import('@/app/actions/sp500-movers').SP500MoverData[]
  sp500Losers: import('@/app/actions/sp500-movers').SP500MoverData[]
  earnings: import('@/app/actions/earnings-calendar').EarningsData[]
  earningsTotalCount: number  // Total companies reporting this week (before filtering to popular stocks)
  sp500GainerSparklines: import('@/app/actions/sp500-gainer-sparklines').SP500GainerSparklineData[]
  sp500LoserSparklines: import('@/app/actions/sp500-loser-sparklines').SP500LoserSparklineData[]
  metaSparkline: import('@/app/actions/stock-sparkline').StockSparklineData | null
  xlbSparkline: import('@/app/actions/stock-sparkline').StockSparklineData | null
  forexBonds: import('@/app/actions/forex-bonds').ForexBondData[]
  largeInsiderTrades: import('@/app/actions/insider-trading').LargeInsiderTrade[]
  globalIndexQuotes: import('@/app/actions/global-indices').GlobalIndexQuote[]
  globalFuturesQuotes: import('@/app/actions/global-indices').FuturesQuote[]
}
