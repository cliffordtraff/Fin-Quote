import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_CHAT_HISTORY_MESSAGES, MAX_CHAT_QUESTION_LENGTH, MAX_CHAT_REQUEST_BYTES } from '@/lib/chatbot/constants'

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createResponse: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/current-user')>()
  return { ...actual, requireCurrentUser: mocks.requireCurrentUser }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mocks.createResponse }
  },
}))

import { POST } from '@/app/api/ask/route'
import { AuthenticationRequiredError } from '@/lib/auth/current-user'

const originalFlag = process.env.NEXT_PUBLIC_ENABLE_CHAT

function request(body: unknown) {
  return new NextRequest('https://theintraday.com/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_ENABLE_CHAT = 'true'
  mocks.requireCurrentUser.mockResolvedValue({ id: 'user-1' })
})

afterAll(() => {
  if (originalFlag === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_CHAT
  } else {
    process.env.NEXT_PUBLIC_ENABLE_CHAT = originalFlag
  }
})

describe('chatbot streaming route spend boundary', () => {
  it('fails closed when the server-side feature flag is disabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CHAT = 'false'

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(404)
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('requires authentication before reading data or calling OpenAI', async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthenticationRequiredError())

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(401)
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'an oversized question',
      body: { question: 'q'.repeat(MAX_CHAT_QUESTION_LENGTH + 1) },
      status: 400,
    },
    {
      name: 'too many history messages',
      body: {
        question: 'Question',
        conversationHistory: Array.from(
          { length: MAX_CHAT_HISTORY_MESSAGES + 1 },
          () => ({ role: 'user', content: 'Earlier question' }),
        ),
      },
      status: 400,
    },
    {
      name: 'an invalid session identifier',
      body: { question: 'Question', sessionId: '../../other-user' },
      status: 400,
    },
    {
      name: 'an oversized request body',
      body: {
        question: 'Question',
        padding: 'x'.repeat(MAX_CHAT_REQUEST_BYTES),
      },
      status: 413,
    },
  ])('rejects $name before OpenAI is called', async ({ body, status }) => {
    const response = await POST(request(body))

    expect(response.status).toBe(status)
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })
})
