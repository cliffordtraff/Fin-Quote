import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveAuthenticatedRequest: vi.fn(),
}))

vi.mock('@/lib/supabase/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/server')>()
  return {
    ...actual,
    resolveAuthenticatedRequest: mocks.resolveAuthenticatedRequest,
  }
})

import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  requireCurrentUser,
  requireCurrentUserContext,
} from '@/lib/auth/current-user'
import {
  RequestAuthenticationRequiredError,
  RequestAuthenticationUnavailableError,
} from '@/lib/supabase/server'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireCurrentUser', () => {
  it('returns the verified user and the same bearer-bound context', async () => {
    const context = {
      accessToken: 'access-token-a',
      client: { from: vi.fn() },
      expiresAt: 2_000_000_000,
      user: { id: 'user-a' },
    }
    mocks.resolveAuthenticatedRequest.mockResolvedValue(context)

    await expect(requireCurrentUser()).resolves.toBe(context.user)
    await expect(requireCurrentUserContext()).resolves.toBe(context)
  })

  it('distinguishes rejected credentials from verification outage', async () => {
    mocks.resolveAuthenticatedRequest.mockRejectedValueOnce(
      new RequestAuthenticationRequiredError('missing'),
    )
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    )

    mocks.resolveAuthenticatedRequest.mockRejectedValueOnce(
      new RequestAuthenticationUnavailableError(),
    )
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    )
  })

  it('preserves an expiring-token reason for route-level browser recovery', async () => {
    mocks.resolveAuthenticatedRequest.mockRejectedValueOnce(
      new RequestAuthenticationRequiredError('expiring', 2_000_000_000),
    )

    await expect(requireCurrentUserContext({
      minimumValiditySeconds: 150,
    })).rejects.toMatchObject({
      name: AuthenticationRequiredError.name,
      reason: 'expiring',
      expiresAt: 2_000_000_000,
    })
  })

  it('maps unexpected verification transport failures to unavailable', async () => {
    mocks.resolveAuthenticatedRequest.mockRejectedValueOnce(new Error('network offline'))
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    )
  })
})
