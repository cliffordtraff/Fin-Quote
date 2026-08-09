import { z } from 'zod'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'

export const ACCOUNT_SETTINGS_REQUEST_TIMEOUT_MS = 8_000
export const ACCOUNT_DISPLAY_NAME_MAX_CODE_POINTS = 80
export const ACCOUNT_DISPLAY_NAME_MAX_UTF8_BYTES = 320
export const ACCOUNT_PASSWORD_MIN_CODE_POINTS = 6
export const ACCOUNT_PASSWORD_MAX_CODE_POINTS = 128
export const ACCOUNT_PASSWORD_MAX_UTF8_BYTES = 512

export const ACCOUNT_SETTINGS_MESSAGES = {
  invalidInput: 'The account settings request is invalid.',
  authenticationRequired: 'You must be signed in to update account settings.',
  authenticationUnavailable: 'Authentication is temporarily unavailable. Please try again.',
  principalMismatch: 'Your signed-in account changed. Reload before updating account settings.',
  timeout: 'The account settings request timed out. Check your account before trying again.',
  upstreamUnavailable: 'Account settings are temporarily unavailable. Please try again.',
  verificationUnavailable: 'Email verification is not available for this account.',
  invalidResponse: 'The account settings response is invalid.',
} as const

export interface AccountDisplayNameInput {
  expectedUserId: string
  accessToken: string
  displayName: string
}

export interface AccountPasswordInput {
  expectedUserId: string
  accessToken: string
  password: string
}

export interface AccountVerificationInput {
  expectedUserId: string
  accessToken: string
}

export type AccountSessionInput = AccountVerificationInput

export type AccountSettingsMutationResult =
  | { status: 'updated'; userId: string }
  | { status: 'invalid_input'; message: typeof ACCOUNT_SETTINGS_MESSAGES.invalidInput }
  | {
      status: 'authentication_required'
      message: typeof ACCOUNT_SETTINGS_MESSAGES.authenticationRequired
    }
  | {
      status: 'authentication_unavailable'
      message: typeof ACCOUNT_SETTINGS_MESSAGES.authenticationUnavailable
    }
  | {
      status: 'principal_mismatch'
      message: typeof ACCOUNT_SETTINGS_MESSAGES.principalMismatch
    }
  | { status: 'timeout'; message: typeof ACCOUNT_SETTINGS_MESSAGES.timeout }
  | {
      status: 'upstream_unavailable'
      message:
        | typeof ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable
        | typeof ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable
    }

export class AccountSettingsContractError extends Error {
  readonly code = 'INVALID_ACCOUNT_SETTINGS_CONTRACT' as const

  constructor(message: string = ACCOUNT_SETTINGS_MESSAGES.invalidInput) {
    super(message)
    this.name = 'AccountSettingsContractError'
  }
}

const encoder = new TextEncoder()

function codePointLength(value: string): number {
  return Array.from(value).length
}

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength
}

function isSafeUnicodeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit === 0) return false
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false
    }
  }
  return true
}

function readExactDataProperties(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== expectedKeys.length ||
      keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
    ) return null

    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (!expectedKeys.every(key => {
      const descriptor = descriptors[key]
      return Boolean(descriptor && descriptor.enumerable && 'value' in descriptor)
    })) return null

    return Object.fromEntries(expectedKeys.map(key => [key, descriptors[key].value]))
  } catch {
    return null
  }
}

const expectedUserIdSchema = z.string().uuid()
const accessTokenSchema = z.string().refine(isSupabaseAccessToken)
const displayNameSchema = z.string()
  .transform(value => value.trim())
  .refine(isSafeUnicodeText)
  .refine(value => codePointLength(value) <= ACCOUNT_DISPLAY_NAME_MAX_CODE_POINTS)
  .refine(value => utf8Length(value) <= ACCOUNT_DISPLAY_NAME_MAX_UTF8_BYTES)
const passwordSchema = z.string()
  .refine(isSafeUnicodeText)
  .refine(value => codePointLength(value) >= ACCOUNT_PASSWORD_MIN_CODE_POINTS)
  .refine(value => codePointLength(value) <= ACCOUNT_PASSWORD_MAX_CODE_POINTS)
  .refine(value => utf8Length(value) <= ACCOUNT_PASSWORD_MAX_UTF8_BYTES)

const displayNameInputSchema = z.object({
  expectedUserId: expectedUserIdSchema,
  accessToken: accessTokenSchema,
  displayName: displayNameSchema,
}).strict()
const passwordInputSchema = z.object({
  expectedUserId: expectedUserIdSchema,
  accessToken: accessTokenSchema,
  password: passwordSchema,
}).strict()
const verificationInputSchema = z.object({
  expectedUserId: expectedUserIdSchema,
  accessToken: accessTokenSchema,
}).strict()

const resultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('updated'),
    userId: expectedUserIdSchema,
  }).strict(),
  z.object({
    status: z.literal('invalid_input'),
    message: z.literal(ACCOUNT_SETTINGS_MESSAGES.invalidInput),
  }).strict(),
  z.object({
    status: z.literal('authentication_required'),
    message: z.literal(ACCOUNT_SETTINGS_MESSAGES.authenticationRequired),
  }).strict(),
  z.object({
    status: z.literal('authentication_unavailable'),
    message: z.literal(ACCOUNT_SETTINGS_MESSAGES.authenticationUnavailable),
  }).strict(),
  z.object({
    status: z.literal('principal_mismatch'),
    message: z.literal(ACCOUNT_SETTINGS_MESSAGES.principalMismatch),
  }).strict(),
  z.object({
    status: z.literal('timeout'),
    message: z.literal(ACCOUNT_SETTINGS_MESSAGES.timeout),
  }).strict(),
  z.object({
    status: z.literal('upstream_unavailable'),
    message: z.union([
      z.literal(ACCOUNT_SETTINGS_MESSAGES.upstreamUnavailable),
      z.literal(ACCOUNT_SETTINGS_MESSAGES.verificationUnavailable),
    ]),
  }).strict(),
])

function parseExactInput<T>(
  value: unknown,
  keys: readonly string[],
  schema: z.ZodType<T>,
): T {
  const properties = readExactDataProperties(value, keys)
  if (!properties) {
    throw new AccountSettingsContractError()
  }
  const parsed = schema.safeParse(properties)
  if (!parsed.success) throw new AccountSettingsContractError()
  return parsed.data
}

export function parseAccountDisplayNameInput(value: unknown): AccountDisplayNameInput {
  return parseExactInput(
    value,
    ['expectedUserId', 'accessToken', 'displayName'],
    displayNameInputSchema,
  )
}

export function parseAccountPasswordInput(value: unknown): AccountPasswordInput {
  return parseExactInput(
    value,
    ['expectedUserId', 'accessToken', 'password'],
    passwordInputSchema,
  )
}

export function parseAccountVerificationInput(value: unknown): AccountVerificationInput {
  return parseExactInput(value, ['expectedUserId', 'accessToken'], verificationInputSchema)
}

export function parseAccountSessionInput(value: unknown): AccountSessionInput {
  return parseExactInput(value, ['expectedUserId', 'accessToken'], verificationInputSchema)
}

export function parseAccountSettingsMutationResult(
  value: unknown,
): AccountSettingsMutationResult {
  const properties = readExactDataProperties(value, ['status', 'userId']) ??
    readExactDataProperties(value, ['status', 'message'])
  if (!properties) {
    throw new AccountSettingsContractError(ACCOUNT_SETTINGS_MESSAGES.invalidResponse)
  }
  const parsed = resultSchema.safeParse(properties)
  if (!parsed.success) {
    throw new AccountSettingsContractError(ACCOUNT_SETTINGS_MESSAGES.invalidResponse)
  }
  return parsed.data
}
