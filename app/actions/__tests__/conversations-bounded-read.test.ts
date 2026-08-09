import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCurrentUserContext: vi.fn(),
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', () => ({
  requireCurrentUserContext: mocks.requireCurrentUserContext,
}))

import {
  getConversation,
  getConversations,
} from '@/app/actions/conversations'

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000010'
const MESSAGE_ONE = '00000000-0000-4000-8000-000000000011'
const MESSAGE_TWO = '00000000-0000-4000-8000-000000000012'
const CREATED_AT = '2026-08-09T12:00:00.000Z'
const UPDATED_AT = '2026-08-09T12:01:00.000Z'

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    conversation_id: CONVERSATION_ID,
    title: 'Bounded history',
    conversation_created_at: CREATED_AT,
    conversation_updated_at: UPDATED_AT,
    revision: 2,
    message_id: MESSAGE_TWO,
    message_role: 'assistant',
    message_content: 'Newer answer',
    message_created_at: UPDATED_AT,
    chart_config: null,
    follow_up_questions: null,
    data_used: null,
    has_more: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal })
  mocks.requireCurrentUserContext.mockResolvedValue({
    client: { rpc: mocks.rpc },
    user: { id: 'user-1' },
  })
})

describe('bounded conversation read actions', () => {
  it('distinguishes an authoritative empty list from an unavailable RPC', async () => {
    mocks.abortSignal.mockResolvedValueOnce({ data: [], error: null })
    await expect(getConversations({ limit: 50 })).resolves.toEqual({
      status: 'empty',
      conversations: [],
      nextCursor: null,
    })

    mocks.abortSignal.mockResolvedValueOnce({
      data: null,
      error: { message: 'offline' },
    })
    await expect(getConversations({ limit: 50 })).resolves.toMatchObject({
      status: 'unavailable',
      conversations: null,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'list_chatbot_conversations', {
      p_before_updated_at: null,
      p_before_id: null,
      p_limit: 50,
    })
  })

  it('fails closed on malformed or out-of-order list rows', async () => {
    mocks.abortSignal.mockResolvedValueOnce({
      data: [
        {
          id: CONVERSATION_ID,
          title: 'Older placed first',
          created_at: CREATED_AT,
          updated_at: CREATED_AT,
          revision: 1,
        },
        {
          id: '00000000-0000-4000-8000-000000000020',
          title: 'Newer placed second',
          created_at: CREATED_AT,
          updated_at: UPDATED_AT,
          revision: 1,
        },
      ],
      error: null,
    })

    await expect(getConversations({ limit: 50 })).resolves.toMatchObject({
      status: 'unavailable',
    })
  })

  it('orders list and detail rows by PostgreSQL microseconds before UUIDs', async () => {
    const newest = '2026-08-09T12:00:00.123457Z'
    const older = '2026-08-09T12:00:00.123456Z'
    mocks.abortSignal.mockResolvedValueOnce({
      data: [
        {
          id: CONVERSATION_ID,
          title: 'Newer, lower UUID',
          created_at: CREATED_AT,
          updated_at: newest,
          revision: 2,
        },
        {
          id: '00000000-0000-4000-8000-000000000020',
          title: 'Older, higher UUID',
          created_at: CREATED_AT,
          updated_at: older,
          revision: 1,
        },
      ],
      error: null,
    })
    await expect(getConversations({ limit: 50 })).resolves.toMatchObject({
      status: 'ready',
      conversations: [
        { id: CONVERSATION_ID },
        { id: '00000000-0000-4000-8000-000000000020' },
      ],
    })

    mocks.abortSignal.mockResolvedValueOnce({
      data: [
        detailRow({
          message_id: MESSAGE_ONE,
          message_created_at: newest,
        }),
        detailRow({
          message_id: MESSAGE_TWO,
          message_role: 'user',
          message_content: 'Older question',
          message_created_at: older,
        }),
      ],
      error: null,
    })
    await expect(getConversation(CONVERSATION_ID)).resolves.toMatchObject({
      status: 'ready',
      messages: [
        { id: MESSAGE_TWO },
        { id: MESSAGE_ONE },
      ],
    })
  })

  it('decodes a newest-first page, returns it chronologically, and exposes the older cursor', async () => {
    mocks.abortSignal.mockResolvedValueOnce({
      data: [
        detailRow(),
        detailRow({
          message_id: MESSAGE_ONE,
          message_role: 'user',
          message_content: 'Older question',
          message_created_at: CREATED_AT,
        }),
      ],
      error: null,
    })

    const result = await getConversation({ conversationId: CONVERSATION_ID })

    expect(result).toMatchObject({
      status: 'ready',
      messages: [
        { id: MESSAGE_ONE, content: 'Older question' },
        { id: MESSAGE_TWO, content: 'Newer answer' },
      ],
      nextCursor: {
        beforeCreatedAt: CREATED_AT,
        beforeId: MESSAGE_ONE,
      },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('get_chatbot_conversation_page', {
      p_conversation_id: CONVERSATION_ID,
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 50,
    })
  })

  it('keeps not-found distinct and treats malformed detail shapes as unavailable', async () => {
    mocks.abortSignal.mockResolvedValueOnce({
      data: [{
        status: 'not_found',
        conversation_id: null,
        title: null,
        conversation_created_at: null,
        conversation_updated_at: null,
        revision: null,
        message_id: null,
        message_role: null,
        message_content: null,
        message_created_at: null,
        chart_config: null,
        follow_up_questions: null,
        data_used: null,
        has_more: false,
      }],
      error: null,
    })
    await expect(getConversation(CONVERSATION_ID)).resolves.toEqual({
      status: 'not_found',
      conversation: null,
      messages: null,
      nextCursor: null,
    })

    mocks.abortSignal.mockResolvedValueOnce({
      data: [{
        status: 'overflow',
        conversation_id: null,
        title: null,
        conversation_created_at: null,
        conversation_updated_at: null,
        revision: null,
        message_id: null,
        message_role: null,
        message_content: null,
        message_created_at: null,
        chart_config: null,
        follow_up_questions: null,
        data_used: null,
        has_more: false,
      }],
      error: null,
    })
    await expect(getConversation(CONVERSATION_ID)).resolves.toMatchObject({
      status: 'overflow',
      messages: null,
    })

    mocks.abortSignal.mockResolvedValueOnce({
      data: [detailRow({ message_role: 'system' })],
      error: null,
    })
    await expect(getConversation(CONVERSATION_ID)).resolves.toMatchObject({
      status: 'unavailable',
    })
  })
})
