export const CHATBOT_IDEMPOTENCY_VERSION = 'c1'
export const CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000
export const CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS = 10 * 60 * 1_000

const CHATBOT_IDEMPOTENCY_KEY_PATTERN =
  /^c1\.(\d{13})\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

export function chatbotIdempotencyKeyTimestamp(key: string): number | null {
  const match = CHATBOT_IDEMPOTENCY_KEY_PATTERN.exec(key)
  if (!match) return null
  const timestamp = Number(match[1])
  return Number.isSafeInteger(timestamp) ? timestamp : null
}

export function isCurrentChatbotIdempotencyKey(
  key: string,
  now = Date.now(),
): boolean {
  const timestamp = chatbotIdempotencyKeyTimestamp(key)
  return timestamp !== null &&
    timestamp >= now - CHATBOT_IDEMPOTENCY_RETRY_WINDOW_MS &&
    timestamp <= now + CHATBOT_IDEMPOTENCY_FUTURE_SKEW_MS
}

export function createChatbotIdempotencyKey(
  now = Date.now(),
  randomUuid = crypto.randomUUID(),
): string {
  const key = `${CHATBOT_IDEMPOTENCY_VERSION}.${Math.trunc(now)}.${randomUuid.toLowerCase()}`
  if (!isCurrentChatbotIdempotencyKey(key, now)) {
    throw new Error('Unable to create a valid chatbot idempotency key.')
  }
  return key
}
