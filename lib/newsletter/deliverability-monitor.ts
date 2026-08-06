export const NEWSLETTER_DELIVERABILITY_MINIMUM_SAMPLE = 100
export const NEWSLETTER_BOUNCE_RATE_LIMIT = 0.02
export const NEWSLETTER_COMPLAINT_RATE_LIMIT = 0.001
export const NEWSLETTER_UNSUBSCRIBE_RATE_LIMIT = 0.003

export type NewsletterDeliverabilityBreach = {
  metric: 'bounce' | 'complaint' | 'unsubscribe'
  count: number
  sent: number
  rate: number
  limit: number
  severity: 'warning' | 'error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function count(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key]
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return 0
}

export function evaluateBeehiivDeliverability(
  stats: Record<string, unknown>,
): NewsletterDeliverabilityBreach[] {
  const email = isRecord(stats.email) ? stats.email : {}
  const sent = count(email, ['total_sent', 'recipients', 'sent'])
  if (sent < NEWSLETTER_DELIVERABILITY_MINIMUM_SAMPLE) return []

  const hard = count(email, ['total_hard_bounced'])
  const soft = count(email, ['total_soft_bounced'])
  const bounces = count(email, ['total_bounces', 'bounces', 'bounced']) ||
    hard + soft
  const complaints = count(email, [
    'total_spam_reported',
    'spam_reports',
    'spamReports',
  ])
  const unsubscribes = count(email, [
    'total_unsubscribes',
    'unsubscribes',
  ])

  const candidates: NewsletterDeliverabilityBreach[] = [
    {
      metric: 'bounce',
      count: bounces,
      sent,
      rate: bounces / sent,
      limit: NEWSLETTER_BOUNCE_RATE_LIMIT,
      severity: 'error',
    },
    {
      metric: 'complaint',
      count: complaints,
      sent,
      rate: complaints / sent,
      limit: NEWSLETTER_COMPLAINT_RATE_LIMIT,
      severity: 'error',
    },
    {
      metric: 'unsubscribe',
      count: unsubscribes,
      sent,
      rate: unsubscribes / sent,
      limit: NEWSLETTER_UNSUBSCRIBE_RATE_LIMIT,
      severity: 'warning',
    },
  ]
  return candidates.filter((candidate) => candidate.rate >= candidate.limit)
}
