import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { logQuery } from '@/lib/query-logs'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.single.mockResolvedValue({ data: { id: 'query-log-1' }, error: null })
  mocks.select.mockReturnValue({ single: mocks.single })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.from.mockReturnValue({ insert: mocks.insert })
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
})

describe('trusted query logging', () => {
  it('persists server-generated telemetry with the service client', async () => {
    const result = await logQuery({
      sessionId: 'session-1',
      userId: 'user-1',
      userQuestion: 'What moved AAPL?',
      toolSelected: 'getPrices',
      toolArgs: { symbol: 'AAPL' },
      answerGenerated: 'AAPL moved after earnings.',
      toolSelectionPromptTokens: 100,
      toolSelectionCompletionTokens: 20,
      answerPromptTokens: 200,
      answerCompletionTokens: 40,
    })

    expect(result).toBe('query-log-1')
    expect(mocks.createServiceRoleClient).toHaveBeenCalledOnce()
    expect(mocks.from).toHaveBeenCalledWith('query_logs')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        session_id: 'session-1',
      }),
    )
    expect(mocks.insert.mock.calls[0][0].total_cost_usd).toBeCloseTo(0.000039)
  })

  it('fails non-fatally when persistence is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    })

    await expect(
      logQuery({
        sessionId: 'session-1',
        userId: 'user-1',
        userQuestion: 'Question',
        toolSelected: 'tool',
        toolArgs: {},
        answerGenerated: 'Answer',
      }),
    ).resolves.toBeNull()
  })
})
