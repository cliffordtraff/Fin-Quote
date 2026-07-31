import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { fetchEarningsCalendar, type EarningsData } from '@/app/actions/earnings-calendar'
import { getEconomicEvents, type EconomicEvent } from '@/app/actions/economic-calendar'
import { getForexBondsData, type ForexBondData } from '@/app/actions/forex-bonds'
import { getGlobalIndexQuotes, type GlobalIndexQuote } from '@/app/actions/global-indices'
import {
  getWiimSummaryDate,
  WIIM_SUMMARY_CONFIG_VERSION,
} from '@/lib/generated-stock-why-moving'
import {
  buildMorningBriefTakeaways,
  type MorningBriefTakeaway,
} from '@/lib/morning-brief-insights'
import { getPremarketBrief, type PremarketBrief } from '@/lib/premarket-brief'
import { isSP500, normalizeSP500Symbol, SP500_SYMBOLS } from '@/lib/sp500'
import type { RankedWiimCandidate, WiimCandidateSourceRef } from '@/lib/wiim/types'

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
  error_message: string | null
}

interface WiimRunRow {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  top_candidate: string | null
  best_contrarian_candidate: string | null
  top_five_json: unknown
}

interface WiimSummaryRunRow {
  run_id: string
  run_date: string
  ticker_count: number
  model: string | null
  created_at: string
}

export interface MorningBriefWiimCandidate {
  rank: number
  ticker: string
  headline: string
  whyItMatters: string
  confidenceScore: number
  candidateType: RankedWiimCandidate['candidateType']
  stateLabel: RankedWiimCandidate['stateLabel']
  movePercent: number | null
  sourceRefs: WiimCandidateSourceRef[]
  generatedSummary: {
    text: string | null
    noSummaryReason: string | null
    generatedAt: string
    model: string | null
    keyFact: string | null
    reasonType: string | null
    quoteMovePercent: number | null
  } | null
  finvizSummary: {
    headline: string | null
    text: string | null
    sourceUrl: string | null
    fetchedAt: string
  } | null
}

export interface MorningBriefWiimReport {
  status: 'ready' | 'missing' | 'unavailable'
  summaryDate: string
  runId: string | null
  generatedAt: string | null
  topCandidate: string | null
  bestContrarianCandidate: string | null
  candidates: MorningBriefWiimCandidate[]
  summaryCoverage: {
    expected: number
    stored: number
    generated: number
    noClearCatalyst: number
    model: string | null
    runId: string | null
  }
  finvizCoverage: {
    expected: number
    attempted: number
    found: number
    notFound: number
    errors: number
    missing: number
    missingSymbols: string[]
  }
  error: string | null
}

export interface MorningBriefReport {
  summaryDate: string
  generatedAt: string
  premarket: PremarketBrief
  economicEvents: EconomicEvent[]
  earnings: EarningsData[]
  globalMarkets: GlobalIndexQuote[]
  forexBonds: ForexBondData[]
  wiim: MorningBriefWiimReport
  takeaways: MorningBriefTakeaway[]
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
  )
}

function readSummaryMetadata(metadata: unknown) {
  if (!isRecord(metadata)) {
    return { keyFact: null, reasonType: null, quoteMovePercent: null }
  }

  const quote = isRecord(metadata.quote) ? metadata.quote : null

  return {
    keyFact: stringValue(metadata.key_fact),
    reasonType: stringValue(metadata.reason_type),
    quoteMovePercent: numberValue(quote?.changesPercentage),
  }
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
  const startOffset = getTimeZoneOffsetMinutes(date, 'America/New_York')
  const endOffset = getTimeZoneOffsetMinutes(nextDate, 'America/New_York')

  return {
    start: new Date(Date.parse(`${date}T00:00:00Z`) - startOffset * 60_000).toISOString(),
    end: new Date(Date.parse(`${nextDate}T00:00:00Z`) - endOffset * 60_000).toISOString(),
  }
}

function unavailableWiimReport(summaryDate: string, error: string): MorningBriefWiimReport {
  return {
    status: 'unavailable',
    summaryDate,
    runId: null,
    generatedAt: null,
    topCandidate: null,
    bestContrarianCandidate: null,
    candidates: [],
    summaryCoverage: {
      expected: 0,
      stored: 0,
      generated: 0,
      noClearCatalyst: 0,
      model: null,
      runId: null,
    },
    finvizCoverage: {
      expected: SP500_SYMBOLS.size,
      attempted: 0,
      found: 0,
      notFound: 0,
      errors: 0,
      missing: SP500_SYMBOLS.size,
      missingSymbols: Array.from(SP500_SYMBOLS),
    },
    error,
  }
}

async function loadWiimReport(summaryDate: string): Promise<MorningBriefWiimReport> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return unavailableWiimReport(summaryDate, 'Supabase is not configured.')
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const bounds = getEasternDateBounds(summaryDate)

  const [runResult, summaryRunResult, summaryRowsResult, finvizRowsResult] = await Promise.all([
    supabase
      .from('wiim_runs')
      .select('id, status, started_at, completed_at, top_candidate, best_contrarian_candidate, top_five_json')
      .eq('run_type', 'morning')
      .eq('status', 'completed')
      .gte('started_at', bounds.start)
      .lt('started_at', bounds.end)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('wiim_summary_runs')
      .select('run_id, run_date, ticker_count, model, created_at')
      .eq('run_date', summaryDate)
      .order('ticker_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stock_summaries')
      .select('symbol, summary_text, no_summary_reason, generated_at, model, run_id, metadata')
      .eq('summary_date', summaryDate)
      .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
      .or('no_summary_reason.is.null,no_summary_reason.neq.validation_rejected')
      .order('generated_at', { ascending: false }),
    supabase
      .from('stock_why_moving_cache')
      .select('symbol, status, headline, display_text, source_url, fetched_at, error_message')
      .gte('fetched_at', bounds.start)
      .lt('fetched_at', bounds.end)
      .order('fetched_at', { ascending: false }),
  ])

  const firstError =
    runResult.error || summaryRunResult.error || summaryRowsResult.error || finvizRowsResult.error
  if (firstError) {
    return unavailableWiimReport(summaryDate, firstError.message)
  }

  const run = (runResult.data ?? null) as WiimRunRow | null
  const summaryRun = (summaryRunResult.data ?? null) as WiimSummaryRunRow | null
  const summaryRows = (summaryRowsResult.data ?? []) as GeneratedSummaryRow[]
  const finvizRows = (finvizRowsResult.data ?? []) as FinvizCacheRow[]

  const summariesBySymbol = new Map<string, GeneratedSummaryRow>()
  for (const row of summaryRows) {
    if (!summariesBySymbol.has(row.symbol)) summariesBySymbol.set(row.symbol, row)
  }

  const finvizBySymbol = new Map<string, FinvizCacheRow>()
  for (const row of finvizRows) {
    if (!finvizBySymbol.has(row.symbol)) finvizBySymbol.set(row.symbol, row)
  }

  const topFive = Array.isArray(run?.top_five_json)
    ? run.top_five_json.filter(isRankedWiimCandidate)
    : []
  const candidates = topFive.map((candidate): MorningBriefWiimCandidate => {
    const ticker = candidate.ticker || candidate.metadata?.symbol || ''
    const generated = summariesBySymbol.get(ticker)
    const finviz = finvizBySymbol.get(ticker)
    const generatedMetadata = readSummaryMetadata(generated?.metadata)

    return {
      rank: candidate.rank,
      ticker,
      headline: candidate.headline,
      whyItMatters: candidate.whyItMatters,
      confidenceScore: candidate.confidenceScore,
      candidateType: candidate.candidateType,
      stateLabel: candidate.stateLabel,
      movePercent: numberValue(candidate.metadata?.changesPercentage),
      sourceRefs: Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [],
      generatedSummary: generated
        ? {
            text: generated.summary_text,
            noSummaryReason: generated.no_summary_reason,
            generatedAt: generated.generated_at,
            model: generated.model,
            keyFact: generatedMetadata.keyFact,
            reasonType: generatedMetadata.reasonType,
            quoteMovePercent: generatedMetadata.quoteMovePercent,
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

  const uniqueSummaryRows = Array.from(summariesBySymbol.values())
  const sp500SummaryRows = uniqueSummaryRows.filter((row) => isSP500(row.symbol))
  const sp500FinvizRows = finvizRows.filter((row) => isSP500(row.symbol))
  const generatedCount = sp500SummaryRows.filter((row) => Boolean(row.summary_text)).length
  const noClearCatalystCount = sp500SummaryRows.filter((row) => !row.summary_text).length
  const expectedFinvizRows = SP500_SYMBOLS.size
  const attemptedFinvizRows = sp500FinvizRows.length
  const refreshedFinvizSymbols = new Set(
    sp500FinvizRows
      .map((row) => normalizeSP500Symbol(row.symbol))
      .filter((symbol): symbol is string => Boolean(symbol)),
  )
  const missingFinvizSymbols = Array.from(SP500_SYMBOLS)
    .filter((symbol) => !refreshedFinvizSymbols.has(symbol))
    .sort((a, b) => a.localeCompare(b))

  return {
    status: run && candidates.length > 0 ? 'ready' : 'missing',
    summaryDate,
    runId: run?.id ?? null,
    generatedAt: run?.completed_at ?? run?.started_at ?? null,
    topCandidate: run?.top_candidate ?? null,
    bestContrarianCandidate: run?.best_contrarian_candidate ?? null,
    candidates,
    summaryCoverage: {
      expected: summaryRun?.ticker_count ?? 0,
      stored: sp500SummaryRows.length,
      generated: generatedCount,
      noClearCatalyst: noClearCatalystCount,
      model: summaryRun?.model ?? sp500SummaryRows[0]?.model ?? null,
      runId: summaryRun?.run_id ?? sp500SummaryRows[0]?.run_id ?? null,
    },
    finvizCoverage: {
      expected: expectedFinvizRows,
      attempted: attemptedFinvizRows,
      found: sp500FinvizRows.filter((row) => row.status === 'found').length,
      notFound: sp500FinvizRows.filter((row) => row.status === 'not_found').length,
      errors: sp500FinvizRows.filter((row) => row.status === 'error').length,
      missing: missingFinvizSymbols.length,
      missingSymbols: missingFinvizSymbols,
    },
    error: null,
  }
}

export async function getMorningBriefReport(): Promise<MorningBriefReport> {
  const summaryDate = getWiimSummaryDate()
  const [
    premarket,
    economicResult,
    earningsResult,
    globalMarkets,
    forexResult,
    wiim,
  ] = await Promise.all([
    getPremarketBrief(),
    getEconomicEvents(),
    fetchEarningsCalendar(),
    getGlobalIndexQuotes(),
    getForexBondsData(),
    loadWiimReport(summaryDate),
  ])

  const economicEvents: EconomicEvent[] =
    'events' in economicResult && Array.isArray(economicResult.events)
      ? economicResult.events
      : []
  const forexBonds = 'forexBonds' in forexResult ? forexResult.forexBonds : []
  const topWiimCandidate = wiim.candidates[0]

  return {
    summaryDate,
    generatedAt: new Date().toISOString(),
    premarket,
    economicEvents,
    earnings: earningsResult.earnings,
    globalMarkets,
    forexBonds,
    wiim,
    takeaways: buildMorningBriefTakeaways({
      summaryDate,
      futures: premarket.futuresRows.map((row) => ({
        name: row.name,
        changePercent: row.premarketChangePct ?? row.currentChangePct,
      })),
      semiconductorRead: premarket.semiRead,
      economicEvents,
      earnings: earningsResult.earnings,
      topWiimCandidate: topWiimCandidate
        ? {
            ticker: topWiimCandidate.ticker,
            headline: topWiimCandidate.headline,
            movePercent: topWiimCandidate.movePercent,
          }
        : null,
    }),
  }
}
