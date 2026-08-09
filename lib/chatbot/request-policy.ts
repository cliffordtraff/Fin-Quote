import 'server-only'

import { z } from 'zod'
import {
  MAX_CHAT_HISTORY_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_IDEMPOTENCY_KEY_LENGTH,
  MAX_CHAT_QUESTION_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
  MAX_CHAT_SESSION_ID_LENGTH,
} from './constants'
import { isCurrentChatbotIdempotencyKey } from './idempotency-key'
import { isPostgresSafeText } from './postgres-text'

const historyMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(MAX_CHAT_HISTORY_MESSAGE_LENGTH)
      .refine(isPostgresSafeText, 'Conversation history contains invalid text.'),
    timestamp: z.string().max(64).optional(),
  })
  .strip()

export const chatbotRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_CHAT_QUESTION_LENGTH)
      .refine(isPostgresSafeText, 'Question contains invalid text.'),
    conversationHistory: z
      .array(historyMessageSchema)
      .max(MAX_CHAT_HISTORY_MESSAGES)
      .default([])
      .refine(
        (messages) =>
          messages.reduce((total, message) => total + message.content.length, 0) <=
          MAX_CHAT_HISTORY_TOTAL_LENGTH,
        { message: 'Conversation history is too long.' },
      ),
    sessionId: z
      .string()
      .trim()
      .max(MAX_CHAT_SESSION_ID_LENGTH)
      .regex(/^[A-Za-z0-9._:-]*$/, 'Session ID contains invalid characters.')
      .default(''),
    idempotencyKey: z
      .string()
      .min(8)
      .max(MAX_CHAT_IDEMPOTENCY_KEY_LENGTH)
      .refine(
        key => isCurrentChatbotIdempotencyKey(key),
        'Idempotency key is invalid or outside the 30-day retry window.',
      ),
    conversationId: z.string().uuid().nullable().default(null),
    expectedRevision: z.number().int().min(0).default(0),
  })
  .strict()
  .refine(
    payload => payload.conversationId !== null || payload.expectedRevision === 0,
    { message: 'A new conversation must start at revision zero.' },
  )

export type ChatbotRequestPayload = z.infer<typeof chatbotRequestSchema>

export class ChatbotRequestValidationError extends Error {
  constructor(message = 'Invalid chatbot request.') {
    super(message)
    this.name = 'ChatbotRequestValidationError'
  }
}

export class ChatbotRequestTooLargeError extends Error {
  constructor() {
    super('Chatbot request is too large.')
    this.name = 'ChatbotRequestTooLargeError'
  }
}

function requestAbortReason(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException('The chatbot request was aborted.', 'AbortError')
}

async function readBoundedRequestBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let aborting = false
  const cancelReader = (reason: unknown) => {
    if (aborting) return
    aborting = true
    void reader.cancel(reason).catch(() => undefined)
  }
  const onAbort = () => cancelReader(requestAbortReason(request.signal))

  if (request.signal.aborted) {
    cancelReader(requestAbortReason(request.signal))
    throw requestAbortReason(request.signal)
  }
  request.signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      if (request.signal.aborted) throw requestAbortReason(request.signal)
      const { done, value } = await reader.read()
      if (request.signal.aborted) throw requestAbortReason(request.signal)
      if (done) break
      if (!value || value.byteLength === 0) continue

      totalBytes += value.byteLength
      if (totalBytes > MAX_CHAT_REQUEST_BYTES) {
        cancelReader(new ChatbotRequestTooLargeError())
        throw new ChatbotRequestTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    request.signal.removeEventListener('abort', onAbort)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

export function isChatbotEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true'
}

export function parseChatbotRequestPayload(input: unknown): ChatbotRequestPayload {
  const result = chatbotRequestSchema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues[0]?.message || 'Invalid chatbot request.'
    throw new ChatbotRequestValidationError(message)
  }
  return result.data
}

export async function readChatbotRequest(request: Request): Promise<ChatbotRequestPayload> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_REQUEST_BYTES) {
    throw new ChatbotRequestTooLargeError()
  }

  let rawBody: string
  try {
    rawBody = await readBoundedRequestBody(request)
  } catch (error) {
    if (error instanceof ChatbotRequestTooLargeError) throw error
    if (request.signal.aborted) throw requestAbortReason(request.signal)
    throw new ChatbotRequestValidationError('Request body must be valid UTF-8.')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new ChatbotRequestValidationError('Request body must be valid JSON.')
  }

  return parseChatbotRequestPayload(payload)
}
