import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createCompletion: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return {
    ...actual,
    requireAdminUser: mocks.requireAdminUser,
  }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.createCompletion,
      },
    }
  },
}))

import {
  maxDuration as analyzeMaxDuration,
  POST as analyze,
} from '@/app/api/evaluations/analyze/route'
import { POST as analyzeFeedback } from '@/app/api/evaluations/analyze-feedback/route'
import { AdminAccessError } from '@/lib/auth/admin'

const analysisBody = {
  question: 'What was Apple revenue?',
  question_id: 7,
  expected_tool: 'get_financials',
  expected_args: { symbol: 'AAPL' },
  actual_tool: 'get_financials',
  actual_args: { symbol: 'MSFT' },
  tool_match: true,
}

const feedbackBody = {
  ...analysisBody,
  initial_analysis: 'The golden test is correct.',
  user_disagreement: 'Both symbols are acceptable in this fixture.',
}

function postRequest(path: string, body: unknown) {
  return new NextRequest(`https://finquote.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdminUser.mockResolvedValue({
    user: { id: 'admin-user-1' },
    isAdmin: true,
    adminConfigured: true,
  })
  mocks.createCompletion.mockResolvedValue({
    choices: [{ message: { content: 'Model analysis' } }],
  })
})

describe('evaluation AI route authorization', () => {
  it('rejects unauthenticated analysis requests before invoking OpenAI', async () => {
    mocks.requireAdminUser.mockRejectedValue(
      new AdminAccessError(
        'You must be signed in to access this admin feature.',
      ),
    )

    const response = await analyze(
      postRequest('/api/evaluations/analyze', analysisBody),
    )

    expect(response.status).toBe(401)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })

  it('rejects signed-in non-admin analysis requests', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())

    const response = await analyze(
      postRequest('/api/evaluations/analyze', analysisBody),
    )

    expect(response.status).toBe(403)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })

  it('rejects non-admin feedback requests before invoking OpenAI', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())

    const response = await analyzeFeedback(
      postRequest('/api/evaluations/analyze-feedback', feedbackBody),
    )

    expect(response.status).toBe(403)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })
})

describe('evaluation AI request limits', () => {
  it('uses a bounded serverless execution budget', () => {
    expect(analyzeMaxDuration).toBe(60)
  })

  it('accepts a valid admin analysis request', async () => {
    const response = await analyze(
      postRequest('/api/evaluations/analyze', analysisBody),
    )

    expect(response.status).toBe(200)
    expect(mocks.requireAdminUser).toHaveBeenCalledOnce()
    expect(mocks.createCompletion).toHaveBeenCalledOnce()
    await expect(response.json()).resolves.toEqual({
      analysis: 'Model analysis',
      question_id: 7,
    })
  })

  it('rejects batches larger than 20 questions', async () => {
    const response = await analyze(
      postRequest('/api/evaluations/analyze', {
        questions: Array.from(
          { length: 21 },
          (_, questionId) => ({
            ...analysisBody,
            question_id: questionId,
          }),
        ),
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })

  it('rejects request bodies larger than 256 KiB', async () => {
    const response = await analyze(
      postRequest('/api/evaluations/analyze', {
        ...analysisBody,
        question: 'x'.repeat(257 * 1024),
      }),
    )

    expect(response.status).toBe(413)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })

  it('rejects malformed feedback payloads', async () => {
    const response = await analyzeFeedback(
      postRequest('/api/evaluations/analyze-feedback', {
        ...feedbackBody,
        user_disagreement: '',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })
})
