import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getSnapshot: vi.fn(),
  executeAction: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/auth/current-user')>()
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser,
  }
})

vi.mock('@/lib/newsletter/operations', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/operations')>()
  return {
    ...actual,
    getNewsletterOperationsSnapshot: mocks.getSnapshot,
    executeNewsletterOperationsAction: mocks.executeAction,
  }
})

import { GET, POST } from '@/app/api/newsletter/operations/route'
import { AuthenticationRequiredError } from '@/lib/auth/current-user'
import { NewsletterOperationsActionError } from '@/lib/newsletter/operations'

function postRequest(body: unknown) {
  return new NextRequest(
    'https://finquote.example/api/newsletter/operations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireCurrentUser.mockResolvedValue({ id: 'user-1' })
})

describe('newsletter operations API', () => {
  it('returns the signed-in operator snapshot', async () => {
    mocks.getSnapshot.mockResolvedValue({
      marketDate: '2026-07-30',
      morning: { status: 'completed' },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.getSnapshot).toHaveBeenCalledWith('user-1')
    await expect(response.json()).resolves.toMatchObject({
      marketDate: '2026-07-30',
    })
  })

  it('requires authentication', async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new AuthenticationRequiredError(),
    )

    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('runs one durable morning step immediately', async () => {
    mocks.executeAction.mockResolvedValue({
      action: 'summary-batch',
      claimed: true,
    })

    const response = await POST(
      postRequest({
        pipeline: 'morning',
        action: 'run_now',
        marketDate: '2026-07-30',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.executeAction).toHaveBeenCalledWith('user-1', {
      pipeline: 'morning',
      action: 'run_now',
      marketDate: '2026-07-30',
    })
  })

  it('runs authenticated Beehiiv reconciliation and returns its counts', async () => {
    mocks.executeAction.mockResolvedValue({
      attempted: 4,
      updated: 3,
      failed: [{ draftId: 'draft-1', error: 'Beehiiv timeout' }],
    })

    const response = await POST(
      postRequest({ action: 'reconcile_beehiiv' }),
    )

    expect(response.status).toBe(200)
    expect(mocks.executeAction).toHaveBeenCalledWith('user-1', {
      action: 'reconcile_beehiiv',
    })
    await expect(response.json()).resolves.toEqual({
      result: {
        attempted: 4,
        updated: 3,
        failed: [{ draftId: 'draft-1', error: 'Beehiiv timeout' }],
      },
    })
  })

  it('does not expose Beehiiv reconciliation to signed-out callers', async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new AuthenticationRequiredError(),
    )

    const response = await POST(
      postRequest({ action: 'reconcile_beehiiv' }),
    )

    expect(response.status).toBe(401)
    expect(mocks.executeAction).not.toHaveBeenCalled()
  })

  it('returns a conflict when a retry is not valid', async () => {
    mocks.executeAction.mockRejectedValue(
      new NewsletterOperationsActionError(
        'The morning pipeline is not in a failed state.',
      ),
    )

    const response = await POST(
      postRequest({
        pipeline: 'morning',
        action: 'retry_failed',
        marketDate: '2026-07-30',
      }),
    )

    expect(response.status).toBe(409)
  })

  it('rejects unknown actions', async () => {
    const response = await POST(
      postRequest({
        pipeline: 'morning',
        action: 'delete_everything',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.executeAction).not.toHaveBeenCalled()
  })
})
