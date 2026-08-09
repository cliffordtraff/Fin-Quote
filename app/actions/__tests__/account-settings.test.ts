import { AuthSessionMissingError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createStatelessUserClient: vi.fn(),
  getUser: vi.fn(),
  updateStatelessUser: vi.fn(),
  resend: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase/stateless-user', () => ({
  createStatelessUserClient: mocks.createStatelessUserClient,
  updateStatelessUser: mocks.updateStatelessUser,
}))

import {
  resendAccountVerification,
  signOutAccountSession,
  updateAccountDisplayName,
  updateAccountPassword,
} from '@/app/actions/account-settings'
import {
  ACCOUNT_SETTINGS_MESSAGES,
  ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS,
  parseAccountSettingsMutationResult,
  type AccountSettingsMutationResult,
} from '@/lib/account-settings-contract'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002'
const AUTH_EMAIL = 'account-owner@example.com'
const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`

function authenticatedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: AUTH_EMAIL,
    confirmed_at: null,
    email_confirmed_at: null,
    ...overrides,
  }
}

function authenticationResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: { user: authenticatedUser(overrides) },
    error: null,
  }
}

function expectExactResult(
  result: AccountSettingsMutationResult,
  expected: AccountSettingsMutationResult,
) {
  expect(result).toEqual(expected)
  expect(Object.keys(result)).toEqual(
    result.status === 'updated' ? ['status', 'userId'] : ['status', 'message'],
  )
  expect(parseAccountSettingsMutationResult(result)).toEqual(expected)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createStatelessUserClient.mockReturnValue({
    auth: {
      getUser: mocks.getUser,
      resend: mocks.resend,
      admin: { signOut: mocks.signOut },
    },
  })
  mocks.getUser.mockResolvedValue(authenticationResponse())
  mocks.updateStatelessUser.mockResolvedValue({
    status: 200,
    body: authenticatedUser(),
  })
  mocks.resend.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  })
  mocks.signOut.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('principal-bound account setting actions', () => {
  it('normalizes a display name and uses one request client before returning the validated principal', async () => {
    const result = await updateAccountDisplayName({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: '  Ada Lovelace  ',
    })

    expectExactResult(result, { status: 'updated', userId: USER_ID })
    expect(mocks.createStatelessUserClient).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).toHaveBeenCalledWith(ACCESS_TOKEN)
    expect(mocks.updateStatelessUser).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      { data: { display_name: 'Ada Lovelace' } },
      { signal: expect.any(AbortSignal) },
    )
    expect(mocks.resend).not.toHaveBeenCalled()
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateStatelessUser.mock.invocationCallOrder[0],
    )

    const [requestToken, requestOptions] = mocks.createStatelessUserClient.mock.calls[0]
    expect(requestToken).toBe(ACCESS_TOKEN)
    expect(requestOptions).toEqual({ signal: expect.any(AbortSignal) })
    expect(requestOptions.signal.aborted).toBe(false)
  })

  it('preserves the password exactly and never includes it in the browser result', async () => {
    const password = '  secure passphrase  '
    const result = await updateAccountPassword({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      password,
    })

    expectExactResult(result, { status: 'updated', userId: USER_ID })
    expect(mocks.updateStatelessUser).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      { password },
      { signal: expect.any(AbortSignal) },
    )
    expect(JSON.stringify(result)).not.toContain(password)
  })

  it('derives verification email only from the authenticated principal', async () => {
    const result = await resendAccountVerification({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })

    expectExactResult(result, { status: 'updated', userId: USER_ID })
    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: AUTH_EMAIL,
    })
    expect(mocks.updateStatelessUser).not.toHaveBeenCalled()
  })

  it('binds sign-out to the verified principal and revokes only this session', async () => {
    const result = await signOutAccountSession({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })

    expectExactResult(result, { status: 'updated', userId: USER_ID })
    expect(mocks.signOut).toHaveBeenCalledWith(ACCESS_TOKEN, 'local')
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    )
  })

  it('rejects all principal mismatches before any mutation or resend', async () => {
    mocks.getUser.mockResolvedValue(authenticationResponse({ id: OTHER_USER_ID }))

    const results = await Promise.all([
      updateAccountDisplayName({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN, displayName: 'Ada' }),
      updateAccountPassword({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN, password: 'secure password' }),
      resendAccountVerification({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN }),
      signOutAccountSession({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN }),
    ])

    for (const result of results) {
      expectExactResult(result, {
        status: 'principal_mismatch',
        message: ACCOUNT_SETTINGS_MESSAGES.principalMismatch,
      })
    }
    expect(mocks.updateStatelessUser).not.toHaveBeenCalled()
    expect(mocks.resend).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('rejects invalid and non-exact inputs before creating a request client', async () => {
    const results = await Promise.all([
      updateAccountDisplayName({
        expectedUserId: 'not-a-uuid',
        accessToken: ACCESS_TOKEN,
        displayName: 'Ada',
      }),
      updateAccountPassword({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        password: 'short',
      }),
      updateAccountDisplayName({
        expectedUserId: USER_ID,
        accessToken: 'not-a-jwt',
        displayName: 'Ada',
      }),
      resendAccountVerification({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        email: 'caller@example.com',
      } as never),
      signOutAccountSession({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        scope: 'global',
      } as never),
    ])

    for (const result of results) {
      expectExactResult(result, {
        status: 'invalid_input',
        message: ACCOUNT_SETTINGS_MESSAGES.invalidInput,
      })
    }
    expect(mocks.createStatelessUserClient).not.toHaveBeenCalled()
  })

  it('distinguishes missing authentication from transient and malformed auth responses', async () => {
    let authGetterInvoked = false
    const accessorAuthResponse = { error: null } as Record<string, unknown>
    Object.defineProperty(accessorAuthResponse, 'data', {
      enumerable: true,
      get() {
        authGetterInvoked = true
        return { user: authenticatedUser() }
      },
    })
    mocks.getUser
      .mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthSessionMissingError(),
      })
      .mockRejectedValueOnce(new AuthSessionMissingError())
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'raw transient auth detail' },
      })
      .mockResolvedValueOnce({
        data: { user: authenticatedUser() },
        error: null,
        privateDetail: 'must fail closed',
      })
      .mockRejectedValueOnce(new Error('raw rejected auth detail'))
      .mockResolvedValueOnce(accessorAuthResponse)

    const results = []
    for (let index = 0; index < 7; index += 1) {
      results.push(await updateAccountDisplayName({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        displayName: 'Ada',
      }))
    }

    expectExactResult(results[0], {
      status: 'authentication_required',
      message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
    })
    expectExactResult(results[1], {
      status: 'authentication_required',
      message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
    })
    expectExactResult(results[2], {
      status: 'authentication_required',
      message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
    })
    for (const result of results.slice(3)) {
      expectExactResult(result, {
        status: 'authentication_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.authenticationUnavailable,
      })
      expect(JSON.stringify(result)).not.toContain('raw')
    }
    expect(mocks.updateStatelessUser).not.toHaveBeenCalled()
    expect(authGetterInvoked).toBe(false)
  })

  it('fails closed on provider errors and malformed updated principals without raw detail', async () => {
    let updateGetterInvoked = false
    const accessorUpdateResponse = {
      email: AUTH_EMAIL,
      confirmed_at: null,
      email_confirmed_at: null,
    } as Record<string, unknown>
    Object.defineProperty(accessorUpdateResponse, 'id', {
      enumerable: true,
      get() {
        updateGetterInvoked = true
        return USER_ID
      },
    })
    mocks.updateStatelessUser
      .mockResolvedValueOnce({
        status: 500,
        body: { message: 'raw provider failure' },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: null,
      })
      .mockResolvedValueOnce({
        status: 200,
        body: authenticatedUser({ id: OTHER_USER_ID }),
      })
      .mockResolvedValueOnce({ status: 200, body: accessorUpdateResponse })

    for (let index = 0; index < 4; index += 1) {
      const result = await updateAccountPassword({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        password: 'secure password',
      })
      expectExactResult(result, {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable,
      })
      expect(JSON.stringify(result)).not.toContain('raw provider failure')
    }
    expect(updateGetterInvoked).toBe(false)
  })

  it('reports a session lost during update as authentication required', async () => {
    mocks.updateStatelessUser
      .mockResolvedValueOnce({ status: 401, body: null })
      .mockRejectedValueOnce(new AuthSessionMissingError())

    for (let index = 0; index < 2; index += 1) {
      const result = await updateAccountPassword({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        password: 'secure password',
      })

      expectExactResult(result, {
        status: 'authentication_required',
        message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
      })
    }
  })

  it('refuses resend for missing email, confirmed accounts, and malformed confirmation state', async () => {
    mocks.getUser
      .mockResolvedValueOnce(authenticationResponse({ email: null }))
      .mockResolvedValueOnce(authenticationResponse({
        email_confirmed_at: '2026-08-09T12:00:00.000Z',
      }))
      .mockResolvedValueOnce(authenticationResponse({
        email_confirmed_at: { malformed: true },
      }))
      .mockResolvedValueOnce(authenticationResponse({
        confirmed_at: '2026-08-09T12:00:00.000Z',
      }))

    for (let index = 0; index < 4; index += 1) {
      const result = await resendAccountVerification({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
      })
      expectExactResult(result, {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable,
      })
    }
    expect(mocks.resend).not.toHaveBeenCalled()
  })

  it('fails closed on resend errors and adversarial response shapes', async () => {
    mocks.resend
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'raw resend failure' },
      })
      .mockResolvedValueOnce({
        data: { user: authenticatedUser(), session: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: null, session: null, messageId: 123 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: null,
        extra: true,
      })

    for (let index = 0; index < 4; index += 1) {
      const result = await resendAccountVerification({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
      })
      expectExactResult(result, {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable,
      })
      expect(JSON.stringify(result)).not.toContain('raw resend failure')
    }
  })

  it('fails closed on malformed sign-out responses without exposing provider errors', async () => {
    mocks.signOut
      .mockResolvedValueOnce({ data: null, error: { message: 'raw sign-out detail' } })
      .mockResolvedValueOnce({ data: null, error: null, extra: true })

    for (let index = 0; index < 2; index += 1) {
      const result = await signOutAccountSession({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
      })
      expectExactResult(result, {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable,
      })
      expect(JSON.stringify(result)).not.toContain('raw sign-out detail')
    }
  })

  it('uses one owned deadline across a slow authentication and hanging update', async () => {
    vi.useFakeTimers()
    mocks.getUser.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve(authenticationResponse()), 7_000)
    }))
    mocks.updateStatelessUser.mockReturnValue(new Promise(() => {}))

    const resultPromise = updateAccountDisplayName({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: 'Ada',
    })
    await vi.advanceTimersByTimeAsync(7_000)

    expect(mocks.updateStatelessUser).toHaveBeenCalledTimes(1)
    const signal = mocks.createStatelessUserClient.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS - 7_000)
    const result = await resultPromise

    expectExactResult(result, {
      status: 'timeout',
      message: ACCOUNT_SETTINGS_MESSAGES.timeout,
    })
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' })
    expect(mocks.createStatelessUserClient).toHaveBeenCalledTimes(1)
  })

  it('bounds authentication, resend, and sign-out hangs with the same owned deadline', async () => {
    vi.useFakeTimers()
    mocks.getUser.mockReturnValueOnce(new Promise(() => {}))

    const authPromise = updateAccountPassword({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      password: 'secure password',
    })
    await vi.advanceTimersByTimeAsync(ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS)
    const authSignal = mocks.createStatelessUserClient.mock.calls[0][1].signal as AbortSignal
    expectExactResult(await authPromise, {
      status: 'timeout',
      message: ACCOUNT_SETTINGS_MESSAGES.timeout,
    })
    expect(authSignal.aborted).toBe(true)
    expect(mocks.updateStatelessUser).not.toHaveBeenCalled()

    mocks.getUser.mockResolvedValue(authenticationResponse())
    mocks.resend.mockReturnValueOnce(new Promise(() => {}))
    const resendPromise = resendAccountVerification({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })
    await vi.advanceTimersByTimeAsync(ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS)
    const resendSignal = mocks.createStatelessUserClient.mock.calls[1][1].signal as AbortSignal
    expectExactResult(await resendPromise, {
      status: 'timeout',
      message: ACCOUNT_SETTINGS_MESSAGES.timeout,
    })
    expect(resendSignal.aborted).toBe(true)
    expect(mocks.resend).toHaveBeenCalledTimes(1)

    mocks.signOut.mockReturnValueOnce(new Promise(() => {}))
    const signOutPromise = signOutAccountSession({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })
    await vi.advanceTimersByTimeAsync(ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS)
    const signOutSignal = mocks.createStatelessUserClient.mock.calls[2][1].signal as AbortSignal
    expectExactResult(await signOutPromise, {
      status: 'timeout',
      message: ACCOUNT_SETTINGS_MESSAGES.timeout,
    })
    expect(signOutSignal.aborted).toBe(true)
    expect(mocks.signOut).toHaveBeenCalledWith(ACCESS_TOKEN, 'local')
  })
})
