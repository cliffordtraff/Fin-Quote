import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_CHAT_QUESTION_LENGTH } from '@/lib/chatbot/constants'

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

import { askQuestion } from '@/app/actions/ask-question'
import { AuthenticationRequiredError } from '@/lib/auth/current-user'

const originalFlag = process.env.NEXT_PUBLIC_ENABLE_CHAT

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_ENABLE_CHAT = 'true'
  mocks.requireCurrentUser.mockResolvedValue({ id: 'user-1' })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterAll(() => {
  vi.restoreAllMocks()
  if (originalFlag === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_CHAT
  } else {
    process.env.NEXT_PUBLIC_ENABLE_CHAT = originalFlag
  }
})

describe('legacy chatbot server action spend boundary', () => {
  it('fails closed when chat is disabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CHAT = 'false'

    const result = await askQuestion('How is AAPL doing?')

    expect(result.error).toBe('Chatbot is not available.')
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('requires authentication before calling OpenAI', async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthenticationRequiredError())

    const result = await askQuestion('How is AAPL doing?')

    expect(result.error).toBe('You must be signed in to continue.')
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('validates question limits before calling OpenAI', async () => {
    const result = await askQuestion('q'.repeat(MAX_CHAT_QUESTION_LENGTH + 1))

    expect(result.error).toMatch(/too big|less than or equal/i)
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })
})
