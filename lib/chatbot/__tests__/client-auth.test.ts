import { AuthSessionMissingError, type User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ChatbotClientAuthFence,
  classifyInitialChatbotUser,
} from '@/lib/chatbot/client-auth'
import {
  hasPendingChatbotCommand,
  loadPendingChatbotCommand,
  savePendingChatbotCommand,
} from '@/lib/chatbot/pending-command'
import { createChatbotIdempotencyKey } from '@/lib/chatbot/idempotency-key'

const NOW = Date.now()
const USER_SCOPE = 'user:owner-1:conversation:new'
const BODY = {
  question: 'Preserve this exact request',
  conversationHistory: [],
  sessionId: 'session-1',
  idempotencyKey: createChatbotIdempotencyKey(NOW),
  conversationId: null,
  expectedRevision: 0,
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('chatbot client auth resolution', () => {
  it('keeps transient getUser errors unresolved without erasing a user recovery key', () => {
    savePendingChatbotCommand(
      sessionStorage,
      USER_SCOPE,
      BODY,
      'a'.repeat(64),
      0,
      NOW,
    )
    const fence = new ChatbotClientAuthFence()
    const lookup = fence.beginInitialLookup()

    expect(fence.resolveInitialLookup(lookup, {
      data: { user: null },
      error: new Error('storage transport failed'),
    })).toEqual({ status: 'unavailable' })

    // An unresolved auth scope is deliberately non-destructive: it neither
    // publishes anonymous identity nor triggers the principal-mismatch erase.
    expect(hasPendingChatbotCommand(
      sessionStorage,
      'auth:pending',
      NOW,
    )).toBe(false)
    expect(loadPendingChatbotCommand(
      sessionStorage,
      USER_SCOPE,
      NOW,
    )).toMatchObject({ body: { idempotencyKey: BODY.idempotencyKey } })
  })

  it('publishes a genuine missing session and a clean null result as signed out', () => {
    expect(classifyInitialChatbotUser({
      data: { user: null },
      error: new AuthSessionMissingError(),
    })).toEqual({ status: 'resolved', user: null })
    expect(classifyInitialChatbotUser({
      data: { user: null },
      error: null,
    })).toEqual({ status: 'resolved', user: null })
  })

  it('does not let a late lookup response clobber a newer auth event', () => {
    const fence = new ChatbotClientAuthFence()
    const lookup = fence.beginInitialLookup()
    const authenticatedUser = { id: 'owner-2' } as User

    expect(fence.publishAuthEvent(authenticatedUser)).toEqual({
      status: 'resolved',
      user: authenticatedUser,
    })
    expect(fence.resolveInitialLookup(lookup, {
      data: { user: null },
      error: new Error('late transport failure'),
    })).toBeNull()
    expect(fence.resolveInitialLookup(lookup, {
      data: { user: null },
      error: null,
    })).toBeNull()
  })

  it('ignores lookup and event callbacks after unmount', () => {
    const fence = new ChatbotClientAuthFence()
    const lookup = fence.beginInitialLookup()
    fence.dispose()

    expect(fence.rejectInitialLookup(lookup)).toBeNull()
    expect(fence.publishAuthEvent(null)).toBeNull()
  })
})
