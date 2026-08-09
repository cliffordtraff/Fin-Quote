import { describe, expect, it } from 'vitest'
import {
  canonicalizeChatbotCommand,
  fingerprintChatbotCommand,
} from '@/lib/chatbot/command-fingerprint'

describe('chatbot command fingerprint', () => {
  it('sorts nested object keys by code point, independent of locale', () => {
    const canonical = canonicalizeChatbotCommand({
      '🚀': 5,
      'é': 4,
      a: { z: 2, A: 1 },
      Z: 3,
    }) as Record<string, unknown>

    expect(Object.keys(canonical)).toEqual(['Z', 'a', 'é', '🚀'])
    expect(Object.keys(canonical.a as Record<string, unknown>)).toEqual(['A', 'z'])
  })

  it('produces the same fingerprint for insertion-order variants', async () => {
    const first = await fingerprintChatbotCommand({ b: 2, a: { d: 4, c: 3 } })
    const second = await fingerprintChatbotCommand({ a: { c: 3, d: 4 }, b: 2 })
    expect(first).toBe(second)
  })
})
