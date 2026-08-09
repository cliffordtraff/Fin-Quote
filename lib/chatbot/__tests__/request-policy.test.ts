import { describe, expect, it, vi } from 'vitest'
import {
  ChatbotRequestTooLargeError,
  ChatbotRequestValidationError,
  parseChatbotRequestPayload,
  readChatbotRequest,
} from '@/lib/chatbot/request-policy'
import {
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_QUESTION_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
} from '@/lib/chatbot/constants'
import {
  CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS,
  CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS,
  createChatbotIdempotencyKey,
} from '@/lib/chatbot/idempotency-key'

const TEST_UUID = '00000000-0000-4000-8000-000000000001'

function currentKey(): string {
  return createChatbotIdempotencyKey(Date.now(), TEST_UUID)
}

function keyAt(issuedAt: number): string {
  return `c1.${Math.trunc(issuedAt)}.${TEST_UUID}`
}

function streamingRequest(
  stream: ReadableStream<Uint8Array>,
  options?: { signal?: AbortSignal; contentLength?: string },
): Request {
  return new Request('https://theintraday.com/api/ask', {
    method: 'POST',
    body: stream,
    signal: options?.signal,
    headers: options?.contentLength
      ? { 'Content-Length': options.contentLength }
      : undefined,
    // Required by Node's fetch implementation for a streaming request body.
    duplex: 'half',
  } as RequestInit)
}

describe('chatbot request policy', () => {
  it('normalizes prompt fields and strips rich client-only message data', () => {
    const result = parseChatbotRequestPayload({
      idempotencyKey: currentKey(),
      question: '  How did revenue change?  ',
      conversationHistory: [
        {
          role: 'assistant',
          content: '  Revenue increased.  ',
          timestamp: '2026-08-03T12:00:00.000Z',
          chartConfig: { series: ['large client object'] },
          dataUsed: { data: Array.from({ length: 500 }, () => ({ value: 1 })) },
        },
      ],
      sessionId: 'session_123-abc',
    })

    expect(result.question).toBe('How did revenue change?')
    expect(result.conversationHistory).toEqual([
      {
        role: 'assistant',
        content: 'Revenue increased.',
        timestamp: '2026-08-03T12:00:00.000Z',
      },
    ])
  })

  it.each([
    {
      name: 'an oversized question',
      payload: { question: 'q'.repeat(MAX_CHAT_QUESTION_LENGTH + 1) },
    },
    {
      name: 'too many history messages',
      payload: {
        question: 'Question',
        conversationHistory: Array.from(
          { length: MAX_CHAT_HISTORY_MESSAGES + 1 },
          () => ({ role: 'user', content: 'Earlier question' }),
        ),
      },
    },
    {
      name: 'too much total history text',
      payload: {
        question: 'Question',
        conversationHistory: Array.from({ length: 7 }, () => ({
          role: 'assistant',
          content: 'x'.repeat(Math.floor(MAX_CHAT_HISTORY_TOTAL_LENGTH / 7) + 1),
        })),
      },
    },
    {
      name: 'an invalid session identifier',
      payload: { question: 'Question', sessionId: '<script>' },
    },
    {
      name: 'a question containing PostgreSQL NUL',
      payload: { question: 'Question\u0000' },
    },
    {
      name: 'a question containing an unpaired high surrogate',
      payload: { question: `Question${String.fromCharCode(0xd800)}` },
    },
    {
      name: 'history containing an unpaired low surrogate',
      payload: {
        question: 'Question',
        conversationHistory: [{
          role: 'assistant',
          content: `Answer${String.fromCharCode(0xdc00)}`,
        }],
      },
    },
  ])('rejects $name', ({ payload }) => {
    expect(() => parseChatbotRequestPayload({
      idempotencyKey: currentKey(),
      ...payload,
    })).toThrow(
      ChatbotRequestValidationError,
    )
  })

  it.each([
    ['legacy shape', 'legacy-uuid'],
    [
      'expired timestamp',
      keyAt(Date.now() - CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS - 1),
    ],
    [
      'future timestamp',
      keyAt(Date.now() + CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS + 60_000),
    ],
  ])('rejects an idempotency key with %s', (_name, idempotencyKey) => {
    expect(() => parseChatbotRequestPayload({
      question: 'Question',
      idempotencyKey,
    })).toThrow(ChatbotRequestValidationError)
  })

  it('caps the body while streaming even when Content-Length lies', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_CHAT_REQUEST_BYTES + 1))
      },
      cancel,
    })

    await expect(readChatbotRequest(streamingRequest(stream, {
      contentLength: '1',
    }))).rejects.toBeInstanceOf(ChatbotRequestTooLargeError)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('cancels a pending body read when the caller disconnects', async () => {
    const cancel = vi.fn()
    const caller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => undefined),
      cancel,
    })

    const read = readChatbotRequest(streamingRequest(stream, {
      signal: caller.signal,
    }))
    await Promise.resolve()
    caller.abort(new DOMException('browser disconnected', 'AbortError'))

    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
