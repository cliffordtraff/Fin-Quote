import { describe, expect, it } from 'vitest'
import {
  classifyCompletedConversationRecovery,
  classifyPendingMarkerResolution,
} from '@/lib/chatbot/request-resolution'

describe('completed chatbot pointer recovery', () => {
  it('publishes only an authoritative revision and retains transient ambiguity', () => {
    expect(classifyCompletedConversationRecovery('ready', 5, 5)).toBe('publish')
    expect(classifyCompletedConversationRecovery('ready', 4, 5)).toBe('retain')
    expect(classifyCompletedConversationRecovery('unavailable', null, 5))
      .toBe('retain')
  })

  it('retains uncertain markers and clears only authoritative non-completions', () => {
    expect(classifyPendingMarkerResolution(null)).toBe('retain')
    expect(classifyPendingMarkerResolution({
      disposition: 'in_progress',
      conversationId: null,
      revision: null,
    })).toBe('retain')
    for (const disposition of [
      'failed',
      'expired',
      'key_conflict',
      'missing',
    ] as const) {
      expect(classifyPendingMarkerResolution({
        disposition,
        conversationId: null,
        revision: null,
      })).toBe('clear')
    }
    expect(classifyPendingMarkerResolution({
      disposition: 'completed',
      conversationId: '00000000-0000-4000-8000-000000000010',
      revision: 2,
    })).toBe('recover')
  })

  it('unlocks an irrecoverably deleted or bounded-overflow pointer', () => {
    expect(classifyCompletedConversationRecovery('not_found', null, 5))
      .toBe('clear_deleted')
    expect(classifyCompletedConversationRecovery('overflow', null, 5))
      .toBe('clear_overflow')
  })
})
