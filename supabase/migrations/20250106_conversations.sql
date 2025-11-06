-- Migration: Add conversation persistence tables
-- Created: 2025-01-06
-- Description: Enables users to have persistent conversations across devices

-- ============================================================================
-- 1. Create conversations table
-- ============================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint conversations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

-- Indexes for performance
create index conversations_user_id_idx on public.conversations(user_id);
create index conversations_updated_at_idx on public.conversations(updated_at desc);

-- Enable Row Level Security
alter table public.conversations enable row level security;

-- RLS Policies
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

-- ============================================================================
-- 2. Create messages table
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null,

  -- Optional metadata for rich message display
  chart_config jsonb,
  follow_up_questions text[],
  data_used jsonb,

  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade
);

-- Composite index for optimal query performance
-- Matches the pattern: WHERE conversation_id = ? ORDER BY created_at
create index messages_conversation_id_created_at_idx on public.messages(conversation_id, created_at);

-- Enable Row Level Security
alter table public.messages enable row level security;

-- RLS Policies (users can only access messages in their own conversations)
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

-- ============================================================================
-- 3. Create function to auto-generate conversation titles
-- ============================================================================

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

  -- Return default if no message found
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

-- ============================================================================
-- 4. Create triggers to update conversation timestamp
-- ============================================================================

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

-- ============================================================================
-- Grant permissions (if needed for service role)
-- ============================================================================

-- These are handled by RLS policies, but grant basic permissions
grant usage on schema public to authenticated;
grant all on public.conversations to authenticated;
grant all on public.messages to authenticated;

-- ============================================================================
-- Verification queries (comment out before running)
-- ============================================================================

-- Uncomment these to verify the migration worked:
-- select * from public.conversations limit 1;
-- select * from public.messages limit 1;
-- select public.generate_conversation_title('00000000-0000-0000-0000-000000000000'::uuid);
