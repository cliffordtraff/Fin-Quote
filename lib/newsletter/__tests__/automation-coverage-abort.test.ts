import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  abortSignals: [] as AbortSignal[],
  createClient: vi.fn(),
  hangQueriesUntilAbort: false,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { __testOnly as daily } from '../daily-automation'
import { __testOnly as midMorning } from '../mid-morning-automation'
import { getDailySummaryCoverage } from '@/lib/wiim/daily-summaries'

function queryBuilder() {
  let rejectResponse: ((reason: unknown) => void) | undefined
  const response = mocks.hangQueriesUntilAbort
    ? new Promise<never>((_resolve, reject) => {
        rejectResponse = reject
      })
    : Promise.resolve({ data: [], error: null })
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select',
    'in',
    'gte',
    'eq',
    'lt',
    'order',
    'limit',
    'maybeSingle',
  ]) {
    builder[method] = vi.fn(() => builder)
  }
  builder.abortSignal = vi.fn((signal: AbortSignal) => {
    mocks.abortSignals.push(signal)
    if (rejectResponse) {
      signal.addEventListener('abort', () => rejectResponse?.(signal.reason), {
        once: true,
      })
    }
    return builder
  })
  builder.then = response.then.bind(response)
  return builder
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  mocks.abortSignals.length = 0
  mocks.hangQueriesUntilAbort = false
  mocks.createClient.mockReturnValue({
    from: vi.fn(() => queryBuilder()),
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('automation coverage cancellation', () => {
  it('binds the stage signal to every daily and mid-morning coverage query', async () => {
    const controller = new AbortController()
    const baseRun = {
      candidateSymbols: ['AAPL'],
      startedAt: '2026-08-06T09:00:00.000Z',
      createdAt: '2026-08-06T09:00:00.000Z',
    }

    await daily.loadFinvizCoverage(baseRun as never, controller.signal)
    await getDailySummaryCoverage(
      '2026-08-06',
      ['AAPL'],
      controller.signal,
    )
    await midMorning.loadFinvizCoverage(baseRun as never, controller.signal)
    await midMorning.loadFreshSummaryCoverage(
      'mid-run-1',
      controller.signal,
    )

    expect(mocks.abortSignals).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
    ])
  })

  it('cancels a hung morning-run lookup when the stage budget expires', async () => {
    mocks.hangQueriesUntilAbort = true
    const controller = new AbortController()
    const reason = new Error('stage budget elapsed')
    const pending = midMorning.collectCandidates(
      {
        marketDate: '2026-08-06',
      } as never,
      'lease-token',
      controller.signal,
    )

    await Promise.resolve()
    controller.abort(reason)

    await expect(pending).rejects.toBe(reason)
    expect(mocks.abortSignals).toEqual([controller.signal])
  })
})
