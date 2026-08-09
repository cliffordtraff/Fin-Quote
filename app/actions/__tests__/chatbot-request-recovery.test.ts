import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatbotIdempotencyKey } from '@/lib/chatbot/idempotency-key'

const mocks = vi.hoisted(() => ({
  requireCurrentUserContext: vi.fn(),
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', () => ({
  requireCurrentUserContext: mocks.requireCurrentUserContext,
}))

import { resolvePendingChatbotRequest } from '@/app/actions/chatbot-request-recovery'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal })
  mocks.requireCurrentUserContext.mockResolvedValue({
    client: { rpc: mocks.rpc },
    user: { id: 'user-1' },
  })
})

describe('content-free pending chatbot recovery action', () => {
  it('strictly decodes an owner-bound completed pointer', async () => {
    const idempotencyKey = createChatbotIdempotencyKey()
    mocks.abortSignal.mockResolvedValue({
      data: [{
        disposition: 'completed',
        result_conversation_id: '00000000-0000-4000-8000-000000000010',
        result_revision: 4,
      }],
      error: null,
    })

    await expect(resolvePendingChatbotRequest({
      idempotencyKey,
      requestFingerprint: 'a'.repeat(64),
    })).resolves.toEqual({
      status: 'ready',
      disposition: 'completed',
      conversationId: '00000000-0000-4000-8000-000000000010',
      revision: 4,
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'resolve_owned_chatbot_request_admission',
      {
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: 'a'.repeat(64),
      },
    )
  })

  it('fails closed on malformed pointer nullability or storage outage', async () => {
    const identity = {
      idempotencyKey: createChatbotIdempotencyKey(),
      requestFingerprint: 'b'.repeat(64),
    }
    mocks.abortSignal.mockResolvedValueOnce({
      data: [{
        disposition: 'failed',
        result_conversation_id: '00000000-0000-4000-8000-000000000010',
        result_revision: null,
      }],
      error: null,
    })
    await expect(resolvePendingChatbotRequest(identity)).resolves.toMatchObject({
      status: 'unavailable',
    })

    mocks.abortSignal.mockResolvedValueOnce({
      data: null,
      error: { message: 'offline' },
    })
    await expect(resolvePendingChatbotRequest(identity)).resolves.toMatchObject({
      status: 'unavailable',
    })
  })
})
