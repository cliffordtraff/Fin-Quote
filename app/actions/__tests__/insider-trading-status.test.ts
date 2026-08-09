import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state: {
    databaseResult: { data: unknown[] | null; error: unknown }
  } = {
    databaseResult: { data: [], error: null },
  }
  const query: Record<string, ReturnType<typeof vi.fn>> = {}

  for (const method of ['select', 'gte', 'lte', 'in', 'not', 'gt', 'order']) {
    query[method] = vi.fn(() => query)
  }
  query.limit = vi.fn(async () => state.databaseResult)

  return {
    state,
    from: vi.fn(() => query),
  }
})

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({ from: mocks.from }),
}))

import { getLargestInsiderTrades } from '@/app/actions/insider-trading'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime('2026-08-08T14:00:00.000Z')
  process.env.FMP_API_KEY = 'test-key'
  mocks.state.databaseResult = { data: [], error: null }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.FMP_API_KEY
})

describe('largest insider trade source status', () => {
  it('treats fulfilled empty database and FMP sources as authoritative empty data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await expect(getLargestInsiderTrades(4, 7)).resolves.toEqual({ trades: [] })
  })

  it('surfaces an FMP transport failure instead of caching it as empty data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)))

    await expect(getLargestInsiderTrades(4, 8)).resolves.toEqual({
      error: 'Failed to load insider trading data',
    })
  })

  it('surfaces a database failure instead of accepting the other source as complete', async () => {
    mocks.state.databaseResult = {
      data: null,
      error: new Error('database unavailable'),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await expect(getLargestInsiderTrades(4, 9)).resolves.toEqual({
      error: 'Failed to load insider trading data',
    })
  })
})
