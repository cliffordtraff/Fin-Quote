import 'server-only'

import { z } from 'zod'
import type { Json } from '@/lib/database.types'
import type { createServerClient } from '@/lib/supabase/server'
import { fingerprintChatbotCommand } from './command-fingerprint'
import {
  commitChatbotConversationTurnDatabaseRowSchema,
  commitChatbotConversationTurnInputSchema,
  type ChatbotConversationTurnResult,
  type CommitChatbotConversationTurnInput,
} from './conversation-contract'

const CHATBOT_TURN_COMPLETION_DEADLINE_MS = 8_000

type UserSupabaseClient = Awaited<ReturnType<typeof createServerClient>>

type CompleteTurnInput = CommitChatbotConversationTurnInput & {
  admissionRequestFingerprint: string
  leaseToken: string
}

const completionFenceSchema = z.object({
  admissionRequestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  leaseToken: z.string().uuid(),
}).strict()

function unavailable(
  error = 'Conversation storage is temporarily unavailable.',
): ChatbotConversationTurnResult {
  return { status: 'unavailable', error }
}

/**
 * Invoke the auth.uid-bound combo RPC through a client captured while the Next
 * request context is active. Its independent deadline lets the atomic DB
 * transaction settle even if the SSE consumer disconnects at the same moment.
 */
export async function completeChatbotTurnAndRequest(
  client: UserSupabaseClient,
  input: CompleteTurnInput,
): Promise<ChatbotConversationTurnResult> {
  const turn = commitChatbotConversationTurnInputSchema.safeParse({
    conversationId: input.conversationId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    userContent: input.userContent,
    assistantContent: input.assistantContent,
    chartConfig: input.chartConfig,
    followUpQuestions: input.followUpQuestions,
    dataUsed: input.dataUsed,
  })
  const fence = completionFenceSchema.safeParse({
    admissionRequestFingerprint: input.admissionRequestFingerprint,
    leaseToken: input.leaseToken,
  })
  if (!turn.success || !fence.success) return unavailable('Invalid chatbot turn.')

  const turnRequestFingerprint = await fingerprintChatbotCommand({
    version: 1,
    conversationId: turn.data.conversationId,
    expectedRevision: turn.data.expectedRevision,
    userContent: turn.data.userContent,
    assistantContent: turn.data.assistantContent,
    chartConfig: turn.data.chartConfig,
    followUpQuestions: turn.data.followUpQuestions,
    dataUsed: turn.data.dataUsed,
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'Chatbot turn completion exceeded its deadline.',
      'TimeoutError',
    ))
  }, CHATBOT_TURN_COMPLETION_DEADLINE_MS)

  try {
    const { data, error } = await client.rpc(
      'commit_chatbot_turn_and_complete_request',
      {
        p_conversation_id: turn.data.conversationId,
        p_expected_revision: turn.data.expectedRevision,
        p_idempotency_key: turn.data.idempotencyKey,
        p_turn_request_fingerprint: turnRequestFingerprint,
        p_user_content: turn.data.userContent,
        p_assistant_content: turn.data.assistantContent,
        p_chart_config: turn.data.chartConfig as Json,
        p_follow_up_questions: turn.data.followUpQuestions,
        p_data_used: turn.data.dataUsed as Json,
        p_admission_request_fingerprint: fence.data.admissionRequestFingerprint,
        p_lease_token: fence.data.leaseToken,
      },
    ).abortSignal(controller.signal)

    if (error || !Array.isArray(data) || data.length !== 1) return unavailable()
    const decoded = commitChatbotConversationTurnDatabaseRowSchema.safeParse(data[0])
    if (!decoded.success) return unavailable()
    const row = decoded.data

    return {
      status: 'ready',
      disposition: row.disposition,
      conversationId: row.conversation_id,
      revision: row.revision,
      title: row.title,
      updatedAt: row.updated_at,
      userMessageId: row.user_message_id,
      assistantMessageId: row.assistant_message_id,
    }
  } catch {
    return unavailable()
  } finally {
    clearTimeout(timeout)
  }
}
