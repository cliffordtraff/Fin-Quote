import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NEWSLETTER_AUTOMATION_LEASE_RENEW_INTERVAL_MS,
  NEWSLETTER_AUTOMATION_LEASE_SECONDS,
  NEWSLETTER_AUTOMATION_MIN_STAGE_BUDGET_MS,
  NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
  NEWSLETTER_CRON_REQUEST_RESERVE_MS,
  NEWSLETTER_DAILY_FINVIZ_STAGE_BUDGET_MS,
  NewsletterAutomationLeaseLostError,
  NewsletterAutomationStageBudgetError,
  getNewsletterAutomationStageBudget,
  runWithNewsletterAutomationLease,
} from '../automation-lease'

afterEach(() => {
  vi.useRealTimers()
})

describe('newsletter automation lease heartbeat', () => {
  it('renews a long-running stage and stops renewing after completion', async () => {
    vi.useFakeTimers()
    const renew = vi.fn().mockResolvedValue(undefined)
    let finish!: (value: string) => void
    const task = new Promise<string>((resolve) => {
      finish = resolve
    })
    const result = runWithNewsletterAutomationLease({
      task: () => task,
      renew,
      renewIntervalMs: 10,
      budgetMs: 100,
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(renew).toHaveBeenCalledTimes(2)

    finish('done')
    await expect(result).resolves.toBe('done')
    await vi.advanceTimersByTimeAsync(50)
    expect(renew).toHaveBeenCalledTimes(2)
  })

  it('stops the stage when lease renewal proves ownership was lost', async () => {
    vi.useFakeTimers()
    const leaseLost = new NewsletterAutomationLeaseLostError('test workflow')
    const result = runWithNewsletterAutomationLease({
      task: (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
      renew: vi.fn().mockRejectedValue(leaseLost),
      renewIntervalMs: 10,
      budgetMs: 100,
    })
    const rejection = expect(result).rejects.toBe(leaseLost)

    await vi.advanceTimersByTimeAsync(10)
    await rejection
  })

  it('ends the owned stage before the cron runtime is exhausted', async () => {
    vi.useFakeTimers()
    const result = runWithNewsletterAutomationLease({
      task: (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
      renew: vi.fn().mockResolvedValue(undefined),
      renewIntervalMs: 10,
      budgetMs: 25,
    })
    const rejection = expect(result).rejects.toBeInstanceOf(
      NewsletterAutomationStageBudgetError,
    )

    await vi.advanceTimersByTimeAsync(25)
    await rejection
  })

  it('keeps heartbeat and stage deadlines inside the 60-second route budget', () => {
    expect(NEWSLETTER_AUTOMATION_LEASE_RENEW_INTERVAL_MS).toBeLessThan(
      NEWSLETTER_AUTOMATION_LEASE_SECONDS * 1000,
    )
    expect(NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS).toBeLessThan(60_000)
    expect(
      NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS +
        NEWSLETTER_CRON_REQUEST_RESERVE_MS,
    ).toBeLessThanOrEqual(60_000)
  })

  it('keeps the six-symbol Finviz stage inside the 120-second route budget', () => {
    expect(
      NEWSLETTER_DAILY_FINVIZ_STAGE_BUDGET_MS +
        NEWSLETTER_CRON_REQUEST_RESERVE_MS,
    ).toBeLessThanOrEqual(120_000)
  })

  it('caps a fresh stage to the deadline and declines unsafe slivers', () => {
    const now = Date.parse('2026-08-06T12:00:00.000Z')

    expect(getNewsletterAutomationStageBudget(now + 60_000, now)).toBe(
      NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
    )
    expect(getNewsletterAutomationStageBudget(now + 45_000, now)).toBe(
      35_000,
    )
    expect(
      getNewsletterAutomationStageBudget(
        now + 120_000,
        now,
        NEWSLETTER_DAILY_FINVIZ_STAGE_BUDGET_MS,
      ),
    ).toBe(NEWSLETTER_DAILY_FINVIZ_STAGE_BUDGET_MS)
    expect(
      getNewsletterAutomationStageBudget(
        now +
          NEWSLETTER_CRON_REQUEST_RESERVE_MS +
          NEWSLETTER_AUTOMATION_MIN_STAGE_BUDGET_MS -
          1,
        now,
      ),
    ).toBeNull()
  })
})
