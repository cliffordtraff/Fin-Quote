import { describe, expect, it } from 'vitest'
import {
  chatbotConversationDatabaseRowSchema,
  chatbotConversationMessageDatabaseRowSchema,
  chatbotConversationPageDatabaseRowSchema,
  commitChatbotConversationTurnInputSchema,
  chatbotFollowUpQuestionsSchema,
  commitChatbotConversationTurnDatabaseRowSchema,
  deleteChatbotConversationDatabaseRowSchema,
  chatbotTurnPersistenceMetadataSchema,
  CHATBOT_CHART_CONFIG_MAX_BYTES,
} from '@/lib/chatbot/conversation-contract'

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001'
const USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000002'
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000003'
const TIMESTAMP = '2026-08-09T12:00:00.000Z'

const appliedTurn = {
  disposition: 'applied',
  conversation_id: CONVERSATION_ID,
  revision: 1,
  title: 'Revenue trend',
  updated_at: TIMESTAMP,
  user_message_id: USER_MESSAGE_ID,
  assistant_message_id: ASSISTANT_MESSAGE_ID,
}

describe('chatbot conversation database decoders', () => {
  it('matches PostgreSQL code-point and UTF-8 title/follow-up limits', () => {
    const astralTitle = '🚀'.repeat(120)
    const astralFollowUp = '🚀'.repeat(240)

    expect(chatbotConversationDatabaseRowSchema.safeParse({
      id: CONVERSATION_ID,
      title: astralTitle,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 0,
    }).success).toBe(true)
    expect(chatbotFollowUpQuestionsSchema.safeParse([astralFollowUp]).success)
      .toBe(true)

    expect(chatbotConversationDatabaseRowSchema.safeParse({
      id: CONVERSATION_ID,
      title: '🚀'.repeat(121),
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 0,
    }).success).toBe(false)
    expect(chatbotFollowUpQuestionsSchema.safeParse(['🚀'.repeat(241)]).success)
      .toBe(false)
  })

  it('rejects malformed or oversized message rows', () => {
    const valid = {
      id: USER_MESSAGE_ID,
      role: 'user',
      content: 'What changed?',
      created_at: TIMESTAMP,
      chart_config: null,
      follow_up_questions: null,
      data_used: null,
    }

    expect(chatbotConversationMessageDatabaseRowSchema.safeParse(valid).success)
      .toBe(true)
    expect(chatbotConversationMessageDatabaseRowSchema.safeParse({
      ...valid,
      role: 'system',
    }).success).toBe(false)
    expect(chatbotConversationMessageDatabaseRowSchema.safeParse({
      ...valid,
      content: 'x'.repeat(8193),
    }).success).toBe(false)
    expect(chatbotConversationMessageDatabaseRowSchema.safeParse({
      ...valid,
      chart_config: [],
    }).success).toBe(false)
  })

  it('requires exact bounded detail-page status and message shapes', () => {
    const ready = {
      status: 'ready',
      conversation_id: CONVERSATION_ID,
      title: 'Conversation',
      conversation_created_at: TIMESTAMP,
      conversation_updated_at: TIMESTAMP,
      revision: 1,
      message_id: USER_MESSAGE_ID,
      message_role: 'user',
      message_content: 'Question',
      message_created_at: TIMESTAMP,
      chart_config: null,
      follow_up_questions: null,
      data_used: null,
      has_more: true,
    }
    expect(chatbotConversationPageDatabaseRowSchema.safeParse(ready).success)
      .toBe(true)
    expect(chatbotConversationPageDatabaseRowSchema.safeParse({
      ...ready,
      status: 'not_found',
    }).success).toBe(false)
    expect(chatbotConversationPageDatabaseRowSchema.safeParse({
      ...ready,
      message_id: null,
      message_role: null,
      message_content: null,
      message_created_at: null,
      has_more: true,
    }).success).toBe(false)
    expect(chatbotConversationPageDatabaseRowSchema.safeParse({
      ...ready,
      message_content: 'x'.repeat(8193),
    }).success).toBe(false)
  })

  it('fails closed on deeply nested metadata before fingerprint recursion', () => {
    let chartConfig: Record<string, unknown> = { value: 1 }
    for (let depth = 0; depth < 2_000; depth += 1) {
      chartConfig = { nested: chartConfig }
    }

    expect(() => commitChatbotConversationTurnInputSchema.safeParse({
      conversationId: null,
      expectedRevision: 0,
      idempotencyKey: `c1.${Date.now()}.${CONVERSATION_ID}`,
      userContent: 'Question',
      assistantContent: 'Answer',
      chartConfig,
      followUpQuestions: null,
      dataUsed: null,
    })).not.toThrow()
    expect(commitChatbotConversationTurnInputSchema.safeParse({
      conversationId: null,
      expectedRevision: 0,
      idempotencyKey: `c1.${Date.now()}.${CONVERSATION_ID}`,
      userContent: 'Question',
      assistantContent: 'Answer',
      chartConfig,
      followUpQuestions: null,
      dataUsed: null,
    }).success).toBe(false)
  })

  it('accounts for PostgreSQL jsonb text spacing at the byte boundary', () => {
    const chartConfig: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`key_${index}`, index]),
    )
    chartConfig.payload = ''
    const encoder = new TextEncoder()
    const baseBytes = encoder.encode(JSON.stringify(chartConfig)).byteLength
    chartConfig.payload = 'x'.repeat(CHATBOT_CHART_CONFIG_MAX_BYTES - baseBytes)

    expect(encoder.encode(JSON.stringify(chartConfig)).byteLength).toBe(
      CHATBOT_CHART_CONFIG_MAX_BYTES,
    )
    expect(chatbotTurnPersistenceMetadataSchema.safeParse({
      chartConfig,
      dataUsed: null,
    }).success).toBe(false)
  })

  it('rejects sparse arrays and PostgreSQL-invalid JSON strings or keys', () => {
    const sparse = new Array(2)
    sparse[1] = 'value'
    const hugeSparse = new Array(4_096)
    for (const chartConfig of [
      { data: sparse },
      { data: hugeSparse },
      { value: 'bad\u0000value' },
      { ['bad\u0000key']: 'value' },
      { value: String.fromCharCode(0xd800) },
      { value: String.fromCharCode(0xdc00) },
    ]) {
      expect(chatbotTurnPersistenceMetadataSchema.safeParse({
        chartConfig,
        dataUsed: null,
      }).success).toBe(false)
    }
  })

  it('rejects PostgreSQL-invalid user, assistant, follow-up, and row text', () => {
    const base = {
      conversationId: null,
      expectedRevision: 0,
      idempotencyKey: `c1.${Date.now()}.${CONVERSATION_ID}`,
      userContent: 'Question',
      assistantContent: 'Answer',
      chartConfig: null,
      followUpQuestions: null,
      dataUsed: null,
    }
    for (const override of [
      { userContent: 'bad\u0000question' },
      { assistantContent: String.fromCharCode(0xd800) },
      { followUpQuestions: [String.fromCharCode(0xdc00)] },
    ]) {
      expect(commitChatbotConversationTurnInputSchema.safeParse({
        ...base,
        ...override,
      }).success).toBe(false)
    }
    expect(chatbotConversationMessageDatabaseRowSchema.safeParse({
      id: USER_MESSAGE_ID,
      role: 'assistant',
      content: 'bad\u0000answer',
      created_at: TIMESTAMP,
      chart_config: null,
      follow_up_questions: null,
      data_used: null,
    }).success).toBe(false)
  })

  it('requires exact applied/replayed receipt shapes', () => {
    expect(commitChatbotConversationTurnDatabaseRowSchema.safeParse(appliedTurn).success)
      .toBe(true)
    expect(commitChatbotConversationTurnDatabaseRowSchema.safeParse({
      ...appliedTurn,
      disposition: 'replayed',
    }).success).toBe(true)
    expect(commitChatbotConversationTurnDatabaseRowSchema.safeParse({
      ...appliedTurn,
      user_message_id: null,
    }).success).toBe(false)
    expect(commitChatbotConversationTurnDatabaseRowSchema.safeParse({
      ...appliedTurn,
      disposition: 'gone',
      revision: null,
      title: null,
      updated_at: null,
      user_message_id: null,
      assistant_message_id: null,
    }).success).toBe(true)
    expect(commitChatbotConversationTurnDatabaseRowSchema.safeParse({
      ...appliedTurn,
      disposition: 'gone',
      title: null,
      user_message_id: null,
      assistant_message_id: null,
    }).success).toBe(false)
  })

  it('enforces delete disposition nullability', () => {
    expect(deleteChatbotConversationDatabaseRowSchema.safeParse({
      disposition: 'applied',
      conversation_id: CONVERSATION_ID,
      revision: 4,
    }).success).toBe(true)
    expect(deleteChatbotConversationDatabaseRowSchema.safeParse({
      disposition: 'not_found',
      conversation_id: CONVERSATION_ID,
      revision: null,
    }).success).toBe(true)
    expect(deleteChatbotConversationDatabaseRowSchema.safeParse({
      disposition: 'gone',
      conversation_id: CONVERSATION_ID,
      revision: null,
    }).success).toBe(false)
    expect(deleteChatbotConversationDatabaseRowSchema.safeParse({
      disposition: 'command_quota',
      conversation_id: CONVERSATION_ID,
      revision: 1,
    }).success).toBe(false)
  })
})
