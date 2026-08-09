import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdminUser }
})

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    readdirSync: mocks.readdirSync,
    statSync: mocks.statSync,
    readFileSync: mocks.readFileSync,
  },
}))

import { GET } from '@/app/api/evaluations/latest/route'
import { AdminAccessError } from '@/lib/auth/admin'

describe('latest evaluation route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminUser.mockResolvedValue({
      user: { id: 'admin-1' },
      isAdmin: true,
      adminConfigured: true,
    })
    mocks.existsSync.mockReturnValue(true)
    mocks.readdirSync.mockReturnValue(['eval-fast-2026-08-08.json'])
    mocks.statSync.mockReturnValue({ mtime: new Date('2026-08-08T12:00:00Z') })
    mocks.readFileSync.mockReturnValue('{"summary":{"passed":2}}')
  })

  it('rejects a signed-out caller before touching evaluation artifacts', async () => {
    mocks.requireAdminUser.mockRejectedValue(
      new AdminAccessError(
        'You must be signed in to access this admin feature.',
      ),
    )

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mocks.existsSync).not.toHaveBeenCalled()
  })

  it('rejects a non-admin caller', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.existsSync).not.toHaveBeenCalled()
  })

  it('never exposes an absolute deployment path in a missing-results response', async () => {
    mocks.existsSync.mockReturnValue(false)

    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Results directory not found',
    })
  })

  it('returns the latest tracked artifact to an administrator', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      filename: 'eval-fast-2026-08-08.json',
      evaluation: { summary: { passed: 2 } },
    })
  })
})
