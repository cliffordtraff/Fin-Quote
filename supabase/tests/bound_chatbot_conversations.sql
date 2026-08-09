BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.chatbot_key(label text, issued_offset interval DEFAULT interval '0')
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
  digest text := md5(label);
  issued_milliseconds bigint := pg_catalog.floor(
    pg_catalog.date_part(
      'epoch',
      pg_catalog.transaction_timestamp() + issued_offset
    ) * 1000
  )::bigint;
BEGIN
  RETURN pg_catalog.format(
    'c1.%s.%s-%s-4%s-a%s-%s',
    issued_milliseconds,
    pg_catalog.substring(digest, 1, 8),
    pg_catalog.substring(digest, 9, 4),
    pg_catalog.substring(digest, 13, 3),
    pg_catalog.substring(digest, 16, 3),
    pg_catalog.substring(digest, 19, 12)
  );
END;
$function$;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'revision'
      AND data_type = 'bigint'
      AND is_nullable = 'NO'
  )
    AND to_regclass('public.chatbot_conversation_command_receipts') IS NOT NULL
    AND to_regclass('public.chatbot_deleted_conversations') IS NOT NULL,
  'bounded conversation state and replay tables exist'
);

SELECT ok(
  pg_catalog.pg_get_functiondef(
    'public.commit_chatbot_conversation_turn(uuid,bigint,text,text,text,text,jsonb,text[],jsonb)'::regprocedure
  ) LIKE '%LIMIT 180001%'
    AND pg_catalog.pg_get_functiondef(
      'public.commit_chatbot_conversation_turn(uuid,bigint,text,text,text,text,jsonb,text[],jsonb)'::regprocedure
    ) LIKE '%retained_receipt_count >= 180000%'
    AND pg_catalog.pg_get_functiondef(
      'public.delete_chatbot_conversation(uuid,bigint,text,text)'::regprocedure
    ) LIKE '%retained_receipt_count >= 180000%',
  'the finite receipt fuse covers maximum thirty-day admitted turns plus deletes'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND indexname = 'idx_conversations_owner_keyset'
      AND indexdef LIKE '%(user_id, updated_at DESC, id DESC)%'
  )
    AND EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'messages'
        AND indexname = 'idx_messages_conversation_deterministic'
        AND indexdef LIKE '%(conversation_id, created_at, id)%'
    ),
  'owner-keyset and deterministic-message indexes match bounded reads'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.conversations', 'SELECT')
    AND NOT has_any_column_privilege(
      'authenticated', 'public.conversations', 'SELECT'
    )
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'REFERENCES')
    AND NOT has_table_privilege('authenticated', 'public.conversations', 'TRIGGER')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'SELECT')
    AND NOT has_any_column_privilege(
      'authenticated', 'public.messages', 'SELECT'
    )
    AND NOT has_table_privilege('authenticated', 'public.messages', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'REFERENCES')
    AND NOT has_table_privilege('authenticated', 'public.messages', 'TRIGGER'),
  'browser roles cannot bypass bounded read and mutation RPCs through base tables'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    ) AS privilege_name
    CROSS JOIN unnest(
      ARRAY[
        'public.chatbot_conversation_command_receipts',
        'public.chatbot_deleted_conversations'
      ]
    ) AS table_name
    WHERE has_table_privilege(role_name, table_name, privilege_name)
  ),
  'receipts and tombstones are hidden from browser Data API roles'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(
      ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    ) AS privilege_name
    CROSS JOIN unnest(
      ARRAY[
        'public.chatbot_conversation_command_receipts',
        'public.chatbot_deleted_conversations'
      ]
    ) AS table_name
    WHERE has_table_privilege('service_role', table_name, privilege_name)
  )
    AND has_table_privilege(
      'service_role',
      'public.chatbot_conversation_command_receipts',
      'SELECT'
    )
    AND has_table_privilege(
      'service_role',
      'public.chatbot_deleted_conversations',
      'SELECT'
    ),
  'service role can inspect replay state but cannot mutate it directly'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.commit_chatbot_conversation_turn(uuid,bigint,text,text,text,text,jsonb,text[],jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.commit_chatbot_conversation_turn(uuid,bigint,text,text,text,text,jsonb,text[],jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.delete_chatbot_conversation(uuid,bigint,text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.delete_chatbot_conversation(uuid,bigint,text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.list_chatbot_conversations(timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.get_chatbot_conversation_page(uuid,timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.list_chatbot_conversations(timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.get_chatbot_conversation_page(uuid,timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.generate_conversation_title(uuid)',
      'EXECUTE'
    ),
  'only owner-derived bounded reads and delete are exposed to authenticated callers'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
      AND procedure.proconfig @> ARRAY['statement_timeout=5s']::text[]
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.commit_chatbot_conversation_turn(uuid,bigint,text,text,text,text,jsonb,text[],jsonb)'::regprocedure
  )
    AND (
      SELECT procedure.prosecdef
        AND procedure.proconfig @> ARRAY['search_path=""']::text[]
        AND procedure.proconfig @> ARRAY['statement_timeout=5s']::text[]
      FROM pg_proc AS procedure
      WHERE procedure.oid =
        'public.delete_chatbot_conversation(uuid,bigint,text,text)'::regprocedure
    )
    AND (
      SELECT pg_catalog.bool_and(
        procedure.prosecdef
        AND procedure.proconfig @> ARRAY['search_path=""']::text[]
        AND procedure.proconfig @> ARRAY['statement_timeout=5s']::text[]
      )
      FROM pg_proc AS procedure
      WHERE procedure.oid IN (
        'public.list_chatbot_conversations(timestamptz,uuid,integer)'::regprocedure,
        'public.get_chatbot_conversation_page(uuid,timestamptz,uuid,integer)'::regprocedure
      )
    ),
  'conversation read and mutation RPCs are short security definers with empty search paths'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'chatbot_conversation_command_receipts',
        'chatbot_deleted_conversations'
      )
      AND column_name ~ '(title|content|chart|follow|data_used)'
  ),
  'receipt and tombstone schemas retain no user or assistant content'
);

-- The remaining assertions exercise the internal primitive and inspect its
-- rows directly. Grant both only inside this rolled-back test transaction after
-- proving the production Data API ACLs above.
GRANT EXECUTE ON FUNCTION public.commit_chatbot_conversation_turn(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb
) TO authenticated;
GRANT SELECT ON TABLE public.conversations, public.messages TO authenticated;

INSERT INTO auth.users (id) VALUES
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002'),
  ('c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000004'),
  ('c1000000-0000-4000-8000-000000000005');

-- A victim row lets us prove that a caller cannot distinguish a foreign UUID
-- from one that never existed.
INSERT INTO public.conversations (id, user_id, title)
VALUES (
  'c2000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000002',
  'owner B private title'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE first_turn AS
SELECT *
FROM public.commit_chatbot_conversation_turn(
  NULL,
  0,
  pg_temp.chatbot_key('first-turn-key-01'),
  repeat('a', 64),
  'What happened to Apple today?',
  'Apple moved after its earnings update.',
  '{"type":"line"}'::jsonb,
  ARRAY['What changed in guidance?'],
  '{"symbol":"AAPL"}'::jsonb
);

SELECT ok(
  (SELECT disposition = 'applied' FROM first_turn)
    AND (SELECT revision = 1 FROM first_turn)
    AND (SELECT title = 'What happened to Apple today?' FROM first_turn)
    AND (
      SELECT count(*) = 2
      FROM public.messages
      WHERE conversation_id = (SELECT conversation_id FROM first_turn)
    ),
  'one command atomically creates a titled conversation and exactly one message pair'
);

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('first-turn-key-01'),
      repeat('a', 64),
      'What happened to Apple today?',
      'Apple moved after its earnings update.',
      '{"type":"line"}'::jsonb,
      ARRAY['What changed in guidance?'],
      '{"symbol":"AAPL"}'::jsonb
    )
  ),
  'replayed',
  'a lost-response retry resolves through the exact receipt'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.messages
    WHERE conversation_id = (SELECT conversation_id FROM first_turn)
  ),
  2::bigint,
  'an exact retry cannot duplicate either half of a turn'
);

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('first-turn-key-01'),
      repeat('b', 64),
      'Different request',
      'Different answer',
      NULL,
      NULL,
      NULL
    )
  ),
  'key_conflict',
  'the same key with another canonical fingerprint conflicts'
);

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      (SELECT conversation_id FROM first_turn),
      0,
      pg_temp.chatbot_key('stale-revision-key-01'),
      repeat('c', 64),
      'Stale writer',
      'Stale answer',
      NULL,
      NULL,
      NULL
    )
  ),
  'revision_conflict',
  'compare-and-swap rejects a stale conversation revision'
);

CREATE TEMP TABLE foreign_probe AS
SELECT *
FROM public.commit_chatbot_conversation_turn(
  'c2000000-0000-4000-8000-000000000002',
  0,
  pg_temp.chatbot_key('foreign-probe-key-01'),
  repeat('d', 64),
  'Probe',
  'Probe answer',
  NULL,
  NULL,
  NULL
);

CREATE TEMP TABLE absent_probe AS
SELECT *
FROM public.commit_chatbot_conversation_turn(
  'c2000000-0000-4000-8000-000000000099',
  0,
  pg_temp.chatbot_key('absent-probe-key-01'),
  repeat('e', 64),
  'Probe',
  'Probe answer',
  NULL,
  NULL,
  NULL
);

SELECT ok(
  (SELECT disposition = 'gone' AND revision IS NULL AND title IS NULL FROM foreign_probe)
    AND (SELECT disposition = 'gone' AND revision IS NULL AND title IS NULL FROM absent_probe),
  'foreign and absent non-null UUIDs have an indistinguishable content-free result'
);

SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.commit_chatbot_conversation_turn(
      NULL, 0, %L, '%s', 'small user message', '%s',
      NULL, NULL, NULL
    )$statement$,
    pg_temp.chatbot_key('oversized-turn-key-01'),
    repeat('f', 64),
    repeat('x', 32769)
  ),
  '22023',
  'Invalid or oversized chatbot turn',
  'oversized assistant content is rejected before any write'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.conversations
    WHERE user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'a rejected command cannot leave an empty conversation or half-turn behind'
);

CREATE TEMP TABLE second_turn AS
SELECT *
FROM public.commit_chatbot_conversation_turn(
  (SELECT conversation_id FROM first_turn),
  1,
  pg_temp.chatbot_key('second-turn-key-01'),
  repeat('1', 64),
  'What about guidance?',
  'Guidance increased modestly.',
  NULL,
  NULL,
  NULL
);

SELECT ok(
  (SELECT disposition = 'applied' AND revision = 2 FROM second_turn)
    AND (
      SELECT array_agg(role ORDER BY created_at, id) =
        ARRAY['user', 'assistant', 'user', 'assistant']::text[]
      FROM public.messages
      WHERE conversation_id = (SELECT conversation_id FROM first_turn)
    ),
  'successful turns increment revision and retain deterministic pair ordering'
);

SELECT ok(
  (
    SELECT replayed.disposition = 'replayed'
      AND replayed.revision = 1
      AND replayed.updated_at = original.updated_at
      AND replayed.user_message_id = original.user_message_id
      AND replayed.assistant_message_id = original.assistant_message_id
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('first-turn-key-01'),
      repeat('a', 64),
      'What happened to Apple today?',
      'Apple moved after its earnings update.',
      '{"type":"line"}'::jsonb,
      ARRAY['What changed in guidance?'],
      '{"symbol":"AAPL"}'::jsonb
    ) AS replayed
    CROSS JOIN first_turn AS original
  ),
  'an older exact replay keeps its receipt revision, timestamp, and message ids'
);

CREATE TEMP TABLE owner_list_page AS
SELECT *
FROM public.list_chatbot_conversations(NULL, NULL, 50);

CREATE TEMP TABLE newest_message_page AS
SELECT *
FROM public.get_chatbot_conversation_page(
  (SELECT conversation_id FROM first_turn),
  NULL,
  NULL,
  2
);

CREATE TEMP TABLE older_message_page AS
SELECT *
FROM public.get_chatbot_conversation_page(
  (SELECT conversation_id FROM first_turn),
  (
    SELECT message_created_at
    FROM newest_message_page
    ORDER BY message_created_at, message_id
    LIMIT 1
  ),
  (
    SELECT message_id
    FROM newest_message_page
    ORDER BY message_created_at, message_id
    LIMIT 1
  ),
  2
);

SELECT ok(
  (SELECT count(*) = 1 FROM owner_list_page)
    AND NOT EXISTS (
      SELECT 1 FROM owner_list_page
      WHERE id = 'c2000000-0000-4000-8000-000000000002'
    )
    AND (
      SELECT count(*) = 2 AND pg_catalog.bool_and(has_more)
      FROM newest_message_page
      WHERE status = 'ready' AND message_id IS NOT NULL
    )
    AND (
      SELECT count(*) = 2 AND NOT pg_catalog.bool_or(has_more)
      FROM older_message_page
      WHERE status = 'ready' AND message_id IS NOT NULL
    )
    AND (
      SELECT count(DISTINCT message_id) = 4
      FROM (
        SELECT message_id FROM newest_message_page
        UNION ALL
        SELECT message_id FROM older_message_page
      ) AS paged_messages
    ),
  'owner reads use bounded newest-first pages with a stable older-message cursor'
);

CREATE TEMP TABLE foreign_read AS
SELECT *
FROM public.get_chatbot_conversation_page(
  'c2000000-0000-4000-8000-000000000002', NULL, NULL, 50
);
CREATE TEMP TABLE absent_read AS
SELECT *
FROM public.get_chatbot_conversation_page(
  'c2000000-0000-4000-8000-000000000099', NULL, NULL, 50
);

SELECT ok(
  (SELECT status = 'not_found' FROM foreign_read)
    AND (SELECT status = 'not_found' FROM absent_read)
    AND (
      SELECT pg_catalog.to_jsonb(foreign_row)
      FROM foreign_read AS foreign_row
    ) = (
      SELECT pg_catalog.to_jsonb(absent_row)
      FROM absent_read AS absent_row
    ),
  'bounded detail reads make foreign and absent conversation ids indistinguishable'
);

RESET ROLE;
INSERT INTO public.conversations (id, user_id, title)
VALUES (
  'c2000000-0000-4000-8000-000000000040',
  'c1000000-0000-4000-8000-000000000004',
  'Aggregate byte budget fixture'
);
INSERT INTO public.messages (conversation_id, role, content)
SELECT
  'c2000000-0000-4000-8000-000000000040',
  'assistant',
  pg_catalog.repeat(pg_catalog.chr(1), 20000)
FROM generate_series(1, 50);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000004',
  true
);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE byte_bounded_page AS
SELECT *
FROM public.get_chatbot_conversation_page(
  'c2000000-0000-4000-8000-000000000040', NULL, NULL, 50
);

SELECT ok(
  (SELECT count(*) BETWEEN 1 AND 49 FROM byte_bounded_page)
    AND (SELECT pg_catalog.bool_and(has_more) FROM byte_bounded_page)
    AND (
      SELECT pg_catalog.sum(
        2048::bigint
          + pg_catalog.octet_length(
              pg_catalog.to_jsonb(message_content)::text
            )::bigint
      ) <= 786432
      FROM byte_bounded_page
    ),
  'detail paging stops below the aggregate escaped-wire byte budget'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT disposition
    FROM public.delete_chatbot_conversation(
      (SELECT conversation_id FROM first_turn),
      1,
      pg_temp.chatbot_key('delete-stale-key-01'),
      repeat('2', 64)
    )
  ),
  'revision_conflict',
  'delete also enforces compare-and-swap'
);

CREATE TEMP TABLE first_delete AS
SELECT *
FROM public.delete_chatbot_conversation(
  (SELECT conversation_id FROM first_turn),
  2,
  pg_temp.chatbot_key('delete-first-key-01'),
  repeat('3', 64)
);

SELECT ok(
  (SELECT disposition = 'applied' FROM first_delete)
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages
      WHERE conversation_id = (SELECT conversation_id FROM first_turn)
    ),
  'owner delete atomically cascades every message'
);

SELECT is(
  (
    SELECT disposition
    FROM public.delete_chatbot_conversation(
      (SELECT conversation_id FROM first_turn),
      2,
      pg_temp.chatbot_key('delete-first-key-01'),
      repeat('3', 64)
    )
  ),
  'replayed',
  'delete replays exactly inside the documented retention window'
);

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('first-turn-key-01'),
      repeat('a', 64),
      'What happened to Apple today?',
      'Apple moved after its earnings update.',
      '{"type":"line"}'::jsonb,
      ARRAY['What changed in guidance?'],
      '{"symbol":"AAPL"}'::jsonb
    )
  ),
  'deleted',
  'replaying a create receipt for a deleted target never recreates it'
);

RESET ROLE;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = 'c1000000-0000-4000-8000-000000000001'
      AND to_jsonb(receipt)::text LIKE '%What happened to Apple today%'
  ),
  'deleting a conversation leaves no title or message content in receipts'
);

-- Message and conversation quotas use independent owners so the fixtures do
-- not weaken the replay assertions above.
INSERT INTO public.conversations (id, user_id, title, revision)
SELECT
  ('c3' || lpad(number::text, 6, '0') || '-0000-4000-8000-000000000003')::uuid,
  'c1000000-0000-4000-8000-000000000003',
  'quota conversation ' || number,
  0
FROM generate_series(1, 100) AS number;

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000003',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      NULL, 0, pg_temp.chatbot_key('conversation-quota-key-01'), repeat('4', 64),
      'One too many', 'Cannot create', NULL, NULL, NULL
    )
  ),
  'conversation_quota',
  'a user cannot exceed one hundred live conversations'
);

RESET ROLE;

INSERT INTO public.conversations (id, user_id, title, revision)
VALUES (
  'c4000000-0000-4000-8000-000000000004',
  'c1000000-0000-4000-8000-000000000004',
  'full message conversation',
  0
);
INSERT INTO public.messages (conversation_id, role, content, created_at)
SELECT
  'c4000000-0000-4000-8000-000000000004',
  CASE WHEN number % 2 = 1 THEN 'user' ELSE 'assistant' END,
  'message ' || number,
  '2026-08-09 12:00:00+00'::timestamptz + number * interval '1 microsecond'
FROM generate_series(1, 199) AS number;

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000004',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      'c4000000-0000-4000-8000-000000000004',
      0,
      pg_temp.chatbot_key('message-quota-key-01'),
      repeat('5', 64),
      'One more pair',
      'Would exceed two hundred',
      NULL,
      NULL,
      NULL
    )
  ),
  'message_quota',
  'a command cannot take a conversation past two hundred messages'
);

RESET ROLE;

-- Generate more than the cleanup batch size. The first receipt must survive;
-- retrying it after hundreds of newer commands must not create another turn.
CREATE FUNCTION pg_temp.churn_chatbot_conversations(owner_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  command_number integer;
  created_id uuid;
  created_revision bigint;
  first_id uuid;
BEGIN
  FOR command_number IN 1..257 LOOP
    SELECT result.conversation_id, result.revision
    INTO created_id, created_revision
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('ring-create-' || lpad(command_number::text, 4, '0')),
      md5('create-' || command_number::text)
        || md5('create-fingerprint-' || command_number::text),
      'ring user ' || command_number,
      'ring assistant ' || command_number,
      NULL,
      NULL,
      NULL
    ) AS result;
    IF command_number = 1 THEN first_id := created_id; END IF;

    PERFORM 1
    FROM public.delete_chatbot_conversation(
      created_id,
      created_revision,
      pg_temp.chatbot_key('ring-delete-' || lpad(command_number::text, 4, '0')),
      md5('delete-' || command_number::text)
        || md5('delete-fingerprint-' || command_number::text)
    );
  END LOOP;
  RETURN first_id;
END;
$function$;

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000005',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE ring_first AS
SELECT pg_temp.churn_chatbot_conversations(
  'c1000000-0000-4000-8000-000000000005'
) AS conversation_id;

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      NULL,
      0,
      pg_temp.chatbot_key('ring-create-0001'),
      md5('create-1') || md5('create-fingerprint-1'),
      'ring user 1',
      'ring assistant 1',
      NULL,
      NULL,
      NULL
    )
  ),
  'deleted',
  'more than 256 newer commands cannot evict an unexpired lost-response receipt'
);

RESET ROLE;

-- Simulate the documented post-retention state. Safety comes from command
-- semantics: a non-null missing id is never interpreted as create.
DELETE FROM public.chatbot_conversation_command_receipts
WHERE owner_id = 'c1000000-0000-4000-8000-000000000005'
  AND conversation_id = (SELECT conversation_id FROM ring_first);
DELETE FROM public.chatbot_deleted_conversations
WHERE owner_id = 'c1000000-0000-4000-8000-000000000005'
  AND conversation_id = (SELECT conversation_id FROM ring_first);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000005',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT disposition
    FROM public.commit_chatbot_conversation_turn(
      (SELECT conversation_id FROM ring_first),
      0,
      pg_temp.chatbot_key('post-retention-key-01'),
      repeat('6', 64),
      'must not recreate',
      'must not recreate',
      NULL,
      NULL,
      NULL
    )
  ),
  'gone',
  'a non-null deleted target remains non-creating after receipt expiry'
);

SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.commit_chatbot_conversation_turn(
      NULL, 0, %L, '%s', 'expired retry', 'must not spend',
      NULL, NULL, NULL
    )$statement$,
    pg_temp.chatbot_key('expired-create-key', interval '-31 days'),
    repeat('7', 64)
  ),
  '22023',
  'Invalid or oversized chatbot turn',
  'an evicted create key is intrinsically inadmissible after the retry window'
);

RESET ROLE;

-- Simulate rows written before the new NOT VALID constraints existed. Each
-- remains below the aggregate response budget but violates one strict
-- application field contract; the read RPC must return one content-free
-- overflow instead of a forever-unavailable ready payload.
ALTER TABLE public.messages
  DROP CONSTRAINT messages_content_bounded_check,
  DROP CONSTRAINT messages_chart_config_bounded_check,
  DROP CONSTRAINT messages_data_used_bounded_check,
  DROP CONSTRAINT messages_follow_up_questions_bounded_check;

INSERT INTO public.conversations (id, user_id, title) VALUES
  ('c5000000-0000-4000-8000-000000000041', 'c1000000-0000-4000-8000-000000000005', 'legacy content'),
  ('c5000000-0000-4000-8000-000000000042', 'c1000000-0000-4000-8000-000000000005', 'legacy chart'),
  ('c5000000-0000-4000-8000-000000000043', 'c1000000-0000-4000-8000-000000000005', 'legacy data'),
  ('c5000000-0000-4000-8000-000000000044', 'c1000000-0000-4000-8000-000000000005', 'legacy followup');

INSERT INTO public.messages (conversation_id, role, content) VALUES (
  'c5000000-0000-4000-8000-000000000041',
  'assistant',
  pg_catalog.repeat('x', 32769)
);
INSERT INTO public.messages (conversation_id, role, content, chart_config)
SELECT
  'c5000000-0000-4000-8000-000000000042',
  'assistant',
  'legacy chart',
  pg_catalog.jsonb_build_object(
    'series',
    (SELECT pg_catalog.jsonb_agg(number) FROM generate_series(1, 4100) AS number)
  );
INSERT INTO public.messages (conversation_id, role, content, data_used) VALUES (
  'c5000000-0000-4000-8000-000000000043',
  'assistant',
  'legacy data',
  pg_catalog.jsonb_build_object('payload', pg_catalog.repeat('x', 262145))
);
INSERT INTO public.messages (
  conversation_id, role, content, follow_up_questions
) VALUES (
  'c5000000-0000-4000-8000-000000000044',
  'assistant',
  'legacy followup',
  ARRAY[pg_catalog.repeat('x', 241)]::text[]
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000005',
  true
);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE legacy_overflow_reads AS
SELECT target.conversation_id AS requested_conversation_id, result.*
FROM (
  VALUES
    ('c5000000-0000-4000-8000-000000000041'::uuid),
    ('c5000000-0000-4000-8000-000000000042'::uuid),
    ('c5000000-0000-4000-8000-000000000043'::uuid),
    ('c5000000-0000-4000-8000-000000000044'::uuid)
) AS target(conversation_id)
CROSS JOIN LATERAL public.get_chatbot_conversation_page(
  target.conversation_id, NULL, NULL, 50
) AS result;

SELECT ok(
  (SELECT pg_catalog.count(*) = 4 FROM legacy_overflow_reads)
    AND (SELECT pg_catalog.bool_and(status = 'overflow') FROM legacy_overflow_reads)
    AND NOT EXISTS (
      SELECT 1
      FROM legacy_overflow_reads
      WHERE message_content IS NOT NULL
        OR chart_config IS NOT NULL
        OR data_used IS NOT NULL
        OR follow_up_questions IS NOT NULL
    ),
  'legacy per-field violations return content-free overflow, never ready rows'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
