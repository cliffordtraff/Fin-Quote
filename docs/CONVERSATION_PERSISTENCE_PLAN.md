# Conversation Persistence Implementation Plan

## Overview
Enable users to have persistent conversations across devices by storing chat history in Supabase, linked to their authenticated user account.

## Goals
1. Store conversation history in Supabase (not just localStorage)
2. Enable cross-device access to chat history
3. Maintain conversation context for follow-up questions
4. Provide conversation management (list, view, delete, rename)
5. Preserve existing localStorage behavior for unauthenticated users

---

## Database Schema

### 1. Create `conversations` table

```sql
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint conversations_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- Indexes
create index conversations_user_id_idx on public.conversations(user_id);
create index conversations_updated_at_idx on public.conversations(updated_at desc);

-- RLS Policies
alter table public.conversations enable row level security;

create policy "Users can view their own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can create their own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);
```

### 2. Create `messages` table

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null,

  -- Optional: store metadata about the message
  chart_config jsonb,
  follow_up_questions text[],
  data_used jsonb,

  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id)
);

-- Indexes (composite index for optimal query performance)
create index messages_conversation_id_created_at_idx on public.messages(conversation_id, created_at);

-- RLS Policies
alter table public.messages enable row level security;

create policy "Users can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can create messages in their conversations"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can delete messages in their conversations"
  on public.messages for delete
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
```

### 3. Create function to auto-generate conversation titles

```sql
create or replace function public.generate_conversation_title(conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = public  -- Prevent search path hijacking
as $$
declare
  first_message text;
  title_text text;
begin
  -- Get first user message
  select content into first_message
  from public.messages
  where messages.conversation_id = generate_conversation_title.conversation_id
    and role = 'user'
  order by created_at
  limit 1;

  if first_message is null then
    return 'New Conversation';
  end if;

  -- Truncate to 60 characters and add ellipsis if needed
  if length(first_message) > 60 then
    title_text := substring(first_message from 1 for 60) || '...';
  else
    title_text := first_message;
  end if;

  return title_text;
end;
$$;
```

### 4. Create triggers to update conversation timestamp

```sql
-- Trigger on message insert (updates conversation when new message added)
create or replace function public.update_conversation_timestamp()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return NEW;
end;
$$;

create trigger update_conversation_on_message_insert
  after insert on public.messages
  for each row
  execute function public.update_conversation_timestamp();

-- Trigger on conversation update (updates timestamp on rename, etc.)
create or replace function public.update_conversation_timestamp_on_update()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger update_conversation_timestamp_before_update
  before update on public.conversations
  for each row
  execute function public.update_conversation_timestamp_on_update();
```

---

## TypeScript Types

Update `lib/database.types.ts`:

```typescript
export interface Database {
  public: {
    Tables: {
      // ... existing tables ...
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
          chart_config: Json | null
          follow_up_questions: string[] | null
          data_used: Json | null
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
          chart_config?: Json | null
          follow_up_questions?: string[] | null
          data_used?: Json | null
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant'
          content?: string
          chart_config?: Json | null
          follow_up_questions?: string[] | null
          data_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
    }
  }
}

// Helper types
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
```

---

## Server Actions

### 1. Create `app/actions/conversations.ts`

```typescript
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

export type ConversationWithMessageCount = {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

// Get all conversations for the current user
export async function getConversations() {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      messages(count)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  const conversations: ConversationWithMessageCount[] = data.map(conv => ({
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    message_count: conv.messages?.[0]?.count || 0
  }))

  return { data: conversations, error: null }
}

// Get a single conversation with all messages
export async function getConversation(conversationId: string) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (convError) {
    return { data: null, error: convError.message }
  }

  // Get messages
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (msgError) {
    return { data: null, error: msgError.message }
  }

  return {
    data: { conversation, messages },
    error: null
  }
}

// Create a new conversation
export async function createConversation(title?: string) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title: title || 'New Conversation'
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// Save a message to a conversation
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: {
    chart_config?: any
    follow_up_questions?: string[]
    data_used?: any
  }
) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // Verify user owns this conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) {
    return { data: null, error: 'Conversation not found' }
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      chart_config: metadata?.chart_config || null,
      follow_up_questions: metadata?.follow_up_questions || null,
      data_used: metadata?.data_used || null
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// Update conversation title
export async function updateConversationTitle(
  conversationId: string,
  title: string
) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId)
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

// Delete a conversation (cascade deletes messages)
export async function deleteConversation(conversationId: string) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

// Auto-generate title from first message
export async function autoGenerateTitle(conversationId: string) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data, error } = await supabase
    .rpc('generate_conversation_title', { conversation_id: conversationId })

  if (error) {
    return { title: null, error: error.message }
  }

  // Update the conversation with the generated title
  await updateConversationTitle(conversationId, data)

  return { title: data, error: null }
}
```

---

## Frontend Components

### 1. Create `components/ConversationList.tsx`

A sidebar component to list all conversations (similar to ChatGPT's sidebar).

**Features:**
- List all conversations sorted by recent activity
- Click to load a conversation
- Rename conversation inline
- Delete conversation
- Create new conversation button

### 2. Update `app/ask/page.tsx`

**Changes needed:**
1. Add state for current conversation ID
2. When user is authenticated:
   - Create/load conversation on first message
   - Save each message to Supabase after sending
   - Load conversation history from Supabase instead of localStorage
3. When user is NOT authenticated:
   - Keep existing localStorage behavior
4. Add "New Chat" button to start fresh conversation
5. Show conversation list in sidebar (replace or supplement recent queries)

### 3. Migration Strategy for Existing Users

**Server Action** (`app/actions/conversations.ts`):

```typescript
// Server action to migrate localStorage conversation to Supabase
export async function migrateLocalStorageConversation(messages: any[]) {
  const supabase = createServerComponentClient<Database>({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (!messages || messages.length === 0) {
    return { success: true, conversationId: null }
  }

  try {
    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: 'Migrated Conversation'
      })
      .select()
      .single()

    if (convError || !conversation) {
      return { success: false, error: convError?.message || 'Failed to create conversation' }
    }

    // Insert all messages in batch (more efficient than individual inserts)
    const messagesToInsert = messages.map(msg => ({
      conversation_id: conversation.id,
      role: msg.role,
      content: msg.content,
      chart_config: msg.chartConfig || null,
      follow_up_questions: msg.followUpQuestions || null,
      data_used: msg.dataUsed || null
    }))

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messagesToInsert)

    if (msgError) {
      return { success: false, error: msgError.message }
    }

    // Auto-generate title from first message
    const { data: title } = await supabase
      .rpc('generate_conversation_title', { conversation_id: conversation.id })

    if (title) {
      await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversation.id)
    }

    return { success: true, conversationId: conversation.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to migrate conversation'
    }
  }
}
```

**Client-side Migration Helper** (call from React component):

```typescript
// Client-side helper that calls the server action
export async function handleLocalStorageMigration() {
  const saved = localStorage.getItem('finquote_conversation')
  if (!saved) return { success: true, conversationId: null }

  try {
    const messages = JSON.parse(saved)
    if (messages.length === 0) return { success: true, conversationId: null }

    // Call server action to do the migration
    const result = await migrateLocalStorageConversation(messages)

    if (result.success) {
      // Clear localStorage after successful migration
      localStorage.removeItem('finquote_conversation')
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: 'Failed to parse localStorage data'
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Database Setup (Day 1)
- [ ] Create SQL migration file
- [ ] Run migrations on Supabase
- [ ] Test RLS policies
- [ ] Update TypeScript types

### Phase 2: Server Actions (Day 1-2)
- [ ] Create `conversations.ts` server actions
- [ ] Test all CRUD operations
- [ ] Add error handling
- [ ] Add input validation

### Phase 3: Conversation List UI (Day 2-3)
- [ ] Create ConversationList component
- [ ] Add to sidebar (replace or supplement recent queries)
- [ ] Implement rename/delete functionality
- [ ] Add "New Chat" button
- [ ] Style to match existing design

### Phase 4: Integration with Chat (Day 3-4)
- [ ] Update `app/ask/page.tsx` to use conversations
- [ ] Create conversation on first message (for authenticated users)
- [ ] Save messages to Supabase after sending
- [ ] Load conversation from Supabase on mount
- [ ] Maintain localStorage fallback for unauthenticated users

### Phase 5: Migration & Polish (Day 4-5)
- [ ] Implement localStorage → Supabase migration
- [ ] Prompt users to migrate on first login
- [ ] Add loading states
- [ ] Add optimistic updates
- [ ] Add error boundaries
- [ ] Test cross-device sync

### Phase 6: Optional Enhancements (Future)
- [ ] Search conversations
- [ ] Archive conversations
- [ ] Export conversation as PDF/Markdown
- [ ] Share conversation (public link)
- [ ] Conversation folders/tags
- [ ] Pin important conversations

---

## Testing Checklist

- [ ] Create conversation as authenticated user
- [ ] Save messages to conversation
- [ ] Load conversation on page refresh
- [ ] List all conversations in sidebar
- [ ] Click conversation to load it
- [ ] Rename conversation
- [ ] Delete conversation
- [ ] Test RLS policies (users can only see their own data)
- [ ] Test unauthenticated user experience (localStorage still works)
- [ ] Test localStorage migration
- [ ] Test cross-device sync (login on different browser)
- [ ] Test with multiple users
- [ ] Test error states (network failures, etc.)

---

## Security Considerations

1. **Row Level Security (RLS)**: Ensure users can only access their own conversations
2. **Rate Limiting**: Consider rate limiting conversation creation
3. **Data Validation**: Validate all inputs on server side
4. **Content Moderation**: Consider flagging/moderating stored conversations
5. **Data Retention**: Define policy for how long to keep conversations
6. **GDPR Compliance**: Provide ability to export/delete all user data

---

## Performance Considerations

1. **Pagination**: Load conversations in batches (10-20 at a time)
2. **Message Pagination**: For very long conversations, paginate messages
3. **Caching**: Cache conversation list in React Query or SWR
4. **Optimistic Updates**: Update UI immediately, sync to DB in background
5. **Indexes**: Ensure proper database indexes for fast queries
6. **Lazy Loading**: Only load full conversation when user clicks on it

---

## Cost Estimation

**Supabase Database Storage:**
- Average conversation: ~50 messages
- Average message size: ~500 bytes
- 1,000 users × 10 conversations × 50 messages × 500 bytes = ~250 MB
- Cost: Included in free tier (up to 500 MB)

**Database Operations:**
- Read: ~10 per user session (load conversations + messages)
- Write: ~2 per message (1 message insert + 1 conversation update)
- Cost: Minimal, well within free tier limits

---

## Success Metrics

1. **Adoption Rate**: % of users who create conversations
2. **Retention**: % of users who return to previous conversations
3. **Cross-Device Usage**: % of users accessing same conversation on multiple devices
4. **Migration Rate**: % of localStorage users who migrate to Supabase
5. **Performance**: Average load time for conversation list and messages
6. **Error Rate**: % of failed conversation operations

---

## Rollback Plan

If issues arise:
1. Feature flag to disable Supabase storage
2. Fall back to localStorage for all users
3. Keep data in Supabase but don't display it
4. Allow users to export their Supabase conversations
5. Delete conversations table after 30 days if feature is abandoned

---

## Code Review Notes & Resolutions

### ✅ Fixed Issues:

1. **Client migration flow** - RESOLVED
   - Created dedicated server action `migrateLocalStorageConversation()`
   - Uses batch insert for better performance
   - Client-side helper calls the server action properly

2. **Timestamp accuracy** - RESOLVED
   - Added `BEFORE UPDATE` trigger on conversations table
   - Ensures `updated_at` refreshes on renames and other updates
   - Maintains correct ordering in conversation list

3. **RPC search path** - RESOLVED
   - Added `set search_path = public` to `generate_conversation_title()`
   - Prevents search path hijacking attacks
   - Security best practice for `SECURITY DEFINER` functions

4. **Index tuning** - RESOLVED
   - Replaced separate indexes with composite index
   - `(conversation_id, created_at)` matches query pattern exactly
   - PostgreSQL can use for both filtering and sorting

### ℹ️ Notes:

5. **Action helpers** - NOT APPLICABLE
   - `createServerComponentClient({ cookies })` is the correct pattern for Server Actions
   - This is the official recommendation from Next.js and Supabase docs
   - No action required
