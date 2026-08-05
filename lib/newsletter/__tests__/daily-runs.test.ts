import { describe, expect, it } from 'vitest'
import { __testOnly } from '../daily-runs'
import { resolveExistingRunTarget } from '../daily-target'

describe('daily newsletter run targets', () => {
  it('preserves an existing larger batch when the next-day default is lowered', () => {
    expect(resolveExistingRunTarget(30, 40)).toBe(40)
  })

  it('allows a batch to expand and still enforces the supported range', () => {
    expect(resolveExistingRunTarget(50, 40)).toBe(50)
    expect(resolveExistingRunTarget(10, 0)).toBe(30)
    expect(resolveExistingRunTarget(75, 0)).toBe(50)
  })

  it('enforces the retry ceiling in the item claimant itself', () => {
    const maxRetries = __testOnly.MAX_NEWSLETTER_DAILY_ITEM_RETRIES

    expect(__testOnly.canClaimDailyItem('queued', 0, false)).toBe(true)
    expect(__testOnly.canClaimDailyItem('failed', 1, false)).toBe(false)
    expect(__testOnly.canClaimDailyItem('failed', 1, true)).toBe(true)
    expect(
      __testOnly.canClaimDailyItem('needs_attention', maxRetries, true),
    ).toBe(false)
    expect(__testOnly.canClaimDailyItem('queued', maxRetries, true)).toBe(
      false,
    )
  })

  it('keeps the precise chart exception when readiness adds its checklist', () => {
    const message = __testOnly.mergeDailyItemAttentionMessage(
      'Automatic chart capture failed: Chromium executable was not found.',
      ['Capture a final chart for AAPL: The Market Read.'],
    )

    expect(message).toBe(
      'Automatic chart capture failed: Chromium executable was not found. Capture a final chart for AAPL: The Market Read.',
    )
    expect(
      __testOnly.mergeDailyItemAttentionMessage(message, [
        'Capture a final chart for AAPL: The Market Read.',
      ]),
    ).toBe(message)
  })
})
