export type NewsletterCronJob = 'daily' | 'mid-morning' | 'webhook'

export type NewsletterCronLogLevel = 'info' | 'error'

export interface NewsletterCronLogEntry {
  job: NewsletterCronJob
  event: string
  level?: NewsletterCronLogLevel
  marketDate?: string
  durationMs?: number
  [key: string]: unknown
}

/**
 * Emit one JSON object per cron outcome so serverless logs can be searched and
 * aggregated without parsing human-oriented sentences.
 */
export function logNewsletterCron(entry: NewsletterCronLogEntry): void {
  const { level = 'info', ...details } = entry
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    component: 'newsletter-automation',
    level,
    ...details,
  })

  if (level === 'error') {
    console.error(line)
    return
  }
  console.info(line)
}
