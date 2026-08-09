'use server'

import { z } from 'zod'
import { isCurrentChatbotIdempotencyKey } from '@/lib/chatbot/idempotency-key'
import {
  parseChatbotRequestResolutionRpcRow,
  type ChatbotRequestResolution,
} from '@/lib/chatbot/request-resolution'
import { requireCurrentUserContext } from '@/lib/auth/current-user'

const RECOVERY_DB_DEADLINE_MS = 5_000

const recoveryIdentitySchema = z.object({
  idempotencyKey: z.string().max(128).refine(key =>
    isCurrentChatbotIdempotencyKey(key)
  ),
  requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export type ResolvePendingChatbotRequestResult =
  | ({ status: 'ready' } & ChatbotRequestResolution)
  | { status: 'unavailable'; error: string }

export async function resolvePendingChatbotRequest(
  input: unknown,
): Promise<ResolvePendingChatbotRequestResult> {
  const parsed = recoveryIdentitySchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 'unavailable',
      error: 'The saved chatbot recovery identity is invalid.',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException(
    'Chatbot recovery lookup exceeded its deadline.',
    'TimeoutError',
  )), RECOVERY_DB_DEADLINE_MS)

  try {
    const { client: supabase } = await requireCurrentUserContext({
      signal: controller.signal,
    })
    const { data, error } = await supabase.rpc(
      'resolve_owned_chatbot_request_admission',
      {
        p_idempotency_key: parsed.data.idempotencyKey,
        p_request_fingerprint: parsed.data.requestFingerprint,
      },
    ).abortSignal(controller.signal)

    if (error || !Array.isArray(data) || data.length !== 1) {
      return {
        status: 'unavailable',
        error: 'Saved-answer recovery is temporarily unavailable.',
      }
    }
    const decoded = parseChatbotRequestResolutionRpcRow(data[0])
    return { status: 'ready', ...decoded }
  } catch {
    return {
      status: 'unavailable',
      error: 'Saved-answer recovery is temporarily unavailable.',
    }
  } finally {
    clearTimeout(timeout)
  }
}
