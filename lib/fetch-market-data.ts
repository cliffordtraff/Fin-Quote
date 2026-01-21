'use server'

import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData, getESFuturesMarketData } from '@/app/actions/market-data'
import { getFuturesData, getFuturesWithHistory } from '@/app/actions/futures'
import { getGainersData } from '@/app/actions/gainers'
import { getLosersData } from '@/app/actions/losers'
import { getStocksData } from '@/app/actions/stocks'
import { getSectorPerformance } from '@/app/actions/sectors'
import { getVIXData } from '@/app/actions/vix'
import { getEconomicEvents } from '@/app/actions/economic-calendar'
import { getMarketNews } from '@/app/actions/get-market-news'
import { getSparklineIndicesData } from '@/app/actions/sparkline-indices'
import type { AllMarketData, MarketData, FutureData, FutureMarketData } from './market-types'

/**
 * Fetches all market data in parallel.
 * Can be called from:
 * 1. Server component (initial SSR load)
 * 2. Client component (polling for updates)
 *
 * Each section that fails returns null/empty, others continue to display.
 */
export async function fetchAllMarketData(): Promise<AllMarketData> {
  const [
    spxResult,
    nasdaqResult,
    dowResult,
    russellResult,
    esFuturesResult,
    futuresResult,
    futuresWithHistoryResult,
    gainersResult,
    losersResult,
    stocksResult,
    sectorsResult,
    vixResult,
    economicResult,
    newsResult,
    commoditiesResult
  ] = await Promise.all([
    getAaplMarketData(),
    getNasdaqMarketData(),
    getDowMarketData(),
    getRussellMarketData(),
    getESFuturesMarketData(),
    getFuturesData(),
    getFuturesWithHistory(),
    getGainersData(),
    getLosersData(),
    getStocksData(),
    getSectorPerformance(),
    getVIXData(),
    getEconomicEvents(),
    getMarketNews(6),
    getSparklineIndicesData()
  ])

  // Process results - gracefully handle failures per-section
  return {
    spx: 'error' in spxResult ? null : spxResult as MarketData,
    nasdaq: 'error' in nasdaqResult ? null : nasdaqResult as MarketData,
    dow: 'error' in dowResult ? null : dowResult as MarketData,
    russell: 'error' in russellResult ? null : russellResult as MarketData,
    esFutures: 'error' in esFuturesResult ? null : esFuturesResult as MarketData,
    futures: 'error' in futuresResult ? [] : (futuresResult.futures as FutureData[]),
    futuresWithHistory: 'error' in futuresWithHistoryResult ? [] : (futuresWithHistoryResult.futuresWithHistory as FutureMarketData[]),
    gainers: 'error' in gainersResult ? [] : gainersResult.gainers,
    losers: 'error' in losersResult ? [] : losersResult.losers,
    stocks: 'error' in stocksResult ? [] : stocksResult.stocks,
    sectors: 'error' in sectorsResult || !('sectors' in sectorsResult) ? [] : sectorsResult.sectors,
    vix: 'error' in vixResult || !('vix' in vixResult) ? null : vixResult.vix,
    economicEvents: 'error' in economicResult || !('events' in economicResult) ? [] : economicResult.events,
    marketNews: newsResult || [],
    sparklineIndices: 'error' in commoditiesResult || !('indices' in commoditiesResult) ? [] : commoditiesResult.indices
  }
}
