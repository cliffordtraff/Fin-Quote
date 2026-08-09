import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionMissingError } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  requireCurrentUser,
} from '@/lib/auth/current-user'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } })
})

describe('requireCurrentUser', () => {
  it('distinguishes clean anonymous auth from verification outage', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    )

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'auth service unavailable' },
    })
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    )

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    })
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    )
  })

  it('maps unexpected verification transport failures to unavailable', async () => {
    mocks.getUser.mockRejectedValueOnce(new Error('network offline'))
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    )
  })
})
