import { describe, expect, it } from 'vitest'
import {
  ChatbotRequestValidationError,
  parseChatbotRequestPayload,
} from '@/lib/chatbot/request-policy'
import {
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_QUESTION_LENGTH,
} from '@/lib/chatbot/constants'

describe('chatbot request policy', () => {
  it('normalizes prompt fields and strips rich client-only message data', () => {
    const result = parseChatbotRequestPayload({
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
  ])('rejects $name', ({ payload }) => {
    expect(() => parseChatbotRequestPayload(payload)).toThrow(
      ChatbotRequestValidationError,
    )
  })
})
