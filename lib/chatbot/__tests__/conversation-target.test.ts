import { describe, expect, it } from 'vitest'
import { isChatbotConversationTargetReady } from '@/lib/chatbot/conversation-target'

describe('chatbot conversation target readiness', () => {
  it('blocks an existing URL target until its exact row and revision are ready', () => {
    for (const status of [
      'pending',
      'unavailable',
      'overflow',
      'not_found',
    ] as const) {
      expect(isChatbotConversationTargetReady(true, status)).toBe(false)
    }
    expect(isChatbotConversationTargetReady(true, 'ready')).toBe(true)
  })

  it('keeps an explicit new-chat target ready without a database row', () => {
    expect(isChatbotConversationTargetReady(false, 'pending')).toBe(true)
  })
})
