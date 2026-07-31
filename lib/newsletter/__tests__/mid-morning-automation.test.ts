import { describe, expect, it } from 'vitest'
import { getNewsletterAutomationClock } from '../daily-automation'
import {
  __testOnly,
  getMidMorningAutomationWindow,
} from '../mid-morning-automation'

describe('mid-morning automation schedule', () => {
  it('starts at 10:15 ET and recovers through 11:59 ET', () => {
    const before = getNewsletterAutomationClock(
      new Date('2026-07-30T14:14:00.000Z'),
    )
    const start = getNewsletterAutomationClock(
      new Date('2026-07-30T14:15:00.000Z'),
    )
    const late = getNewsletterAutomationClock(
      new Date('2026-07-30T15:00:00.000Z'),
    )
    const ended = getNewsletterAutomationClock(
      new Date('2026-07-30T16:00:00.000Z'),
    )

    expect(getMidMorningAutomationWindow(before).shouldRun).toBe(false)
    expect(getMidMorningAutomationWindow(start).shouldRun).toBe(true)
    expect(getMidMorningAutomationWindow(late).isLate).toBe(true)
    expect(getMidMorningAutomationWindow(ended)).toMatchObject({
      shouldRun: false,
      hasEnded: true,
    })
  })

  it('resumes the recorded failed stage', () => {
    expect(__testOnly.retryableStage('wiim')).toBe('wiim')
    expect(__testOnly.retryableStage('summaries')).toBe('summaries')
    expect(__testOnly.retryableStage('completed')).toBe('collecting')
  })
})
