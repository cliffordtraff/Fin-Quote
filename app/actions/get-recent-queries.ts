'use server'

import { createServerClient } from '@/lib/supabase/server'

export type RecentQuery = {
  id: string
  question: string
  answer: string
  created_at: string
  tool_used: string
}

export async function getRecentQueries(params?: {
  userId?: string
  sessionId?: string
}): Promise<RecentQuery[]> {
  try {
    const supabase = createServerClient()

    // Build query - prioritize user_id over session_id
    let query = supabase
      .from('query_logs')
      .select('id, user_question, answer_generated, created_at, tool_selected')
      .order('created_at', { ascending: false })
      .limit(50)

    if (params?.userId) {
      // Logged in user - fetch their queries
      query = query.eq('user_id', params.userId)
    } else if (params?.sessionId) {
      // Anonymous user - fetch session queries
      query = query.eq('session_id', params.sessionId)
    } else {
      // No identifier provided, return empty
      return []
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching recent queries:', error)
      return []
    }

    // Map database columns to expected RecentQuery format
    return (data || []).map((row: any) => ({
      id: row.id,
      question: row.user_question,
      answer: row.answer_generated,
      created_at: row.created_at,
      tool_used: row.tool_selected,
    }))
  } catch (error) {
    console.error('Failed to fetch recent queries:', error)
    return []
  }
}

export async function deleteQuery(queryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient()

    const { error } = await supabase
      .from('query_logs')
      .delete()
      .eq('id', queryId)

    if (error) {
      console.error('Error deleting query:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to delete query:', error)
    return { success: false, error: 'Failed to delete query' }
  }
}

export async function clearQueryHistory(params?: {
  userId?: string
  sessionId?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient()

    // Build delete query - prioritize user_id over session_id
    let query = supabase.from('query_logs').delete()

    if (params?.userId) {
      // Logged in user - delete their queries
      query = query.eq('user_id', params.userId)
    } else if (params?.sessionId) {
      // Anonymous user - delete session queries
      query = query.eq('session_id', params.sessionId)
    } else {
      // No identifier provided
      return { success: false, error: 'No user or session identifier provided' }
    }

    const { error } = await query

    if (error) {
      console.error('Error clearing query history:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to clear query history:', error)
    return { success: false, error: 'Failed to clear history' }
  }
}
