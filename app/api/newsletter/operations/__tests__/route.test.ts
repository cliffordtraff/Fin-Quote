import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getSnapshot: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/auth/current-user')>()
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser,
  }
})

vi.mock('@/lib/newsletter/operations-read', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/operations-read')>()
  return {
    ...actual,
    getNewsletterOperationsSnapshot: mocks.getSnapshot,
  }
})

import { GET, POST } from '@/app/api/newsletter/operations/route'
import { AuthenticationRequiredError } from '@/lib/auth/current-user'

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

function getRequest() {
  return new NextRequest(
    'https://finquote.example/api/newsletter/operations',
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

    const request = getRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mocks.getSnapshot).toHaveBeenCalledWith(
      'user-1',
      request.signal,
    )
    await expect(response.json()).resolves.toMatchObject({
      marketDate: '2026-07-30',
    })
  })

  it('requires authentication', async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new AuthenticationRequiredError(),
    )

    const response = await GET(getRequest())

    expect(response.status).toBe(401)
  })

  it('preserves legacy POST callers with a method-preserving action redirect', async () => {
    const response = await POST(
      postRequest({
        pipeline: 'morning',
        action: 'run_now',
        marketDate: '2026-07-30',
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://finquote.example/api/newsletter/operations/action',
    )
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled()
  })
})
