import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterResult } from '@/lib/newsletter/types'

const {
  generateNewsletterMock,
  runLocalNewsletterWorkerMock,
} = vi.hoisted(() => ({
  generateNewsletterMock: vi.fn(),
  runLocalNewsletterWorkerMock: vi.fn(),
}))

vi.mock('@/lib/newsletter/orchestrate', () => ({
  generateNewsletter: generateNewsletterMock,
}))

vi.mock('@/lib/newsletter/local-worker', () => ({
  runLocalNewsletterWorker: runLocalNewsletterWorkerMock,
}))

import {
  generateNewsletterWithBackend,
  resolveNewsletterGenerationBackend,
} from '@/lib/newsletter/generation'

const sampleResult: NewsletterResult = {
  ticker: 'NVDA',
  format: 'single_stock',
  featuredTickers: ['NVDA'],
  generatedAt: '2026-04-24T16:00:00.000Z',
  subjectLine: 'Nvidia snapshot',
  selections: [],
  blocks: [],
  chartSpecs: [],
  fullHtml: '<html />',
  beehiivHtml: '<table />',
  chartPaths: [],
  htmlPath: '/tmp/nvda.html',
  beehiivHtmlPath: '/tmp/nvda-beehiiv.html',
  previewPath: null,
  timings: {},
  autoPickedStock: false,
}

describe('newsletter generation backend', () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const originalBackend = process.env.NEWSLETTER_GENERATION_BACKEND
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    delete process.env.NEWSLETTER_GENERATION_BACKEND
    mutableEnv.NODE_ENV = 'test'
    generateNewsletterMock.mockReset()
    runLocalNewsletterWorkerMock.mockReset()
    generateNewsletterMock.mockResolvedValue(sampleResult)
    runLocalNewsletterWorkerMock.mockResolvedValue(sampleResult)
  })

  afterEach(() => {
    if (originalBackend == null) {
      delete process.env.NEWSLETTER_GENERATION_BACKEND
    } else {
      process.env.NEWSLETTER_GENERATION_BACKEND = originalBackend
    }
    mutableEnv.NODE_ENV = originalNodeEnv
  })

  it('uses the direct in-process path when configured', async () => {
    process.env.NEWSLETTER_GENERATION_BACKEND = 'openai_api'

    const result = await generateNewsletterWithBackend('NVDA', {
      format: 'single_stock',
    })

    expect(result).toBe(sampleResult)
    expect(generateNewsletterMock).toHaveBeenCalledWith('NVDA', {
      format: 'single_stock',
    })
    expect(runLocalNewsletterWorkerMock).not.toHaveBeenCalled()
  })

  it('uses the local worker when configured via env', async () => {
    process.env.NEWSLETTER_GENERATION_BACKEND = 'local_worker'

    await generateNewsletterWithBackend(undefined, {
      format: 'market_roundup',
      roundupSize: 4,
    })

    expect(runLocalNewsletterWorkerMock).toHaveBeenCalledWith(undefined, {
      format: 'market_roundup',
      roundupSize: 4,
    })
    expect(generateNewsletterMock).not.toHaveBeenCalled()
  })

  it('lets the explicit option override the env backend', async () => {
    process.env.NEWSLETTER_GENERATION_BACKEND = 'local_worker'

    await generateNewsletterWithBackend('AAPL', {
      format: 'single_stock',
      generationBackend: 'openai_api',
    })

    expect(generateNewsletterMock).toHaveBeenCalledWith('AAPL', {
      format: 'single_stock',
    })
    expect(runLocalNewsletterWorkerMock).not.toHaveBeenCalled()
  })

  it('resolves backend names safely', () => {
    expect(resolveNewsletterGenerationBackend()).toBe('local_worker')

    process.env.NEWSLETTER_GENERATION_BACKEND = 'local_worker'
    expect(resolveNewsletterGenerationBackend()).toBe('local_worker')

    process.env.NEWSLETTER_GENERATION_BACKEND = 'something-else'
    expect(resolveNewsletterGenerationBackend()).toBe('local_worker')
  })

  it('defaults to the in-process API backend in production', () => {
    mutableEnv.NODE_ENV = 'production'

    expect(resolveNewsletterGenerationBackend()).toBe('openai_api')

    process.env.NEWSLETTER_GENERATION_BACKEND = 'local_worker'
    expect(resolveNewsletterGenerationBackend()).toBe('local_worker')
  })
})
