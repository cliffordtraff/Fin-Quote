import { describe, expect, it } from 'vitest'
import {
  evaluateBeehiivDeliverability,
  NEWSLETTER_DELIVERABILITY_MINIMUM_SAMPLE,
} from '../deliverability-monitor'

describe('Beehiiv deliverability guardrails', () => {
  it('does not alert on statistically tiny seed sends', () => {
    expect(
      evaluateBeehiivDeliverability({
        email: { total_sent: NEWSLETTER_DELIVERABILITY_MINIMUM_SAMPLE - 1, total_bounces: 1 },
      }),
    ).toEqual([])
  })

  it('flags bounce, complaint, and unsubscribe rate breaches', () => {
    expect(
      evaluateBeehiivDeliverability({
        email: {
          total_sent: 1_000,
          total_hard_bounced: 21,
          total_spam_reported: 1,
          total_unsubscribes: 3,
        },
      }).map((breach) => breach.metric),
    ).toEqual(['bounce', 'complaint', 'unsubscribe'])
  })
})
