import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHATBOT_AUTH_DEADLINE_MS,
  CHATBOT_EXPECTED_USER_HEADER,
  CHATBOT_MINIMUM_AUTH_VALIDITY_SECONDS,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_QUESTION_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
} from '@/lib/chatbot/constants'
import {
  CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS,
  CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS,
  createChatbotIdempotencyKey,
} from '@/lib/chatbot/idempotency-key'

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createResponse: vi.fn(),
  createServerClient: vi.fn(),
  validateAnswer: vi.fn(),
  logQuery: vi.fn(),
  acquireDurableAdmission: vi.fn(),
  failDurableAdmission: vi.fn(),
  resolveDurableAdmission: vi.fn(),
  completeTurnAndRequest: vi.fn(),
  getFinancialMetrics: vi.fn(),
  listMetrics: vi.fn(),
  preflightConversationTarget: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/current-user')>()
  return {
    ...actual,
    requireCurrentUserContext: async (options?: {
      signal?: AbortSignal
      minimumValiditySeconds?: number
    }) => {
      const user = await mocks.requireCurrentUser(options)
      return { client: await mocks.createServerClient(), user }
    },
  }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mocks.createResponse }
  },
}))

vi.mock('@/lib/supabase/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/server')>(),
  createServerClient: mocks.createServerClient,
}))

vi.mock('@/lib/validators', () => ({
  validateAnswer: mocks.validateAnswer,
}))

vi.mock('@/lib/query-logs', () => ({
  logQuery: mocks.logQuery,
}))

vi.mock('@/app/actions/get-financial-metric', () => ({
  getFinancialMetrics: mocks.getFinancialMetrics,
}))

vi.mock('@/app/actions/list-metrics', () => ({
  listMetrics: mocks.listMetrics,
}))

vi.mock('@/lib/chatbot/durable-admission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/chatbot/durable-admission')>()
  return {
    ...actual,
    acquireDurableChatbotAdmission: mocks.acquireDurableAdmission,
    failDurableChatbotAdmission: mocks.failDurableAdmission,
    resolveDurableChatbotAdmission: mocks.resolveDurableAdmission,
  }
})

vi.mock('@/lib/chatbot/complete-turn', () => ({
  completeChatbotTurnAndRequest: mocks.completeTurnAndRequest,
}))

vi.mock('@/lib/chatbot/target-preflight', () => ({
  preflightChatbotConversationTarget: mocks.preflightConversationTarget,
}))

import { POST } from '@/app/api/ask/route'
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
} from '@/lib/auth/current-user'
import {
  CHATBOT_PHYSICAL_MAX,
  CHATBOT_REQUEST_DEADLINE_MS,
  getChatbotAdmissionStateForTests,
  reserveChatbotRequest,
  resetChatbotAdmissionForTests,
} from '@/lib/chatbot/admission'
import { chatbotBackgroundWorkTestOnly } from '@/lib/chatbot/background-work'

const originalFlag = process.env.NEXT_PUBLIC_ENABLE_CHAT
let requestSequence = 0
let registeredBackgroundTasks: Promise<void>[] = []

function requestUuid(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

function keyAt(issuedAt: number, sequence = 999_999): string {
  return `c1.${Math.trunc(issuedAt)}.${requestUuid(sequence)}`
}

function request(body: unknown, options?: {
  signal?: AbortSignal
  headers?: Record<string, string>
  expectedUserId?: string
}) {
  requestSequence += 1
  const boundedBody = body && typeof body === 'object' && !Array.isArray(body)
    ? {
        idempotencyKey: createChatbotIdempotencyKey(
          Date.now(),
          requestUuid(requestSequence),
        ),
        ...body,
      }
    : body
  return new NextRequest('https://theintraday.com/api/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [CHATBOT_EXPECTED_USER_HEADER]: options?.expectedUserId ?? 'user-1',
      ...options?.headers,
    },
    body: JSON.stringify(boundedBody),
    signal: options?.signal,
  })
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  resetChatbotAdmissionForTests()
  vi.clearAllMocks()
  requestSequence = 0
  registeredBackgroundTasks = []
  chatbotBackgroundWorkTestOnly.setRegistrar(task => {
    registeredBackgroundTasks.push(task)
  })
  process.env.NEXT_PUBLIC_ENABLE_CHAT = 'true'
  mocks.requireCurrentUser.mockResolvedValue({ id: 'user-1' })
  mocks.createServerClient.mockResolvedValue({})
  mocks.validateAnswer.mockResolvedValue({
    number_validation: { status: 'pass' },
    year_validation: { status: 'pass' },
    filing_validation: { status: 'pass' },
    overall_passed: true,
    overall_severity: 'none',
    latency_ms: 1,
  })
  mocks.logQuery.mockResolvedValue('query-log-1')
  mocks.acquireDurableAdmission.mockResolvedValue({
    disposition: 'acquired',
    leaseToken: '00000000-0000-4000-8000-000000000001',
    retryAfterSeconds: 90,
    conversationId: null,
    revision: null,
  })
  mocks.failDurableAdmission.mockResolvedValue('failed')
  mocks.resolveDurableAdmission.mockResolvedValue({
    disposition: 'failed',
    conversationId: null,
    revision: null,
  })
  mocks.completeTurnAndRequest.mockResolvedValue({
    status: 'ready',
    disposition: 'applied',
    conversationId: '00000000-0000-4000-8000-000000000010',
    revision: 1,
    title: 'Question',
    updatedAt: '2026-08-09T12:00:00.000Z',
    userMessageId: '00000000-0000-4000-8000-000000000011',
    assistantMessageId: '00000000-0000-4000-8000-000000000012',
  })
  mocks.getFinancialMetrics.mockResolvedValue({
    data: [],
    error: null,
  })
  mocks.listMetrics.mockResolvedValue({ data: [], error: null })
  mocks.preflightConversationTarget.mockResolvedValue({ status: 'ready' })
})

afterEach(() => {
  chatbotBackgroundWorkTestOnly.setRegistrar(null)
})

afterEach(() => {
  resetChatbotAdmissionForTests()
  vi.useRealTimers()
})

afterAll(() => {
  if (originalFlag === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_CHAT
  } else {
    process.env.NEXT_PUBLIC_ENABLE_CHAT = originalFlag
  }
})

describe('chatbot streaming route spend boundary', () => {
  it.each([
    {
      name: 'a foreign Origin without fetch metadata',
      headers: { Origin: 'https://charts.theintraday.com' },
    },
    {
      name: 'same-site fetch metadata even with the application Origin',
      headers: {
        Origin: 'https://theintraday.com',
        'Sec-Fetch-Site': 'same-site',
      },
    },
  ])('rejects $name before auth or body reading', async ({ headers }) => {
    const bodyAccess = vi.fn(() => {
      throw new Error('body should not be touched')
    })
    const crossOriginRequest = {
      url: 'https://theintraday.com/api/ask',
      headers: new Headers(headers as Record<string, string>),
      signal: new AbortController().signal,
      get body() {
        return bodyAccess()
      },
    } as unknown as NextRequest

    const response = await POST(crossOriginRequest)

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled()
    expect(bodyAccess).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

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

  it('requires a browser refresh before spend when the bearer cannot outlive the route', async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new AuthenticationRequiredError(undefined, 'expiring'),
    )

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('retry-after')).toBe('1')
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_AUTH_REFRESH_REQUIRED',
    })
    expect(mocks.requireCurrentUser).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      minimumValiditySeconds: CHATBOT_MINIMUM_AUTH_VALIDITY_SECONDS,
    })
    expect(mocks.acquireDurableAdmission).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('rejects a stale displayed principal before body, admission, model, or persistence', async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: 'user-b' })
    const bodyAccess = vi.fn(() => {
      throw new Error('body should not be touched')
    })
    const stalePrincipalRequest = {
      url: 'https://theintraday.com/api/ask',
      headers: new Headers({
        Origin: 'https://theintraday.com',
        'Sec-Fetch-Site': 'same-origin',
        [CHATBOT_EXPECTED_USER_HEADER]: 'user-a',
      }),
      signal: new AbortController().signal,
      get body() {
        return bodyAccess()
      },
    } as unknown as NextRequest

    const response = await POST(stalePrincipalRequest)

    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_PRINCIPAL_MISMATCH',
    })
    expect(bodyAccess).not.toHaveBeenCalled()
    expect(mocks.acquireDurableAdmission).not.toHaveBeenCalled()
    expect(mocks.preflightConversationTarget).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
    expect(mocks.completeTurnAndRequest).not.toHaveBeenCalled()
  })

  it('treats auth verification failure as retryable unavailability before body work', async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthenticationUnavailableError())

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('2')
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_AUTH_UNAVAILABLE',
    })
    expect(mocks.acquireDurableAdmission).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('bounds authentication before body admission or model work', async () => {
    vi.useFakeTimers()
    let authSignal: AbortSignal | undefined
    mocks.requireCurrentUser.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal } = {}) => new Promise((_resolve, reject) => {
        authSignal = signal
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    )

    const pendingResponse = POST(request({ question: 'How is AAPL doing?' }))
    await Promise.resolve()
    expect(authSignal).toBeInstanceOf(AbortSignal)
    expect(authSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(CHATBOT_AUTH_DEADLINE_MS)
    const response = await pendingResponse

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('retry-after')).toBe('2')
    expect(authSignal?.aborted).toBe(true)
    expect(mocks.acquireDurableAdmission).not.toHaveBeenCalled()
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
      name: 'a PostgreSQL-invalid NUL question',
      body: { question: 'Question\u0000' },
      status: 400,
    },
    {
      name: 'PostgreSQL-invalid surrogate history',
      body: {
        question: 'Question',
        conversationHistory: [{
          role: 'assistant',
          content: `Answer${String.fromCharCode(0xd800)}`,
        }],
      },
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
    {
      name: 'a malformed idempotency key',
      body: { question: 'Question', idempotencyKey: 'legacy-key' },
      status: 400,
    },
    {
      name: 'an expired idempotency key',
      body: {
        question: 'Question',
        idempotencyKey: keyAt(
          Date.now() - CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS - 1,
        ),
      },
      status: 400,
    },
    {
      name: 'an implausibly future idempotency key',
      body: {
        question: 'Question',
        idempotencyKey: keyAt(
          Date.now() + CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS + 60_000,
        ),
      },
      status: 400,
    },
  ])('rejects $name before OpenAI is called', async ({ body, status }) => {
    const response = await POST(request(body))

    expect(response.status).toBe(status)
    expect(mocks.acquireDurableAdmission).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('fails closed before local admission or OpenAI when durable authority is unavailable', async () => {
    const { ChatbotDurableAdmissionUnavailableError } = await import(
      '@/lib/chatbot/durable-admission'
    )
    mocks.acquireDurableAdmission.mockRejectedValue(
      new ChatbotDurableAdmissionUnavailableError(),
    )

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_ADMISSION_UNAVAILABLE',
    })
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('fails a same-key physical-attempt exhaustion before local or paid work', async () => {
    mocks.acquireDurableAdmission.mockResolvedValueOnce({
      disposition: 'attempts_exhausted',
      leaseToken: null,
      retryAfterSeconds: 0,
      conversationId: null,
      revision: null,
    })

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_RETRY_EXHAUSTED',
    })
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
    expect(mocks.preflightConversationTarget).not.toHaveBeenCalled()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404, 'CHATBOT_CONVERSATION_NOT_FOUND'],
    ['revision_conflict', 409, 'CHATBOT_REVISION_CONFLICT'],
    ['conversation_quota', 429, 'CHATBOT_CONVERSATION_QUOTA'],
    ['message_quota', 429, 'CHATBOT_MESSAGE_QUOTA'],
    ['command_quota', 429, 'CHATBOT_COMMAND_QUOTA'],
    ['unavailable', 503, 'CHATBOT_CONVERSATION_UNAVAILABLE'],
  ] as const)(
    'rejects %s conversation preflight before local or paid work',
    async (status, httpStatus, code) => {
      mocks.preflightConversationTarget.mockResolvedValueOnce({ status })

      const response = await POST(request({
        question: 'Continue this conversation',
        conversationId: '00000000-0000-4000-8000-000000000020',
        expectedRevision: 2,
      }))

      expect(response.status).toBe(httpStatus)
      await expect(response.json()).resolves.toMatchObject({ code })
      expect(mocks.failDurableAdmission).toHaveBeenCalledOnce()
      expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
      expect(mocks.createResponse).not.toHaveBeenCalled()
    },
  )

  it('returns typed 429 before OpenAI for a second request from one account', async () => {
    reserveChatbotRequest('user-1')

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_SCOPE_BUSY',
    })
    expect(response.headers.get('retry-after')).toBeTruthy()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('returns typed 503 before OpenAI for a fifth global request', async () => {
    for (let index = 0; index < CHATBOT_PHYSICAL_MAX; index += 1) {
      reserveChatbotRequest(`occupied-${index}`)
    }
    mocks.requireCurrentUser.mockResolvedValue({ id: 'overflow-user' })

    const response = await POST(request(
      { question: 'How is AAPL doing?' },
      { expectedUserId: 'overflow-user' },
    ))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_CAPACITY',
    })
    expect(response.headers.get('retry-after')).toBeTruthy()
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('returns typed 504 while timed-out physical work is still stopping', async () => {
    vi.useFakeTimers()
    const physical = deferred()
    const lease = reserveChatbotRequest('user-1')
    void lease.start(async () => {
      await physical.promise
    })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(CHATBOT_REQUEST_DEADLINE_MS)

    const response = await POST(request({ question: 'How is AAPL doing?' }))

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CHATBOT_TIMEOUT',
    })
    expect(response.headers.get('retry-after')).toBeTruthy()
    expect(mocks.createResponse).not.toHaveBeenCalled()

    physical.resolve()
    await lease.physicalCompletion
  })

  it('consumer cancellation aborts owned work without releasing its physical slot early', async () => {
    const model = deferred<Record<string, unknown>>()
    let ownedSignal: AbortSignal | undefined
    mocks.createResponse.mockImplementationOnce(
      (_body: unknown, options?: { signal?: AbortSignal }) => {
        ownedSignal = options?.signal
        return model.promise
      },
    )

    const response = await POST(request({ question: 'How is AAPL doing?' }))
    const reader = response.body!.getReader()
    await Promise.resolve()
    expect(registeredBackgroundTasks).toHaveLength(1)
    await reader.cancel('browser stopped reading')

    expect(ownedSignal?.aborted).toBe(true)
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(1)

    const retry = await POST(request({ question: 'Try again' }))
    expect(retry.status).toBe(429)
    expect(mocks.createResponse).toHaveBeenCalledOnce()
    expect(mocks.logQuery).not.toHaveBeenCalled()

    model.resolve({ output_text: '{"tool":"listMetrics","args":{}}' })
    await vi.waitFor(() => {
      expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
    })
    expect(mocks.createResponse).toHaveBeenCalledOnce()
    expect(mocks.logQuery).not.toHaveBeenCalled()
  })

  it('request abort stops follow-up model and telemetry work', async () => {
    const caller = new AbortController()
    let ownedSignal: AbortSignal | undefined
    mocks.createResponse.mockImplementationOnce(
      async (_body: unknown, options?: { signal?: AbortSignal }) => {
        ownedSignal = options?.signal
        caller.abort(new DOMException('browser disconnected', 'AbortError'))
        return { output_text: '{"tool":"listMetrics","args":{}}' }
      },
    )

    const response = await POST(request(
      { question: 'How is AAPL doing?' },
      { signal: caller.signal },
    ))
    await response.text()

    expect(ownedSignal?.aborted).toBe(true)
    expect(mocks.createResponse).toHaveBeenCalledOnce()
    expect(mocks.logQuery).not.toHaveBeenCalled()
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('request abort detaches the stream while abort-ignoring work retains capacity', async () => {
    const caller = new AbortController()
    const model = deferred<Record<string, unknown>>()
    let ownedSignal: AbortSignal | undefined
    mocks.createResponse.mockImplementationOnce(
      (_body: unknown, options?: { signal?: AbortSignal }) => {
        ownedSignal = options?.signal
        return model.promise
      },
    )

    const response = await POST(request(
      { question: 'How is AAPL doing?' },
      { signal: caller.signal },
    ))
    await vi.waitFor(() => expect(mocks.createResponse).toHaveBeenCalledOnce())
    caller.abort(new DOMException('browser disconnected', 'AbortError'))

    const detachedBody = await response.text()
    expect(detachedBody).not.toContain('event: complete')
    expect(detachedBody).not.toContain('event: answer')
    expect(ownedSignal?.aborted).toBe(true)
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(1)
    expect(mocks.logQuery).not.toHaveBeenCalled()

    model.resolve({ output_text: '{"tool":"listMetrics","args":{}}' })
    await vi.waitFor(() => {
      expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
    })
    expect(mocks.createResponse).toHaveBeenCalledOnce()
    expect(mocks.logQuery).not.toHaveBeenCalled()
  })

  it('uses one owned signal for every model call and telemetry write', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: 'Available metrics.' }
    }
    mocks.createResponse
      .mockResolvedValueOnce({
        output_text: '{"tool":"listMetrics","args":{}}',
      })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({
        output_text: '{"suggestions":["Show valuation metrics?"]}',
      })

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('event: complete')
    expect(mocks.createResponse).toHaveBeenCalledTimes(3)
    const signals = mocks.createResponse.mock.calls.map((call) => call[1]?.signal)
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true)
    expect(new Set(signals).size).toBe(1)
    expect(mocks.logQuery).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      { signal: signals[0] },
    )
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('normalizes PostgreSQL-invalid answer units before streaming and commit', async () => {
    const invalidDelta =
      `A\u0000${String.fromCharCode(0xd800)}B${String.fromCharCode(0xdc00)}C🚀`
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: invalidDelta }
    }
    mocks.createResponse
      .mockResolvedValueOnce({
        output_text: '{"tool":"listMetrics","args":{}}',
      })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({ output_text: '{"suggestions":[]}' })

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('A��B�C🚀')
    expect(body).not.toContain('\u0000')
    expect(mocks.completeTurnAndRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assistantContent: 'A��B�C🚀' }),
    )
  })

  it('rejects a multibyte answer at the persisted UTF-8 byte ceiling', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: '🚀'.repeat(8_193) }
    }
    mocks.createResponse
      .mockResolvedValueOnce({
        output_text: '{"tool":"listMetrics","args":{}}',
      })
      .mockResolvedValueOnce(answerStream())

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('event: error')
    expect(body).not.toContain('event: complete')
    expect(mocks.completeTurnAndRequest).not.toHaveBeenCalled()
  })

  it('rejects oversized retained tool metadata before answer generation', async () => {
    mocks.createResponse.mockResolvedValueOnce({
      output_text: '{"tool":"listMetrics","args":{}}',
    })
    mocks.listMetrics.mockResolvedValueOnce({
      data: [{ payload: 'x'.repeat(260 * 1024) }],
      error: null,
    })

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('event: error')
    expect(mocks.createResponse).toHaveBeenCalledOnce()
    expect(mocks.completeTurnAndRequest).not.toHaveBeenCalled()
  })

  it('returns a durable completed pointer without starting model work', async () => {
    mocks.acquireDurableAdmission.mockResolvedValueOnce({
      disposition: 'completed',
      leaseToken: null,
      retryAfterSeconds: 0,
      conversationId: '00000000-0000-4000-8000-000000000010',
      revision: 4,
    })

    const response = await POST(request({ question: 'Recover my answer' }))
    const body = await response.text()

    expect(body).toContain('event: complete')
    expect(body).toContain('"replayed":true')
    expect(body).toContain('"revision":4')
    expect(mocks.createResponse).not.toHaveBeenCalled()
  })

  it('recovers a lost terminal with the same key without a second model run', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: 'Available metrics.' }
    }
    mocks.createResponse
      .mockResolvedValueOnce({
        output_text: '{"tool":"listMetrics","args":{}}',
      })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({ output_text: '{"suggestions":[]}' })
    const idempotencyKey = createChatbotIdempotencyKey(
      Date.now(),
      '00000000-0000-4000-8000-000000000099',
    )
    const body = { question: 'What metrics are available?', idempotencyKey }

    // Simulate a browser losing the response without consuming its terminal.
    await POST(request(body))
    await vi.waitFor(() => expect(mocks.completeTurnAndRequest).toHaveBeenCalledOnce())
    mocks.acquireDurableAdmission.mockResolvedValueOnce({
      disposition: 'completed',
      leaseToken: null,
      retryAfterSeconds: 0,
      conversationId: '00000000-0000-4000-8000-000000000010',
      revision: 1,
    })

    const replay = await POST(request(body))
    expect(await replay.text()).toContain('"replayed":true')
    expect(mocks.createResponse).toHaveBeenCalledTimes(3)
    expect(mocks.completeTurnAndRequest).toHaveBeenCalledOnce()
  })

  it.each([
    { name: 'the model-selected ticker', selectedSymbol: 'MSFT', expected: 'MSFT' },
    { name: 'the legacy fallback', selectedSymbol: undefined, expected: 'AAPL' },
  ])('uses $name for both metric loading and answer-year validation', async ({
    selectedSymbol,
    expected,
  }) => {
    async function* answerStream() {
      yield {
        type: 'response.output_text.delta',
        delta: `${expected} had a P/E observation in 2025.`,
      }
    }
    const selection = {
      tool: 'getFinancialMetric',
      args: {
        metricNames: ['P/E'],
        period: 'annual',
        limit: 1,
        ...(selectedSymbol ? { symbol: selectedSymbol } : {}),
      },
    }
    mocks.createResponse
      .mockResolvedValueOnce({ output_text: JSON.stringify(selection) })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({ output_text: '{"suggestions":[]}' })
    mocks.getFinancialMetrics.mockResolvedValue({
      data: [{
        year: 2025,
        metric_name: 'peRatio',
        metric_value: 20,
        metric_category: null,
        data_source: 'FMP:key-metrics',
        period_type: 'annual',
        fiscal_quarter: null,
        fiscal_label: null,
      }],
      error: null,
    })

    const validationResult = { data: [{ year: 2025 }], error: null }
    const validationQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(),
      abortSignal: vi.fn(),
      then: vi.fn((
        onFulfilled: (value: typeof validationResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(validationResult).then(onFulfilled, onRejected)),
    }
    for (const method of [
      validationQuery.select,
      validationQuery.eq,
      validationQuery.limit,
      validationQuery.abortSignal,
    ]) {
      method.mockReturnValue(validationQuery)
    }
    mocks.createServerClient.mockResolvedValue({
      from: vi.fn(() => validationQuery),
    })
    mocks.validateAnswer.mockImplementationOnce(async (
      _answer: string,
      _data: unknown[],
      checkYearInDatabase: (year: number) => Promise<boolean>,
    ) => {
      expect(await checkYearInDatabase(2025)).toBe(true)
      return {
        number_validation: { status: 'pass' },
        year_validation: { status: 'pass' },
        filing_validation: { status: 'pass' },
        overall_passed: true,
        overall_severity: 'none',
        latency_ms: 1,
      }
    })

    const response = await POST(request({ question: `What is ${expected}'s P/E?` }))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('event: complete')
    expect(mocks.getFinancialMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: expected }),
      { signal: expect.any(AbortSignal) },
    )
    expect(validationQuery.eq).toHaveBeenCalledWith('symbol', expected)
    expect(mocks.completeTurnAndRequest).toHaveBeenCalledOnce()
  })

  it('never emits terminal success when atomic turn completion is uncertain', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: 'Available metrics.' }
    }
    mocks.createResponse
      .mockResolvedValueOnce({
        output_text: '{"tool":"listMetrics","args":{}}',
      })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({
        output_text: '{"suggestions":[]}',
      })
    mocks.completeTurnAndRequest.mockResolvedValue({
      status: 'unavailable',
      error: 'Conversation storage is temporarily unavailable.',
    })

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('event: error')
    expect(body).not.toContain('event: complete')
    expect(mocks.completeTurnAndRequest).toHaveBeenCalledOnce()
    expect(mocks.failDurableAdmission).toHaveBeenCalledOnce()
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('recovers completed pointer when combo committed but its response was lost', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: 'Available metrics.' }
    }
    mocks.createResponse
      .mockResolvedValueOnce({ output_text: '{"tool":"listMetrics","args":{}}' })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({ output_text: '{"suggestions":[]}' })
    mocks.completeTurnAndRequest.mockResolvedValueOnce({
      status: 'unavailable',
      error: 'Completion response was lost.',
    })
    mocks.failDurableAdmission.mockResolvedValueOnce('fence_lost')
    mocks.resolveDurableAdmission.mockResolvedValueOnce({
      disposition: 'completed',
      conversationId: '00000000-0000-4000-8000-000000000010',
      revision: 1,
    })

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('event: complete')
    expect(body).toContain('"replayed":true')
    expect(body).not.toContain('CHATBOT_COMPLETION_UNCERTAIN')
  })

  it('marks an unresolved combo response retryable under the same key', async () => {
    async function* answerStream() {
      yield { type: 'response.output_text.delta', delta: 'Available metrics.' }
    }
    mocks.createResponse
      .mockResolvedValueOnce({ output_text: '{"tool":"listMetrics","args":{}}' })
      .mockResolvedValueOnce(answerStream())
      .mockResolvedValueOnce({ output_text: '{"suggestions":[]}' })
    mocks.completeTurnAndRequest.mockResolvedValueOnce({
      status: 'unavailable',
      error: 'Completion response was lost.',
    })
    mocks.failDurableAdmission.mockResolvedValueOnce('fence_lost')
    mocks.resolveDurableAdmission.mockRejectedValueOnce(new Error('lookup offline'))

    const response = await POST(request({ question: 'What metrics are available?' }))
    const body = await response.text()

    expect(body).toContain('CHATBOT_COMPLETION_UNCERTAIN')
    expect(body).toContain('"retryable":true')
    expect(body).not.toContain('event: complete')
  })
})
