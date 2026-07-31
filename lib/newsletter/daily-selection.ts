import { getSP500Constituent } from '@/lib/sp500'
import type {
  NewsletterDailyCandidate,
  NewsletterDailyQualityBand,
  NewsletterDailySourceRef,
} from './daily-types'

export interface DailyWiimCandidateRow {
  id: string
  wiim_run_id: string
  rank: number
  ticker: string | null
  headline: string
  why_it_matters: string
  confidence_score: number
  candidate_type: string
  state_label: string | null
  signals_json: unknown
  source_refs_json: unknown
  metadata_json: unknown
}

export interface DailyGeneratedSummaryRow {
  symbol: string
  summary_text: string | null
  no_summary_reason: string | null
  generated_at: string
  model: string | null
  run_id: string | null
  winning_event: unknown
  metadata: unknown
}

interface CandidateSignals {
  movePercent: number | null
  moveAbsPercent: number
  hasNews: boolean
  newsCount: number
  hasEarnings: boolean
  hasFinvizCatalyst: boolean
  finvizFreshnessMinutes: number | null
  wasRecentlyPicked: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeSourceRefs(value: unknown): NewsletterDailySourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const kind = stringValue(entry.kind)
    const label = stringValue(entry.label)
    if (!kind || !label) return []
    return [{
      kind,
      label,
      url: stringValue(entry.url) ?? undefined,
      publishedAt: stringValue(entry.publishedAt) ?? undefined,
    }]
  })
}

function readSignals(value: unknown): CandidateSignals {
  const signals = isRecord(value) ? value : {}
  const movePercent = numberValue(signals.movePercent)
  return {
    movePercent,
    moveAbsPercent:
      numberValue(signals.moveAbsPercent) ?? Math.abs(movePercent ?? 0),
    hasNews: signals.hasNews === true,
    newsCount: numberValue(signals.newsCount) ?? 0,
    hasEarnings: signals.hasEarnings === true,
    hasFinvizCatalyst: signals.hasFinvizCatalyst === true,
    finvizFreshnessMinutes: numberValue(signals.finvizFreshnessMinutes),
    wasRecentlyPicked: signals.wasRecentlyPicked === true,
  }
}

function toCalendarDay(value: string | null | undefined): number | null {
  if (!value) return null
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!dateMatch) return null
  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
  )
}

export function isDailySourceFresh(
  publishedAt: string | null | undefined,
  marketDate: string,
  maxAgeDays = 7,
): boolean {
  const publishedDay = toCalendarDay(publishedAt)
  const marketDay = toCalendarDay(marketDate)
  if (publishedDay == null || marketDay == null) return false
  const ageDays = Math.round((marketDay - publishedDay) / 86_400_000)
  return ageDays >= 0 && ageDays <= maxAgeDays
}

function summaryEventDate(row: DailyGeneratedSummaryRow): string | null {
  if (isRecord(row.winning_event)) {
    const publishedAt =
      stringValue(row.winning_event.publishedDate) ??
      stringValue(row.winning_event.published_at)
    if (publishedAt) return publishedAt
  }

  if (!isRecord(row.metadata) || !Array.isArray(row.metadata.candidate_pool)) {
    return null
  }
  for (const candidate of row.metadata.candidate_pool) {
    if (!isRecord(candidate)) continue
    const publishedAt =
      stringValue(candidate.publishedDate) ??
      stringValue(candidate.published_at)
    if (publishedAt) return publishedAt
  }
  return null
}

function summaryQuality(row: DailyGeneratedSummaryRow, marketDate: string): number {
  const summaryText = row.summary_text?.trim()
  if (!summaryText || /(?:\.{3}|…)$/.test(summaryText)) {
    return Number.NEGATIVE_INFINITY
  }
  const eventDate = summaryEventDate(row)
  if (!isDailySourceFresh(eventDate, marketDate, 7)) {
    return Number.NEGATIVE_INFINITY
  }

  const metadata = isRecord(row.metadata) ? row.metadata : {}
  const source = stringValue(metadata.source)
  const generatedDayFresh = isDailySourceFresh(row.generated_at, marketDate, 0)
  return (
    (generatedDayFresh ? 20 : 0) +
    (source === 'fin_quote_generated_daily' ? 8 : 0) +
    (row.run_id?.startsWith('fin_quote_daily_') ? 5 : 0) +
    (eventDate?.startsWith(marketDate) ? 8 : 0)
  )
}

function bestSummaryBySymbol(
  summaries: DailyGeneratedSummaryRow[],
  marketDate: string,
): Map<string, DailyGeneratedSummaryRow> {
  const best = new Map<string, DailyGeneratedSummaryRow>()
  for (const row of summaries) {
    if (!row.summary_text?.trim()) continue
    const current = best.get(row.symbol)
    if (
      !current ||
      summaryQuality(row, marketDate) > summaryQuality(current, marketDate) ||
      (
        summaryQuality(row, marketDate) === summaryQuality(current, marketDate) &&
        row.generated_at > current.generated_at
      )
    ) {
      best.set(row.symbol, row)
    }
  }
  for (const [symbol, row] of best) {
    if (!Number.isFinite(summaryQuality(row, marketDate))) best.delete(symbol)
  }
  return best
}

function isConcreteHeadline(headline: string, ticker: string): boolean {
  const normalized = headline.trim().toLowerCase()
  if (normalized.length < 24) return false
  return !normalized.startsWith(`${ticker.toLowerCase()} is moving`)
}

function deriveReasonType(
  row: DailyGeneratedSummaryRow | undefined,
  signals: CandidateSignals,
): string | null {
  if (isRecord(row?.metadata)) {
    const reason = stringValue(row.metadata.reason_type)
    if (reason) return reason
  }
  if (signals.hasEarnings) return 'earnings'
  if (signals.hasFinvizCatalyst) return 'catalyst'
  if (signals.hasNews) return 'news'
  return null
}

function candidateScore(input: {
  confidenceScore: number
  candidateType: string
  stateLabel: string | null
  signals: CandidateSignals
  sourceRefs: NewsletterDailySourceRef[]
  hasIndependentSummary: boolean
  concreteHeadline: boolean
  marketDate: string
}): number {
  const freshNews = input.sourceRefs.some(
    (source) =>
      source.kind === 'news' &&
      isDailySourceFresh(source.publishedAt, input.marketDate, 2),
  )
  const freshFinviz = input.sourceRefs.some(
    (source) =>
      source.kind === 'finviz' &&
      isDailySourceFresh(source.publishedAt, input.marketDate, 1),
  )
  const sourceKinds = new Set(input.sourceRefs.map((source) => source.kind))

  return Math.min(100, Math.round(
    (
      input.confidenceScore +
      (input.candidateType === 'newsletter' ? 12 : 0) +
      (input.signals.hasEarnings ? 14 : 0) +
      (freshFinviz ? 12 : 0) +
      (freshNews ? 8 : 0) +
      (input.hasIndependentSummary ? 10 : 0) +
      Math.min(input.signals.moveAbsPercent, 12) +
      Math.min(sourceKinds.size * 2, 8) +
      (input.stateLabel === 'new' ? 5 : 0) -
      (input.signals.wasRecentlyPicked ? 28 : 0) -
      (input.stateLabel === 'fading' ? 18 : 0) -
      (input.concreteHeadline ? 0 : 24)
    ) * 100,
  ) / 100)
}

function qualityBand(input: {
  relevanceScore: number
  concreteHeadline: boolean
  hasFreshEvidence: boolean
  wasRecentlyPicked: boolean
  stateLabel: string | null
}): NewsletterDailyQualityBand {
  return (
    input.relevanceScore >= 58 &&
    input.concreteHeadline &&
    input.hasFreshEvidence &&
    !input.wasRecentlyPicked &&
    input.stateLabel !== 'fading'
  )
    ? 'strong'
    : 'review'
}

function cleanSentence(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(?:\.\s*){2,}$/g, '.')
    .trim()
}

function summaryMoveDirection(
  value: string,
  ticker: string,
): 'positive' | 'negative' | null {
  const escapedTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const subject = `(?:shares?|stock|${escapedTicker})`
  const positive = new RegExp(
    `\\b${subject}\\b.{0,28}\\b(?:up|rose|rises|rallied|rallies|jumped|jumps|surged|surges|soared|soars|gained|gains|climbed|climbs|advanced|advances)\\b`,
    'i',
  )
  const negative = new RegExp(
    `\\b${subject}\\b.{0,28}\\b(?:down|fell|falls|dropped|drops|plunged|plunges|slid|slides|sank|sinks|tumbled|tumbles|declined|declines)\\b`,
    'i',
  )
  const opening = value.slice(0, 180)
  if (positive.test(opening)) return 'positive'
  if (negative.test(opening)) return 'negative'
  return null
}

export function isDailySummaryDirectionCompatible(
  value: string,
  ticker: string,
  movePercent: number | null,
): boolean {
  if (movePercent == null || Math.abs(movePercent) < 0.5) return true
  const direction = summaryMoveDirection(value, ticker)
  if (!direction) return true
  return movePercent > 0 ? direction === 'positive' : direction === 'negative'
}

function stripMoveLead(value: string, ticker: string): string {
  return cleanSentence(
    value
      .replace(
        new RegExp(
          `^${ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is moving [+-]?\\d+(?:\\.\\d+)?%\\.\\s*`,
          'i',
        ),
        '',
      )
      .replace(/^Finviz points to\s+/i, ''),
  )
}

export function selectDailyNewsletterCandidates(input: {
  candidateRows: DailyWiimCandidateRow[]
  summaryRows: DailyGeneratedSummaryRow[]
  marketDate: string
  targetCount: number
}): NewsletterDailyCandidate[] {
  const targetCount = Math.max(30, Math.min(50, Math.floor(input.targetCount)))
  const summaries = bestSummaryBySymbol(input.summaryRows, input.marketDate)

  const candidates = input.candidateRows.flatMap((row) => {
    const ticker = row.ticker?.trim().toUpperCase()
    if (!ticker) return []

    const signals = readSignals(row.signals_json)
    const sourceRefs = normalizeSourceRefs(row.source_refs_json)
    const candidateSummary = summaries.get(ticker)
    const summary =
      candidateSummary?.summary_text &&
      isDailySummaryDirectionCompatible(
        candidateSummary.summary_text,
        ticker,
        signals.movePercent,
      )
        ? candidateSummary
        : undefined
    const metadata = isRecord(row.metadata_json) ? row.metadata_json : {}
    const summaryMetadata = isRecord(summary?.metadata) ? summary.metadata : {}
    const quote = isRecord(summaryMetadata.quote) ? summaryMetadata.quote : {}
    const companyName =
      stringValue(metadata.name) ??
      stringValue(quote.name) ??
      getSP500Constituent(ticker)?.name ??
      ticker
    const headlineFromRow = row.headline?.trim() || ''
    const concreteHeadline = isConcreteHeadline(headlineFromRow, ticker)
    const summaryText = cleanSentence(
      summary?.summary_text?.trim() ||
        stripMoveLead(row.why_it_matters, ticker) ||
        headlineFromRow,
    )
    const headline = concreteHeadline
      ? headlineFromRow
      : summaryText.slice(0, 180)
    const freshEvidence = sourceRefs.some((source) => {
      if (source.kind === 'earnings') {
        return isDailySourceFresh(source.publishedAt, input.marketDate, 1)
      }
      if (source.kind === 'finviz' || source.kind === 'news') {
        return isDailySourceFresh(source.publishedAt, input.marketDate, 2)
      }
      return false
    })
    const relevanceScore = candidateScore({
      confidenceScore: Number(row.confidence_score) || 0,
      candidateType: row.candidate_type,
      stateLabel: row.state_label,
      signals,
      sourceRefs,
      hasIndependentSummary: Boolean(summary),
      concreteHeadline,
      marketDate: input.marketDate,
    })
    const band = qualityBand({
      relevanceScore,
      concreteHeadline,
      hasFreshEvidence: freshEvidence || Boolean(summary),
      wasRecentlyPicked: signals.wasRecentlyPicked,
      stateLabel: row.state_label,
    })

    if (
      row.candidate_type === 'watch_only' ||
      signals.wasRecentlyPicked ||
      (!freshEvidence && !summary) ||
      (!concreteHeadline && !summary)
    ) {
      return []
    }

    return [{
      sourceCandidateId: row.id,
      sourceWiimRunId: row.wiim_run_id,
      rank: row.rank,
      ticker,
      companyName,
      headline,
      summaryText,
      keyFact: isRecord(summary?.metadata)
        ? stringValue(summary.metadata.key_fact)
        : null,
      reasonType: deriveReasonType(summary, signals),
      confidenceScore: Number(row.confidence_score) || 0,
      relevanceScore,
      candidateType: row.candidate_type,
      stateLabel: row.state_label,
      qualityBand: band,
      movePercent:
        numberValue(metadata.changesPercentage) ??
        numberValue(quote.changesPercentage) ??
        signals.movePercent,
      price: numberValue(metadata.price) ?? numberValue(quote.price),
      change: numberValue(metadata.change) ?? numberValue(quote.change),
      sourceRefs,
      candidateMetadata: metadata,
    } satisfies NewsletterDailyCandidate]
  })

  return candidates
    .sort((a, b) => {
      if (a.qualityBand !== b.qualityBand) {
        return a.qualityBand === 'strong' ? -1 : 1
      }
      return b.relevanceScore - a.relevanceScore || a.rank - b.rank
    })
    .slice(0, targetCount)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}
