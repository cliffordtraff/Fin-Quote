import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { getLatestWiimRun } from '@/lib/wiim/store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key')

  const builder = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
    limit: mocks.limit,
    maybeSingle: mocks.maybeSingle,
  }
  mocks.from.mockReturnValue(builder)
  mocks.select.mockReturnValue(builder)
  mocks.eq.mockReturnValue(builder)
  mocks.order.mockReturnValue(builder)
  mocks.limit.mockReturnValue(builder)
  mocks.createClient.mockReturnValue({ from: mocks.from })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getLatestWiimRun', () => {
  it('never treats a newer running row as the latest publishable brief', async () => {
    mocks.maybeSingle.mockImplementation(async () => {
      const filtersForCompleted = mocks.eq.mock.calls.some(
        ([column, value]) => column === 'status' && value === 'completed',
      )
      return {
        data: {
          id: filtersForCompleted ? 'completed-run' : 'running-run',
          run_type: 'morning',
          status: filtersForCompleted ? 'completed' : 'running',
          started_at: filtersForCompleted
            ? '2026-08-06T12:00:00.000Z'
            : '2026-08-06T13:00:00.000Z',
        },
        error: null,
      }
    })

    const run = await getLatestWiimRun('morning')

    expect(mocks.eq).toHaveBeenCalledWith('run_type', 'morning')
    expect(mocks.eq).toHaveBeenCalledWith('status', 'completed')
    expect(run?.id).toBe('completed-run')
    expect(run?.status).toBe('completed')
  })
})
