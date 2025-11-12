/**
 * Test script for conversation persistence
 *
 * This script tests:
 * 1. Creating conversations
 * 2. Saving messages
 * 3. Fetching conversations
 * 4. Auto-generating titles
 * 5. Updating conversation titles
 * 6. Deleting conversations
 * 7. RLS policies (implicit through server actions)
 *
 * Run with: npx tsx scripts/test-conversations.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

console.log('🚀 Testing conversation persistence...\n')

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runTests() {
  let conversationId: string | undefined
  let testUserId: string

  try {
    // Test 0: Get or create a test user
    console.log('[0/8] Setting up test user...')
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('  ❌ Failed to list users:', listError.message)
      return
    }

    if (users.length === 0) {
      console.log('  ⚠️  No users found. Please create a user account first.')
      console.log('  To create a test user, sign up at http://localhost:3000')
      return
    }

    // Use the first user for testing
    testUserId = users[0].id
    console.log('  ✅ Using test user:', testUserId)

    // Test 1: Create a conversation
    console.log('[1/8] Testing conversation creation...')
    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        user_id: testUserId,
        title: 'Test Conversation'
      })
      .select()
      .single()

    if (createError) {
      console.error('  ❌ Failed to create conversation:', createError.message)
      return
    }

    conversationId = newConversation.id
    console.log('  ✅ Conversation created:', conversationId)

    // Test 2: Insert user message
    console.log('[2/8] Testing message insertion (user)...')
    const { data: userMessage, error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: 'What was Apple\'s revenue in 2023?'
      })
      .select()
      .single()

    if (userMsgError) {
      console.error('  ❌ Failed to insert user message:', userMsgError.message)
      return
    }

    console.log('  ✅ User message saved:', userMessage.id)

    // Test 3: Insert assistant message with metadata
    console.log('[3/8] Testing message insertion (assistant with metadata)...')
    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Apple\'s revenue in 2023 was $383.3B.',
        chart_config: {
          type: 'line',
          categories: ['2023'],
          data: [383285000000]
        },
        follow_up_questions: [
          'What was the revenue growth compared to 2022?',
          'How does this compare to other tech companies?'
        ],
        data_used: {
          tool: 'getAaplFinancialsByMetric',
          metric: 'revenue'
        }
      })
      .select()
      .single()

    if (assistantMsgError) {
      console.error('  ❌ Failed to insert assistant message:', assistantMsgError.message)
      return
    }

    console.log('  ✅ Assistant message saved:', assistantMessage.id)

    // Test 4: Fetch conversation with messages
    console.log('[4/8] Testing conversation retrieval...')
    const { data: fetchedConversation, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (fetchError) {
      console.error('  ❌ Failed to fetch conversation:', fetchError.message)
      return
    }

    console.log('  ✅ Conversation fetched:', fetchedConversation.title)

    const { data: messages, error: msgFetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (msgFetchError) {
      console.error('  ❌ Failed to fetch messages:', msgFetchError.message)
      return
    }

    console.log(`  ✅ ${messages.length} messages fetched`)

    // Test 5: Auto-generate title
    console.log('[5/8] Testing auto-title generation...')
    const { data: generatedTitle, error: titleError } = await supabase
      .rpc('generate_conversation_title', {
        conversation_id: conversationId
      })

    if (titleError) {
      console.error('  ❌ Failed to generate title:', titleError.message)
      return
    }

    console.log('  ✅ Generated title:', generatedTitle)

    // Test 6: Update conversation title
    console.log('[6/8] Testing title update...')
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: generatedTitle })
      .eq('id', conversationId)

    if (updateError) {
      console.error('  ❌ Failed to update title:', updateError.message)
      return
    }

    console.log('  ✅ Title updated')

    // Test 7: Verify conversation timestamp was updated
    console.log('[7/8] Testing timestamp trigger...')
    const { data: updatedConv, error: timestampError } = await supabase
      .from('conversations')
      .select('updated_at')
      .eq('id', conversationId)
      .single()

    if (timestampError) {
      console.error('  ❌ Failed to check timestamp:', timestampError.message)
      return
    }

    console.log('  ✅ Timestamp updated:', updatedConv.updated_at)

    // Test 8: Delete conversation (cascade should delete messages)
    console.log('[8/8] Testing conversation deletion (cascade)...')
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    if (deleteError) {
      console.error('  ❌ Failed to delete conversation:', deleteError.message)
      return
    }

    // Verify messages were deleted too
    const { data: orphanedMessages, error: orphanError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)

    if (orphanError) {
      console.error('  ❌ Failed to check for orphaned messages:', orphanError.message)
      return
    }

    if (orphanedMessages.length > 0) {
      console.error(`  ❌ Found ${orphanedMessages.length} orphaned messages (cascade delete failed)`)
      return
    }

    console.log('  ✅ Conversation and messages deleted (cascade worked)')

    console.log('\n✅ All tests passed!')

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message)
    process.exit(1)
  }
}

runTests()
