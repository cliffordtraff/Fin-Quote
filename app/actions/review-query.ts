'use server'

import { createServerClient } from '@/lib/supabase/server'

export type ErrorCategory =
  | 'wrong_tool'
  | 'wrong_arguments'
  | 'wrong_units'
  | 'hallucination'
  | 'correct_data_wrong_interpretation'
  | 'missing_data'
  | 'other'

export type QueryLogWithDetails = {
  id: string
  created_at: string
  user_question: string
  tool_selected: string
  tool_args: any
  data_returned: any
  data_row_count: number | null
  tool_error: string | null
  answer_generated: string
  user_feedback: 'thumbs_up' | 'thumbs_down' | null
  user_feedback_comment: string | null
  error_category: ErrorCategory | null
  reviewer_notes: string | null
  reviewed_at: string | null
  session_id: string
  user_id: string | null
}

/**
 * Mark a query as reviewed with error categorization
 */
export async function markQueryIncorrect(params: {
  queryLogId: string
  errorCategory: ErrorCategory
  reviewerNotes?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user (reviewer)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Must be logged in to review queries' }
    }

    // Update the query log with review information
    const { error } = await (supabase as any)
      .from('query_logs')
      .update({
        error_category: params.errorCategory,
        reviewer_notes: params.reviewerNotes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', params.queryLogId)

    if (error) {
      console.error('Failed to mark query as incorrect:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to mark query as incorrect (unexpected error):', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Mark a query as correct (useful for building positive examples)
 */
export async function markQueryCorrect(params: {
  queryLogId: string
  reviewerNotes?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user (reviewer)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Must be logged in to review queries' }
    }

    // Update the query log with review information
    const { error } = await (supabase as any)
      .from('query_logs')
      .update({
        error_category: null, // No error
        reviewer_notes: params.reviewerNotes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        user_feedback: 'thumbs_up', // Override to thumbs_up if reviewer marks as correct
      })
      .eq('id', params.queryLogId)

    if (error) {
      console.error('Failed to mark query as correct:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to mark query as correct (unexpected error):', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Get queries for review, with filtering options
 */
export async function getQueriesForReview(params: {
  filter?: 'thumbs_down' | 'no_feedback' | 'unreviewed' | 'all'
  limit?: number
  offset?: number
}): Promise<{
  data: QueryLogWithDetails[] | null
  error: string | null
  total: number
}> {
  try {
    const supabase = await createServerClient()
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    // Build the query
    let query = (supabase as any)
      .from('query_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply filters
    if (params.filter === 'thumbs_down') {
      query = query.eq('user_feedback', 'thumbs_down')
    } else if (params.filter === 'no_feedback') {
      query = query.is('user_feedback', null)
    } else if (params.filter === 'unreviewed') {
      query = query.is('reviewed_at', null)
    }
    // 'all' filter means no additional filter

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Failed to fetch queries for review:', error)
      return { data: null, error: error.message, total: 0 }
    }

    return { data: data ?? [], error: null, total: count ?? 0 }
  } catch (err) {
    console.error('Failed to fetch queries for review (unexpected error):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
      total: 0,
    }
  }
}

/**
 * Get error category statistics for analysis
 */
export async function getErrorCategoryStats(): Promise<{
  data: Array<{ error_category: string; count: number }> | null
  error: string | null
}> {
  try {
    const supabase = await createServerClient()

    const { data, error } = await (supabase as any)
      .from('query_logs')
      .select('error_category')
      .not('error_category', 'is', null)

    if (error) {
      console.error('Failed to fetch error category stats:', error)
      return { data: null, error: error.message }
    }

    // Count occurrences of each error category
    const stats = (data || []).reduce((acc: any, row: any) => {
      const category = row.error_category
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})

    const result = Object.entries(stats)
      .map(([error_category, count]) => ({
        error_category,
        count: count as number,
      }))
      .sort((a, b) => b.count - a.count) // Sort by count descending

    return { data: result, error: null }
  } catch (err) {
    console.error('Failed to fetch error category stats (unexpected error):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
