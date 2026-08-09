import 'server-only'

import { z } from 'zod'
import type { createServerClient } from '@/lib/supabase/server'

const CHATBOT_TARGET_PREFLIGHT_DEADLINE_MS = 5_000
const preflightStatusSchema = z.enum([
  'ready',
  'not_found',
  'revision_conflict',
  'conversation_quota',
  'message_quota',
  'command_quota',
])

type UserSupabaseClient = Awaited<ReturnType<typeof createServerClient>>

export type ChatbotTargetPreflightResult =
  | { status: 'ready' }
  | {
      status:
        | 'not_found'
        | 'revision_conflict'
        | 'conversation_quota'
        | 'message_quota'
        | 'command_quota'
        | 'unavailable'
    }

export async function preflightChatbotConversationTarget(
  client: UserSupabaseClient,
  target: { conversationId: string | null; expectedRevision: number },
  callerSignal?: AbortSignal,
): Promise<ChatbotTargetPreflightResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'Chatbot conversation preflight exceeded its deadline.',
      'TimeoutError',
    ))
  }, CHATBOT_TARGET_PREFLIGHT_DEADLINE_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, controller.signal])
    : controller.signal

  try {
    const { data, error } = await client
      .rpc('preflight_chatbot_conversation_turn', {
        p_conversation_id: target.conversationId,
        p_expected_revision: target.expectedRevision,
      })
      .abortSignal(signal)
    const parsed = preflightStatusSchema.safeParse(data)
    return error || !parsed.success
      ? { status: 'unavailable' }
      : { status: parsed.data }
  } catch {
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}
