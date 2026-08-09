import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { __testOnly } from '../operations-read'

function queryResult(result: unknown) {
  const query = {} as Record<string, ReturnType<typeof vi.fn>>
  for (const method of [
    'eq',
    'is',
    'lte',
    'order',
    'limit',
    'not',
    'abortSignal',
  ]) {
    query[method] = vi.fn().mockReturnValue(query)
  }
  query.then = vi.fn((onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected),
  )
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('newsletter operations snapshot cancellation', () => {
  it('forwards the request signal to all six webhook outbox reads', async () => {
    const oldestDue = queryResult({
      data: [{ next_attempt_at: '2026-08-08T12:00:00.000Z' }],
      error: null,
    })
    const latestError = queryResult({
      data: [
        {
          last_error: 'Webhook timeout',
          last_attempt_at: '2026-08-08T11:55:00.000Z',
          updated_at: '2026-08-08T11:56:00.000Z',
        },
      ],
      error: null,
    })
    const countQueries = [1, 2, 3, 4].map((count) =>
      queryResult({ count, error: null }),
    )
    const queries = [oldestDue, latestError, ...countQueries]
    mocks.from.mockImplementation(() => {
      const query = queries.shift()
      if (!query) throw new Error('Unexpected webhook outbox query')
      return { select: vi.fn().mockReturnValue(query) }
    })
    mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
    const controller = new AbortController()

    const health = await __testOnly.getNewsletterWebhookOutboxHealth(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      controller.signal,
      new Date('2026-08-08T12:05:00.000Z'),
    )

    expect(mocks.from).toHaveBeenCalledTimes(6)
    expect(mocks.from).toHaveBeenCalledWith('newsletter_webhook_outbox')
    for (const query of [oldestDue, latestError, ...countQueries]) {
      expect(query.abortSignal).toHaveBeenCalledOnce()
      expect(query.abortSignal).toHaveBeenCalledWith(controller.signal)
    }
    expect(health).toMatchObject({
      pending: 1,
      delivering: 2,
      delivered: 3,
      errors: 4,
      oldestDueAt: '2026-08-08T12:00:00.000Z',
      lastError: 'Webhook timeout',
      lastErrorAt: '2026-08-08T11:55:00.000Z',
    })
  })

  it('does not start webhook reads for an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      __testOnly.getNewsletterWebhookOutboxHealth(
        { ownerId: 'owner-1', sessionId: 'session-1' },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })
})
