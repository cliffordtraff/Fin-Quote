import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import {
  STATELESS_AUTH_RESPONSE_MAX_BYTES,
  createStatelessUserClient,
  updateStatelessUser,
} from '@/lib/supabase/stateless-user'
import {
  SUPABASE_ACCESS_TOKEN_MAX_LENGTH,
  isSupabaseAccessToken,
} from '@/lib/supabase/access-token'

const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`

describe('cookie-free Supabase user boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    mocks.createClient.mockReset()
    mocks.createClient.mockReturnValue({ auth: {}, from: vi.fn(), rpc: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('bounds JWT transport without pretending to verify its signature', () => {
    expect(isSupabaseAccessToken(ACCESS_TOKEN)).toBe(true)
    for (const value of [
      null,
      'not-a-jwt',
      `a.b.${'c'.repeat(SUPABASE_ACCESS_TOKEN_MAX_LENGTH)}`,
      'a.b.bad token',
    ]) {
      expect(isSupabaseAccessToken(value)).toBe(false)
    }
  })

  it('creates a no-storage client with one explicit bearer and no cookie adapter', () => {
    const controller = new AbortController()
    const client = createStatelessUserClient(ACCESS_TOKEN, {
      signal: controller.signal,
    })

    expect(client).toBe(mocks.createClient.mock.results[0].value)
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: expect.objectContaining({
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          fetch: expect.any(Function),
        }),
      }),
    )
    const options = mocks.createClient.mock.calls[0][2]
    expect(options).not.toHaveProperty('cookies')
  })

  it('updates through the user-auth endpoint without forwarding response cookies', async () => {
    const user = { id: '00000000-0000-4000-8000-000000000001' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(user),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'sb-project-auth-token=must-not-cross',
        },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateStatelessUser(
      ACCESS_TOKEN,
      { data: { display_name: 'Ada' } },
    )).resolves.toEqual({ status: 200, body: user })

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.href).toBe('https://project.supabase.co/auth/v1/user')
    expect(init).toMatchObject({
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        apikey: 'anon-key',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { display_name: 'Ada' } }),
    })
    expect(init).not.toHaveProperty('credentials')
  })

  it('rejects oversized auth responses instead of materializing them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x', {
      status: 200,
      headers: {
        'Content-Length': String(STATELESS_AUTH_RESPONSE_MAX_BYTES + 1),
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateStatelessUser(
      ACCESS_TOKEN,
      { password: 'secure password' },
    )).rejects.toThrow(/exceeded its bound/i)
  })
})
