'use server'

import {
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'
import { z } from 'zod'
import {
  ACCOUNT_SETTINGS_MESSAGES,
  ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS,
  parseAccountDisplayNameInput,
  parseAccountPasswordInput,
  parseAccountSessionInput,
  parseAccountVerificationInput,
  type AccountDisplayNameInput,
  type AccountPasswordInput,
  type AccountSessionInput,
  type AccountSettingsMutationResult,
  type AccountVerificationInput,
} from '@/lib/account-settings-contract'
import {
  createStatelessUserClient,
  updateStatelessUser,
} from '@/lib/supabase/stateless-user'

type AccountSettingsServerClient = ReturnType<typeof createStatelessUserClient>

type AuthenticatedPrincipal = {
  id: string
  email?: unknown
  confirmed_at?: unknown
  email_confirmed_at?: unknown
}

type AuthenticationResolution =
  | { status: 'authenticated'; user: AuthenticatedPrincipal }
  | { status: 'anonymous' }
  | { status: 'error'; error: unknown }
  | { status: 'malformed' }

const principalSchema = z.object({
  id: z.string().uuid(),
  email: z.unknown().optional(),
  confirmed_at: z.unknown().optional(),
  email_confirmed_at: z.unknown().optional(),
}).strip()

const emailSchema = z.string().trim().email().max(320)

function readPlainDataObject(
  value: unknown,
  expectedKeys?: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string')) return null
    if (
      expectedKeys && (
        keys.length !== expectedKeys.length ||
        keys.some(key => !expectedKeys.includes(key as string))
      )
    ) return null

    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (!keys.every(key => {
      const descriptor = descriptors[key as string]
      return Boolean(descriptor && descriptor.enumerable && 'value' in descriptor)
    })) return null

    return Object.fromEntries(keys.map(key => [key, descriptors[key as string].value]))
  } catch {
    return null
  }
}

function decodePrincipal(value: unknown): AuthenticatedPrincipal | null {
  const properties = readPlainDataObject(value)
  if (!properties) return null
  const parsed = principalSchema.safeParse(properties)
  return parsed.success ? parsed.data : null
}

function invalidInput(): AccountSettingsMutationResult {
  return {
    status: 'invalid_input',
    message: ACCOUNT_SETTINGS_MESSAGES.invalidInput,
  }
}

function authenticationRequired(): AccountSettingsMutationResult {
  return {
    status: 'authentication_required',
    message: ACCOUNT_SETTINGS_MESSAGES.authenticationRequired,
  }
}

function authenticationUnavailable(): AccountSettingsMutationResult {
  return {
    status: 'authentication_unavailable',
    message: ACCOUNT_SETTINGS_MESSAGES.authenticationUnavailable,
  }
}

function principalMismatch(): AccountSettingsMutationResult {
  return {
    status: 'principal_mismatch',
    message: ACCOUNT_SETTINGS_MESSAGES.principalMismatch,
  }
}

function timedOut(): AccountSettingsMutationResult {
  return {
    status: 'timeout',
    message: ACCOUNT_SETTINGS_MESSAGES.timeout,
  }
}

function upstreamUnavailable(
  message:
    | typeof ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable
    | typeof ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable =
      ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable,
): AccountSettingsMutationResult {
  return { status: 'upstream_unavailable', message }
}

function updated(userId: string): AccountSettingsMutationResult {
  return { status: 'updated', userId }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The account settings request was aborted.', 'AbortError')
}

function awaitWithSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      value => {
        cleanup()
        resolve(value)
      },
      error => {
        cleanup()
        reject(error)
      },
    )
  })
}

function createOwnedDeadline(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'The account settings request exceeded its deadline.',
      'TimeoutError',
    ))
  }, ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

function decodeAuthenticationResult(value: unknown): AuthenticationResolution {
  const response = readPlainDataObject(value, ['data', 'error'])
  if (!response) return { status: 'malformed' }
  if (response.error !== null) return { status: 'error', error: response.error }
  const data = readPlainDataObject(response.data, ['user'])
  if (!data) return { status: 'malformed' }
  if (data.user === null) return { status: 'anonymous' }

  const user = decodePrincipal(data.user)
  return user
    ? { status: 'authenticated', user }
    : { status: 'malformed' }
}

function decodeResendResult(value: unknown):
  | { status: 'sent' }
  | { status: 'error'; error: unknown }
  | { status: 'malformed' } {
  const response = readPlainDataObject(value, ['data', 'error'])
  if (!response) return { status: 'malformed' }
  if (response.error !== null) return { status: 'error', error: response.error }
  const data = readPlainDataObject(response.data, ['user', 'session']) ??
    readPlainDataObject(response.data, ['user', 'session', 'messageId'])
  if (!data) return { status: 'malformed' }
  if (data.user !== null || data.session !== null) {
    return { status: 'malformed' }
  }
  if (
    'messageId' in data &&
    data.messageId !== null &&
    typeof data.messageId !== 'string'
  ) return { status: 'malformed' }
  return { status: 'sent' }
}

function decodeSignOutResult(value: unknown):
  | { status: 'signed_out' }
  | { status: 'error'; error: unknown }
  | { status: 'malformed' } {
  const response = readPlainDataObject(value, ['data', 'error'])
  if (!response) return { status: 'malformed' }
  return response.data === null && response.error === null
    ? { status: 'signed_out' }
    : response.error !== null
      ? { status: 'error', error: response.error }
      : { status: 'malformed' }
}

function isMissingSession(error: unknown): boolean {
  try {
    return isAuthSessionMissingError(error)
  } catch {
    return false
  }
}

function isInvalidSession(error: unknown): boolean {
  if (isMissingSession(error)) return true
  try {
    return isAuthApiError(error) && (error.status === 401 || error.status === 403)
  } catch {
    return false
  }
}

async function runPrincipalBoundMutation(
  expectedUserId: string,
  accessToken: string,
  operation: (
    client: AccountSettingsServerClient,
    user: AuthenticatedPrincipal,
    signal: AbortSignal,
  ) => Promise<AccountSettingsMutationResult>,
): Promise<AccountSettingsMutationResult> {
  const deadline = createOwnedDeadline()
  let phase: 'authentication' | 'mutation' = 'authentication'

  try {
    const client = createStatelessUserClient(accessToken, {
      signal: deadline.signal,
    })
    const authentication = decodeAuthenticationResult(await awaitWithSignal(
      client.auth.getUser(accessToken),
      deadline.signal,
    ))

    if (authentication.status === 'error') {
      return isInvalidSession(authentication.error)
        ? authenticationRequired()
        : authenticationUnavailable()
    }
    if (authentication.status === 'anonymous') return authenticationRequired()
    if (authentication.status === 'malformed') return authenticationUnavailable()
    if (authentication.user.id !== expectedUserId) return principalMismatch()

    phase = 'mutation'
    return await operation(client, authentication.user, deadline.signal)
  } catch (error) {
    if (deadline.signal.aborted) return timedOut()
    if (isInvalidSession(error)) return authenticationRequired()
    return phase === 'authentication'
      ? authenticationUnavailable()
      : upstreamUnavailable()
  } finally {
    deadline.clear()
  }
}

async function updatePrincipal(
  _client: AccountSettingsServerClient,
  expectedUserId: string,
  accessToken: string,
  attributes: { data: { display_name: string } } | { password: string },
  signal: AbortSignal,
): Promise<AccountSettingsMutationResult> {
  const response = await awaitWithSignal(
    updateStatelessUser(accessToken, attributes, { signal }),
    signal,
  )
  if (response.status === 401 || response.status === 403) {
    return authenticationRequired()
  }
  if (response.status < 200 || response.status >= 300) {
    return upstreamUnavailable()
  }
  const user = decodePrincipal(response.body)
  if (!user || user.id !== expectedUserId) {
    return upstreamUnavailable()
  }
  return updated(user.id)
}

export async function updateAccountDisplayName(
  input: AccountDisplayNameInput,
): Promise<AccountSettingsMutationResult> {
  let parsed: AccountDisplayNameInput
  try {
    parsed = parseAccountDisplayNameInput(input)
  } catch {
    return invalidInput()
  }

  return runPrincipalBoundMutation(
    parsed.expectedUserId,
    parsed.accessToken,
    (client, _user, signal) => updatePrincipal(
      client,
      parsed.expectedUserId,
      parsed.accessToken,
      { data: { display_name: parsed.displayName } },
      signal,
    ),
  )
}

export async function updateAccountPassword(
  input: AccountPasswordInput,
): Promise<AccountSettingsMutationResult> {
  let parsed: AccountPasswordInput
  try {
    parsed = parseAccountPasswordInput(input)
  } catch {
    return invalidInput()
  }

  return runPrincipalBoundMutation(
    parsed.expectedUserId,
    parsed.accessToken,
    (client, _user, signal) => updatePrincipal(
      client,
      parsed.expectedUserId,
      parsed.accessToken,
      { password: parsed.password },
      signal,
    ),
  )
}

export async function resendAccountVerification(
  input: AccountVerificationInput,
): Promise<AccountSettingsMutationResult> {
  let parsed: AccountVerificationInput
  try {
    parsed = parseAccountVerificationInput(input)
  } catch {
    return invalidInput()
  }

  return runPrincipalBoundMutation(
    parsed.expectedUserId,
    parsed.accessToken,
    async (client, user, signal) => {
      const email = emailSchema.safeParse(user.email)
      if (
        !email.success ||
        (user.confirmed_at !== null && user.confirmed_at !== undefined) ||
        (user.email_confirmed_at !== null && user.email_confirmed_at !== undefined)
      ) {
        return upstreamUnavailable(ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable)
      }

      const result = decodeResendResult(await awaitWithSignal(
        client.auth.resend({ type: 'signup', email: email.data }),
        signal,
      ))
      if (result.status === 'error') {
        return isInvalidSession(result.error)
          ? authenticationRequired()
          : upstreamUnavailable()
      }
      return result.status === 'sent'
        ? updated(user.id)
        : upstreamUnavailable()
    },
  )
}

export async function signOutAccountSession(
  input: AccountSessionInput,
): Promise<AccountSettingsMutationResult> {
  let parsed: AccountSessionInput
  try {
    parsed = parseAccountSessionInput(input)
  } catch {
    return invalidInput()
  }

  return runPrincipalBoundMutation(
    parsed.expectedUserId,
    parsed.accessToken,
    async (client, user, signal) => {
      const result = decodeSignOutResult(await awaitWithSignal(
        client.auth.admin.signOut(parsed.accessToken, 'local'),
        signal,
      ))
      if (result.status === 'signed_out') return updated(user.id)
      if (result.status === 'error' && isInvalidSession(result.error)) {
        return updated(user.id)
      }
      return upstreamUnavailable()
    },
  )
}
