import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { fetchEarningsCalendar, type EarningsData } from '@/app/actions/earnings-calendar'
import { getEconomicEvents, type EconomicEvent } from '@/app/actions/economic-calendar'
import { getForexBondsData, type ForexBondData } from '@/app/actions/forex-bonds'
import { getGlobalIndexQuotes, type GlobalIndexQuote } from '@/app/actions/global-indices'
import { getMarketNews, type MarketNewsItem } from '@/app/actions/get-market-news'
import { getSectorPerformance } from '@/app/actions/sectors'
import {
  getWiimSummaryDate,
  WIIM_SUMMARY_CONFIG_VERSION,
} from '@/lib/generated-stock-why-moving'
import { getMarketStatus, getSessionLabel } from '@/lib/market-hours'
import {
  buildMidMorningTakeaways,
  classifyMorningFollowThrough,
  parsePercentValue,
  type MidMorningTakeaway,
  type MorningFollowThroughStatus,
} from '@/lib/mid-morning-brief-insights'
import {
  getNewsletterMidMorningRun,
  type NewsletterMidMorningRun,
} from '@/lib/newsletter/mid-morning-automation'
import { getProvider, type ProviderCandle, type ProviderQuote } from '@/lib/providers'
import {
  getSP500Constituent,
  isSP500,
  normalizeSP500Symbol,
  SP500_SYMBOLS,
} from '@/lib/sp500'
import { computeWiimDelta, type WiimDeltaSummary } from '@/lib/wiim/delta'
import type {
  RankedWiimCandidate,
  WiimCandidateSourceRef,
} from '@/lib/wiim/types'

const ET_TIME_ZONE = 'America/New_York'

const INDEX_DEFINITIONS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq Composite' },
  { symbol: '^DJI', name: 'Dow Industrials' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: '^VIX', name: 'VIX' },
] as const

interface WiimRunRow {
  id: string
  run_type: string
  status: string
  started_at: string
  completed_at: string | null
  top_candidate: string | null
  best_contrarian_candidate: string | null
  top_five_json: unknown
  metadata_json: unknown
}

interface GeneratedSummaryRow {
  symbol: string
  summary_text: string | null
  no_summary_reason: string | null
  generated_at: string
  model: string | null
  run_id: string | null
  metadata: unknown
}

interface FinvizCacheRow {
  symbol: string
  status: string
  headline: string | null
  display_text: string | null
  source_url: string | null
  fetched_at: string
}

interface LoadedWiimRows {
  status: 'ready' | 'missing' | 'unavailable'
  morningRun: WiimRunRow | null
  midMorningRun: WiimRunRow | null
  morningTopFive: RankedWiimCandidate[]
  midMorningTopFive: RankedWiimCandidate[]
  summariesBySymbol: Map<string, GeneratedSummaryRow>
  finvizBySymbol: Map<string, FinvizCacheRow>
  error: string | null
}

interface LiveMarketResult {
  indices: MidMorningIndexSnapshot[]
  breadth: MidMorningBreadth
  gainers: MidMorningMover[]
  losers: MidMorningMover[]
  quotesBySymbol: Map<string, ProviderQuote>
  sourceErrors: string[]
  providerName: string
}

export interface MidMorningIndexSnapshot {
  symbol: string
  name: string
  price: number | null
  dayChangePercent: number | null
  sinceOpenPercent: number | null
  open: number | null
  sessionHigh: number | null
  sessionLow: number | null
}

export interface MidMorningBreadth {
  expected: number
  covered: number
  advancers: number
  decliners: number
  unchanged: number
  upTwoPercent: number
  downTwoPercent: number
  missingSymbols: string[]
}

export interface MidMorningMover {
  symbol: string
  name: string
  price: number
  changePercent: number
}

export interface MidMorningSector {
  name: string
  changePercent: number
  ytdReturn: number | null
}

export interface MidMorningGeneratedSummary {
  text: string | null
  noSummaryReason: string | null
  generatedAt: string
  model: string | null
  runId: string | null
  keyFact: string | null
  reasonType: string | null
  quoteMovePercent: number | null
}

export interface MidMorningWiimCandidate {
  rank: number
  ticker: string
  name: string
  headline: string
  whyItMatters: string
  confidenceScore: number
  candidateType: RankedWiimCandidate['candidateType']
  stateLabel: RankedWiimCandidate['stateLabel']
  snapshotMovePercent: number | null
  currentMovePercent: number | null
  morningRank: number | null
  sourceRefs: WiimCandidateSourceRef[]
  topNews: Array<{
    title: string
    url: string
    site: string
    publishedDate: string
  }>
  earningsReport: {
    date: string
    time: string
    eps: number | null
    epsEstimated: number | null
    revenue: number | null
    revenueEstimated: number | null
  } | null
  generatedSummary: MidMorningGeneratedSummary | null
  finvizSummary: {
    headline: string | null
    text: string | null
    sourceUrl: string | null
    fetchedAt: string
  } | null
}

export interface MorningFollowThrough {
  rank: number
  ticker: string
  headline: string
  morningMovePercent: number | null
  currentMovePercent: number | null
  moveDeltaPercent: number | null
  currentRank: number | null
  status: MorningFollowThroughStatus
}

export interface MidMorningWiimReport {
  status: 'ready' | 'missing' | 'unavailable'
  morningRunId: string | null
  morningGeneratedAt: string | null
  midMorningRunId: string | null
  midMorningGeneratedAt: string | null
  topCandidate: string | null
  bestContrarianCandidate: string | null
  candidates: MidMorningWiimCandidate[]
  morningFollowThrough: MorningFollowThrough[]
  delta: WiimDeltaSummary | null
  pipeline: {
    candidateCount: number
    finvizRefreshedCount: number
    finvizRefreshedAt: string | null
    generatedSummaryCount: number
    summaryRunId: string | null
    summariesGeneratedAt: string | null
  }
  error: string | null
}

export interface MidMorningHeadline {
  title: string
  url: string
  site: string
  publishedAt: string
}

export interface MidMorningReportedEarnings {
  symbol: string
  name: string
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
  movePercent: number | null
}

export interface MidMorningBriefReport {
  summaryDate: string
  generatedAt: string
  sessionLabel: string
  currentTimeET: string
  providerName: string
  automation: NewsletterMidMorningRun | null
  indices: MidMorningIndexSnapshot[]
  breadth: MidMorningBreadth
  sectors: MidMorningSector[]
  gainers: MidMorningMover[]
  losers: MidMorningMover[]
  wiim: MidMorningWiimReport
  takeaways: MidMorningTakeaway[]
  completedEconomicEvents: EconomicEvent[]
  upcomingEconomicEvents: EconomicEvent[]
  reportedEarnings: MidMorningReportedEarnings[]
  remainingEarnings: EarningsData[]
  forexBonds: ForexBondData[]
  globalMarkets: GlobalIndexQuote[]
  headlines: MidMorningHeadline[]
  sourceErrors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRankedWiimCandidate(value: unknown): value is RankedWiimCandidate {
  if (!isRecord(value)) return false
  return (
    typeof value.rank === 'number'
    && typeof value.ticker === 'string'
    && typeof value.headline === 'string'
    && typeof value.whyItMatters === 'string'
    && typeof value.confidenceScore === 'number'
    && isRecord(value.metadata)
  )
}

function readCandidates(value: unknown): RankedWiimCandidate[] {
  return Array.isArray(value) ? value.filter(isRankedWiimCandidate) : []
}

function nextIsoDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function getTimeZoneOffsetMinutes(date: string, timeZone: string): number {
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')
    ?.value
  const match = offsetName?.match(/^GMT([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

function getEasternDateBounds(date: string) {
  const nextDate = nextIsoDate(date)
  const startOffset = getTimeZoneOffsetMinutes(date, ET_TIME_ZONE)
  const endOffset = getTimeZoneOffsetMinutes(nextDate, ET_TIME_ZONE)
  return {
    start: new Date(Date.parse(`${date}T00:00:00Z`) - startOffset * 60_000).toISOString(),
    end: new Date(Date.parse(`${nextDate}T00:00:00Z`) - endOffset * 60_000).toISOString(),
  }
}

function parseNewsTimestamp(value: string): number {
  if (!value) return Number.NaN
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return Date.parse(value)
  const normalized = value.replace(' ', 'T')
  const date = normalized.slice(0, 10)
  const offset = getTimeZoneOffsetMinutes(date, ET_TIME_ZONE)
  return Date.parse(`${normalized}Z`) - offset * 60_000
}

function parseEconomicTimestamp(value: string): number {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`)
}

function etDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

function percentChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0 || !Number.isFinite(from) || !Number.isFinite(to)) {
    return null
  }
  return ((to - from) / from) * 100
}

function regularSessionCandles(candles: ProviderCandle[], summaryDate: string): ProviderCandle[] {
  return candles
    .filter((candle) => {
      if (!candle.date.startsWith(summaryDate)) return false
      const time = candle.date.split(' ')[1]
      if (!time) return false
      const [hour, minute] = time.split(':').map(Number)
      const clock = hour * 60 + minute
      return Number.isFinite(clock) && clock >= 9 * 60 + 30 && clock < 16 * 60
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      return dateCompare !== 0 ? dateCompare : a.timestampMs - b.timestampMs
    })
}

async function loadLiveMarket(summaryDate: string): Promise<LiveMarketResult> {
  const provider = getProvider()
  const sourceErrors: string[] = []
  const indexSymbols = INDEX_DEFINITIONS.map((item) => item.symbol)

  const [indexQuotes, stockQuotes, candlesByIndex] = await Promise.all([
    provider.getQuotes(indexSymbols).catch(() => {
      sourceErrors.push('US index quotes')
      return [] as ProviderQuote[]
    }),
    provider.getQuotes(Array.from(SP500_SYMBOLS)).catch(() => {
      sourceErrors.push('S&P 500 breadth')
      return [] as ProviderQuote[]
    }),
    Promise.all(
      indexSymbols.map((symbol) =>
        provider.getIntraday(symbol, 5, 'minute', summaryDate, summaryDate).catch(() => []),
      ),
    ),
  ])

  const indexQuoteBySymbol = new Map(indexQuotes.map((quote) => [quote.symbol, quote]))
  const indices = INDEX_DEFINITIONS.map((definition, index): MidMorningIndexSnapshot => {
    const quote = indexQuoteBySymbol.get(definition.symbol)
    const regularCandles = regularSessionCandles(candlesByIndex[index], summaryDate)
    const open = regularCandles[0]?.open ?? null
    const highs = regularCandles.map((candle) => candle.high).filter(Number.isFinite)
    const lows = regularCandles.map((candle) => candle.low).filter(Number.isFinite)

    return {
      symbol: definition.symbol,
      name: definition.name,
      price: quote?.price ?? regularCandles.at(-1)?.close ?? null,
      dayChangePercent: quote?.changesPercentage ?? null,
      sinceOpenPercent: percentChange(open, quote?.price ?? regularCandles.at(-1)?.close ?? null),
      open,
      sessionHigh: quote?.dayHigh ?? (highs.length > 0 ? Math.max(...highs) : null),
      sessionLow: quote?.dayLow ?? (lows.length > 0 ? Math.min(...lows) : null),
    }
  })

  if (indices.filter((item) => item.price != null).length < INDEX_DEFINITIONS.length) {
    sourceErrors.push('Some US index quotes')
  }
  if (candlesByIndex.every((candles) => candles.length === 0)) {
    sourceErrors.push('Intraday index candles')
  }

  const quotesBySymbol = new Map<string, ProviderQuote>()
  for (const quote of stockQuotes) {
    const canonical = normalizeSP500Symbol(quote.symbol)
    if (canonical && isSP500(canonical)) {
      quotesBySymbol.set(canonical, { ...quote, symbol: canonical })
    }
  }

  const validQuotes = Array.from(quotesBySymbol.values())
    .filter((quote) => quote.price > 0 && Number.isFinite(quote.changesPercentage))
  const movers = validQuotes
    .map((quote): MidMorningMover => ({
      symbol: quote.symbol,
      name: getSP500Constituent(quote.symbol)?.name || quote.name || quote.symbol,
      price: quote.price,
      changePercent: quote.changesPercentage,
    }))
  const missingSymbols = Array.from(SP500_SYMBOLS)
    .filter((symbol) => !quotesBySymbol.has(symbol))
    .sort((a, b) => a.localeCompare(b))

  return {
    indices,
    breadth: {
      expected: SP500_SYMBOLS.size,
      covered: validQuotes.length,
      advancers: validQuotes.filter((quote) => quote.changesPercentage > 0).length,
      decliners: validQuotes.filter((quote) => quote.changesPercentage < 0).length,
      unchanged: validQuotes.filter((quote) => quote.changesPercentage === 0).length,
      upTwoPercent: validQuotes.filter((quote) => quote.changesPercentage >= 2).length,
      downTwoPercent: validQuotes.filter((quote) => quote.changesPercentage <= -2).length,
      missingSymbols,
    },
    gainers: movers.slice().sort((a, b) => b.changePercent - a.changePercent).slice(0, 8),
    losers: movers.slice().sort((a, b) => a.changePercent - b.changePercent).slice(0, 8),
    quotesBySymbol,
    sourceErrors,
    providerName: process.env.DATA_PROVIDER === 'massive' ? 'Massive' : 'FMP',
  }
}

function createSupabaseReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function loadWiimRows(summaryDate: string): Promise<LoadedWiimRows> {
  const supabase = createSupabaseReadClient()
  if (!supabase) {
    return {
      status: 'unavailable',
      morningRun: null,
      midMorningRun: null,
      morningTopFive: [],
      midMorningTopFive: [],
      summariesBySymbol: new Map(),
      finvizBySymbol: new Map(),
      error: 'Supabase is not configured.',
    }
  }

  const bounds = getEasternDateBounds(summaryDate)
  const runQuery = (runType: 'morning' | 'mid_morning') =>
    supabase
      .from('wiim_runs')
      .select('id, run_type, status, started_at, completed_at, top_candidate, best_contrarian_candidate, top_five_json, metadata_json')
      .eq('run_type', runType)
      .eq('status', 'completed')
      .gte('started_at', bounds.start)
      .lt('started_at', bounds.end)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  const [morningResult, midMorningResult] = await Promise.all([
    runQuery('morning'),
    runQuery('mid_morning'),
  ])
  const runError = morningResult.error || midMorningResult.error
  if (runError) {
    return {
      status: 'unavailable',
      morningRun: null,
      midMorningRun: null,
      morningTopFive: [],
      midMorningTopFive: [],
      summariesBySymbol: new Map(),
      finvizBySymbol: new Map(),
      error: runError.message,
    }
  }

  const morningRun = (morningResult.data ?? null) as WiimRunRow | null
  const midMorningRun = (midMorningResult.data ?? null) as WiimRunRow | null
  const morningTopFive = readCandidates(morningRun?.top_five_json)
  const midMorningTopFive = readCandidates(midMorningRun?.top_five_json)
  const symbols = Array.from(new Set(
    [...morningTopFive, ...midMorningTopFive]
      .map((candidate) => candidate.ticker || candidate.metadata.symbol)
      .filter(Boolean),
  ))

  if (symbols.length === 0) {
    return {
      status: 'missing',
      morningRun,
      midMorningRun,
      morningTopFive,
      midMorningTopFive,
      summariesBySymbol: new Map(),
      finvizBySymbol: new Map(),
      error: 'No completed WIIM mid-morning run is stored for today.',
    }
  }

  const [summaryResult, finvizResult] = await Promise.all([
    supabase
      .from('stock_summaries')
      .select('symbol, summary_text, no_summary_reason, generated_at, model, run_id, metadata')
      .eq('summary_date', summaryDate)
      .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
      .in('symbol', symbols)
      .or('no_summary_reason.is.null,no_summary_reason.neq.validation_rejected')
      .order('generated_at', { ascending: false }),
    supabase
      .from('stock_why_moving_cache')
      .select('symbol, status, headline, display_text, source_url, fetched_at')
      .in('symbol', symbols),
  ])
  const sourceError = summaryResult.error || finvizResult.error
  if (sourceError) {
    return {
      status: 'unavailable',
      morningRun,
      midMorningRun,
      morningTopFive,
      midMorningTopFive,
      summariesBySymbol: new Map(),
      finvizBySymbol: new Map(),
      error: sourceError.message,
    }
  }

  const summariesBySymbol = new Map<string, GeneratedSummaryRow>()
  for (const row of (summaryResult.data ?? []) as GeneratedSummaryRow[]) {
    if (!summariesBySymbol.has(row.symbol)) summariesBySymbol.set(row.symbol, row)
  }
  const finvizBySymbol = new Map<string, FinvizCacheRow>()
  for (const row of (finvizResult.data ?? []) as FinvizCacheRow[]) {
    finvizBySymbol.set(row.symbol, row)
  }

  return {
    status: midMorningRun && midMorningTopFive.length > 0 ? 'ready' : 'missing',
    morningRun,
    midMorningRun,
    morningTopFive,
    midMorningTopFive,
    summariesBySymbol,
    finvizBySymbol,
    error: midMorningRun ? null : 'No completed WIIM mid-morning run is stored for today.',
  }
}

function readGeneratedMetadata(metadata: unknown) {
  const record = isRecord(metadata) ? metadata : null
  const quote = record && isRecord(record.quote) ? record.quote : null
  return {
    keyFact: stringValue(record?.key_fact),
    reasonType: stringValue(record?.reason_type),
    quoteMovePercent: numberValue(quote?.changesPercentage),
  }
}

function mapWiimReport(rows: LoadedWiimRows, quotesBySymbol: Map<string, ProviderQuote>): MidMorningWiimReport {
  const morningByTicker = new Map(
    rows.morningTopFive.map((candidate) => [candidate.ticker, candidate] as const),
  )
  const currentRankByTicker = new Map(
    rows.midMorningTopFive.map((candidate) => [candidate.ticker, candidate.rank] as const),
  )

  const candidates = rows.midMorningTopFive.map((candidate): MidMorningWiimCandidate => {
    const ticker = candidate.ticker || candidate.metadata.symbol
    const summary = rows.summariesBySymbol.get(ticker)
    const finviz = rows.finvizBySymbol.get(ticker)
    const morningCandidate = morningByTicker.get(ticker)
    const summaryMetadata = readGeneratedMetadata(summary?.metadata)
    const earningsReport = candidate.metadata.earningsReport

    return {
      rank: candidate.rank,
      ticker,
      name: candidate.metadata.name || getSP500Constituent(ticker)?.name || ticker,
      headline: candidate.headline,
      whyItMatters: candidate.whyItMatters,
      confidenceScore: candidate.confidenceScore,
      candidateType: candidate.candidateType,
      stateLabel: candidate.stateLabel,
      snapshotMovePercent: numberValue(candidate.metadata.changesPercentage),
      currentMovePercent:
        numberValue(quotesBySymbol.get(ticker)?.changesPercentage)
        ?? numberValue(candidate.metadata.changesPercentage),
      morningRank: morningCandidate?.rank ?? null,
      sourceRefs: Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [],
      topNews: Array.isArray(candidate.metadata.topNews)
        ? candidate.metadata.topNews.slice(0, 3).map((item) => ({
            title: item.title,
            url: item.url,
            site: item.site,
            publishedDate: item.publishedDate,
          }))
        : [],
      earningsReport: earningsReport
        ? {
            date: earningsReport.date,
            time: earningsReport.time,
            eps: earningsReport.eps,
            epsEstimated: earningsReport.epsEstimated,
            revenue: earningsReport.revenue,
            revenueEstimated: earningsReport.revenueEstimated,
          }
        : null,
      generatedSummary: summary
        ? {
            text: summary.summary_text,
            noSummaryReason: summary.no_summary_reason,
            generatedAt: summary.generated_at,
            model: summary.model,
            runId: summary.run_id,
            keyFact: summaryMetadata.keyFact,
            reasonType: summaryMetadata.reasonType,
            quoteMovePercent: summaryMetadata.quoteMovePercent,
          }
        : null,
      finvizSummary: finviz?.status === 'found'
        ? {
            headline: finviz.headline,
            text: finviz.display_text,
            sourceUrl: finviz.source_url,
            fetchedAt: finviz.fetched_at,
          }
        : null,
    }
  })

  const morningFollowThrough = rows.morningTopFive.map((candidate): MorningFollowThrough => {
    const ticker = candidate.ticker || candidate.metadata.symbol
    const morningMovePercent = numberValue(candidate.metadata.changesPercentage)
    const currentMovePercent = numberValue(quotesBySymbol.get(ticker)?.changesPercentage)
    return {
      rank: candidate.rank,
      ticker,
      headline: candidate.headline,
      morningMovePercent,
      currentMovePercent,
      moveDeltaPercent:
        morningMovePercent != null && currentMovePercent != null
          ? currentMovePercent - morningMovePercent
          : null,
      currentRank: currentRankByTicker.get(ticker) ?? null,
      status: classifyMorningFollowThrough(morningMovePercent, currentMovePercent),
    }
  })

  const candidateFinvizRows = candidates
    .map((candidate) => candidate.finvizSummary)
    .filter((item): item is NonNullable<typeof item> => item != null)
  const candidateSummaries = candidates
    .map((candidate) => candidate.generatedSummary)
    .filter((item): item is NonNullable<typeof item> => item != null)

  return {
    status: rows.status,
    morningRunId: rows.morningRun?.id ?? null,
    morningGeneratedAt: rows.morningRun?.completed_at ?? rows.morningRun?.started_at ?? null,
    midMorningRunId: rows.midMorningRun?.id ?? null,
    midMorningGeneratedAt:
      rows.midMorningRun?.completed_at ?? rows.midMorningRun?.started_at ?? null,
    topCandidate: rows.midMorningRun?.top_candidate ?? candidates[0]?.ticker ?? null,
    bestContrarianCandidate: rows.midMorningRun?.best_contrarian_candidate ?? null,
    candidates,
    morningFollowThrough,
    delta:
      rows.morningTopFive.length > 0 && rows.midMorningTopFive.length > 0
        ? computeWiimDelta(rows.morningTopFive, rows.midMorningTopFive)
        : null,
    pipeline: {
      candidateCount: candidates.length,
      finvizRefreshedCount: candidateFinvizRows.length,
      finvizRefreshedAt: candidateFinvizRows
        .map((item) => item.fetchedAt)
        .sort()
        .at(-1) ?? null,
      generatedSummaryCount: candidateSummaries.filter((item) => Boolean(item.text)).length,
      summaryRunId: candidateSummaries[0]?.runId ?? null,
      summariesGeneratedAt: candidateSummaries
        .map((item) => item.generatedAt)
        .sort()
        .at(-1) ?? null,
    },
    error: rows.error,
  }
}

function buildHeadlines(
  candidates: MidMorningWiimCandidate[],
  marketNews: MarketNewsItem[],
): MidMorningHeadline[] {
  const rawRows = [
    ...candidates.flatMap((candidate) =>
      candidate.topNews.map((item) => ({
        title: item.title,
        url: item.url,
        site: item.site,
        publishedDate: item.publishedDate,
      })),
    ),
    ...marketNews.map((item) => ({
      title: item.title,
      url: item.url,
      site: item.site,
      publishedDate: item.publishedDate,
    })),
  ]
  const rows: MidMorningHeadline[] = rawRows.flatMap((item) => {
    const timestamp = parseNewsTimestamp(item.publishedDate)
    if (!item.url || !item.title || !Number.isFinite(timestamp)) return []
    return [{
      title: item.title,
      url: item.url,
      site: item.site,
      publishedAt: new Date(timestamp).toISOString(),
    }]
  })

  const byUrl = new Map<string, MidMorningHeadline>()
  for (const row of rows) {
    if (!byUrl.has(row.url)) byUrl.set(row.url, row)
  }

  return Array.from(byUrl.values())
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 10)
}

function eventTimeLabel(event: EconomicEvent): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET_TIME_ZONE,
    timeZoneName: 'short',
  }).format(new Date(parseEconomicTimestamp(event.date)))
}

export async function getMidMorningBriefReport(): Promise<MidMorningBriefReport> {
  const summaryDate = getWiimSummaryDate()
  const marketStatus = getMarketStatus()

  const [
    liveMarket,
    wiimRows,
    automation,
    sectorResult,
    economicResult,
    earningsResult,
    forexResult,
    globalMarkets,
    marketNews,
  ] = await Promise.all([
    loadLiveMarket(summaryDate),
    loadWiimRows(summaryDate),
    getNewsletterMidMorningRun(summaryDate).catch(() => null),
    getSectorPerformance(),
    getEconomicEvents(),
    fetchEarningsCalendar(),
    getForexBondsData(),
    getGlobalIndexQuotes(),
    getMarketNews(12),
  ])

  const sourceErrors = [...liveMarket.sourceErrors]
  const sectors: MidMorningSector[] =
    'sectors' in sectorResult && Array.isArray(sectorResult.sectors)
      ? sectorResult.sectors
          .map((sector) => ({
            name: sector.sector,
            changePercent: parsePercentValue(sector.changesPercentage),
            ytdReturn: numberValue(sector.ytdReturn),
          }))
          .filter((sector): sector is MidMorningSector => sector.changePercent != null)
          .sort((a, b) => b.changePercent - a.changePercent)
      : []
  if ('error' in sectorResult) sourceErrors.push('Sector performance')

  const economicEvents: EconomicEvent[] =
    'events' in economicResult && Array.isArray(economicResult.events)
      ? economicResult.events
      : []
  if ('error' in economicResult) sourceErrors.push('Economic calendar')

  const now = Date.now()
  const todaysEvents = economicEvents.filter(
    (event) => etDate(parseEconomicTimestamp(event.date)) === summaryDate,
  )
  const completedEconomicEvents = todaysEvents
    .filter((event) => parseEconomicTimestamp(event.date) <= now)
    .sort((a, b) => parseEconomicTimestamp(a.date) - parseEconomicTimestamp(b.date))
  const upcomingEconomicEvents = todaysEvents
    .filter((event) => parseEconomicTimestamp(event.date) > now)
    .sort((a, b) => parseEconomicTimestamp(a.date) - parseEconomicTimestamp(b.date))

  const forexBonds = 'forexBonds' in forexResult ? forexResult.forexBonds : []
  if ('error' in forexResult) sourceErrors.push('Rates and FX')
  if (globalMarkets.length === 0) sourceErrors.push('Global markets')
  if (marketNews.length === 0) sourceErrors.push('Market headlines')
  if (wiimRows.status === 'unavailable') sourceErrors.push('WIIM run storage')

  const wiim = mapWiimReport(wiimRows, liveMarket.quotesBySymbol)
  const reportedEarnings = wiim.candidates
    .filter((candidate) => candidate.earningsReport?.date.startsWith(summaryDate))
    .map((candidate): MidMorningReportedEarnings => ({
      symbol: candidate.ticker,
      name: candidate.name,
      eps: candidate.earningsReport?.eps ?? null,
      epsEstimated: candidate.earningsReport?.epsEstimated ?? null,
      revenue: candidate.earningsReport?.revenue ?? null,
      revenueEstimated: candidate.earningsReport?.revenueEstimated ?? null,
      movePercent: candidate.currentMovePercent,
    }))
  const remainingEarnings = earningsResult.earnings
    .filter((item) => item.date.startsWith(summaryDate) && item.time === 'amc' && item.eps == null)
    .sort((a, b) => a.symbol.localeCompare(b.symbol))

  const sp500 = liveMarket.indices.find((item) => item.symbol === '^GSPC')
  const vix = liveMarket.indices.find((item) => item.symbol === '^VIX')
  const leadingSector = sectors[0] ?? null
  const laggingSector = sectors.at(-1) ?? null
  const nextMacroEvent = upcomingEconomicEvents[0]
    ? {
        name: upcomingEconomicEvents[0].event,
        timeLabel: eventTimeLabel(upcomingEconomicEvents[0]),
      }
    : null

  return {
    summaryDate,
    generatedAt: new Date().toISOString(),
    sessionLabel: getSessionLabel(marketStatus.session),
    currentTimeET: marketStatus.currentTimeET,
    providerName: liveMarket.providerName,
    automation,
    indices: liveMarket.indices,
    breadth: liveMarket.breadth,
    sectors,
    gainers: liveMarket.gainers,
    losers: liveMarket.losers,
    wiim,
    takeaways: buildMidMorningTakeaways({
      sp500ChangePercent: sp500?.dayChangePercent ?? null,
      vixChangePercent: vix?.dayChangePercent ?? null,
      advancers: liveMarket.breadth.advancers,
      decliners: liveMarket.breadth.decliners,
      leadingSector,
      laggingSector,
      previousTopCandidate: wiim.delta?.previousTopCandidate ?? null,
      currentTopCandidate: wiim.delta?.currentTopCandidate ?? wiim.topCandidate,
      newlyEntered: wiim.delta?.newlyEntered ?? [],
      nextMacroEvent,
      afterCloseEarnings: remainingEarnings.map((item) => item.symbol),
    }),
    completedEconomicEvents,
    upcomingEconomicEvents,
    reportedEarnings,
    remainingEarnings,
    forexBonds,
    globalMarkets: globalMarkets.filter((market) => market.market !== 'New York'),
    headlines: buildHeadlines(wiim.candidates, marketNews),
    sourceErrors: Array.from(new Set(sourceErrors)),
  }
}
