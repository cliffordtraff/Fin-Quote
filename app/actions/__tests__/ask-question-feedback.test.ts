import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  builder.update = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.select = vi.fn(() => builder)
  builder.maybeSingle = vi.fn()
  return {
    builder,
    from: vi.fn(() => builder),
    requireCurrentUserContext: vi.fn(),
  }
})

vi.mock('@/lib/auth/current-user', () => ({
  requireCurrentUserContext: mocks.requireCurrentUserContext,
}))

import { submitFeedback } from '@/app/actions/ask-question'

const QUERY_ID = 'ea9b0a63-c765-4e17-b839-7c9bb7e8d7c7'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.requireCurrentUserContext.mockResolvedValue({
    client: { from: mocks.from },
    user: { id: 'user-1' },
  })
  mocks.builder.maybeSingle.mockResolvedValue({
    data: { id: QUERY_ID },
    error: null,
  })
})

describe('chatbot feedback action', () => {
  it('requires an authenticated caller before opening a database client', async () => {
    mocks.requireCurrentUserContext.mockRejectedValue(new Error('not authenticated'))

    const result = await submitFeedback({
      queryLogId: QUERY_ID,
      feedback: 'thumbs_up',
    })

    expect(result).toEqual({ success: false, error: 'Unable to submit feedback.' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('bounds feedback input before writing', async () => {
    const result = await submitFeedback({
      queryLogId: QUERY_ID,
      feedback: 'thumbs_down',
      comment: 'x'.repeat(2_001),
    })

    expect(result.success).toBe(false)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('updates only a query log owned by the authenticated caller', async () => {
    const result = await submitFeedback({
      queryLogId: QUERY_ID,
      feedback: 'thumbs_down',
      comment: 'The time period was wrong.',
    })

    expect(result).toEqual({ success: true, error: null })
    expect(mocks.from).toHaveBeenCalledWith('query_logs')
    expect(mocks.builder.eq).toHaveBeenNthCalledWith(1, 'id', QUERY_ID)
    expect(mocks.builder.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1')
  })

  it('does not claim success when no owned row was updated', async () => {
    mocks.builder.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await submitFeedback({
      queryLogId: QUERY_ID,
      feedback: 'thumbs_up',
    })

    expect(result).toEqual({ success: false, error: 'Query log not found.' })
  })
})
