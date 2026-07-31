export const MIN_NEWSLETTER_DAILY_TARGET = 30
export const MAX_NEWSLETTER_DAILY_TARGET = 50
export const DEFAULT_NEWSLETTER_DAILY_TARGET = 40

export function clampNewsletterDailyTarget(value: number): number {
  const parsed = Number.isFinite(value)
    ? Math.floor(value)
    : DEFAULT_NEWSLETTER_DAILY_TARGET
  return Math.max(
    MIN_NEWSLETTER_DAILY_TARGET,
    Math.min(MAX_NEWSLETTER_DAILY_TARGET, parsed),
  )
}

export function resolveExistingRunTarget(
  requestedTarget: number,
  selectedCount: number,
): number {
  return Math.max(
    clampNewsletterDailyTarget(requestedTarget),
    Math.min(
      MAX_NEWSLETTER_DAILY_TARGET,
      Math.max(0, Math.floor(selectedCount)),
    ),
  )
}
