import 'server-only'

import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  parseChatbotRequestResolutionRpcRow,
  type ChatbotRequestResolution,
} from './request-resolution'

export { parseChatbotRequestResolutionRpcRow as parseDurableResolutionRpcRow }

export const CHATBOT_DURABLE_RPC_DEADLINE_MS = 8_000

export type ChatbotDurableAdmissionDisposition =
  | 'acquired'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'owner_capacity'
  | 'global_capacity'
  | 'rate_limited'
  | 'identity_capacity'
  | 'attempts_exhausted'
  | 'key_conflict'

export type ChatbotDurableAdmission = {
  disposition: ChatbotDurableAdmissionDisposition
  leaseToken: string | null
  retryAfterSeconds: number
  conversationId: string | null
  revision: number | null
}

const durableAdmissionRpcSchema = z
  .object({
    disposition: z.enum([
      'acquired',
      'in_progress',
      'completed',
      'failed',
      'owner_capacity',
      'global_capacity',
      'rate_limited',
      'identity_capacity',
      'attempts_exhausted',
      'key_conflict',
    ]),
    lease_token: z.string().uuid().nullable(),
    retry_after_seconds: z.number().int().safe().min(0).max(180),
    result_conversation_id: z.string().uuid().nullable(),
    result_revision: z.number().int().safe().min(0).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if ((row.disposition === 'acquired') !== (row.lease_token !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only an acquired admission may carry a lease token.',
      })
    }
    const hasAnyPointer = row.result_conversation_id !== null ||
      row.result_revision !== null
    const hasCompletePointer = row.result_conversation_id !== null &&
      row.result_revision !== null
    if (
      (row.disposition === 'completed' && !hasCompletePointer) ||
      (row.disposition !== 'completed' && hasAnyPointer)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only completed admission may carry a conversation receipt.',
      })
    }
  })

export function parseDurableAdmissionRpcRow(
  row: unknown,
): ChatbotDurableAdmission {
  const parsed = durableAdmissionRpcSchema.parse(row)
  return {
    disposition: parsed.disposition,
    leaseToken: parsed.lease_token,
    retryAfterSeconds: parsed.retry_after_seconds,
    conversationId: parsed.result_conversation_id,
    revision: parsed.result_revision,
  }
}

export function parseDurableFailureRpcValue(
  value: unknown,
): 'failed' | 'fence_lost' {
  return z.enum(['failed', 'fence_lost']).parse(value)
}

export type ChatbotDurableResolution = ChatbotRequestResolution

export class ChatbotDurableAdmissionUnavailableError extends Error {
  constructor(message = 'Chatbot admission storage is temporarily unavailable.') {
    super(message)
    this.name = 'ChatbotDurableAdmissionUnavailableError'
  }
}

type DurableIdentity = {
  ownerId: string
  idempotencyKey: string
  requestFingerprint: string
}

type DurableLeaseIdentity = DurableIdentity & { leaseToken: string }

async function withRpcDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(
      'Chatbot admission RPC exceeded its deadline.',
      'TimeoutError',
    ))
  }, CHATBOT_DURABLE_RPC_DEADLINE_MS)

  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export async function acquireDurableChatbotAdmission(
  identity: DurableIdentity,
): Promise<ChatbotDurableAdmission> {
  try {
    return await withRpcDeadline(async signal => {
      const client = createServiceRoleClient()
      const { data, error } = await client.rpc(
        'acquire_chatbot_request_admission',
        {
          p_owner_id: identity.ownerId,
          p_idempotency_key: identity.idempotencyKey,
          p_request_fingerprint: identity.requestFingerprint,
        },
      ).abortSignal(signal)

      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ChatbotDurableAdmissionUnavailableError()
      }

      return parseDurableAdmissionRpcRow(data[0])
    })
  } catch (error) {
    if (error instanceof ChatbotDurableAdmissionUnavailableError) throw error
    throw new ChatbotDurableAdmissionUnavailableError()
  }
}

export async function resolveDurableChatbotAdmission(
  identity: DurableIdentity,
): Promise<ChatbotDurableResolution> {
  try {
    return await withRpcDeadline(async signal => {
      const client = createServiceRoleClient()
      const { data, error } = await client.rpc(
        'resolve_chatbot_request_admission',
        {
          p_owner_id: identity.ownerId,
          p_idempotency_key: identity.idempotencyKey,
          p_request_fingerprint: identity.requestFingerprint,
        },
      ).abortSignal(signal)
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ChatbotDurableAdmissionUnavailableError()
      }
      return parseChatbotRequestResolutionRpcRow(data[0])
    })
  } catch (error) {
    if (error instanceof ChatbotDurableAdmissionUnavailableError) throw error
    throw new ChatbotDurableAdmissionUnavailableError()
  }
}

async function settleDurableChatbotAdmission(
  identity: DurableLeaseIdentity,
): Promise<'failed' | 'fence_lost'> {
  try {
    return await withRpcDeadline(async signal => {
      const client = createServiceRoleClient()
      const { data, error } = await client.rpc('fail_chatbot_request_admission', {
        p_owner_id: identity.ownerId,
        p_idempotency_key: identity.idempotencyKey,
        p_request_fingerprint: identity.requestFingerprint,
        p_lease_token: identity.leaseToken,
      }).abortSignal(signal)

      if (error) {
        throw new ChatbotDurableAdmissionUnavailableError()
      }
      return parseDurableFailureRpcValue(data)
    })
  } catch (error) {
    if (error instanceof ChatbotDurableAdmissionUnavailableError) throw error
    throw new ChatbotDurableAdmissionUnavailableError()
  }
}

export function failDurableChatbotAdmission(
  identity: DurableLeaseIdentity,
): Promise<'failed' | 'fence_lost'> {
  return settleDurableChatbotAdmission(identity)
}
