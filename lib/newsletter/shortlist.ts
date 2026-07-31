import type {
  NewsletterDailyRunItem,
  NewsletterRecommendedIssue,
} from './daily-types'

const ACTIONABLE_STATUSES = new Set([
  'generated',
  'ready',
  'published',
])

function formatMove(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function recommendationReason(item: NewsletterDailyRunItem): string {
  const parts: string[] = []
  const move = formatMove(item.movePercent)
  const reason = item.reasonType?.replaceAll('_', ' ')

  if (item.rank === 1) parts.push('Highest-ranked story')
  else parts.push(`#${item.rank} editorial candidate`)
  if (reason) parts.push(reason)
  if (move) parts.push(`${move} move`)
  parts.push(`${Math.round(item.confidenceScore)}% confidence`)

  return parts.join(' / ')
}

export function selectNewsletterRecommendedIssues(
  items: NewsletterDailyRunItem[],
  limit = 5,
): NewsletterRecommendedIssue[] {
  return items
    .filter(
      (item) =>
        ACTIONABLE_STATUSES.has(item.status) &&
        item.qualityBand === 'strong' &&
        Boolean(item.draftId),
    )
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.relevanceScore !== right.relevanceScore) {
        return right.relevanceScore - left.relevanceScore
      }
      return right.confidenceScore - left.confidenceScore
    })
    .slice(0, Math.max(3, Math.min(5, limit)))
    .map((item, index) => ({
      position: index + 1,
      itemId: item.id,
      draftId: item.draftId!,
      ticker: item.ticker,
      subjectLine: item.subjectLine || item.headline,
      reason: recommendationReason(item),
      relevanceScore: item.relevanceScore,
      confidenceScore: item.confidenceScore,
      movePercent: item.movePercent,
    }))
}
