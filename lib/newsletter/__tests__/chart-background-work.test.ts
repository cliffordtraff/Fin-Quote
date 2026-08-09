import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ after: vi.fn() }))

vi.mock('next/server', () => ({ after: mocks.after }))

import {
  newsletterChartBackgroundWorkTestOnly,
  registerNewsletterChartBackgroundTask,
} from '@/lib/newsletter/chart-background-work'

afterEach(() => {
  newsletterChartBackgroundWorkTestOnly.setRegistrar(null)
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('newsletter chart background work registration', () => {
  it('registers the supplied physical promise with Next after in request scope', async () => {
    vi.stubEnv('VITEST', '')
    const task = Promise.resolve()
    registerNewsletterChartBackgroundTask(task)

    expect(mocks.after).toHaveBeenCalledOnce()
    const callback = mocks.after.mock.calls[0]?.[0]
    await expect(callback()).resolves.toBeUndefined()
  })

  it('supports an injectable registrar for route-level lifecycle tests', () => {
    const registrar = vi.fn()
    const task = Promise.resolve()
    newsletterChartBackgroundWorkTestOnly.setRegistrar(registrar)

    registerNewsletterChartBackgroundTask(task)

    expect(registrar).toHaveBeenCalledWith(task)
  })
})
