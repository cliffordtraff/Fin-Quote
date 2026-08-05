import { afterEach, describe, expect, it, vi } from 'vitest'
import { logNewsletterCron } from '../cron-logging'

describe('newsletter cron logging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes one parseable JSON object with stable search fields', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logNewsletterCron({
      job: 'daily',
      event: 'run-advanced',
      marketDate: '2026-08-05',
      action: 'summary-batch',
      candidateCount: 147,
    })

    expect(info).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(info.mock.calls[0][0]))
    expect(payload).toMatchObject({
      component: 'newsletter-automation',
      level: 'info',
      job: 'daily',
      event: 'run-advanced',
      marketDate: '2026-08-05',
      action: 'summary-batch',
      candidateCount: 147,
    })
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false)
  })

  it('sends failures to the error stream', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    logNewsletterCron({
      job: 'mid-morning',
      event: 'run-error',
      level: 'error',
      error: 'database unavailable',
    })

    expect(error).toHaveBeenCalledOnce()
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
      component: 'newsletter-automation',
      level: 'error',
      job: 'mid-morning',
      event: 'run-error',
      error: 'database unavailable',
    })
  })
})
