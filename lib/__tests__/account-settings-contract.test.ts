import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_DISPLAY_NAME_MAX_CODE_POINTS,
  ACCOUNT_DISPLAY_NAME_MAX_UTF8_BYTES,
  ACCOUNT_PASSWORD_MAX_CODE_POINTS,
  ACCOUNT_PASSWORD_MAX_UTF8_BYTES,
  ACCOUNT_PASSWORD_MIN_CODE_POINTS,
  ACCOUNT_SETTINGS_MESSAGES,
  ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS,
  AccountSettingsContractError,
  parseAccountDisplayNameInput,
  parseAccountPasswordInput,
  parseAccountSessionInput,
  parseAccountSettingsMutationResult,
  parseAccountVerificationInput,
} from '@/lib/account-settings-contract'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(48)}`

function expectContractError(
  run: () => unknown,
  message: string = ACCOUNT_SETTINGS_MESSAGES.invalidInput,
) {
  try {
    run()
    throw new Error('Expected account settings parsing to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(AccountSettingsContractError)
    expect((error as Error).message).toBe(message)
  }
}

describe('account settings browser contract', () => {
  it('publishes the exact product bounds and request deadline', () => {
    expect({
      timeout: ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS,
      displayCodePoints: ACCOUNT_DISPLAY_NAME_MAX_CODE_POINTS,
      displayBytes: ACCOUNT_DISPLAY_NAME_MAX_UTF8_BYTES,
      passwordMin: ACCOUNT_PASSWORD_MIN_CODE_POINTS,
      passwordMax: ACCOUNT_PASSWORD_MAX_CODE_POINTS,
      passwordBytes: ACCOUNT_PASSWORD_MAX_UTF8_BYTES,
    }).toEqual({
      timeout: 8_000,
      displayCodePoints: 80,
      displayBytes: 320,
      passwordMin: 6,
      passwordMax: 128,
      passwordBytes: 512,
    })
  })

  it('trims display names, permits trimmed empty, and counts Unicode code points and bytes', () => {
    expect(parseAccountDisplayNameInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: '  Ada Lovelace  ',
    })).toEqual({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN, displayName: 'Ada Lovelace' })
    expect(parseAccountDisplayNameInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: '   ',
    })).toEqual({ expectedUserId: USER_ID, accessToken: ACCESS_TOKEN, displayName: '' })

    const exactAstralBoundary = '🚀'.repeat(80)
    expect(new TextEncoder().encode(exactAstralBoundary)).toHaveLength(320)
    expect(parseAccountDisplayNameInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: exactAstralBoundary,
    }).displayName).toBe(exactAstralBoundary)

    expectContractError(() => parseAccountDisplayNameInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: '🚀'.repeat(81),
    }))
  })

  it('preserves passwords exactly while enforcing code-point and UTF-8 limits', () => {
    expect(parseAccountPasswordInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      password: ' abcdef ',
    }).password).toBe(' abcdef ')
    expect(parseAccountPasswordInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      password: '🔒'.repeat(6),
    }).password).toBe('🔒'.repeat(6))

    const exactAstralBoundary = '🔒'.repeat(128)
    expect(new TextEncoder().encode(exactAstralBoundary)).toHaveLength(512)
    expect(parseAccountPasswordInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      password: exactAstralBoundary,
    }).password).toBe(exactAstralBoundary)

    for (const password of [
      'short',
      '🔒'.repeat(5),
      '🔒'.repeat(129),
    ]) {
      expectContractError(() => parseAccountPasswordInput({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        password,
      }))
    }
  })

  it('rejects NUL, unpaired UTF-16, invalid UUIDs, and non-exact objects', () => {
    for (const invalidText of ['bad\0text', 'bad\ud800text', 'bad\udc00text']) {
      expectContractError(() => parseAccountDisplayNameInput({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        displayName: invalidText,
      }))
      expectContractError(() => parseAccountPasswordInput({
        expectedUserId: USER_ID,
        accessToken: ACCESS_TOKEN,
        password: `${invalidText}secure`,
      }))
    }

    expectContractError(() => parseAccountDisplayNameInput({
      expectedUserId: 'not-a-uuid',
      accessToken: ACCESS_TOKEN,
      displayName: 'Ada',
    }))
    expectContractError(() => parseAccountDisplayNameInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      displayName: 'Ada',
      extra: true,
    }))
    const symbolic = { expectedUserId: USER_ID, accessToken: ACCESS_TOKEN, displayName: 'Ada' }
    Object.defineProperty(symbolic, Symbol('hidden'), { value: true })
    expectContractError(() => parseAccountDisplayNameInput(symbolic))

    const inherited = Object.create({ inherited: true }) as Record<string, unknown>
    inherited.expectedUserId = USER_ID
    inherited.accessToken = ACCESS_TOKEN
    inherited.displayName = 'Ada'
    expectContractError(() => parseAccountDisplayNameInput(inherited))

    let getterInvoked = false
    const accessorInput = {
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    } as Record<string, unknown>
    Object.defineProperty(accessorInput, 'displayName', {
      enumerable: true,
      get() {
        getterInvoked = true
        return 'Ada'
      },
    })
    expectContractError(() => parseAccountDisplayNameInput(accessorInput))
    expect(getterInvoked).toBe(false)

    const hostileProxy = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('hostile trap detail')
      },
    })
    expectContractError(() => parseAccountVerificationInput(hostileProxy))
  })

  it('accepts only an exact verification identity', () => {
    expect(parseAccountVerificationInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })).toEqual({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })
    expectContractError(() => parseAccountVerificationInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      email: 'caller-controlled@example.com',
    }))
  })

  it('accepts only an exact sign-out session identity', () => {
    expect(parseAccountSessionInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })).toEqual({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
    })
    expect(() => parseAccountSessionInput({
      expectedUserId: USER_ID,
      accessToken: ACCESS_TOKEN,
      scope: 'global',
    })).toThrow(AccountSettingsContractError)
  })

  it('strictly parses the closed result union and rejects raw or extra details', () => {
    const validResults = [
      { status: 'updated', userId: USER_ID },
      { status: 'invalid_input', message: ACCOUNT_SETTINGS_MESSAGES.invalidInput },
      {
        status: 'authentication_required',
        message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
      },
      {
        status: 'authentication_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.authenticationUnavailable,
      },
      { status: 'principal_mismatch', message: ACCOUNT_SETTINGS_MESSAGES.principalMismatch },
      { status: 'timeout', message: ACCOUNT_SETTINGS_MESSAGES.timeout },
      {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable,
      },
      {
        status: 'upstream_unavailable',
        message: ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable,
      },
    ]

    for (const result of validResults) {
      expect(parseAccountSettingsMutationResult(result)).toEqual(result)
    }
    expectContractError(
      () => parseAccountSettingsMutationResult({
        status: 'upstream_unavailable',
        message: 'private provider error',
      }),
      ACCOUNT_SETTINGS_MESSAGES.invalidResponse,
    )
    expectContractError(
      () => parseAccountSettingsMutationResult({
        status: 'updated',
        userId: USER_ID,
        password: 'must never cross the boundary',
      }),
      ACCOUNT_SETTINGS_MESSAGES.invalidResponse,
    )

    let getterInvoked = false
    const accessorResult = { status: 'updated' } as Record<string, unknown>
    Object.defineProperty(accessorResult, 'userId', {
      enumerable: true,
      get() {
        getterInvoked = true
        return USER_ID
      },
    })
    expectContractError(
      () => parseAccountSettingsMutationResult(accessorResult),
      ACCOUNT_SETTINGS_MESSAGES.invalidResponse,
    )
    expect(getterInvoked).toBe(false)
  })
})
