import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stringToBase64URL } from '@supabase/ssr'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  verifyStatelessUser: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/supabase/verify-user', () => ({
  verifyStatelessUser: mocks.verifyStatelessUser,
}))

import {
  RequestAuthenticationRequiredError,
  RequestAuthenticationUnavailableError,
  resolveAuthenticatedRequest,
} from '@/lib/supabase/server'

const NOW_SECONDS = Math.floor(Date.now() / 1000)
const ACCESS_TOKEN = [
  stringToBase64URL(JSON.stringify({ alg: 'HS256' })),
  stringToBase64URL(JSON.stringify({ exp: NOW_SECONDS + 3_600 })),
  's'.repeat(48),
].join('.')
const SESSION_COOKIE = `base64-${stringToBase64URL(JSON.stringify({
  access_token: ACCESS_TOKEN,
  refresh_token: 'refresh-token-a',
}))}`

describe('authenticated stateless request resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: 'sb-project-auth-token', value: SESSION_COOKIE }],
    })
  })

  it('verifies the extracted JWT explicitly and returns that same bearer client', async () => {
    const client = { from: vi.fn(), rpc: vi.fn() }
    const user = { id: '00000000-0000-4000-8000-000000000001' }
    mocks.verifyStatelessUser.mockResolvedValue({
      status: 'authenticated',
      client,
      user,
    })

    await expect(resolveAuthenticatedRequest()).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      client,
      expiresAt: NOW_SECONDS + 3_600,
      user,
    })
    expect(mocks.verifyStatelessUser).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      { signal: undefined },
    )
  })

  it('rejects missing/expired transport before any auth request', async () => {
    mocks.cookies.mockResolvedValueOnce({ getAll: () => [] })
    await expect(resolveAuthenticatedRequest()).rejects.toMatchObject({
      name: RequestAuthenticationRequiredError.name,
      reason: 'missing',
    })
    expect(mocks.verifyStatelessUser).not.toHaveBeenCalled()
  })

  it('rejects a token that cannot outlive the requested operation before verification', async () => {
    await expect(resolveAuthenticatedRequest({
      minimumValiditySeconds: 3_601,
    })).rejects.toBeInstanceOf(RequestAuthenticationUnavailableError)

    await expect(resolveAuthenticatedRequest({
      minimumValiditySeconds: 3_600,
    })).rejects.toMatchObject({
      name: RequestAuthenticationRequiredError.name,
      reason: 'expiring',
      expiresAt: NOW_SECONDS + 3_600,
    })
    expect(mocks.verifyStatelessUser).not.toHaveBeenCalled()
  })

  it('distinguishes rejected credentials from auth-service outage', async () => {
    mocks.verifyStatelessUser.mockResolvedValueOnce({ status: 'invalid' })
    await expect(resolveAuthenticatedRequest()).rejects.toMatchObject({
      name: RequestAuthenticationRequiredError.name,
      reason: 'invalid',
    })

    mocks.verifyStatelessUser.mockResolvedValueOnce({ status: 'unavailable' })
    await expect(resolveAuthenticatedRequest()).rejects.toBeInstanceOf(
      RequestAuthenticationUnavailableError,
    )
  })

  it('requires only read access to the request cookie store', async () => {
    const set = vi.fn()
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: 'sb-project-auth-token', value: SESSION_COOKIE }],
      set,
    })
    mocks.verifyStatelessUser.mockResolvedValue({
      status: 'authenticated',
      client: {},
      user: { id: '00000000-0000-4000-8000-000000000001' },
    })

    await resolveAuthenticatedRequest()
    expect(set).not.toHaveBeenCalled()
  })

  it('classifies malformed server configuration as unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'ftp://project.supabase.co')
    await expect(resolveAuthenticatedRequest()).rejects.toBeInstanceOf(
      RequestAuthenticationUnavailableError,
    )
    expect(mocks.verifyStatelessUser).not.toHaveBeenCalled()
  })
})
