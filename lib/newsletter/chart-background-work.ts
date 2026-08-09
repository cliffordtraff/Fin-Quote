import { after } from 'next/server'
import type { NewsletterChartBackgroundTaskRegistrar } from './chart-post-admission'

let registrarOverride: NewsletterChartBackgroundTaskRegistrar | null = null

/**
 * Register a physical chart save with the request lifecycle before awaiting
 * it. Next's `after` keeps the function alive if the HTTP caller disconnects
 * or the response returns on the logical 55-second deadline.
 */
export const registerNewsletterChartBackgroundTask:
NewsletterChartBackgroundTaskRegistrar = (task) => {
  if (registrarOverride) {
    registrarOverride(task)
    return
  }

  // Unit tests invoke route functions without a real Next request store.
  // Production and development requests always use the actual `after` API.
  if (process.env.VITEST === 'true') {
    void task.catch(() => undefined)
    return
  }

  after(async () => {
    await task
  })
}

export const newsletterChartBackgroundWorkTestOnly = {
  setRegistrar(registrar: NewsletterChartBackgroundTaskRegistrar | null): void {
    registrarOverride = registrar
  },
}
