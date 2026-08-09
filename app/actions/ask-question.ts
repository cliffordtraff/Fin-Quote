'use server'

import { z } from 'zod'
import { requireCurrentUserContext } from '@/lib/auth/current-user'

const feedbackSchema = z.object({
  queryLogId: z.string().uuid(),
  feedback: z.enum(['thumbs_up', 'thumbs_down']),
  comment: z.string().trim().max(2_000).optional(),
}).strict()

/**
 * Persist feedback only on a query log owned by the authenticated caller.
 * Model generation deliberately has no Server Action export: `/api/ask` is
 * the single admission-controlled model-spend boundary.
 */
export async function submitFeedback(input: {
  queryLogId: string
  feedback: 'thumbs_up' | 'thumbs_down'
  comment?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const { client: supabase, user: currentUser } = await requireCurrentUserContext()
    const params = feedbackSchema.parse(input)

    const { data, error } = await supabase
      .from('query_logs')
      .update({
        user_feedback: params.feedback,
        user_feedback_comment: params.comment || null,
      })
      .eq('id', params.queryLogId)
      .eq('user_id', currentUser.id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Failed to submit feedback:', error)
      return { success: false, error: 'Failed to submit feedback.' }
    }
    if (!data) {
      return { success: false, error: 'Query log not found.' }
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    return { success: false, error: 'Unable to submit feedback.' }
  }
}
