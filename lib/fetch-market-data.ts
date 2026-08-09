'use server'

import { unstable_cache } from 'next/cache'
import {
  getAaplMarketData,
  getNasdaqMarketData,
  getDowMarketData,
  getRussellMarketData,
  getESFuturesMarketData,
  getESFuturesMarketDataWithStatus,
} from '@/app/actions/market-data'
import {
  getFuturesWithYTDSparkline,
  getFuturesWithYTDSparklineWithStatus,
  getFuturesWithHistory,
  getFuturesWithHistoryWithStatus,
} from '@/app/actions/futures'
import {
  getAllSessionMovers,
  getAllSessionMoversWithStatus,
  type AllSessionMoversResult,
} from '@/app/actions/market-movers'
import { getStocksData, getStocksDataWithStatus } from '@/app/actions/stocks'
import { getSectorPerformance } from '@/app/actions/sectors'
import { getVIXData } from '@/app/actions/vix'
import { getEconomicEvents } from '@/app/actions/economic-calendar'
import { getMarketNews, getMarketNewsWithStatus } from '@/app/actions/get-market-news'
import {
  getSparklineIndicesData,
  getSparklineIndicesDataWithStatus,
} from '@/app/actions/sparkline-indices'
import { getMostActiveData } from '@/app/actions/most-active'
import { getTrendingStocksData } from '@/app/actions/trending-stocks'
import { getSP500Gainers, getSP500Losers } from '@/app/actions/sp500-movers'
import {
  fetchEarningsCalendar,
  fetchEarningsCalendarWithStatus,
} from '@/app/actions/earnings-calendar'
import {
  getSP500GainerSparklines,
  getSP500GainerSparklinesWithStatus,
} from '@/app/actions/sp500-gainer-sparklines'
import {
  getSP500LoserSparklines,
  getSP500LoserSparklinesWithStatus,
} from '@/app/actions/sp500-loser-sparklines'
import { getStockSparkline } from '@/app/actions/stock-sparkline'
import { getForexBondsData } from '@/app/actions/forex-bonds'
import { getLargestInsiderTrades } from '@/app/actions/insider-trading'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'
import { getCachedMarketSummary } from '@/app/actions/market-summary'
import { getCachedMarketTrendsBullets } from '@/app/actions/market-trends-responses'
import { createAsyncTTLCache } from '@/lib/async-ttl-cache'
import type { DashboardSnapshotCaptureTimes } from '@/lib/dashboard-snapshot-provenance'
import {
  normalizeFastFailedSections,
  type FastMarketDataPatch,
  type FastMarketDataSection,
  type FastMarketDataSnapshot,
} from '@/lib/fast-snapshot-types'
import type { AllMarketData, MarketData, FutureDataWithSparkline, FutureMarketData } from './market-types'
import type {
  SlowMarketDataSection,
  SlowMarketDataSnapshot,
} from './slow-snapshot-types'

const getCachedLiveMoversMarketData = createAsyncTTLCache<LiveMoversMarketData>(15_000)

export interface AllMarketDataEnvelope {
  data: AllMarketData
  captureTimes: DashboardSnapshotCaptureTimes
}

const getCachedAllMarketData = createAsyncTTLCache<AllMarketDataEnvelope>(60_000)

export interface LiveMoversMarketData {
  gainers: AllSessionMoversResult
  losers: AllSessionMoversResult
}

async function loadLiveMoversMarketData(): Promise<LiveMoversMarketData> {
  const [gainers, losers] = await Promise.all([
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
  ])

  return { gainers, losers }
}

/**
 * Minimal snapshot for the live dashboard's mover poll.
 *
 * Keep this separate from the broader fast snapshot: the live surface only
 * consumes gainers and losers, so loading the other fast-dashboard sections
 * wastes provider calls and response bytes on every poll.
 */
export async function fetchLiveMoversMarketData(): Promise<LiveMoversMarketData> {
  return getCachedLiveMoversMarketData(loadLiveMoversMarketData)
}

interface FastSectionLoad {
  data: FastMarketDataPatch
  failedSections: FastMarketDataSection[]
}

async function loadFastSection<T>(
  section: FastMarketDataSection,
  loader: () => Promise<T>,
  project: (value: T) => FastMarketDataPatch,
): Promise<FastSectionLoad> {
  try {
    const value = await loader()
    if (hasExplicitError(value)) {
      return { data: {}, failedSections: [section] }
    }
    return { data: project(value), failedSections: [] }
  } catch {
    return { data: {}, failedSections: [section] }
  }
}

/**
 * Minimal, provenance-aware patch for the market overview's one-minute poll.
 * Failed fields are absent, while successful values (including empty arrays)
 * remain explicit and may intentionally replace the prior client value.
 */
export async function fetchFastMarketData(
  signal?: AbortSignal,
): Promise<FastMarketDataSnapshot> {
  const sections = await Promise.all([
    loadFastSection(
      'gainers',
      () => getAllSessionMoversWithStatus('gainers', signal),
      (value) => ({ gainers: value as AllSessionMoversResult }),
    ),
    loadFastSection(
      'losers',
      () => getAllSessionMoversWithStatus('losers', signal),
      (value) => ({ losers: value as AllSessionMoversResult }),
    ),
    loadFastSection(
      'stocks',
      () => getStocksDataWithStatus(signal),
      (value) => ({ stocks: 'stocks' in value ? value.stocks : [] }),
    ),
    loadFastSection(
      'sparklineIndices',
      () => getSparklineIndicesDataWithStatus(signal),
      (value) => ({
        sparklineIndices: 'indices' in value ? value.indices : [],
      }),
    ),
  ])

  return {
    data: Object.assign({}, ...sections.map((section) => section.data)),
    failedSections: normalizeFastFailedSections(
      sections.flatMap((section) => section.failedSections),
    ),
    capturedAt: new Date().toISOString(),
  }
}

interface SlowSectionLoad {
  data: Partial<AllMarketData>
  failedSections: SlowMarketDataSection[]
}

function hasExplicitError(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { error?: unknown }).error === 'string',
  )
}

async function loadSlowSection<T>(
  sections: readonly SlowMarketDataSection[],
  loader: () => Promise<T>,
  project: (value: T) => Partial<AllMarketData>,
  failureData: Partial<AllMarketData>,
): Promise<SlowSectionLoad> {
  try {
    const value = await loader()
    if (hasExplicitError(value)) {
      return { data: failureData, failedSections: [...sections] }
    }
    return { data: project(value), failedSections: [] }
  } catch {
    return { data: failureData, failedSections: [...sections] }
  }
}

async function loadSlowMarketData(): Promise<SlowMarketDataSnapshot> {
  const sections = await Promise.all([
    loadSlowSection(
      ['esFutures'],
      getESFuturesMarketDataWithStatus,
      (value) => ({ esFutures: value as MarketData }),
      { esFutures: null },
    ),
    loadSlowSection(
      ['futures'],
      getFuturesWithYTDSparklineWithStatus,
      (value) => ({
        futures: 'futures' in value
          ? value.futures as FutureDataWithSparkline[]
          : [],
      }),
      { futures: [] },
    ),
    loadSlowSection(
      ['futuresWithHistory'],
      getFuturesWithHistoryWithStatus,
      (value) => ({
        futuresWithHistory: 'futuresWithHistory' in value
          ? value.futuresWithHistory as FutureMarketData[]
          : [],
      }),
      { futuresWithHistory: [] },
    ),
    loadSlowSection(
      ['sectors'],
      getSectorPerformance,
      (value) => ({
        sectors: 'sectors' in value ? value.sectors || [] : [],
      }),
      { sectors: [] },
    ),
    loadSlowSection(
      ['economicEvents'],
      getEconomicEvents,
      (value) => ({
        economicEvents: 'events' in value ? value.events || [] : [],
      }),
      { economicEvents: [] },
    ),
    loadSlowSection(
      ['marketNews'],
      () => getMarketNewsWithStatus(6),
      (value) => ({ marketNews: 'news' in value ? value.news : [] }),
      { marketNews: [] },
    ),
    loadSlowSection(
      ['earnings', 'earningsTotalCount'],
      fetchEarningsCalendarWithStatus,
      (value) => ({
        earnings: 'earnings' in value ? value.earnings || [] : [],
        earningsTotalCount: 'earnings' in value ? value.totalCount || 0 : 0,
      }),
      { earnings: [], earningsTotalCount: 0 },
    ),
    loadSlowSection(
      ['sp500GainerSparklines'],
      getSP500GainerSparklinesWithStatus,
      (value) => ({ sp500GainerSparklines: value.sparklines || [] }),
      { sp500GainerSparklines: [] },
    ),
    loadSlowSection(
      ['sp500LoserSparklines'],
      getSP500LoserSparklinesWithStatus,
      (value) => ({ sp500LoserSparklines: value.sparklines || [] }),
      { sp500LoserSparklines: [] },
    ),
    loadSlowSection(
      ['metaSparkline'],
      () => getStockSparkline('META'),
      (value) => ({ metaSparkline: value.sparkline ?? null }),
      { metaSparkline: null },
    ),
    loadSlowSection(
      ['xlbSparkline'],
      () => getStockSparkline('XLB'),
      (value) => ({ xlbSparkline: value.sparkline ?? null }),
      { xlbSparkline: null },
    ),
    loadSlowSection(
      ['forexBonds'],
      () => getForexBondsData(),
      (value) => ({
        forexBonds: 'forexBonds' in value ? value.forexBonds : [],
      }),
      { forexBonds: [] },
    ),
    loadSlowSection(
      ['largeInsiderTrades'],
      () => getLargestInsiderTrades(4, 7, { saleLimit: 4, buyLimit: 3 }),
      (value) => ({
        largeInsiderTrades: 'trades' in value ? value.trades : [],
      }),
      { largeInsiderTrades: [] },
    ),
  ])

  return {
    data: Object.assign({}, ...sections.map((section) => section.data)),
    failedSections: sections.flatMap((section) => section.failedSections),
    capturedAt: new Date().toISOString(),
  }
}

export async function fetchSlowMarketData(): Promise<SlowMarketDataSnapshot> {
  return loadSlowMarketData()
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

async function loadAllMarketDataEnvelope(): Promise<AllMarketDataEnvelope> {
  const data = await loadAllMarketData()
  const capturedAt = new Date().toISOString()

  return {
    data,
    captureTimes: {
      fastCapturedAt: capturedAt,
      slowCapturedAt: capturedAt,
      globalLoadedAt: capturedAt,
    },
  }
}

const getPersistedAllMarketData = unstable_cache(
  loadAllMarketDataEnvelope,
  ['all-market-data-envelope-v2'],
  { revalidate: 60 }
)

export async function fetchAllMarketData(): Promise<AllMarketData>
export async function fetchAllMarketData(
  options: { withProvenance: true },
): Promise<AllMarketDataEnvelope>
export async function fetchAllMarketData(
  options?: { withProvenance: true },
): Promise<AllMarketData | AllMarketDataEnvelope> {
  const envelope = await getCachedAllMarketData(getPersistedAllMarketData)
  return options?.withProvenance ? envelope : envelope.data
}
