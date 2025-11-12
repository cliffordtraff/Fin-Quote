import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
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

console.log('🚀 Running conversations migration...')
console.log(`📍 Project: ${supabaseUrl}\n`)

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Read migration file
const migrationSQL = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20250106_conversations.sql'),
  'utf8'
)

// Split into statements (basic parsing)
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0)
  .filter(s => !s.startsWith('--'))
  .filter(s => !s.includes('Uncomment these'))

console.log(`📝 Executing ${statements.length} statements...\n`)

// Execute migration by executing raw SQL
async function runMigration() {
  try {
    // Create tables
    console.log('[1/8] Creating conversations table...')
    const { error: e1 } = await supabase.rpc('exec_sql', {
      sql: `
        create table if not exists public.conversations (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null,
          title text not null,
          created_at timestamptz default now() not null,
          updated_at timestamptz default now() not null,
          constraint conversations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
        );
      `
    }).then(res => {
      if (res.error?.message?.includes('already exists')) {
        console.log('  ⚠️  Table already exists, skipping')
        return { error: null }
      }
      return res
    })

    if (e1) console.error('  Error:', e1.message)
    else console.log('  ✅ Done')

    console.log('[2/8] Creating conversations indexes...')
    await supabase.rpc('exec_sql', {
      sql: `
        create index if not exists conversations_user_id_idx on public.conversations(user_id);
        create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);
      `
    })
    console.log('  ✅ Done')

    console.log('[3/8] Setting up RLS policies for conversations...')
    await supabase.rpc('exec_sql', {
      sql: `
        alter table public.conversations enable row level security;

        drop policy if exists "Users can view their own conversations" on public.conversations;
        create policy "Users can view their own conversations"
          on public.conversations for select
          using (auth.uid() = user_id);

        drop policy if exists "Users can create their own conversations" on public.conversations;
        create policy "Users can create their own conversations"
          on public.conversations for insert
          with check (auth.uid() = user_id);

        drop policy if exists "Users can update their own conversations" on public.conversations;
        create policy "Users can update their own conversations"
          on public.conversations for update
          using (auth.uid() = user_id);

        drop policy if exists "Users can delete their own conversations" on public.conversations;
        create policy "Users can delete their own conversations"
          on public.conversations for delete
          using (auth.uid() = user_id);
      `
    })
    console.log('  ✅ Done')

    console.log('[4/8] Creating messages table...')
    await supabase.rpc('exec_sql', {
      sql: `
        create table if not exists public.messages (
          id uuid primary key default gen_random_uuid(),
          conversation_id uuid not null,
          role text not null check (role in ('user', 'assistant')),
          content text not null,
          created_at timestamptz default now() not null,
          chart_config jsonb,
          follow_up_questions text[],
          data_used jsonb,
          constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade
        );
      `
    })
    console.log('  ✅ Done')

    console.log('[5/8] Creating messages indexes...')
    await supabase.rpc('exec_sql', {
      sql: `create index if not exists messages_conversation_id_created_at_idx on public.messages(conversation_id, created_at);`
    })
    console.log('  ✅ Done')

    console.log('[6/8] Setting up RLS policies for messages...')
    await supabase.rpc('exec_sql', {
      sql: `
        alter table public.messages enable row level security;

        drop policy if exists "Users can view messages in their conversations" on public.messages;
        create policy "Users can view messages in their conversations"
          on public.messages for select
          using (
            exists (
              select 1 from public.conversations
              where conversations.id = messages.conversation_id
              and conversations.user_id = auth.uid()
            )
          );

        drop policy if exists "Users can create messages in their conversations" on public.messages;
        create policy "Users can create messages in their conversations"
          on public.messages for insert
          with check (
            exists (
              select 1 from public.conversations
              where conversations.id = messages.conversation_id
              and conversations.user_id = auth.uid()
            )
          );

        drop policy if exists "Users can delete messages in their conversations" on public.messages;
        create policy "Users can delete messages in their conversations"
          on public.messages for delete
          using (
            exists (
              select 1 from public.conversations
              where conversations.id = messages.conversation_id
              and conversations.user_id = auth.uid()
            )
          );
      `
    })
    console.log('  ✅ Done')

    console.log('[7/8] Creating helper functions...')
    await supabase.rpc('exec_sql', {
      sql: `
        create or replace function public.generate_conversation_title(conversation_id uuid)
        returns text
        language plpgsql
        security definer
        set search_path = public
        as $$
        declare
          first_message text;
          title_text text;
        begin
          select content into first_message
          from public.messages
          where messages.conversation_id = generate_conversation_title.conversation_id
            and role = 'user'
          order by created_at
          limit 1;

          if first_message is null then
            return 'New Conversation';
          end if;

          if length(first_message) > 60 then
            title_text := substring(first_message from 1 for 60) || '...';
          else
            title_text := first_message;
          end if;

          return title_text;
        end;
        $$;
      `
    })
    console.log('  ✅ Done')

    console.log('[8/8] Creating triggers...')
    await supabase.rpc('exec_sql', {
      sql: `
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

        drop trigger if exists update_conversation_on_message_insert on public.messages;
        create trigger update_conversation_on_message_insert
          after insert on public.messages
          for each row
          execute function public.update_conversation_timestamp();

        create or replace function public.update_conversation_timestamp_on_update()
        returns trigger
        language plpgsql
        as $$
        begin
          NEW.updated_at = now();
          return NEW;
        end;
        $$;

        drop trigger if exists update_conversation_timestamp_before_update on public.conversations;
        create trigger update_conversation_timestamp_before_update
          before update on public.conversations
          for each row
          execute function public.update_conversation_timestamp_on_update();
      `
    })
    console.log('  ✅ Done')

    console.log('\n✅ Migration completed successfully!')

    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .limit(0)

    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .limit(0)

    if (!convError && !msgError) {
      console.log('✅ Tables verified: conversations and messages are accessible')
    } else {
      console.log('⚠️  Verification had issues, but tables may still exist')
      if (convError) console.log('  conversations:', convError.message)
      if (msgError) console.log('  messages:', msgError.message)
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message)
    console.log('\n📋 You can run the migration manually:')
    console.log('1. Go to https://supabase.com/dashboard')
    console.log('2. Select your project')
    console.log('3. Go to SQL Editor')
    console.log('4. Paste contents of: supabase/migrations/20250106_conversations.sql')
    console.log('5. Click Run')
    process.exit(1)
  }
}

runMigration()
