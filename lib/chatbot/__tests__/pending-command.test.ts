import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHATBOT_PENDING_COMMAND_TTL_MS,
  CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS,
  clearPendingChatbotCommand,
  getPendingChatbotRecoveryPath,
  hasPendingChatbotCommand,
  isRetryablePendingChatbotResponse,
  loadPendingChatbotCommand,
  loadPendingChatbotRecoveryMarker,
  promotePendingChatbotCommandToRecoveryMarker,
  schedulePendingChatbotCommandExpiry,
  savePendingChatbotCommand,
} from '@/lib/chatbot/pending-command'
import { createChatbotIdempotencyKey } from '@/lib/chatbot/idempotency-key'
import {
  projectChatbotPromptHistory,
  projectChatbotRequestBody,
} from '@/lib/chatbot/prompt-history'
import {
  MAX_CHAT_HISTORY_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
} from '@/lib/chatbot/constants'

const NOW = Date.now()
const SCOPE = 'user:owner-1:conversation:new'
const EXISTING_SCOPE =
  'user:owner-1:conversation:00000000-0000-4000-8000-000000000011'
const FINGERPRINT = 'a'.repeat(64)
const BODY = {
  question: 'What changed?',
  conversationHistory: [],
  sessionId: 'session-1',
  idempotencyKey: createChatbotIdempotencyKey(NOW),
  conversationId: null,
  expectedRevision: 0,
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('pending chatbot command recovery', () => {
  it('round-trips one exact bounded key and payload', () => {
    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      0,
      NOW,
    )
    expect(loadPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toMatchObject({
      scope: SCOPE,
      attempt: 0,
      body: BODY,
    })
    clearPendingChatbotCommand(sessionStorage)
    expect(loadPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toBeNull()
  })

  it('clears a prior account/session but retains same-owner cross-chat recovery', () => {
    const existingBody = {
      ...BODY,
      conversationId: '00000000-0000-4000-8000-000000000011',
      expectedRevision: 2,
    }
    savePendingChatbotCommand(
      sessionStorage,
      EXISTING_SCOPE,
      existingBody,
      FINGERPRINT,
      0,
      NOW,
    )
    expect(loadPendingChatbotCommand(
      sessionStorage,
      SCOPE,
      NOW,
    )).toBeNull()
    expect(hasPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toBe(true)
    expect(getPendingChatbotRecoveryPath(sessionStorage, SCOPE, NOW)).toBe(
      '/chatbot?id=00000000-0000-4000-8000-000000000011',
    )

    expect(hasPendingChatbotCommand(
      sessionStorage,
      'user:owner-2:conversation:new',
      NOW,
    )).toBe(false)
    expect(hasPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toBe(false)

    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      0,
      NOW,
    )
    expect(hasPendingChatbotCommand(
      sessionStorage,
      'anonymous:session-2',
      NOW,
    )).toBe(false)
  })

  it('erases raw content at ten minutes and retains only a bounded identity marker', () => {
    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      0,
      NOW,
    )
    const marker = promotePendingChatbotCommandToRecoveryMarker(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )
    expect(marker).toMatchObject({
      scope: SCOPE,
      principal: 'user:owner-1',
      idempotencyKey: BODY.idempotencyKey,
      requestFingerprint: FINGERPRINT,
    })
    expect(JSON.stringify(marker)).not.toContain(BODY.question)
    expect(loadPendingChatbotCommand(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toBeNull()
    expect(loadPendingChatbotRecoveryMarker(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toMatchObject({ idempotencyKey: BODY.idempotencyKey })
    expect(hasPendingChatbotCommand(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toBe(true)
    expect(hasPendingChatbotCommand(
      sessionStorage,
      'user:owner-2:conversation:new',
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toBe(false)
    expect(loadPendingChatbotRecoveryMarker(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toBeNull()
  })

  it('scrubs a fresh idle command at the original TTL without a reload', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      0,
      NOW,
    )
    const expired = vi.fn()
    const cancel = schedulePendingChatbotCommandExpiry(
      sessionStorage,
      SCOPE,
      expired,
      NOW,
    )

    vi.advanceTimersByTime(CHATBOT_PENDING_COMMAND_TTL_MS + 1)
    expect(expired).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: BODY.idempotencyKey,
    }))
    expect(loadPendingChatbotCommand(
      sessionStorage,
      SCOPE,
      NOW + CHATBOT_PENDING_COMMAND_TTL_MS + 1,
    )).toBeNull()
    cancel()
    vi.useRealTimers()
  })

  it('cannot overwrite an unresolved exact identity with a fresh command', () => {
    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      1,
      NOW,
    )
    const differentBody = {
      ...BODY,
      question: 'A different question',
      idempotencyKey: createChatbotIdempotencyKey(
        NOW,
        '00000000-0000-4000-8000-000000000099',
      ),
    }

    expect(() => savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      differentBody,
      'b'.repeat(64),
      0,
      NOW,
    )).toThrow('still pending recovery')
    expect(loadPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toMatchObject({
      attempt: 1,
      body: { idempotencyKey: BODY.idempotencyKey },
    })
  })

  it('retains rate-limited and capacity-uncertain requests under the same key', () => {
    expect(isRetryablePendingChatbotResponse(
      401,
      'CHATBOT_AUTH_REFRESH_REQUIRED',
    )).toBe(true)
    expect(isRetryablePendingChatbotResponse(
      409,
      'CHATBOT_PRINCIPAL_MISMATCH',
    )).toBe(false)
    expect(isRetryablePendingChatbotResponse(429, 'CHATBOT_RATE_LIMIT')).toBe(true)
    expect(isRetryablePendingChatbotResponse(429, 'CHATBOT_SCOPE_BUSY')).toBe(true)
    expect(isRetryablePendingChatbotResponse(503, 'CHATBOT_CAPACITY')).toBe(true)
    expect(isRetryablePendingChatbotResponse(409, 'CHATBOT_RETRY_EXHAUSTED'))
      .toBe(false)
  })

  it('preserves the original ten-minute expiry across retries', () => {
    const first = savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      0,
      NOW,
    )
    const retried = savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      1,
      NOW + 5 * 60_000,
      { savedAt: first.savedAt, expiresAt: first.expiresAt },
    )
    expect(retried.savedAt).toBe(first.savedAt)
    expect(retried.expiresAt).toBe(first.expiresAt)
    expect(() => savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      2,
      first.expiresAt,
      { savedAt: first.savedAt, expiresAt: first.expiresAt },
    )).toThrow('content has expired')
  })

  it('keeps a potentially in-flight final attempt recoverable after reload', () => {
    savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      BODY,
      FINGERPRINT,
      CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS,
      NOW,
    )
    expect(loadPendingChatbotCommand(sessionStorage, SCOPE, NOW)).toMatchObject({
      attempt: CHATBOT_PENDING_COMMAND_MAX_ATTEMPTS,
      body: { idempotencyKey: BODY.idempotencyKey },
    })
  })
})

describe('chatbot prompt-history projection', () => {
  it('keeps newest chronological context within per-message and total limits', () => {
    const projected = projectChatbotPromptHistory([
      { role: 'user', content: '   ' },
      ...Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `${index}:` + 'x'.repeat(2_500),
        timestamp: `2026-08-09T12:00:${String(index).padStart(2, '0')}Z`,
      })),
    ])

    expect(projected.length).toBeLessThanOrEqual(10)
    expect(projected.every(
      message => message.content.length <= MAX_CHAT_HISTORY_MESSAGE_LENGTH,
    )).toBe(true)
    expect(projected.reduce(
      (total, message) => total + message.content.length,
      0,
    )).toBeLessThanOrEqual(MAX_CHAT_HISTORY_TOTAL_LENGTH)
    expect(projected.at(-1)?.content.startsWith('9:')).toBe(true)
    expect(projected.map(message => message.timestamp)).toEqual(
      [...projected].map(message => message.timestamp).sort(),
    )
  })

  it('trims empties and never leaves a dangling high surrogate', () => {
    const projected = projectChatbotPromptHistory([
      { role: 'user', content: '   ' },
      {
        role: 'assistant',
        content: 'a'.repeat(MAX_CHAT_HISTORY_MESSAGE_LENGTH - 1) + '🚀tail',
      },
    ])
    expect(projected).toHaveLength(1)
    const content = projected[0]!.content
    expect(content.length).toBeLessThanOrEqual(MAX_CHAT_HISTORY_MESSAGE_LENGTH)
    const final = content.charCodeAt(content.length - 1)
    expect(final < 0xd800 || final > 0xdbff).toBe(true)
  })

  it('fits the exact escaped UTF-8 request body while preserving newest context', () => {
    const conversationHistory = projectChatbotPromptHistory(
      Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `${index}:` + '\u0001'.repeat(2_498),
      })),
    )
    const projected = projectChatbotRequestBody({
      ...BODY,
      question: '\u0002'.repeat(2_000),
      conversationHistory,
    })
    const serializedBytes = new TextEncoder().encode(JSON.stringify(projected)).byteLength

    expect(serializedBytes).toBeLessThanOrEqual(MAX_CHAT_REQUEST_BYTES)
    expect(projected.conversationHistory.at(-1)?.content.startsWith('9:')).toBe(true)
    expect(
      projected.conversationHistory.length < conversationHistory.length ||
      projected.conversationHistory[0]!.content.length <
        conversationHistory[0]!.content.length,
    ).toBe(true)
    const oldest = projected.conversationHistory[0]?.content ?? ''
    const final = oldest.charCodeAt(oldest.length - 1)
    expect(Number.isNaN(final) || final < 0xd800 || final > 0xdbff).toBe(true)
    expect(() => savePendingChatbotCommand(
      sessionStorage,
      SCOPE,
      projected,
      FINGERPRINT,
      0,
      NOW,
    )).not.toThrow()
  })
})
