import { z } from 'zod'

const chatbotRequestResolutionRpcSchema = z.object({
  disposition: z.enum([
    'completed',
    'failed',
    'in_progress',
    'expired',
    'key_conflict',
    'missing',
  ]),
  result_conversation_id: z.string().uuid().nullable(),
  result_revision: z.number().int().safe().min(0).nullable(),
}).strict().superRefine((row, context) => {
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
      message: 'Only completed resolution may carry a conversation receipt.',
    })
  }
})

export type ChatbotRequestResolution = {
  disposition:
    | 'completed'
    | 'failed'
    | 'in_progress'
    | 'expired'
    | 'key_conflict'
    | 'missing'
  conversationId: string | null
  revision: number | null
}

export function parseChatbotRequestResolutionRpcRow(
  row: unknown,
): ChatbotRequestResolution {
  const parsed = chatbotRequestResolutionRpcSchema.parse(row)
  return {
    disposition: parsed.disposition,
    conversationId: parsed.result_conversation_id,
    revision: parsed.result_revision,
  }
}

export type CompletedConversationRecoveryDecision =
  | 'publish'
  | 'retain'
  | 'clear_deleted'
  | 'clear_overflow'

export function classifyCompletedConversationRecovery(
  status: 'ready' | 'not_found' | 'overflow' | 'unavailable',
  currentRevision: number | null,
  requiredRevision: number,
): CompletedConversationRecoveryDecision {
  if (status === 'not_found') return 'clear_deleted'
  if (status === 'overflow') return 'clear_overflow'
  if (status === 'unavailable') return 'retain'
  return currentRevision !== null && currentRevision >= requiredRevision
    ? 'publish'
    : 'retain'
}

export function classifyPendingMarkerResolution(
  resolution: ChatbotRequestResolution | null,
): 'recover' | 'retain' | 'clear' {
  if (resolution === null || resolution.disposition === 'in_progress') {
    return 'retain'
  }
  return resolution.disposition === 'completed' ? 'recover' : 'clear'
}
