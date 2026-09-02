export const NEWSLETTER_AUTOMATION_LEASE_SECONDS = 60
export const NEWSLETTER_AUTOMATION_LEASE_RENEW_INTERVAL_MS = 10_000
export const NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS = 42_000
export const NEWSLETTER_DAILY_FINVIZ_STAGE_BUDGET_MS = 100_000
export const NEWSLETTER_CRON_REQUEST_RESERVE_MS = 10_000
export const NEWSLETTER_AUTOMATION_MIN_STAGE_BUDGET_MS = 12_000

/**
 * Fits a newly leased stage inside the invocation's absolute request deadline.
 * Returning null tells the route to leave durable state untouched and let the
 * next scheduled invocation continue with a full budget.
 */
export function getNewsletterAutomationStageBudget(
  deadlineAt: number,
  now = Date.now(),
  maximumBudgetMs = NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
): number | null {
  const available = Math.floor(
    deadlineAt - now - NEWSLETTER_CRON_REQUEST_RESERVE_MS,
  )
  if (available < NEWSLETTER_AUTOMATION_MIN_STAGE_BUDGET_MS) return null
  return Math.min(Math.max(1, maximumBudgetMs), available)
}

export class NewsletterAutomationLeaseLostError extends Error {
  constructor(workflow: string) {
    super(`${workflow} lease was lost before the operation completed`)
    this.name = 'NewsletterAutomationLeaseLostError'
  }
}

export class NewsletterAutomationStageBudgetError extends Error {
  constructor(budgetMs: number) {
    super(
      `Newsletter automation stage exceeded its ${Math.round(budgetMs / 1000)} second invocation budget`,
    )
    this.name = 'NewsletterAutomationStageBudgetError'
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof timer.unref === 'function'
  ) {
    timer.unref()
  }
}

/**
 * Runs one bounded automation stage while periodically proving ownership of
 * its database lease. The timer is unref'd so it never keeps a completed cron
 * invocation alive. Callers must release the lease in a finally block.
 */
export async function runWithNewsletterAutomationLease<T>(input: {
  task: (signal: AbortSignal) => Promise<T>
  renew: () => Promise<void>
  renewIntervalMs?: number
  budgetMs?: number
}): Promise<T> {
  const renewIntervalMs = Math.max(
    1,
    input.renewIntervalMs ??
      NEWSLETTER_AUTOMATION_LEASE_RENEW_INTERVAL_MS,
  )
  const budgetMs = Math.max(
    renewIntervalMs + 1,
    input.budgetMs ?? NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
  )
  let stopped = false
  let renewalTimer: ReturnType<typeof setTimeout> | null = null
  let budgetTimer: ReturnType<typeof setTimeout> | null = null
  let rejectControl!: (error: unknown) => void
  const controller = new AbortController()

  const control = new Promise<never>((_resolve, reject) => {
    rejectControl = reject
  })

  const scheduleRenewal = () => {
    renewalTimer = setTimeout(() => {
      void input
        .renew()
        .then(() => {
          if (!stopped) scheduleRenewal()
        })
        .catch((error: unknown) => {
          if (stopped) return
          stopped = true
          if (budgetTimer) clearTimeout(budgetTimer)
          controller.abort(error)
          rejectControl(error)
        })
    }, renewIntervalMs)
    unrefTimer(renewalTimer)
  }

  scheduleRenewal()
  budgetTimer = setTimeout(() => {
    if (stopped) return
    stopped = true
    if (renewalTimer) clearTimeout(renewalTimer)
    const error = new NewsletterAutomationStageBudgetError(budgetMs)
    controller.abort(error)
    rejectControl(error)
  }, budgetMs)
  unrefTimer(budgetTimer)

  const task = Promise.resolve().then(() => input.task(controller.signal))

  try {
    return await Promise.race([task, control])
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error)
    // Do not release ownership while a cancelled stage can still perform a
    // side effect. In-scope stages propagate this signal to their external
    // work and settle before control returns to the caller's release block.
    await task.catch(() => undefined)
    throw error
  } finally {
    stopped = true
    if (renewalTimer) clearTimeout(renewalTimer)
    if (budgetTimer) clearTimeout(budgetTimer)
  }
}
