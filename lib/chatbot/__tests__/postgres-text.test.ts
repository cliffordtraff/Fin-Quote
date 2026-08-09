import { describe, expect, it } from 'vitest'
import {
  isPostgresSafeText,
  replaceInvalidPostgresText,
} from '@/lib/chatbot/postgres-text'

describe('PostgreSQL-safe chatbot text', () => {
  it('rejects NUL and unpaired UTF-16 while preserving valid astral pairs', () => {
    expect(isPostgresSafeText('safe 🚀 text')).toBe(true)
    expect(isPostgresSafeText('bad\u0000text')).toBe(false)
    expect(isPostgresSafeText(`bad${String.fromCharCode(0xd800)}`)).toBe(false)
    expect(isPostgresSafeText(`bad${String.fromCharCode(0xdc00)}`)).toBe(false)
  })

  it('normalizes invalid streamed units before display and persistence', () => {
    const invalid = `a\u0000${String.fromCharCode(0xd800)}b${String.fromCharCode(0xdc00)}c🚀`
    const normalized = replaceInvalidPostgresText(invalid)
    expect(normalized).toBe('a��b�c🚀')
    expect(isPostgresSafeText(normalized)).toBe(true)
  })
})
