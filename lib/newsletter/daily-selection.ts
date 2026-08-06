import { getSP500Constituent } from '@/lib/sp500'
import {
  getNewsletterCompanyAliases,
  isNewsletterSourceEntityMatch,
} from './source-integrity'
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
  if (value == null || (typeof value === 'string' && !value.trim())) return null
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
  let calendarDate = value
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  ) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsed)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    if (!year || !month || !day) return null
    calendarDate = `${year}-${month}-${day}`
  }
  const dateMatch = calendarDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
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
  if (!isRecord(row.winning_event)) return null
  const directPublishedAt =
    stringValue(row.winning_event.publishedDate) ??
    stringValue(row.winning_event.published_at)
  if (directPublishedAt) return directPublishedAt

  if (!isRecord(row.metadata) || !Array.isArray(row.metadata.candidate_pool)) {
    return null
  }
  const winningUrl = stringValue(row.winning_event.url)
  const winningTitle = stringValue(row.winning_event.title)?.toLowerCase()
  for (const candidate of row.metadata.candidate_pool) {
    if (!isRecord(candidate)) continue
    const candidateUrl = stringValue(candidate.url)
    const candidateTitle = stringValue(candidate.title)?.toLowerCase()
    const isSameEvent =
      (winningUrl != null && candidateUrl === winningUrl) ||
      (winningTitle != null && candidateTitle === winningTitle)
    if (!isSameEvent) continue
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

function rankedSummariesBySymbol(
  summaries: DailyGeneratedSummaryRow[],
  marketDate: string,
): Map<string, DailyGeneratedSummaryRow[]> {
  const ranked = new Map<string, DailyGeneratedSummaryRow[]>()
  for (const row of summaries) {
    if (!Number.isFinite(summaryQuality(row, marketDate))) continue
    const symbol = row.symbol.trim().toUpperCase()
    ranked.set(symbol, [...(ranked.get(symbol) ?? []), row])
  }
  for (const rows of ranked.values()) {
    rows.sort((a, b) => {
      const qualityDifference =
        summaryQuality(b, marketDate) - summaryQuality(a, marketDate)
      return qualityDifference || b.generated_at.localeCompare(a.generated_at)
    })
  }
  return ranked
}

function isConcreteHeadline(
  headline: string,
  ticker: string,
  companyName: string,
): boolean {
  const normalized = headline.trim().toLowerCase()
  if (normalized.length < 24) return false
  return (
    !normalized.startsWith(`${ticker.toLowerCase()} is moving`) &&
    isNewsletterSourceEntityMatch({ ticker, companyName, text: headline })
  )
}

function winningEventSource(
  row: DailyGeneratedSummaryRow | undefined,
  ticker: string,
  companyName: string,
  marketDate: string,
): NewsletterDailySourceRef | null {
  if (!isRecord(row?.winning_event)) return null
  const label = stringValue(row.winning_event.title)
  if (
    !label ||
    !isNewsletterSourceEntityMatch({ ticker, companyName, text: label })
  ) {
    return null
  }
  const publishedAt = summaryEventDate(row)
  if (!isDailySourceFresh(publishedAt, marketDate, 2)) return null
  return {
    kind: 'news',
    label,
    url: stringValue(row.winning_event.url) ?? undefined,
    publishedAt: publishedAt ?? undefined,
  }
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
  companyName: string,
): 'positive' | 'negative' | null {
  const subjects = [
    'shares?',
    'stock',
    ticker,
    ...getNewsletterCompanyAliases({ ticker, companyName }),
  ]
    .map((subject) =>
      subject === 'shares?' || subject === 'stock'
        ? subject
        : subject
            .split(/\s+/)
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+'),
    )
    .sort((a, b) => b.length - a.length)
  const priceVerb = new RegExp(
    `\\b(?:${subjects.join('|')})\\b(?:['’]s)?(?:\\s+shares?)?(?:\\s+(?:were|was|are|is|have|has))?\\s+(up|rose|rises|rallied|rallies|jumped|jumps|surged|surges|soared|soars|gained|gains|climbed|climbs|advanced|advances|down|fell|falls|dropped|drops|plunged|plunges|slid|slides|sank|sinks|tumbled|tumbles|declined|declines)\\b`,
    'i',
  )
  const opening = value.slice(0, 180)
  const verb = opening.match(priceVerb)?.[1]?.toLowerCase()
  if (!verb) return null
  return /^(?:up|rose|rises|rallied|rallies|jumped|jumps|surged|surges|soared|soars|gained|gains|climbed|climbs|advanced|advances)$/.test(
    verb,
  )
    ? 'positive'
    : 'negative'
}

export function isDailySummaryDirectionCompatible(
  value: string,
  ticker: string,
  movePercent: number | null,
  companyName = ticker,
): boolean {
  if (movePercent == null || Math.abs(movePercent) < 0.5) return true
  const direction = summaryMoveDirection(value, ticker, companyName)
  if (!direction) return true
  return movePercent > 0 ? direction === 'positive' : direction === 'negative'
}

export function selectDailyNewsletterCandidates(input: {
  candidateRows: DailyWiimCandidateRow[]
  summaryRows: DailyGeneratedSummaryRow[]
  marketDate: string
  targetCount: number
}): NewsletterDailyCandidate[] {
  const targetCount = Math.max(30, Math.min(50, Math.floor(input.targetCount)))
  const summaries = rankedSummariesBySymbol(input.summaryRows, input.marketDate)

  const candidates = input.candidateRows.flatMap((row) => {
    const ticker = row.ticker?.trim().toUpperCase()
    if (!ticker) return []
    const constituent = getSP500Constituent(ticker)
    if (!constituent) return []

    const signals = readSignals(row.signals_json)
    const rawSourceRefs = normalizeSourceRefs(row.source_refs_json)
    const metadata = isRecord(row.metadata_json) ? row.metadata_json : {}
    const rankedTickerSummaries = summaries.get(ticker) ?? []
    const summaryQuoteMove = rankedTickerSummaries
      .map((summaryRow) =>
        isRecord(summaryRow.metadata) && isRecord(summaryRow.metadata.quote)
          ? numberValue(summaryRow.metadata.quote.changesPercentage)
          : null,
      )
      .find((move): move is number => move != null)
    const movePercent =
      numberValue(metadata.changesPercentage) ??
      summaryQuoteMove ??
      signals.movePercent
    const companyName = constituent.name
    const selectedSummary = rankedTickerSummaries
      .map((summaryRow) => ({
        summary: summaryRow,
        source: winningEventSource(
          summaryRow,
          ticker,
          companyName,
          input.marketDate,
        ),
      }))
      .find(
        ({ summary, source }) =>
          source &&
          summary.summary_text &&
          isDailySummaryDirectionCompatible(
            summary.summary_text,
            ticker,
            movePercent,
            companyName,
          ),
      )
    const candidateSummary = selectedSummary?.summary
    const selectedSource = selectedSummary?.source ?? null
    const summary = candidateSummary
    const candidateSummaryMetadata = isRecord(candidateSummary?.metadata)
      ? candidateSummary.metadata
      : {}
    const quote = isRecord(candidateSummaryMetadata.quote)
      ? candidateSummaryMetadata.quote
      : {}
    const sourceRefs = [
      ...(selectedSource ? [selectedSource] : []),
      ...rawSourceRefs.filter(
        (source) =>
          (source.kind !== 'news' && source.kind !== 'finviz') ||
          isNewsletterSourceEntityMatch({
            ticker,
            companyName,
            text: source.label,
          }),
      ),
    ].filter(
      (source, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.kind === source.kind &&
            candidate.label === source.label &&
            candidate.url === source.url,
        ) === index,
    )
    const headlineFromRow = row.headline?.trim() || ''
    const freshEntitySourceRefs = sourceRefs.filter((source) => {
      if (source.kind === 'earnings') {
        return isDailySourceFresh(source.publishedAt, input.marketDate, 1)
      }
      if (source.kind === 'finviz' || source.kind === 'news') {
        return isDailySourceFresh(source.publishedAt, input.marketDate, 2)
      }
      return false
    })
    const preferredHeadline =
      [
        selectedSource?.label,
        headlineFromRow,
        ...freshEntitySourceRefs.map((source) => source.label),
      ].find(
        (headline): headline is string =>
          Boolean(headline) &&
          isConcreteHeadline(headline!, ticker, companyName),
      ) ?? ''
    const concreteHeadline = isConcreteHeadline(
      preferredHeadline,
      ticker,
      companyName,
    )
    const summaryText = cleanSentence(
      summary?.summary_text?.trim() || preferredHeadline,
    )
    const headline = preferredHeadline
    const freshEvidence = freshEntitySourceRefs.length > 0
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
      hasFreshEvidence: freshEvidence,
      wasRecentlyPicked: signals.wasRecentlyPicked,
      stateLabel: row.state_label,
    })

    if (
      row.candidate_type === 'watch_only' ||
      signals.wasRecentlyPicked ||
      !freshEvidence ||
      !concreteHeadline
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
      movePercent,
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
