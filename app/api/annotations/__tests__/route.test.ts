import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn() }))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdminUser }
})

import { GET, POST } from '@/app/api/annotations/route'
import { AdminAccessError } from '@/lib/auth/admin'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: 'admin-1' },
    isAdmin: true,
    adminConfigured: true,
  })
})

describe('annotations API', () => {
  it('requires an administrator', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())
    const request = new NextRequest(
      'https://theintraday.com/api/annotations?file=eval-fast-2026-01-01.json',
    )

    const response = await GET(request)

    expect(response.status).toBe(403)
  })

  it('rejects path traversal on reads', async () => {
    const request = new NextRequest(
      'https://theintraday.com/api/annotations?file=../../package.json',
    )

    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('rejects path traversal on writes', async () => {
    const request = new NextRequest('https://theintraday.com/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evaluation_file: '../../package.json',
        timestamp: new Date().toISOString(),
        annotations: [],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })
})
