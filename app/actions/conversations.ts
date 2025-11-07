'use server'

import { createServerClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import type { Conversation, Message, ConversationWithMessages } from '@/lib/database.types'

type NewConversation = Database['public']['Tables']['conversations']['Insert']
type NewMessage = Database['public']['Tables']['messages']['Insert']

/**
 * Get all conversations for the current user, ordered by most recent
 */
export async function getConversations(): Promise<{ conversations: Conversation[] | null; error: string | null }> {
  try {
    console.log('[SERVER] getConversations called')
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[SERVER] getConversations: Not authenticated')
      return { conversations: null, error: 'Not authenticated' }
    }

    console.log('[SERVER] getConversations: Fetching for userId:', user.id)

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[SERVER] Error fetching conversations:', error)
      return { conversations: null, error: error.message }
    }

    console.log('[SERVER] getConversations: Returned', data?.length || 0, 'conversations')
    if (data && data.length > 0) {
      console.log('[SERVER] Conversation titles:', data.map(c => c.title))
    }

    return { conversations: data, error: null }
  } catch (err) {
    console.error('[SERVER] Unexpected error in getConversations:', err)
    return { conversations: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get a single conversation with all its messages
 */
export async function getConversation(
  conversationId: string
): Promise<{ conversation: ConversationWithMessages | null; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { conversation: null, error: 'Not authenticated' }
    }

    // Fetch conversation with messages
    const { data: conversationData, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError) {
      console.error('Error fetching conversation:', convError)
      return { conversation: null, error: convError.message }
    }

    const { data: messagesData, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (msgError) {
      console.error('Error fetching messages:', msgError)
      return { conversation: null, error: msgError.message }
    }

    const conversation: ConversationWithMessages = {
      ...conversationData,
      messages: messagesData
    }

    return { conversation, error: null }
  } catch (err) {
    console.error('Unexpected error in getConversation:', err)
    return { conversation: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Create a new conversation
 */
export async function createConversation(
  title?: string
): Promise<{ conversation: Conversation | null; error: string | null }> {
  try {
    console.log('[SERVER] createConversation called with title:', title || 'New Conversation')
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[SERVER] createConversation: Not authenticated')
      return { conversation: null, error: 'Not authenticated' }
    }

    console.log('[SERVER] createConversation: Creating for userId:', user.id)

    const newConversation: NewConversation = {
      user_id: user.id,
      title: title || 'New Conversation'
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert(newConversation)
      .select()
      .single()

    if (error) {
      console.error('[SERVER] Error creating conversation:', error)
      return { conversation: null, error: error.message }
    }

    console.log('[SERVER] createConversation: Successfully created conversation with id:', data.id)
    return { conversation: data, error: null }
  } catch (err) {
    console.error('[SERVER] Unexpected error in createConversation:', err)
    return { conversation: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Save a message to a conversation
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: {
    chart_config?: any
    follow_up_questions?: string[]
    data_used?: any
  }
): Promise<{ message: Message | null; error: string | null }> {
  try {
    console.log('[SERVER] saveMessage called for conversation:', conversationId, 'role:', role)
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[SERVER] saveMessage: Not authenticated')
      return { message: null, error: 'Not authenticated' }
    }

    // Verify conversation belongs to user (RLS will also check, but this provides better error message)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      console.log('[SERVER] saveMessage: Conversation not found or access denied')
      return { message: null, error: 'Conversation not found or access denied' }
    }

    const newMessage: NewMessage = {
      conversation_id: conversationId,
      role,
      content,
      chart_config: metadata?.chart_config || null,
      follow_up_questions: metadata?.follow_up_questions || null,
      data_used: metadata?.data_used || null
    }

    const { data, error } = await supabase
      .from('messages')
      .insert(newMessage)
      .select()
      .single()

    if (error) {
      console.error('[SERVER] Error saving message:', error)
      return { message: null, error: error.message }
    }

    console.log('[SERVER] saveMessage: Successfully saved', role, 'message to conversation', conversationId)
    return { message: data, error: null }
  } catch (err) {
    console.error('[SERVER] Unexpected error in saveMessage:', err)
    return { message: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<{ conversation: Conversation | null; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { conversation: null, error: 'Not authenticated' }
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating conversation title:', error)
      return { conversation: null, error: error.message }
    }

    return { conversation: data, error: null }
  } catch (err) {
    console.error('Unexpected error in updateConversationTitle:', err)
    return { conversation: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Delete a conversation (will cascade delete all messages)
 */
export async function deleteConversation(
  conversationId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting conversation:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Unexpected error in deleteConversation:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Auto-generate a conversation title from the first user message
 * Uses the PostgreSQL function created in the migration
 */
export async function autoGenerateTitle(
  conversationId: string
): Promise<{ title: string | null; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { title: null, error: 'Not authenticated' }
    }

    // Verify conversation belongs to user
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      return { title: null, error: 'Conversation not found or access denied' }
    }

    // Call the PostgreSQL function to generate title
    const { data, error } = await supabase.rpc('generate_conversation_title', {
      conversation_id: conversationId
    })

    if (error) {
      console.error('Error generating title:', error)
      return { title: null, error: error.message }
    }

    // Update the conversation with the generated title
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: data })
      .eq('id', conversationId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating conversation with generated title:', updateError)
      return { title: null, error: updateError.message }
    }

    return { title: data, error: null }
  } catch (err) {
    console.error('Unexpected error in autoGenerateTitle:', err)
    return { title: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Migrate a conversation from localStorage to the database
 * This is a one-time operation to preserve existing conversations
 */
export async function migrateLocalStorageConversation(
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    chart_config?: any
    follow_up_questions?: string[]
    data_used?: any
  }>
): Promise<{ conversationId: string | null; error: string | null }> {
  try {
    const supabase = await createServerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { conversationId: null, error: 'Not authenticated' }
    }

    // Create conversation with temporary title
    const { conversation, error: convError } = await createConversation('Migrated Conversation')
    if (convError || !conversation) {
      return { conversationId: null, error: convError || 'Failed to create conversation' }
    }

    // Insert all messages
    for (const message of messages) {
      const { error: msgError } = await saveMessage(
        conversation.id,
        message.role,
        message.content,
        {
          chart_config: message.chart_config,
          follow_up_questions: message.follow_up_questions,
          data_used: message.data_used
        }
      )

      if (msgError) {
        console.error('Error migrating message:', msgError)
        // Continue with other messages even if one fails
      }
    }

    // Auto-generate title from first user message
    await autoGenerateTitle(conversation.id)

    return { conversationId: conversation.id, error: null }
  } catch (err) {
    console.error('Unexpected error in migrateLocalStorageConversation:', err)
    return { conversationId: null, error: 'An unexpected error occurred' }
  }
}
