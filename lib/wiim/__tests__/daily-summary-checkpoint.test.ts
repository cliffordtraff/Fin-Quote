import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generate: vi.fn(),
  store: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/generated-stock-why-moving', () => ({
  generateStockWhyMovingSummary: mocks.generate,
  storeGeneratedWhyMovingSummary: mocks.store,
  WIIM_SUMMARY_CONFIG_VERSION: 'test-config',
}))

import { generateDailySummaryBatch } from '../daily-summaries'

function queryBuilder() {
  const response = Promise.resolve({ data: null, error: null })
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'upsert', 'abortSignal']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  builder.then = response.then.bind(response)
  return builder
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  mocks.createClient.mockReturnValue({
    from: vi.fn(() => queryBuilder()),
  })
  mocks.generate.mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('daily summary attempt checkpoint', () => {
  it('checkpoints the exact dispatched batch before an aborted worker can reject', async () => {
    const controller = new AbortController()
    const checkpoint = vi.fn(async () => undefined)
    const generation = generateDailySummaryBatch({
      marketDate: '2026-08-06',
      symbols: ['AAPL'],
      runId: 'run-1',
      force: true,
      signal: controller.signal,
      onBatchDispatched: checkpoint,
    })

    await vi.waitFor(() => expect(checkpoint).toHaveBeenCalledWith(['AAPL']))
    controller.abort(new Error('stage budget elapsed'))

    await expect(generation).rejects.toThrow('stage budget elapsed')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.store).not.toHaveBeenCalled()
  })
})
