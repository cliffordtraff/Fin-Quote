import {
  MAX_CHAT_HISTORY_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_HISTORY_TOTAL_LENGTH,
  MAX_CHAT_REQUEST_BYTES,
} from './constants'

export type ChatbotPromptHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

function sliceWithoutSplittingSurrogate(value: string, length: number): string {
  let sliced = value.slice(0, length)
  const finalCodeUnit = sliced.charCodeAt(sliced.length - 1)
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    sliced = sliced.slice(0, -1)
  }
  return sliced
}

type ChatbotRequestBodyWithHistory = {
  question: string
  conversationHistory: ChatbotPromptHistoryMessage[]
  sessionId: string
  idempotencyKey: string
  conversationId: string | null
  expectedRevision: number
}

const encoder = new TextEncoder()

function requestBodyBytes(body: ChatbotRequestBodyWithHistory): number {
  return encoder.encode(JSON.stringify(body)).byteLength
}

/**
 * Keep the newest prompt context while enforcing the exact per-message, count,
 * and aggregate UTF-16 limits accepted by the request schema. The same output
 * is retained for uncertain retries, so the idempotency fingerprint is stable.
 */
export function projectChatbotPromptHistory(
  messages: readonly ChatbotPromptHistoryMessage[],
): ChatbotPromptHistoryMessage[] {
  const newest = messages.slice(-MAX_CHAT_HISTORY_MESSAGES)
  const projected: ChatbotPromptHistoryMessage[] = []
  let remaining = MAX_CHAT_HISTORY_TOTAL_LENGTH

  for (let index = newest.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = newest[index]
    if (!message) continue
    const normalized = message.content.trim()
    if (!normalized) continue
    const allowed = Math.min(MAX_CHAT_HISTORY_MESSAGE_LENGTH, remaining)
    const content = sliceWithoutSplittingSurrogate(normalized, allowed)
    if (!content) continue
    projected.unshift({
      role: message.role,
      content,
      ...(message.timestamp ? { timestamp: message.timestamp } : {}),
    })
    remaining -= content.length
  }

  return projected
}

/** Fit the exact JSON body sent and retained by the browser under the route's
 * physical UTF-8 ceiling. Newest messages win; the oldest retained message is
 * truncated without splitting a surrogate pair when it can partially fit. */
export function projectChatbotRequestBody<T extends ChatbotRequestBodyWithHistory>(
  body: T,
): T {
  const conversationHistory = [...body.conversationHistory]
  let candidate = { ...body, conversationHistory }
  if (requestBodyBytes(candidate) <= MAX_CHAT_REQUEST_BYTES) return candidate

  while (conversationHistory.length > 0) {
    const oldest = conversationHistory[0]!
    const withoutOldest = { ...body, conversationHistory: conversationHistory.slice(1) }
    if (requestBodyBytes(withoutOldest) > MAX_CHAT_REQUEST_BYTES) {
      conversationHistory.shift()
      candidate = { ...body, conversationHistory: [...conversationHistory] }
      continue
    }

    let low = 0
    let high = oldest.content.length
    let best = ''
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const content = sliceWithoutSplittingSurrogate(oldest.content, middle)
      const trial = {
        ...body,
        conversationHistory: [
          { ...oldest, content },
          ...conversationHistory.slice(1),
        ],
      }
      if (content && requestBodyBytes(trial) <= MAX_CHAT_REQUEST_BYTES) {
        best = content
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    candidate = {
      ...body,
      conversationHistory: best
        ? [{ ...oldest, content: best }, ...conversationHistory.slice(1)]
        : conversationHistory.slice(1),
    }
    break
  }

  if (requestBodyBytes(candidate) > MAX_CHAT_REQUEST_BYTES) {
    throw new Error('Chatbot request cannot fit the physical request limit.')
  }
  return candidate
}
