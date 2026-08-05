import 'server-only'

import { z } from 'zod'
import {
  MAX_CHAT_HISTORY_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_QUESTION_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
  MAX_CHAT_SESSION_ID_LENGTH,
} from './constants'

const historyMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(MAX_CHAT_HISTORY_MESSAGE_LENGTH),
    timestamp: z.string().max(64).optional(),
  })
  .strip()

export const chatbotRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_CHAT_QUESTION_LENGTH),
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
  })
  .strict()

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

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_CHAT_REQUEST_BYTES) {
    throw new ChatbotRequestTooLargeError()
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new ChatbotRequestValidationError('Request body must be valid JSON.')
  }

  return parseChatbotRequestPayload(payload)
}
