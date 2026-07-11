import type { RankedWiimCandidate } from './types'

export interface WiimDeltaSummary {
  previousTopCandidate: string | null
  currentTopCandidate: string | null
  topCandidateChanged: boolean
  newlyEntered: string[]
  dropped: string[]
  rankChanges: Array<{
    ticker: string
    previousRank: number
    currentRank: number
  }>
  confidenceShifts: Array<{
    ticker: string
    previousConfidence: number
    currentConfidence: number
    delta: number
  }>
  significanceScore: number
  shouldNotify: boolean
  notableText: string[]
}

function byTicker(candidates: RankedWiimCandidate[]) {
  return new Map(candidates.map((candidate) => [candidate.ticker, candidate] as const))
}

export function computeWiimDelta(previous: RankedWiimCandidate[], current: RankedWiimCandidate[]): WiimDeltaSummary {
  const previousByTicker = byTicker(previous)
  const currentByTicker = byTicker(current)

  const previousTickers = previous.map((candidate) => candidate.ticker).filter((ticker): ticker is string => Boolean(ticker))
  const currentTickers = current.map((candidate) => candidate.ticker).filter((ticker): ticker is string => Boolean(ticker))

  const newlyEntered = currentTickers.filter((ticker) => !previousByTicker.has(ticker))
  const dropped = previousTickers.filter((ticker) => !currentByTicker.has(ticker))

  const rankChanges = currentTickers.flatMap((ticker) => {
    const prev = previousByTicker.get(ticker)
    const curr = currentByTicker.get(ticker)
    if (!prev || !curr || prev.rank === curr.rank) return []
    return [{ ticker, previousRank: prev.rank, currentRank: curr.rank }]
  })

  const confidenceShifts = currentTickers.flatMap((ticker) => {
    const prev = previousByTicker.get(ticker)
    const curr = currentByTicker.get(ticker)
    if (!prev || !curr) return []
    const delta = curr.confidenceScore - prev.confidenceScore
    if (Math.abs(delta) < 5) return []
    return [{ ticker, previousConfidence: prev.confidenceScore, currentConfidence: curr.confidenceScore, delta }]
  })

  const previousTopCandidate = previous[0]?.ticker ?? null
  const currentTopCandidate = current[0]?.ticker ?? null
  const topCandidateChanged = previousTopCandidate !== currentTopCandidate

  const significanceScore =
    (topCandidateChanged ? 5 : 0) +
    (newlyEntered.length * 3) +
    (dropped.length * 2) +
    rankChanges.filter((change) => Math.abs(change.previousRank - change.currentRank) >= 2).length +
    confidenceShifts.length

  const shouldNotify = topCandidateChanged || newlyEntered.length > 0 || confidenceShifts.length > 0 || significanceScore >= 4

  const notableText: string[] = []
  if (topCandidateChanged) {
    notableText.push(`Top pick changed from ${previousTopCandidate ?? 'n/a'} to ${currentTopCandidate ?? 'n/a'}.`)
  }
  if (newlyEntered.length > 0) {
    notableText.push(`New names in the top 5: ${newlyEntered.join(', ')}.`)
  }
  if (dropped.length > 0) {
    notableText.push(`Dropped from the top 5: ${dropped.join(', ')}.`)
  }
  if (rankChanges.length > 0) {
    const moveText = rankChanges
      .slice(0, 3)
      .map((change) => `${change.ticker} ${change.previousRank}→${change.currentRank}`)
      .join(', ')
    notableText.push(`Rank shifts: ${moveText}.`)
  }
  if (confidenceShifts.length > 0) {
    const confidenceText = confidenceShifts
      .slice(0, 3)
      .map((shift) => `${shift.ticker} ${shift.previousConfidence}→${shift.currentConfidence}`)
      .join(', ')
    notableText.push(`Confidence shifts: ${confidenceText}.`)
  }

  return {
    previousTopCandidate,
    currentTopCandidate,
    topCandidateChanged,
    newlyEntered,
    dropped,
    rankChanges,
    confidenceShifts,
    significanceScore,
    shouldNotify,
    notableText,
  }
}
