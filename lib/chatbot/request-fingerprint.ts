export type ChatbotRequestFingerprintInput = {
  question: string
  conversationHistory: Array<{
    role: string
    content: string
    timestamp?: string
  }>
  sessionId: string
  conversationId: string | null
  expectedRevision: number
}

export async function fingerprintChatbotRequest(
  payload: ChatbotRequestFingerprintInput,
): Promise<string> {
  const canonical = JSON.stringify({
    version: 1,
    question: payload.question,
    conversationHistory: payload.conversationHistory,
    sessionId: payload.sessionId,
    conversationId: payload.conversationId,
    expectedRevision: payload.expectedRevision,
  })
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  )
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
