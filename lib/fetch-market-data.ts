'use server'

import { getAaplMarketData, getNasdaqMarketData, getDowMarketData, getRussellMarketData, getESFuturesMarketData } from '@/app/actions/market-data'
import { getFuturesWithYTDSparkline, getFuturesWithHistory } from '@/app/actions/futures'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import { getStocksData } from '@/app/actions/stocks'
import { getSectorPerformance } from '@/app/actions/sectors'
import { getVIXData } from '@/app/actions/vix'
import { getEconomicEvents } from '@/app/actions/economic-calendar'
import { getMarketNews } from '@/app/actions/get-market-news'
import { getSparklineIndicesData } from '@/app/actions/sparkline-indices'
import { getMostActiveData } from '@/app/actions/most-active'
import { getTrendingStocksData } from '@/app/actions/trending-stocks'
import { getSP500Gainers, getSP500Losers } from '@/app/actions/sp500-movers'
import { fetchEarningsCalendar } from '@/app/actions/earnings-calendar'
import { getSP500GainerSparklines } from '@/app/actions/sp500-gainer-sparklines'
import { getSP500LoserSparklines } from '@/app/actions/sp500-loser-sparklines'
import { getStockSparkline } from '@/app/actions/stock-sparkline'
import { getForexBondsData } from '@/app/actions/forex-bonds'
import { getLargestInsiderTrades } from '@/app/actions/insider-trading'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'
import { getCachedMarketSummary } from '@/app/actions/market-summary'
import { getCachedMarketTrendsBullets } from '@/app/actions/market-trends-responses'
import { createAsyncTTLCache } from '@/lib/async-ttl-cache'
import type { AllMarketData, MarketData, FutureDataWithSparkline, FutureMarketData } from './market-types'

const getCachedFastMarketData = createAsyncTTLCache<Partial<AllMarketData>>(15_000)
const getCachedSlowMarketData = createAsyncTTLCache<Partial<AllMarketData>>(5 * 60_000)
const getCachedAllMarketData = createAsyncTTLCache<AllMarketData>(60_000)

/**
 * Fetches all market data in parallel.
 * Can be called from:
 * 1. Server component (initial SSR load)
 * 2. Client component (polling for updates)
 *
 * Each section that fails returns null/empty, others continue to display.
 */
async function loadFastMarketData(): Promise<Partial<AllMarketData>> {
  const [
    spxResult,
    nasdaqResult,
    dowResult,
    russellResult,
    gainersResult,
    losersResult,
    stocksResult,
    vixResult,
    mostActiveResult,
    trendingResult,
    sp500GainersResult,
    sp500LosersResult,
    commoditiesResult
  ] = await Promise.all([
    getAaplMarketData(),
    getNasdaqMarketData(),
    getDowMarketData(),
    getRussellMarketData(),
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
    getStocksData(),
    getVIXData(),
    getMostActiveData(),
    getTrendingStocksData(),
    getSP500Gainers(),
    getSP500Losers(),
    getSparklineIndicesData(),
  ])

  return {
    spx: 'error' in spxResult ? null : spxResult as MarketData,
    nasdaq: 'error' in nasdaqResult ? null : nasdaqResult as MarketData,
    dow: 'error' in dowResult ? null : dowResult as MarketData,
    russell: 'error' in russellResult ? null : russellResult as MarketData,
    gainers: gainersResult,
    losers: losersResult,
    stocks: 'error' in stocksResult ? [] : stocksResult.stocks,
    vix: 'error' in vixResult || !('vix' in vixResult) ? null : vixResult.vix,
    mostActive: 'error' in mostActiveResult || !('mostActive' in mostActiveResult) ? [] : mostActiveResult.mostActive || [],
    trending: 'error' in trendingResult || !('trending' in trendingResult) ? [] : trendingResult.trending || [],
    sp500Gainers: 'error' in sp500GainersResult || !('gainers' in sp500GainersResult) ? [] : sp500GainersResult.gainers || [],
    sp500Losers: 'error' in sp500LosersResult || !('losers' in sp500LosersResult) ? [] : sp500LosersResult.losers || [],
    sparklineIndices: 'error' in commoditiesResult || !('indices' in commoditiesResult) ? [] : commoditiesResult.indices || [],
  }
}

export async function fetchFastMarketData(): Promise<Partial<AllMarketData>> {
  return getCachedFastMarketData(loadFastMarketData)
}

async function loadSlowMarketData(): Promise<Partial<AllMarketData>> {
  const [
    esFuturesResult,
    futuresResult,
    futuresWithHistoryResult,
    sectorsResult,
    economicResult,
    newsResult,
    earningsResult,
    sp500GainerSparklinesResult,
    sp500LoserSparklinesResult,
    metaSparklineResult,
    xlbSparklineResult,
    forexBondsResult,
    largeInsiderTradesResult,
  ] = await Promise.all([
    getESFuturesMarketData(),
    getFuturesWithYTDSparkline(),
    getFuturesWithHistory(),
    getSectorPerformance(),
    getEconomicEvents(),
    getMarketNews(6),
    fetchEarningsCalendar(),
    getSP500GainerSparklines(),
    getSP500LoserSparklines(),
    getStockSparkline('META'),
    getStockSparkline('XLB'),
    getForexBondsData(),
    getLargestInsiderTrades(4, 7, { saleLimit: 4, buyLimit: 3 }),
  ])

  return {
    esFutures: 'error' in esFuturesResult ? null : esFuturesResult as MarketData,
    futures: 'error' in futuresResult ? [] : (futuresResult.futures as FutureDataWithSparkline[]),
    futuresWithHistory: 'error' in futuresWithHistoryResult ? [] : (futuresWithHistoryResult.futuresWithHistory as FutureMarketData[]),
    sectors: 'error' in sectorsResult || !('sectors' in sectorsResult) ? [] : sectorsResult.sectors || [],
    economicEvents: 'error' in economicResult || !('events' in economicResult) ? [] : economicResult.events || [],
    marketNews: newsResult || [],
    earnings: earningsResult?.earnings || [],
    sp500GainerSparklines: 'error' in sp500GainerSparklinesResult || !('sparklines' in sp500GainerSparklinesResult) ? [] : sp500GainerSparklinesResult.sparklines || [],
    sp500LoserSparklines: 'error' in sp500LoserSparklinesResult || !('sparklines' in sp500LoserSparklinesResult) ? [] : sp500LoserSparklinesResult.sparklines || [],
    metaSparkline: 'error' in metaSparklineResult || !('sparkline' in metaSparklineResult) ? null : metaSparklineResult.sparkline ?? null,
    xlbSparkline: 'error' in xlbSparklineResult || !('sparkline' in xlbSparklineResult) ? null : xlbSparklineResult.sparkline ?? null,
    forexBonds: 'error' in forexBondsResult || !('forexBonds' in forexBondsResult) ? [] : forexBondsResult.forexBonds || [],
    largeInsiderTrades: 'error' in largeInsiderTradesResult || !('trades' in largeInsiderTradesResult) ? [] : largeInsiderTradesResult.trades,
  }
}

export async function fetchSlowMarketData(): Promise<Partial<AllMarketData>> {
  return getCachedSlowMarketData(loadSlowMarketData)
}

/**
 * Fetches all market data in parallel.
 * Can be called from:
 * 1. Server component (initial SSR load)
 * 2. Client component (polling for updates)
 *
 * Each section that fails returns null/empty, others continue to display.
 */
async function loadAllMarketData(): Promise<AllMarketData> {
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
    commoditiesResult,
    mostActiveResult,
    trendingResult,
    sp500GainersResult,
    sp500LosersResult,
    earningsResult,
    sp500GainerSparklinesResult,
    sp500LoserSparklinesResult,
    metaSparklineResult,
    xlbSparklineResult,
    forexBondsResult,
    largeInsiderTradesResult,
    globalIndexQuotesResult,
    globalFuturesQuotesResult,
    marketSummaryResult,
    marketTrendsBulletsResult
  ] = await Promise.all([
    getAaplMarketData(),
    getNasdaqMarketData(),
    getDowMarketData(),
    getRussellMarketData(),
    getESFuturesMarketData(),
    getFuturesWithYTDSparkline(),
    getFuturesWithHistory(),
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
    getStocksData(),
    getSectorPerformance(),
    getVIXData(),
    getEconomicEvents(),
    getMarketNews(6),
    getSparklineIndicesData(),
    getMostActiveData(),
    getTrendingStocksData(),
    getSP500Gainers(),
    getSP500Losers(),
    fetchEarningsCalendar(),
    getSP500GainerSparklines(),
    getSP500LoserSparklines(),
    getStockSparkline('META'),
    getStockSparkline('XLB'),  // Materials sector ETF
    getForexBondsData(),
    getLargestInsiderTrades(4, 7, { saleLimit: 4, buyLimit: 3 }), // Last 28 days, top 4 sales / proposed sales + top 3 buys
    getGlobalIndexQuotes(),
    getFuturesQuotes(),
    getCachedMarketSummary(),
    getCachedMarketTrendsBullets()
  ])

  // Process results - gracefully handle failures per-section
  return {
    spx: 'error' in spxResult ? null : spxResult as MarketData,
    nasdaq: 'error' in nasdaqResult ? null : nasdaqResult as MarketData,
    dow: 'error' in dowResult ? null : dowResult as MarketData,
    russell: 'error' in russellResult ? null : russellResult as MarketData,
    esFutures: 'error' in esFuturesResult ? null : esFuturesResult as MarketData,
    futures: 'error' in futuresResult ? [] : (futuresResult.futures as FutureDataWithSparkline[]),
    futuresWithHistory: 'error' in futuresWithHistoryResult ? [] : (futuresWithHistoryResult.futuresWithHistory as FutureMarketData[]),
    gainers: gainersResult,
    losers: losersResult,
    stocks: 'error' in stocksResult ? [] : stocksResult.stocks,
    sectors: 'error' in sectorsResult || !('sectors' in sectorsResult) ? [] : sectorsResult.sectors || [],
    vix: 'error' in vixResult || !('vix' in vixResult) ? null : vixResult.vix ?? null,
    economicEvents: 'error' in economicResult || !('events' in economicResult) ? [] : economicResult.events || [],
    marketNews: newsResult || [],
    sparklineIndices: 'error' in commoditiesResult || !('indices' in commoditiesResult) ? [] : commoditiesResult.indices || [],
    mostActive: 'error' in mostActiveResult || !('mostActive' in mostActiveResult) ? [] : mostActiveResult.mostActive || [],
    trending: 'error' in trendingResult || !('trending' in trendingResult) ? [] : trendingResult.trending || [],
    sp500Gainers: 'error' in sp500GainersResult || !('gainers' in sp500GainersResult) ? [] : sp500GainersResult.gainers || [],
    sp500Losers: 'error' in sp500LosersResult || !('losers' in sp500LosersResult) ? [] : sp500LosersResult.losers || [],
    earnings: earningsResult?.earnings || [],
    earningsTotalCount: earningsResult?.totalCount || 0,
    sp500GainerSparklines: 'error' in sp500GainerSparklinesResult || !('sparklines' in sp500GainerSparklinesResult) ? [] : sp500GainerSparklinesResult.sparklines || [],
    sp500LoserSparklines: 'error' in sp500LoserSparklinesResult || !('sparklines' in sp500LoserSparklinesResult) ? [] : sp500LoserSparklinesResult.sparklines || [],
    metaSparkline: 'error' in metaSparklineResult || !('sparkline' in metaSparklineResult) ? null : metaSparklineResult.sparkline ?? null,
    xlbSparkline: 'error' in xlbSparklineResult || !('sparkline' in xlbSparklineResult) ? null : xlbSparklineResult.sparkline ?? null,
    forexBonds: 'error' in forexBondsResult || !('forexBonds' in forexBondsResult) ? [] : forexBondsResult.forexBonds || [],
    largeInsiderTrades: 'error' in largeInsiderTradesResult || !('trades' in largeInsiderTradesResult) ? [] : largeInsiderTradesResult.trades,
    globalIndexQuotes: globalIndexQuotesResult || [],
    globalFuturesQuotes: globalFuturesQuotesResult || [],
    marketSummary: marketSummaryResult || '',
    marketTrendsBullets: marketTrendsBulletsResult || []
  }
}

export async function fetchAllMarketData(): Promise<AllMarketData> {
  return getCachedAllMarketData(loadAllMarketData)
}
