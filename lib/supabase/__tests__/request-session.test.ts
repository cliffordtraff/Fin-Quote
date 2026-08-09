import { describe, expect, it } from 'vitest'
import { stringToBase64URL } from '@supabase/ssr'
import {
  SUPABASE_SESSION_COOKIE_MAX_BYTES,
  SUPABASE_SESSION_COOKIE_MAX_CHUNKS,
  resolveRequestSession,
  supabaseSessionStorageKey,
} from '@/lib/supabase/request-session'

const SUPABASE_URL = 'https://project.supabase.co'
const STORAGE_KEY = 'sb-project-auth-token'
const NOW = 2_000_000_000

function token(expiresAt: number): string {
  return [
    stringToBase64URL(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    stringToBase64URL(JSON.stringify({ exp: expiresAt, sub: 'user-a' })),
    's'.repeat(48),
  ].join('.')
}

function sessionValue(
  expiresAt: number,
  refreshToken: unknown = 'refresh-token-a',
  encoded = true,
): string {
  const value = JSON.stringify({
    access_token: token(expiresAt),
    refresh_token: refreshToken,
    expires_at: expiresAt,
  })
  return encoded ? `base64-${stringToBase64URL(value)}` : value
}

describe('bounded Supabase request-session transport', () => {
  it('derives the same storage key used by supabase-js', () => {
    expect(supabaseSessionStorageKey(SUPABASE_URL)).toBe(STORAGE_KEY)
    expect(() => supabaseSessionStorageKey('ftp://project.supabase.co')).toThrow(
      'Invalid Supabase URL',
    )
  })

  it('extracts only a nonexpired access token from raw and encoded cookies', () => {
    const accessToken = token(NOW + 300)
    for (const value of [
      sessionValue(NOW + 300),
      sessionValue(NOW + 300, 'refresh-token-a', false),
    ]) {
      const result = resolveRequestSession(
        [{ name: STORAGE_KEY, value }],
        SUPABASE_URL,
        NOW,
      )
      expect(result).toEqual({
        status: 'ready',
        accessToken,
        expiresAt: NOW + 300,
      })
      expect(JSON.stringify(result)).not.toContain('refresh-token-a')
    }
  })

  it('assembles contiguous chunks within its fixed bound', () => {
    const value = sessionValue(NOW + 300)
    const midpoint = Math.floor(value.length / 2)
    expect(resolveRequestSession([
      { name: `${STORAGE_KEY}.0`, value: value.slice(0, midpoint) },
      { name: `${STORAGE_KEY}.1`, value: value.slice(midpoint) },
    ], SUPABASE_URL, NOW)).toMatchObject({ status: 'ready' })
  })

  it('marks expired sessions recoverable without returning their refresh token', () => {
    const recoverable = resolveRequestSession(
      [{ name: STORAGE_KEY, value: sessionValue(NOW - 1) }],
      SUPABASE_URL,
      NOW,
    )
    expect(recoverable).toEqual({
      status: 'expired',
      canRecover: true,
      expiresAt: NOW - 1,
    })
    expect(JSON.stringify(recoverable)).not.toContain('refresh-token-a')

    expect(resolveRequestSession(
      [{ name: STORAGE_KEY, value: sessionValue(NOW - 1, 'bad token') }],
      SUPABASE_URL,
      NOW,
    )).toEqual({
      status: 'expired',
      canRecover: false,
      expiresAt: NOW - 1,
    })
  })

  it('rejects gaps, duplicate chunks, excessive indices and oversized values', () => {
    const value = sessionValue(NOW + 300)
    const malformedCookieSets = [
      [{ name: `${STORAGE_KEY}.1`, value }],
      [
        { name: `${STORAGE_KEY}.0`, value },
        { name: `${STORAGE_KEY}.0`, value },
      ],
      [{ name: `${STORAGE_KEY}.${SUPABASE_SESSION_COOKIE_MAX_CHUNKS}`, value }],
      [{ name: STORAGE_KEY, value: 'x'.repeat(SUPABASE_SESSION_COOKIE_MAX_BYTES + 1) }],
    ]
    for (const cookies of malformedCookieSets) {
      expect(resolveRequestSession(cookies, SUPABASE_URL, NOW)).toEqual({
        status: 'malformed',
      })
    }
  })

  it('rejects malformed encoding, JSON and JWT expiry payloads', () => {
    const malformedValues = [
      'base64-***',
      '{not-json',
      JSON.stringify({ access_token: 'not-a-jwt', refresh_token: 'refresh-token-a' }),
      JSON.stringify({
        access_token: `${'a'.repeat(24)}.${stringToBase64URL('{}')}.${'c'.repeat(48)}`,
        refresh_token: 'refresh-token-a',
      }),
    ]
    for (const value of malformedValues) {
      expect(resolveRequestSession(
        [{ name: STORAGE_KEY, value }],
        SUPABASE_URL,
        NOW,
      )).toEqual({ status: 'malformed' })
    }
  })

  it('distinguishes a truly missing cookie from malformed auth transport', () => {
    expect(resolveRequestSession([], SUPABASE_URL, NOW)).toEqual({ status: 'missing' })
    expect(resolveRequestSession(
      [{ name: 'unrelated', value: 'x' }],
      SUPABASE_URL,
      NOW,
    )).toEqual({ status: 'missing' })
  })
})
