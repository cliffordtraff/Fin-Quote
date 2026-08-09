import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const conversationMigration = source(
  'supabase/migrations/20260809140000_bound_chatbot_conversations.sql',
)
const admissionMigration = source(
  'supabase/migrations/20260809150000_durable_chatbot_request_admission.sql',
)
const conversationPgTap = source(
  'supabase/tests/bound_chatbot_conversations.sql',
)
const admissionPgTap = source(
  'supabase/tests/durable_chatbot_request_admission.sql',
)
const actions = source('app/actions/conversations.ts')
const chatbotPage = source('app/chatbot/page.tsx')
const recentQueries = source('components/RecentQueries.tsx')
const askRoute = source('app/api/ask/route.ts')

function functionDefinition(sql: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?\\$function\\$;`,
  ))
  if (!match?.[0]) throw new Error(`Missing SQL function ${name}`)
  return match[0]
}

describe('bounded chatbot persistence migration contract', () => {
  it('keeps both ordered migrations transactional with balanced function bodies', () => {
    for (const [migration, expectedFunctions] of [
      [conversationMigration, 7],
      [admissionMigration, 6],
    ] as const) {
      expect(migration).toMatch(/^--[\s\S]*\bBEGIN;/)
      expect(migration.trimEnd()).toMatch(/COMMIT;$/)
      expect(migration.match(/CREATE OR REPLACE FUNCTION public\./g))
        .toHaveLength(expectedFunctions)
      expect(migration.match(/AS \$function\$/g)).toHaveLength(expectedFunctions)
      expect(migration.match(/^\$function\$;$/gm)).toHaveLength(expectedFunctions)
    }

    for (const name of [
      'commit_chatbot_conversation_turn',
      'delete_chatbot_conversation',
      'list_chatbot_conversations',
      'get_chatbot_conversation_page',
    ]) {
      const definition = functionDefinition(conversationMigration, name)
      expect(definition.match(/END;\n\$function\$;/g)).toHaveLength(1)
    }
    for (const name of [
      'acquire_chatbot_request_admission',
      'resolve_chatbot_request_admission',
      'resolve_owned_chatbot_request_admission',
      'fail_chatbot_request_admission',
      'preflight_chatbot_conversation_turn',
      'commit_chatbot_turn_and_complete_request',
    ]) {
      const definition = functionDefinition(admissionMigration, name)
      expect(definition.match(/END;\n\$function\$;/g)).toHaveLength(1)
    }

    const combined = `${conversationMigration}\n${admissionMigration}`
    expect(combined).not.toMatch(/owner_id\s*=\s*owner_id/)
    expect(combined).not.toMatch(
      /RAISE EXCEPTION USING ERRCODE = '22023',\s*RAISE EXCEPTION/,
    )
    expect(combined).not.toMatch(
      /SET statement_timeout = '[58]s'\s*SET statement_timeout/,
    )
    expect(combined).not.toMatch(/OWNER TO postgres;\s*OWNER TO postgres;/)
    expect(combined).not.toMatch(
      /SELECT pg_catalog\.count\(\*\)::integer\s*SELECT pg_catalog\.count/,
    )
    expect(combined).not.toMatch(
      /p_request_fingerprint text,\s*p_request_fingerprint text/,
    )
    const combo = functionDefinition(
      admissionMigration,
      'commit_chatbot_turn_and_complete_request',
    )
    expect(combo.match(/\n  title text,/g)).toHaveLength(1)
    expect(combo).toMatch(
      /RETURNS TABLE \(\n  disposition text,\n  conversation_id uuid,\n  revision bigint,\n  title text,\n  updated_at timestamptz,\n  user_message_id uuid,\n  assistant_message_id uuid\n\)/,
    )
    expect(admissionMigration).not.toMatch(
      /chatbot_idempotency_key_is_current\(\s*p_idempotency_key,\s*p_idempotency_key,/,
    )
    const turnCommit = functionDefinition(
      conversationMigration,
      'commit_chatbot_conversation_turn',
    )
    expect(turnCommit).toMatch(
      /chatbot_json_object_is_bounded\(\s*p_chart_config,\s*131072\s*\)/,
    )
    expect(turnCommit).toMatch(
      /chatbot_json_object_is_bounded\(\s*p_data_used,\s*262144\s*\)/,
    )
    expect(turnCommit).not.toMatch(
      /chatbot_json_object_is_bounded\(\s*(p_chart_config|p_data_used),\s*\1,/,
    )
  })

  it('shares one time-bounded command identity that remains safe after compaction', () => {
    const helper = functionDefinition(
      conversationMigration,
      'chatbot_idempotency_key_is_current',
    )
    expect(helper).toContain("'^c1\\.[0-9]{13}\\.")
    expect(helper).toContain('- 2592000000')
    expect(helper).toContain('+ 600000')

    for (const name of [
      'commit_chatbot_conversation_turn',
      'delete_chatbot_conversation',
    ]) {
      expect(functionDefinition(conversationMigration, name)).toContain(
        'public.chatbot_idempotency_key_is_current(',
      )
    }
    for (const name of [
      'acquire_chatbot_request_admission',
      'resolve_chatbot_request_admission',
      'fail_chatbot_request_admission',
    ]) {
      expect(functionDefinition(admissionMigration, name)).toContain(
        'public.chatbot_idempotency_key_is_current(',
      )
    }

    const acquire = functionDefinition(
      admissionMigration,
      'acquire_chatbot_request_admission',
    )
    expect(acquire.indexOf('SELECT request.*')).toBeLessThan(
      acquire.indexOf('WITH stale_requests AS'),
    )
    expect(acquire).toContain("interval '30 days'")
    expect(acquire).toContain("now_at + interval '180 seconds'")
    expect(acquire).toContain('LIMIT 1024')
    expect(acquire).toContain('LIMIT 90001')
    expect(acquire).toContain('retained_identity_count >= 90000')
    expect(acquire).toContain('request_row.attempt_count >= 6')
    expect(acquire).toContain('attempt_count = request.attempt_count + 1')
    expect(acquire.match(/INSERT INTO public\.chatbot_request_rate_events/g))
      .toHaveLength(2)
    expect(admissionMigration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.complete_chatbot_request_admission',
    )
    const ownedResolver = functionDefinition(
      admissionMigration,
      'resolve_owned_chatbot_request_admission',
    )
    expect(ownedResolver).toContain('current_owner_id uuid := auth.uid()')
    expect(ownedResolver).toContain('SET search_path = \'\'')
    expect(ownedResolver).toContain("SET statement_timeout = '5s'")
    expect(admissionMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.resolve_owned_chatbot_request_admission(\n  text, text\n) TO authenticated',
    )
    expect(admissionPgTap).toContain('an evicted key is intrinsically inadmissible')
    expect(conversationPgTap).toContain('after receipt expiry')
  })

  it('keeps receipts content-free, replay-first, and missing targets private', () => {
    expect(conversationMigration).not.toContain('result_title')
    expect(conversationMigration).toContain("command_type IN ('commit_turn', 'delete')")
    expect(conversationMigration).toContain('REFERENCES auth.users(id) ON DELETE CASCADE')

    const commit = functionDefinition(
      conversationMigration,
      'commit_chatbot_conversation_turn',
    )
    expect(commit.indexOf('SELECT receipt.*')).toBeLessThan(
      commit.indexOf('WITH expired_receipts AS'),
    )
    expect(commit).not.toMatch(
      /SELECT\s+conversation\.user_id[\s\S]{0,120}p_conversation_id/,
    )
    expect(commit).toContain("'gone'::text")
    expect(commit).toContain('IF p_conversation_id IS NOT NULL THEN')
    expect(commit).toContain('LIMIT 101')
    expect(commit).toContain('LIMIT 201')
    expect(commit).toContain('retained_receipt_count >= 180000')
    expect(commit).toContain('LIMIT 180001')

    expect(conversationPgTap).toContain('indistinguishable content-free result')
    expect(conversationPgTap).toContain('no title or message content in receipts')
    expect(conversationPgTap).toContain('more than 256 newer commands')
  })

  it('locks caps, deterministic reads, and browser write revocation', () => {
    for (const literal of [
      '8192',
      '32768',
      '131072',
      '262144',
      'cardinality(p_questions) <= 5',
      'char_length(pg_catalog.btrim(question.value)) NOT BETWEEN 1 AND 240',
    ]) {
      expect(conversationMigration).toContain(literal)
    }
    expect(conversationMigration).toContain(
      'ON public.conversations (user_id, updated_at DESC, id DESC)',
    )
    expect(conversationMigration).toContain(
      'ON public.messages (conversation_id, created_at, id)',
    )
    expect(conversationMigration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.conversations FROM authenticated',
    )
    expect(conversationMigration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.messages FROM authenticated',
    )
    expect(conversationMigration).not.toContain(
      'GRANT SELECT ON TABLE public.conversations TO authenticated',
    )
    expect(conversationMigration).not.toContain(
      'GRANT SELECT ON TABLE public.messages TO authenticated',
    )
    expect(conversationMigration).toContain(
      'REVOKE ALL PRIVILEGES (\n  id, user_id, title, created_at, updated_at, revision',
    )
    const detailRead = functionDefinition(
      conversationMigration,
      'get_chatbot_conversation_page',
    )
    expect(detailRead).toContain('page_byte_budget constant bigint := 786432')
    expect(detailRead).toContain('LIMIT p_limit + 1')
    expect(detailRead).toContain('LIMIT 201')
    expect(detailRead).toContain('legacy per-field violation')
    expect(detailRead).toContain(
      'public.chatbot_json_object_is_bounded(\n            message.chart_config',
    )
    expect(detailRead).toContain(
      'public.chatbot_followups_are_bounded(\n            message.follow_up_questions',
    )
    expect(detailRead).toContain(
      'ORDER BY message.created_at DESC, message.id DESC',
    )
    expect(conversationPgTap).toContain("'authenticated', 'public.conversations', 'TRUNCATE'")
    expect(conversationPgTap).toContain("'authenticated', 'public.messages', 'TRUNCATE'")
    expect(conversationPgTap).toContain(
      'service role can inspect replay state but cannot mutate it directly',
    )
    expect(conversationMigration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.generate_conversation_title(uuid)',
    )
  })

  it('keeps durable authority ahead of paid work and settles through token fences', () => {
    const acquire = functionDefinition(
      admissionMigration,
      'acquire_chatbot_request_admission',
    )
    expect(acquire).toContain("fixed_lease_seconds constant integer := 180")
    expect(askRoute).toContain('export const maxDuration = 120')
    expect(acquire).toContain('active_for_owner >= 1')
    expect(acquire).toContain('active_global >= 4')
    expect(acquire).toContain('recent_for_owner >= 20')
    expect(acquire).toContain("interval '10 minutes'")

    expect(askRoute.indexOf('await acquireDurableChatbotAdmission(')).toBeLessThan(
      askRoute.indexOf('reserveChatbotRequest(currentUser.id)'),
    )
    expect(askRoute.indexOf('await acquireDurableChatbotAdmission(')).toBeLessThan(
      askRoute.indexOf('openai.responses.create('),
    )
    expect(askRoute).toContain('completeChatbotTurnAndRequest')
    expect(askRoute).toContain('failDurableChatbotAdmission')
    expect(askRoute).toContain('resolveDurableChatbotAdmission')
    expect(askRoute).toContain('CHATBOT_COMPLETION_UNCERTAIN')
    expect(askRoute.indexOf('await completeChatbotTurnAndRequest(')).toBeLessThan(
      askRoute.indexOf("sendEvent('complete'"),
    )
    expect(askRoute.indexOf('preflightChatbotConversationTarget(')).toBeLessThan(
      askRoute.indexOf('openai.responses.create('),
    )
    expect(askRoute).toContain("case 'command_quota':")
    const preflight = functionDefinition(
      admissionMigration,
      'preflight_chatbot_conversation_turn',
    )
    expect(preflight).toContain('retained_receipt_count >= 180000')
    expect(conversationMigration).toContain('172800')
    expect(preflight).toContain("RETURN 'not_found'")
    expect(preflight).toContain('existing_message_count > 198')
    expect(admissionMigration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.commit_chatbot_conversation_turn(',
    )
    expect(conversationMigration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.commit_chatbot_conversation_turn\([\s\S]*?TO authenticated/,
    )
    expect(admissionPgTap).toContain('cross-owner failure settlement')
    expect(admissionPgTap).toContain('twenty new request identities')
  })

  it('uses bounded application contracts and server-owned atomic completion', () => {
    expect(actions).toContain(".rpc('list_chatbot_conversations'")
    expect(actions).toContain("'get_chatbot_conversation_page'")
    expect(actions).not.toContain(".from('conversations')")
    expect(actions).not.toContain(".from('messages')")
    expect(actions).toContain('data.length > parsed.data.limit + 1')
    expect(actions).toContain('data.length > parsed.data.limit')
    expect(actions).toContain("status: 'empty'")
    expect(actions).toContain("status: 'unavailable'")
    expect(actions).toContain('comparePostgresTimestamps(')
    expect(actions).not.toMatch(/export async function (?:createConversation|saveMessage|migrate)/)

    expect(chatbotPage).not.toContain('commitConversationTurn')
    expect(chatbotPage).toContain(
      'idempotencyKey: clientRequest.idempotencyKey',
    )
    expect(chatbotPage).toContain('conversationId: conversationIdSnapshot')
    expect(chatbotPage).toContain('expectedRevision: conversationRevisionSnapshot')
    expect(chatbotPage).toContain('projectChatbotPromptHistory(')
    expect(chatbotPage).toContain('projectChatbotRequestBody({')
    expect(chatbotPage).toContain('savePendingChatbotCommand(')
    expect(chatbotPage).toContain('getConversation(durableReceipt.conversationId)')
    expect(chatbotPage).toContain('handleLoadOlderMessages')
    expect(chatbotPage).toContain('visibleOlderMessagesCursor')
    expect(chatbotPage).not.toContain('autoGenerateTitle')
    expect(recentQueries).toContain('createChatbotIdempotencyKey()')
    expect(recentQueries).toContain('router.push(`/chatbot?id=${conversationId}`)')
    expect(recentQueries).not.toContain('onQueryClick(conversation.id)')

    expect(conversationPgTap.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(admissionPgTap.trimEnd()).toMatch(/ROLLBACK;$/)
  })
})
