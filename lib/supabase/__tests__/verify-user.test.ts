import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthApiError,
  AuthSessionMissingError,
} from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  createStatelessUserClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/supabase/stateless-user', () => ({
  createStatelessUserClient: mocks.createStatelessUserClient,
}))

import { verifyStatelessUser } from '@/lib/supabase/verify-user'

const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(24)}.${'c'.repeat(48)}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createStatelessUserClient.mockReturnValue({
    auth: { getUser: mocks.getUser },
    from: vi.fn(),
  })
})

describe('stateless Supabase user verification', () => {
  it('verifies the explicit JWT and returns the same bearer-bound client', async () => {
    const user = { id: 'user-a' }
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })

    const result = await verifyStatelessUser(ACCESS_TOKEN)

    expect(result).toMatchObject({ status: 'authenticated', user })
    expect(mocks.createStatelessUserClient).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      { signal: undefined },
    )
    expect(mocks.getUser).toHaveBeenCalledWith(ACCESS_TOKEN)
    if (result.status === 'authenticated') {
      expect(result.client).toBe(mocks.createStatelessUserClient.mock.results[0]!.value)
    }
  })

  it.each([
    new AuthSessionMissingError(),
    new AuthApiError('malformed jwt', 400, 'bad_jwt'),
    new AuthApiError('invalid jwt', 401, 'bad_jwt'),
    new AuthApiError('forbidden jwt', 403, 'bad_jwt'),
  ])('classifies rejected credentials as invalid', async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(verifyStatelessUser(ACCESS_TOKEN)).resolves.toEqual({
      status: 'invalid',
    })
  })

  it.each([
    new AuthApiError('auth service failed', 500, 'unexpected_failure'),
    new Error('network offline'),
  ])('classifies service and transport failures as unavailable', async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(verifyStatelessUser(ACCESS_TOKEN)).resolves.toEqual({
      status: 'unavailable',
    })
  })
})
