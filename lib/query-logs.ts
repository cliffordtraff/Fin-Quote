import 'server-only'

import type { Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { CompleteValidationResults } from '@/lib/validators'

export type QueryLogInput = {
  sessionId: string
  userId: string
  userQuestion: string
  toolSelected: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolArgs: any
  toolSelectionLatencyMs?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataReturned?: any
  dataRowCount?: number
  toolExecutionLatencyMs?: number
  toolError?: string
  answerGenerated: string
  answerLatencyMs?: number
  validationResults?: CompleteValidationResults
  toolSelectionPromptTokens?: number
  toolSelectionCompletionTokens?: number
  toolSelectionTotalTokens?: number
  answerPromptTokens?: number
  answerCompletionTokens?: number
  answerTotalTokens?: number
  regenerationPromptTokens?: number
  regenerationCompletionTokens?: number
  regenerationTotalTokens?: number
  embeddingTokens?: number
}

/**
 * Persist server-generated chatbot telemetry.
 *
 * Browser roles deliberately have no INSERT privilege on query_logs. Keeping
 * this helper in a server-only module prevents the telemetry payload from
 * becoming a directly invokable Server Action, while the service client makes
 * the trusted write independent of the caller's row-level permissions.
 */
export async function logQuery(data: QueryLogInput): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient()

    // gpt-5-nano pricing used by the existing cost dashboard.
    const inputPrice = 0.05 / 1_000_000
    const outputPrice = 0.40 / 1_000_000

    let totalCost = 0
    if (data.toolSelectionPromptTokens && data.toolSelectionCompletionTokens) {
      totalCost +=
        data.toolSelectionPromptTokens * inputPrice +
        data.toolSelectionCompletionTokens * outputPrice
    }
    if (data.answerPromptTokens && data.answerCompletionTokens) {
      totalCost +=
        data.answerPromptTokens * inputPrice +
        data.answerCompletionTokens * outputPrice
    }
    if (data.regenerationPromptTokens && data.regenerationCompletionTokens) {
      totalCost +=
        data.regenerationPromptTokens * inputPrice +
        data.regenerationCompletionTokens * outputPrice
    }
    if (data.embeddingTokens) {
      totalCost += data.embeddingTokens * 0.02 / 1_000_000
    }

    const { data: insertedData, error } = await supabase
      .from('query_logs')
      .insert({
        user_id: data.userId,
        session_id: data.sessionId,
        user_question: data.userQuestion,
        tool_selected: data.toolSelected,
        tool_args: data.toolArgs,
        tool_selection_latency_ms: data.toolSelectionLatencyMs,
        data_returned: data.dataReturned,
        data_row_count: data.dataRowCount,
        tool_execution_latency_ms: data.toolExecutionLatencyMs,
        tool_error: data.toolError,
        answer_generated: data.answerGenerated,
        answer_latency_ms: data.answerLatencyMs,
        validation_results: (data.validationResults
          ? {
              number_validation: data.validationResults.number_validation,
              year_validation: data.validationResults.year_validation,
              filing_validation: data.validationResults.filing_validation,
              overall_severity: data.validationResults.overall_severity,
              action_taken: 'shown',
              latency_ms: data.validationResults.latency_ms,
            }
          : null) as Json,
        validation_passed: data.validationResults?.overall_passed ?? null,
        validation_run_at: data.validationResults
          ? new Date().toISOString()
          : null,
        tool_selection_prompt_tokens: data.toolSelectionPromptTokens,
        tool_selection_completion_tokens: data.toolSelectionCompletionTokens,
        tool_selection_total_tokens: data.toolSelectionTotalTokens,
        answer_prompt_tokens: data.answerPromptTokens,
        answer_completion_tokens: data.answerCompletionTokens,
        answer_total_tokens: data.answerTotalTokens,
        regeneration_prompt_tokens: data.regenerationPromptTokens,
        regeneration_completion_tokens: data.regenerationCompletionTokens,
        regeneration_total_tokens: data.regenerationTotalTokens,
        embedding_tokens: data.embeddingTokens,
        total_cost_usd: totalCost > 0 ? totalCost : null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to log query:', error)
      return null
    }

    return insertedData?.id ?? null
  } catch (error) {
    console.error('Failed to log query (unexpected error):', error)
    return null
  }
}
