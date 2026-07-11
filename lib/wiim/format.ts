import type { RankedWiimCandidate, WiimRunSummary } from './types'

function formatCandidate(candidate: RankedWiimCandidate): string {
  const typeLabel = candidate.candidateType.replaceAll('_', ' ')
  const stateLabel = candidate.stateLabel === 'new' ? 'fresh' : candidate.stateLabel
  const bullet = `${candidate.rank}. ${candidate.ticker} (${candidate.confidenceScore}) — ${candidate.headline}`
  return `${bullet}\n   Read: ${candidate.whyItMatters}\n   Setup: ${typeLabel}; ${stateLabel}.`
}

export function formatWiimBrief(summary: Pick<WiimRunSummary, 'generatedAt' | 'topFive' | 'topCandidate' | 'bestContrarianCandidate' | 'metadata'>): string {
  const delta = summary.metadata?.delta as { notableText?: string[] } | undefined
  const deltaLines = Array.isArray(delta?.notableText) && delta.notableText.length > 0
    ? ['', 'What changed vs last run:', ...delta.notableText.map((line) => `- ${line}`)]
    : []

  const label = typeof summary.metadata?.label === 'string' ? summary.metadata.label : 'WIIM Morning Brief'

  const lines = [
    `${label} — ${summary.generatedAt.slice(0, 10)}`,
    'Focus: S&P 500 names only. Ranked for clean catalysts, move size, freshness, and newsletter usefulness.',
    '',
    ...summary.topFive.map(formatCandidate),
    ...deltaLines,
    '',
    `Best overall pick: ${summary.topCandidate ?? 'n/a'}`,
    `Best contrarian pick: ${summary.bestContrarianCandidate ?? 'n/a'}`,
  ]

  return lines.join('\n')
}
