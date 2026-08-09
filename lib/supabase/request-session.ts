import { stringFromBase64URL } from '@supabase/ssr'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'

export const SUPABASE_SESSION_COOKIE_MAX_CHUNKS = 32
export const SUPABASE_SESSION_COOKIE_MAX_BYTES = 128 * 1024
export const SUPABASE_SESSION_REFRESH_TOKEN_MAX_LENGTH = 16 * 1024
export const SUPABASE_SESSION_EXPIRY_SKEW_SECONDS = 30

export interface RequestCookieValue {
  name: string
  value: string
}

export type RequestSessionResolution =
  | { status: 'ready'; accessToken: string; expiresAt: number }
  | { status: 'expired'; canRecover: boolean; expiresAt: number }
  | { status: 'missing' }
  | { status: 'malformed' }

const BASE64_PREFIX = 'base64-'
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9._~-]+$/

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function readPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null
}

export function supabaseSessionStorageKey(supabaseUrl: string): string {
  const parsedUrl = new URL(supabaseUrl)
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Invalid Supabase URL')
  }
  const projectReference = parsedUrl.hostname.split('.')[0]
  if (!projectReference) throw new Error('Invalid Supabase URL')
  return `sb-${projectReference}-auth-token`
}

function assembleSessionCookie(
  cookies: readonly RequestCookieValue[],
  storageKey: string,
): { status: 'ready'; value: string } | { status: 'missing' | 'malformed' } {
  const direct = cookies.filter(cookie => cookie.name === storageKey)
  if (direct.length > 1) return { status: 'malformed' }
  if (direct.length === 1 && direct[0]!.value) {
    return utf8Length(direct[0]!.value) <= SUPABASE_SESSION_COOKIE_MAX_BYTES
      ? { status: 'ready', value: direct[0]!.value }
      : { status: 'malformed' }
  }

  const chunkPrefix = `${storageKey}.`
  const chunks = new Map<number, string>()
  let sawChunk = false
  for (const cookie of cookies) {
    if (!cookie.name.startsWith(chunkPrefix)) continue
    sawChunk = true
    const suffix = cookie.name.slice(chunkPrefix.length)
    if (!/^(0|[1-9][0-9]*)$/.test(suffix)) continue
    const index = Number(suffix)
    if (
      !Number.isSafeInteger(index)
      || index < 0
      || index >= SUPABASE_SESSION_COOKIE_MAX_CHUNKS
      || chunks.has(index)
    ) return { status: 'malformed' }
    chunks.set(index, cookie.value)
  }

  if (!sawChunk) return { status: 'missing' }
  if (chunks.size === 0 || !chunks.has(0)) return { status: 'malformed' }

  let assembled = ''
  for (let index = 0; index < chunks.size; index += 1) {
    const chunk = chunks.get(index)
    if (chunk === undefined || chunk.length === 0) return { status: 'malformed' }
    assembled += chunk
    if (utf8Length(assembled) > SUPABASE_SESSION_COOKIE_MAX_BYTES) {
      return { status: 'malformed' }
    }
  }

  return { status: 'ready', value: assembled }
}

function decodeCookieValue(value: string): string | null {
  try {
    const decoded = value.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(value.slice(BASE64_PREFIX.length))
      : value
    return utf8Length(decoded) <= SUPABASE_SESSION_COOKIE_MAX_BYTES
      ? decoded
      : null
  } catch {
    return null
  }
}

function jwtExpiry(accessToken: string): number | null {
  const payloadPart = accessToken.split('.')[1]
  if (!payloadPart || payloadPart.length > SUPABASE_SESSION_COOKIE_MAX_BYTES) return null
  try {
    const decoded = stringFromBase64URL(payloadPart)
    if (utf8Length(decoded) > SUPABASE_SESSION_COOKIE_MAX_BYTES) return null
    const payload = readPlainObject(JSON.parse(decoded) as unknown)
    const expiresAt = payload?.exp
    return typeof expiresAt === 'number'
      && Number.isSafeInteger(expiresAt)
      && expiresAt > 0
      ? expiresAt
      : null
  } catch {
    return null
  }
}

function hasPlausibleRefreshToken(value: unknown): boolean {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= SUPABASE_SESSION_REFRESH_TOKEN_MAX_LENGTH
    && REFRESH_TOKEN_PATTERN.test(value)
}

/**
 * Reads only the access-token transport from the Supabase SSR cookie. The
 * refresh token is reduced to a boolean recovery hint and is never returned.
 * Supabase Auth remains authoritative for JWT signature, session and subject.
 */
export function resolveRequestSession(
  cookies: readonly RequestCookieValue[],
  supabaseUrl: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): RequestSessionResolution {
  let storageKey: string
  try {
    storageKey = supabaseSessionStorageKey(supabaseUrl)
  } catch {
    return { status: 'malformed' }
  }

  const assembled = assembleSessionCookie(cookies, storageKey)
  if (assembled.status !== 'ready') return assembled

  const decoded = decodeCookieValue(assembled.value)
  if (decoded === null) return { status: 'malformed' }

  let session: Record<string, unknown> | null
  try {
    session = readPlainObject(JSON.parse(decoded) as unknown)
  } catch {
    session = null
  }
  if (!session || !isSupabaseAccessToken(session.access_token)) {
    return { status: 'malformed' }
  }

  const expiresAt = jwtExpiry(session.access_token)
  if (expiresAt === null) return { status: 'malformed' }
  if (expiresAt <= nowSeconds + SUPABASE_SESSION_EXPIRY_SKEW_SECONDS) {
    return {
      status: 'expired',
      canRecover: hasPlausibleRefreshToken(session.refresh_token),
      expiresAt,
    }
  }

  return {
    status: 'ready',
    accessToken: session.access_token,
    expiresAt,
  }
}
