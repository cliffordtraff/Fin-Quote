import { isSP500, normalizeSP500Symbol } from '@/lib/sp500'

import type {
  RankedWiimCandidate,
  WiimCandidateInput,
  WiimCandidateSignals,
  WiimRunSummary,
  WiimRunType,
} from './types'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hoursBetween(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.round((now - timestamp) / (1000 * 60 * 60))
}

function daysBetween(iso: string | null | undefined, now = Date.now()): number | null {
  const hours = hoursBetween(iso, now)
  return hours == null ? null : round2(hours / 24)
}

function hasDirectionalMismatch(candidate: WiimCandidateInput): boolean {
  const catalyst = candidate.whyMoving?.displayText?.toLowerCase() ?? ''
  if (!catalyst) return false

  const moveUp = candidate.changesPercentage > 0.75
  const moveDown = candidate.changesPercentage < -0.75
  const textSaysUp = /(rise|rises|rose|up |surge|surges|surged|gain|gains|gained|jump|jumps|jumped|climb|climbs|climbed)/.test(catalyst)
  const textSaysDown = /(fall|falls|fell|down |drop|drops|dropped|slide|slides|slid|sink|sinks|sank)/.test(catalyst)

  return (moveUp && textSaysDown) || (moveDown && textSaysUp)
}

function pickHeadline(candidate: WiimCandidateInput): string {
  if (candidate.whyMoving?.headline && !hasDirectionalMismatch(candidate)) return candidate.whyMoving.headline
  if (candidate.news[0]?.title) return candidate.news[0].title

  const move = `${candidate.changesPercentage >= 0 ? '+' : ''}${round2(candidate.changesPercentage)}%`
  return `${candidate.symbol} is moving ${move}`
}

function buildWhyItMatters(candidate: WiimCandidateInput): string {
  const move = `${candidate.changesPercentage >= 0 ? '+' : ''}${round2(candidate.changesPercentage)}%`

  if (candidate.whyMoving?.displayText && !hasDirectionalMismatch(candidate)) {
    return `${candidate.symbol} is moving ${move}. Finviz points to ${candidate.whyMoving.displayText}.`
  }

  if (candidate.earningsReport) {
    const when = candidate.earningsReport.hoursAgo <= 0
      ? `${Math.abs(candidate.earningsReport.hoursAgo)} hours ago`
      : `in ${candidate.earningsReport.hoursAgo} hours`
    const newsLead = candidate.news[0]?.title
    return newsLead
      ? `${candidate.symbol} is moving ${move} around earnings (${when}). Key angle: ${newsLead}`
      : `${candidate.symbol} is moving ${move} around earnings (${when}), which makes it one of the cleaner S&P 500 catalyst names this morning.`
  }

  if (candidate.news[0]?.title) {
    return `${candidate.symbol} is moving ${move}. The leading headline is: ${candidate.news[0].title}`
  }

  return `${candidate.symbol} is moving ${move}, which is enough to keep it on the S&P 500 morning watchlist even without a clear catalyst yet.`
}

function buildStateLabel(candidate: WiimCandidateInput): RankedWiimCandidate['stateLabel'] {
  if (candidate.recentPick && Math.abs(candidate.changesPercentage) < 4 && !candidate.earningsReport) {
    return 'persistent'
  }
  if (candidate.recentPick && Math.abs(candidate.changesPercentage) < 2 && candidate.news.length === 0) {
    return 'fading'
  }
  return 'new'
}

function hasStrongEditorialSetup(candidate: WiimCandidateInput): boolean {
  const moveAbs = Math.abs(candidate.changesPercentage)
  const finvizText = candidate.whyMoving?.displayText?.toLowerCase() ?? ''
  const hasEarnings = Boolean(candidate.earningsReport)
  const hasFreshNewsDepth = candidate.news.length >= 2
  const looksLikeCorporateFluff = /(opens bookings|culinary program|launches|announces program|unveils|introduces)/.test(finvizText)
  const looksLikeHardCatalyst = /(beats|misses|guidance|stake|acquisition|buyback|cuts workforce|raises|lowers|deal|invested)/.test(finvizText)

  if (hasEarnings) return true
  if (looksLikeHardCatalyst && moveAbs >= 4) return true
  if (hasFreshNewsDepth && moveAbs >= 6 && !looksLikeCorporateFluff) return true
  return false
}

function buildCandidateType(candidate: WiimCandidateInput): RankedWiimCandidate['candidateType'] {
  if (hasStrongEditorialSetup(candidate)) return 'newsletter'
  if (Math.abs(candidate.changesPercentage) >= 7) return 'chart_of_day'
  if (candidate.news.length >= 2) return 'roundup'
  return 'watch_only'
}

function buildSignals(candidate: WiimCandidateInput): WiimCandidateSignals {
  const now = Date.now()
  const earningsRecencyHours = candidate.earningsReport?.hoursAgo ?? null
  const finvizFreshnessMinutes = candidate.whyMoving?.fetchedAt
    ? Math.round((now - new Date(candidate.whyMoving.fetchedAt).getTime()) / (1000 * 60))
    : null
  const recentPickAgeDays = candidate.recentPick?.pickedAt
    ? daysBetween(candidate.recentPick.pickedAt, now)
    : null

  const moveAbs = Math.abs(candidate.changesPercentage)
  const hasFreshEarnings = candidate.earningsReport ? Math.abs(candidate.earningsReport.hoursAgo) <= 36 : false
  const finvizText = candidate.whyMoving?.displayText?.toLowerCase() ?? ''
  const hasFreshFinviz = Boolean(candidate.whyMoving?.displayText && finvizFreshnessMinutes != null && finvizFreshnessMinutes <= 240)
  const hasStrongHeadline = candidate.news.length >= 2
  const mismatchPenalty = hasDirectionalMismatch(candidate) ? -10 : 0
  const fluffPenalty = /(opens bookings|culinary program|launches|announces program|unveils|introduces)/.test(finvizText) ? -8 : 0
  const hardCatalystBonus = /(beats|misses|guidance|stake|acquisition|buyback|cuts workforce|raises|lowers|deal|invested)/.test(finvizText) ? 6 : 0

  const scoreBreakdown = {
    move: clamp(moveAbs * 4.2, 0, 26),
    news: candidate.news.length > 0 ? Math.min(candidate.news.length * 5, 15) : -6,
    earnings: hasFreshEarnings ? 18 - Math.min(Math.abs(candidate.earningsReport!.hoursAgo), 36) / 3 : 0,
    finviz: hasFreshFinviz ? 8 : 0,
    novelty: candidate.recentPick ? -14 : 8,
    catalystBonus: (candidate.whyMoving?.isCatalyst ? 3 : 0) + hardCatalystBonus + (hasStrongHeadline ? 4 : 0) + (moveAbs >= 6 ? 3 : 0) + mismatchPenalty + fluffPenalty,
  }

  return {
    movePercent: round2(candidate.changesPercentage),
    moveAbsPercent: round2(Math.abs(candidate.changesPercentage)),
    hasNews: candidate.news.length > 0,
    newsCount: candidate.news.length,
    hasEarnings: Boolean(candidate.earningsReport),
    earningsRecencyHours,
    hasFinvizCatalyst: Boolean(candidate.whyMoving?.displayText),
    finvizFreshnessMinutes,
    wasRecentlyPicked: Boolean(candidate.recentPick),
    recentPickAgeDays,
    sentiment: candidate.whyMoving?.sentiment ?? null,
    scoreBreakdown,
  }
}

function buildSourceRefs(candidate: WiimCandidateInput): RankedWiimCandidate['sourceRefs'] {
  const refs: RankedWiimCandidate['sourceRefs'] = [
    {
      kind: 'market_data',
      label: `${candidate.symbol} ${candidate.changesPercentage >= 0 ? '+' : ''}${round2(candidate.changesPercentage)}%`,
    },
  ]

  if (candidate.earningsReport) {
    refs.push({
      kind: 'earnings',
      label: `${candidate.symbol} earnings ${candidate.earningsReport.time}`,
      publishedAt: candidate.earningsReport.date,
    })
  }

  if (candidate.whyMoving?.displayText) {
    refs.push({
      kind: 'finviz',
      label: candidate.whyMoving.displayText,
      url: candidate.whyMoving.sourceUrl,
      publishedAt: candidate.whyMoving.sourceTimestamp,
    })
  }

  if (candidate.recentPick) {
    refs.push({
      kind: 'recent_pick',
      label: `Picked recently for newsletter`,
      publishedAt: candidate.recentPick.pickedAt,
    })
  }

  for (const article of candidate.news.slice(0, 2)) {
    refs.push({
      kind: 'news',
      label: article.title,
      url: article.url,
      publishedAt: article.publishedDate,
    })
  }

  return refs
}

function scoreCandidate(signals: WiimCandidateSignals): number {
  return Object.values(signals.scoreBreakdown).reduce((sum, value) => sum + value, 0)
}

export function rankWiimCandidates(inputs: WiimCandidateInput[], limit = 5): RankedWiimCandidate[] {
  const ranked = inputs
    .flatMap((candidate) => {
      const symbol = normalizeSP500Symbol(candidate.symbol)
      if (!symbol || !isSP500(symbol)) return []
      return [{ ...candidate, symbol }]
    })
    .map((candidate) => {
      const signals = buildSignals(candidate)
      return {
        candidate,
        signals,
        rawScore: scoreCandidate(signals),
      }
    })
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      ticker: entry.candidate.symbol,
      theme: null,
      headline: pickHeadline(entry.candidate),
      whyItMatters: buildWhyItMatters(entry.candidate),
      confidenceScore: clamp(Math.round(entry.rawScore), 1, 99),
      candidateType: buildCandidateType(entry.candidate),
      stateLabel: buildStateLabel(entry.candidate),
      signals: entry.signals,
      sourceRefs: buildSourceRefs(entry.candidate),
      metadata: {
        symbol: entry.candidate.symbol,
        name: entry.candidate.name,
        price: entry.candidate.price,
        change: entry.candidate.change,
        changesPercentage: entry.candidate.changesPercentage,
        topNews: entry.candidate.news.slice(0, 3),
        earningsReport: entry.candidate.earningsReport,
        recentPick: entry.candidate.recentPick,
        whyMoving: entry.candidate.whyMoving,
      },
    }))

  return ranked
}

function contrarianScore(candidate: RankedWiimCandidate, topCandidate: string | null): number {
  if (!candidate.ticker || candidate.ticker === topCandidate) return Number.NEGATIVE_INFINITY

  const moveAbs = candidate.signals.moveAbsPercent
  const isDownMove = candidate.signals.movePercent < 0
  const hasCatalyst = candidate.signals.hasEarnings || candidate.signals.hasFinvizCatalyst || candidate.signals.hasNews
  const isNotRepeat = !candidate.signals.wasRecentlyPicked
  const notPureMomentum = moveAbs < 8

  return (
    (isDownMove ? 28 : 0) +
    (hasCatalyst ? 18 : 0) +
    (isNotRepeat ? 14 : 0) +
    (notPureMomentum ? 10 : 0) +
    (candidate.candidateType === 'newsletter' ? 12 : 0) +
    Math.min(candidate.confidenceScore, 80) / 4
  )
}

export function summarizeWiimRun(input: {
  runType: WiimRunType
  generatedAt: string
  candidateCount: number
  topFive: RankedWiimCandidate[]
  metadata?: Record<string, unknown>
}): WiimRunSummary {
  const topCandidate = input.topFive[0]?.ticker ?? null
  const bestContrarianCandidate = [...input.topFive]
    .sort((a, b) => contrarianScore(b, topCandidate) - contrarianScore(a, topCandidate))
    .find((candidate) => candidate.ticker && candidate.ticker !== topCandidate)?.ticker
    ?? null

  return {
    runType: input.runType,
    generatedAt: input.generatedAt,
    candidateCount: input.candidateCount,
    topCandidate,
    bestContrarianCandidate,
    topFive: input.topFive,
    summaryText: '',
    metadata: input.metadata ?? {},
  }
}
