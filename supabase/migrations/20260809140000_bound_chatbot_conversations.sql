-- Make chatbot history one bounded, transactional owner-scoped command surface.
-- Browser roles have no direct table privileges. Every read and durable
-- mutation is owned by a bounded auth.uid()-derived RPC.

BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_revision_nonnegative_check
    CHECK (revision >= 0),
  ADD CONSTRAINT conversations_title_bounded_check
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 1 AND 120
      AND pg_catalog.octet_length(title) <= 512
    ) NOT VALID;

-- Normalize a bounded legacy batch so the new NOT VALID constraint cannot
-- strand ordinary appends. Any older row beyond this batch is normalized by
-- the commit RPC immediately before its first successful compare-and-swap.
WITH legacy_conversation_titles AS (
  SELECT conversation.id
  FROM public.conversations AS conversation
  WHERE pg_catalog.char_length(pg_catalog.btrim(conversation.title)) NOT BETWEEN 1 AND 120
    OR pg_catalog.octet_length(conversation.title) > 512
  ORDER BY conversation.id
  LIMIT 10000
  FOR UPDATE
)
UPDATE public.conversations AS conversation
SET title = CASE
  WHEN pg_catalog.btrim(conversation.title) = '' THEN 'New Conversation'
  ELSE pg_catalog.substring(
    pg_catalog.btrim(conversation.title), 1, 117
  ) || '...'
END
FROM legacy_conversation_titles AS legacy
WHERE conversation.id = legacy.id;

CREATE OR REPLACE FUNCTION public.chatbot_idempotency_key_is_current(
  p_idempotency_key text,
  p_now timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_idempotency_key ~
      '^c1\.[0-9]{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN pg_catalog.split_part(p_idempotency_key, '.', 2)::numeric BETWEEN
      (pg_catalog.date_part('epoch', p_now) * 1000)::numeric - 2592000000
      AND (pg_catalog.date_part('epoch', p_now) * 1000)::numeric + 600000
    ELSE false
  END;
$function$;

ALTER FUNCTION public.chatbot_idempotency_key_is_current(text, timestamptz)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.chatbot_idempotency_key_is_current(
  text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.chatbot_followups_are_bounded(
  p_questions text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT
    coalesce(pg_catalog.array_ndims(p_questions), 1) = 1
    AND pg_catalog.cardinality(p_questions) <= 5
    AND pg_catalog.array_position(p_questions, NULL::text) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(p_questions) AS question(value)
      WHERE pg_catalog.char_length(pg_catalog.btrim(question.value)) NOT BETWEEN 1 AND 240
        OR pg_catalog.octet_length(question.value) > 960
    );
$function$;

ALTER FUNCTION public.chatbot_followups_are_bounded(text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.chatbot_followups_are_bounded(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chatbot_followups_are_bounded(text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.chatbot_json_object_is_bounded(
  p_value jsonb,
  p_max_bytes integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  WITH RECURSIVE json_nodes(node, depth) AS (
    SELECT p_value, 0
    UNION ALL
    SELECT child.node, parent.depth + 1
    FROM json_nodes AS parent
    CROSS JOIN LATERAL (
      SELECT array_element.value AS node
      FROM pg_catalog.jsonb_array_elements(
        CASE
          WHEN pg_catalog.jsonb_typeof(parent.node) = 'array'
            THEN parent.node
          ELSE '[]'::jsonb
        END
      ) AS array_element
      UNION ALL
      SELECT object_element.value AS node
      FROM pg_catalog.jsonb_each(
        CASE
          WHEN pg_catalog.jsonb_typeof(parent.node) = 'object'
            THEN parent.node
          ELSE '{}'::jsonb
        END
      ) AS object_element
    ) AS child
    WHERE parent.depth < 32
  ),
  bounded_nodes AS (
    SELECT node, depth
    FROM json_nodes
    LIMIT 4097
  )
  SELECT
    p_max_bytes > 0
    AND pg_catalog.jsonb_typeof(p_value) = 'object'
    AND pg_catalog.octet_length(p_value::text) <= p_max_bytes
    AND (SELECT pg_catalog.count(*) <= 4096 FROM bounded_nodes)
    AND NOT EXISTS (
      SELECT 1
      FROM bounded_nodes AS bounded
      WHERE bounded.depth = 32
        AND (
          (
            pg_catalog.jsonb_typeof(bounded.node) = 'array'
            AND pg_catalog.jsonb_array_length(bounded.node) > 0
          )
          OR (
            pg_catalog.jsonb_typeof(bounded.node) = 'object'
            AND bounded.node <> '{}'::jsonb
          )
        )
    );
$function$;

ALTER FUNCTION public.chatbot_json_object_is_bounded(jsonb, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.chatbot_json_object_is_bounded(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chatbot_json_object_is_bounded(jsonb, integer)
  TO service_role;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_bounded_check CHECK (
    pg_catalog.char_length(pg_catalog.btrim(content)) >= 1
    AND (
      (role = 'user' AND pg_catalog.octet_length(content) <= 8192)
      OR (role = 'assistant' AND pg_catalog.octet_length(content) <= 32768)
    )
  ) NOT VALID,
  ADD CONSTRAINT messages_chart_config_bounded_check CHECK (
    chart_config IS NULL
    OR public.chatbot_json_object_is_bounded(chart_config, 131072)
  ) NOT VALID,
  ADD CONSTRAINT messages_data_used_bounded_check CHECK (
    data_used IS NULL
    OR public.chatbot_json_object_is_bounded(data_used, 262144)
  ) NOT VALID,
  ADD CONSTRAINT messages_follow_up_questions_bounded_check CHECK (
    follow_up_questions IS NULL
    OR public.chatbot_followups_are_bounded(follow_up_questions)
  ) NOT VALID;

CREATE INDEX idx_conversations_owner_keyset
  ON public.conversations (user_id, updated_at DESC, id DESC);
CREATE INDEX idx_messages_conversation_deterministic
  ON public.messages (conversation_id, created_at, id);

CREATE TABLE public.chatbot_conversation_command_receipts (
  receipt_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~
      '^c1\.[0-9]{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  command_type text NOT NULL CHECK (command_type IN ('commit_turn', 'delete')),
  conversation_id uuid NOT NULL,
  result_revision bigint CHECK (result_revision IS NULL OR result_revision >= 0),
  result_updated_at timestamptz,
  user_message_id uuid,
  assistant_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT chatbot_conversation_receipt_shape_check CHECK (
    (
      command_type = 'commit_turn'
      AND result_revision IS NOT NULL
      AND result_updated_at IS NOT NULL
      AND user_message_id IS NOT NULL
      AND assistant_message_id IS NOT NULL
    )
    OR (
      command_type = 'delete'
      AND result_revision IS NOT NULL
      AND result_updated_at IS NULL
      AND user_message_id IS NULL
      AND assistant_message_id IS NULL
    )
  )
);

CREATE INDEX idx_chatbot_conversation_receipts_recent
  ON public.chatbot_conversation_command_receipts (owner_id, receipt_id DESC);

CREATE TABLE public.chatbot_deleted_conversations (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  delete_idempotency_key text NOT NULL CHECK (
    delete_idempotency_key ~
      '^c1\.[0-9]{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  delete_request_fingerprint text NOT NULL CHECK (
    delete_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  deleted_revision bigint NOT NULL CHECK (deleted_revision >= 0),
  deleted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (owner_id, conversation_id)
);

ALTER TABLE public.chatbot_conversation_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_deleted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_read_chatbot_conversation_command_receipts
  ON public.chatbot_conversation_command_receipts
  FOR SELECT
  TO service_role
  USING (true);
CREATE POLICY service_role_read_chatbot_deleted_conversations
  ON public.chatbot_deleted_conversations
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.chatbot_conversation_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.chatbot_deleted_conversations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.chatbot_conversation_command_receipts
  TO service_role;
GRANT SELECT ON TABLE public.chatbot_deleted_conversations TO service_role;

CREATE OR REPLACE FUNCTION public.commit_chatbot_conversation_turn(
  p_conversation_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_user_content text,
  p_assistant_content text,
  p_chart_config jsonb DEFAULT NULL,
  p_follow_up_questions text[] DEFAULT NULL,
  p_data_used jsonb DEFAULT NULL
)
RETURNS TABLE (
  disposition text,
  conversation_id uuid,
  revision bigint,
  title text,
  updated_at timestamptz,
  user_message_id uuid,
  assistant_message_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
  replay public.chatbot_conversation_command_receipts%ROWTYPE;
  current_conversation public.conversations%ROWTYPE;
  owned_conversation_count integer;
  existing_message_count integer;
  retained_receipt_count integer;
  generated_title text;
  created_user_message_id uuid := pg_catalog.gen_random_uuid();
  created_assistant_message_id uuid := pg_catalog.gen_random_uuid();
  turn_time timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF current_owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Authentication is required to commit a chatbot turn';
  END IF;
  IF p_expected_revision IS NULL
    OR p_expected_revision < 0
    OR public.chatbot_idempotency_key_is_current(
      p_idempotency_key,
      pg_catalog.clock_timestamp()
    ) IS DISTINCT FROM true
    OR coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
    OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_user_content, ''))) < 1
    OR pg_catalog.octet_length(coalesce(p_user_content, '')) > 8192
    OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_assistant_content, ''))) < 1
    OR pg_catalog.octet_length(coalesce(p_assistant_content, '')) > 32768
    OR (
      p_chart_config IS NOT NULL
      AND public.chatbot_json_object_is_bounded(
        p_chart_config,
        131072
      ) IS DISTINCT FROM true
    )
    OR (
      p_data_used IS NOT NULL
      AND public.chatbot_json_object_is_bounded(
        p_data_used,
        262144
      ) IS DISTINCT FROM true
    )
    OR (
      p_follow_up_questions IS NOT NULL
      AND NOT public.chatbot_followups_are_bounded(p_follow_up_questions)
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid or oversized chatbot turn';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chatbot-conversations:' || current_owner_id::text,
      0
    )
  );

  SELECT receipt.*
  INTO replay
  FROM public.chatbot_conversation_command_receipts AS receipt
  WHERE receipt.owner_id = current_owner_id
    AND receipt.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF replay.command_type IS DISTINCT FROM 'commit_turn'
      OR replay.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RETURN QUERY SELECT
        'key_conflict'::text,
        replay.conversation_id,
        replay.result_revision,
        NULL::text,
        replay.result_updated_at,
        replay.user_message_id,
        replay.assistant_message_id;
    ELSE
      SELECT conversation.*
      INTO current_conversation
      FROM public.conversations AS conversation
      WHERE conversation.id = replay.conversation_id
        AND conversation.user_id = current_owner_id;

      IF FOUND THEN
        RETURN QUERY SELECT
          'replayed'::text,
          current_conversation.id,
          replay.result_revision,
          current_conversation.title,
          replay.result_updated_at,
          replay.user_message_id,
          replay.assistant_message_id;
      ELSE
        RETURN QUERY SELECT
          'deleted'::text,
          replay.conversation_id,
          replay.result_revision,
          NULL::text,
          replay.result_updated_at,
          replay.user_message_id,
          replay.assistant_message_id;
      END IF;
    END IF;
    RETURN;
  END IF;

  WITH expired_receipts AS (
    SELECT receipt.receipt_id
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
      AND receipt.created_at < pg_catalog.clock_timestamp() - interval '30 days'
      AND pg_catalog.split_part(receipt.idempotency_key, '.', 2)::numeric <
        (pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::numeric
          - 2592000000
    ORDER BY receipt.receipt_id
    LIMIT 256
  )
  DELETE FROM public.chatbot_conversation_command_receipts AS receipt
  USING expired_receipts AS expired
  WHERE receipt.receipt_id = expired.receipt_id;

  WITH expired_tombstones AS (
    SELECT tombstone.owner_id, tombstone.conversation_id
    FROM public.chatbot_deleted_conversations AS tombstone
    WHERE tombstone.owner_id = current_owner_id
      AND tombstone.deleted_at < pg_catalog.clock_timestamp() - interval '30 days'
      AND pg_catalog.split_part(
        tombstone.delete_idempotency_key,
        '.',
        2
      )::numeric <
        (pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::numeric
          - 2592000000
    ORDER BY tombstone.deleted_at, tombstone.conversation_id
    LIMIT 256
  )
  DELETE FROM public.chatbot_deleted_conversations AS tombstone
  USING expired_tombstones AS expired
  WHERE tombstone.owner_id = expired.owner_id
    AND tombstone.conversation_id = expired.conversation_id;

  SELECT pg_catalog.count(*)::integer
  INTO retained_receipt_count
  FROM (
    SELECT 1
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
    LIMIT 180001
  ) AS bounded_receipts;

  IF retained_receipt_count >= 180000 THEN
    RETURN QUERY SELECT
      'command_quota'::text,
      p_conversation_id,
      NULL::bigint,
      NULL::text,
      NULL::timestamptz,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  SELECT conversation.*
  INTO current_conversation
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.user_id = current_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_conversation_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.chatbot_deleted_conversations AS tombstone
        WHERE tombstone.owner_id = current_owner_id
          AND tombstone.conversation_id = p_conversation_id
      ) THEN
        RETURN QUERY SELECT
          'deleted'::text,
          p_conversation_id,
          NULL::bigint,
          NULL::text,
          NULL::timestamptz,
          NULL::uuid,
          NULL::uuid;
        RETURN;
      END IF;

      RETURN QUERY SELECT
        'gone'::text,
        p_conversation_id,
        NULL::bigint,
        NULL::text,
        NULL::timestamptz,
        NULL::uuid,
        NULL::uuid;
      RETURN;
    END IF;

    IF p_expected_revision <> 0 THEN
      RETURN QUERY SELECT
        'revision_conflict'::text,
        p_conversation_id,
        NULL::bigint,
        NULL::text,
        NULL::timestamptz,
        NULL::uuid,
        NULL::uuid;
      RETURN;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO owned_conversation_count
    FROM (
      SELECT 1
      FROM public.conversations AS conversation
      WHERE conversation.user_id = current_owner_id
      LIMIT 101
    ) AS bounded_conversations;

    IF owned_conversation_count >= 100 THEN
      RETURN QUERY SELECT
        'conversation_quota'::text,
        p_conversation_id,
        NULL::bigint,
        NULL::text,
        NULL::timestamptz,
        NULL::uuid,
        NULL::uuid;
      RETURN;
    END IF;

    generated_title := pg_catalog.btrim(
      pg_catalog.regexp_replace(p_user_content, '[[:space:]]+', ' ', 'g')
    );
    IF pg_catalog.char_length(generated_title) > 120 THEN
      generated_title := pg_catalog.substring(generated_title, 1, 117) || '...';
    END IF;

    INSERT INTO public.conversations (id, user_id, title, revision)
    VALUES (pg_catalog.gen_random_uuid(), current_owner_id, generated_title, 0)
    RETURNING * INTO current_conversation;
  ELSIF current_conversation.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN QUERY SELECT
      'revision_conflict'::text,
      current_conversation.id,
      current_conversation.revision,
      current_conversation.title,
      current_conversation.updated_at,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF pg_catalog.char_length(
    pg_catalog.btrim(current_conversation.title)
  ) NOT BETWEEN 1 AND 120
    OR pg_catalog.octet_length(current_conversation.title) > 512 THEN
    generated_title := pg_catalog.btrim(
      pg_catalog.regexp_replace(p_user_content, '[[:space:]]+', ' ', 'g')
    );
    IF pg_catalog.char_length(generated_title) > 120 THEN
      generated_title := pg_catalog.substring(generated_title, 1, 117) || '...';
    END IF;

    UPDATE public.conversations AS conversation
    SET title = generated_title
    WHERE conversation.id = current_conversation.id
    RETURNING conversation.* INTO current_conversation;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO existing_message_count
  FROM (
    SELECT 1
    FROM public.messages AS message
    WHERE message.conversation_id = current_conversation.id
    LIMIT 201
  ) AS bounded_messages;

  IF existing_message_count > 198 THEN
    RETURN QUERY SELECT
      'message_quota'::text,
      current_conversation.id,
      current_conversation.revision,
      current_conversation.title,
      current_conversation.updated_at,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.messages (
    id, conversation_id, role, content, created_at
  ) VALUES (
    created_user_message_id,
    current_conversation.id,
    'user',
    p_user_content,
    turn_time
  );

  INSERT INTO public.messages (
    id,
    conversation_id,
    role,
    content,
    created_at,
    chart_config,
    follow_up_questions,
    data_used
  ) VALUES (
    created_assistant_message_id,
    current_conversation.id,
    'assistant',
    p_assistant_content,
    turn_time + interval '1 microsecond',
    p_chart_config,
    p_follow_up_questions,
    p_data_used
  );

  UPDATE public.conversations AS conversation
  SET revision = conversation.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  WHERE conversation.id = current_conversation.id
  RETURNING conversation.* INTO current_conversation;

  INSERT INTO public.chatbot_conversation_command_receipts (
    owner_id,
    idempotency_key,
    request_fingerprint,
    command_type,
    conversation_id,
    result_revision,
    result_updated_at,
    user_message_id,
    assistant_message_id
  ) VALUES (
    current_owner_id,
    p_idempotency_key,
    p_request_fingerprint,
    'commit_turn',
    current_conversation.id,
    current_conversation.revision,
    current_conversation.updated_at,
    created_user_message_id,
    created_assistant_message_id
  );

  RETURN QUERY SELECT
    'applied'::text,
    current_conversation.id,
    current_conversation.revision,
    current_conversation.title,
    current_conversation.updated_at,
    created_user_message_id,
    created_assistant_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_chatbot_conversation(
  p_conversation_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_request_fingerprint text
)
RETURNS TABLE (
  disposition text,
  conversation_id uuid,
  revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
  replay public.chatbot_conversation_command_receipts%ROWTYPE;
  tombstone public.chatbot_deleted_conversations%ROWTYPE;
  current_conversation public.conversations%ROWTYPE;
  retained_receipt_count integer;
BEGIN
  IF current_owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Authentication is required to delete a chatbot conversation';
  END IF;
  IF p_conversation_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 0
    OR public.chatbot_idempotency_key_is_current(
      p_idempotency_key,
      pg_catalog.clock_timestamp()
    ) IS DISTINCT FROM true
    OR coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot conversation delete command';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chatbot-conversations:' || current_owner_id::text,
      0
    )
  );

  SELECT receipt.*
  INTO replay
  FROM public.chatbot_conversation_command_receipts AS receipt
  WHERE receipt.owner_id = current_owner_id
    AND receipt.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF replay.command_type IS DISTINCT FROM 'delete'
      OR replay.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RETURN QUERY SELECT
        'key_conflict'::text,
        replay.conversation_id,
        replay.result_revision;
    ELSE
      RETURN QUERY SELECT
        'replayed'::text,
        replay.conversation_id,
        replay.result_revision;
    END IF;
    RETURN;
  END IF;

  SELECT deleted.*
  INTO tombstone
  FROM public.chatbot_deleted_conversations AS deleted
  WHERE deleted.owner_id = current_owner_id
    AND deleted.conversation_id = p_conversation_id;

  IF FOUND THEN
    IF tombstone.delete_idempotency_key = p_idempotency_key
      AND tombstone.delete_request_fingerprint = p_request_fingerprint THEN
      RETURN QUERY SELECT
        'replayed'::text,
        tombstone.conversation_id,
        tombstone.deleted_revision;
    ELSE
      RETURN QUERY SELECT
        'gone'::text,
        tombstone.conversation_id,
        tombstone.deleted_revision;
    END IF;
    RETURN;
  END IF;

  WITH expired_receipts AS (
    SELECT receipt.receipt_id
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
      AND receipt.created_at < pg_catalog.clock_timestamp() - interval '30 days'
      AND pg_catalog.split_part(receipt.idempotency_key, '.', 2)::numeric <
        (pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::numeric
          - 2592000000
    ORDER BY receipt.receipt_id
    LIMIT 256
  )
  DELETE FROM public.chatbot_conversation_command_receipts AS receipt
  USING expired_receipts AS expired
  WHERE receipt.receipt_id = expired.receipt_id;

  WITH expired_tombstones AS (
    SELECT deleted.owner_id, deleted.conversation_id
    FROM public.chatbot_deleted_conversations AS deleted
    WHERE deleted.owner_id = current_owner_id
      AND deleted.deleted_at < pg_catalog.clock_timestamp() - interval '30 days'
      AND pg_catalog.split_part(
        deleted.delete_idempotency_key,
        '.',
        2
      )::numeric <
        (pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::numeric
          - 2592000000
    ORDER BY deleted.deleted_at, deleted.conversation_id
    LIMIT 256
  )
  DELETE FROM public.chatbot_deleted_conversations AS deleted
  USING expired_tombstones AS expired
  WHERE deleted.owner_id = expired.owner_id
    AND deleted.conversation_id = expired.conversation_id;

  SELECT pg_catalog.count(*)::integer
  INTO retained_receipt_count
  FROM (
    SELECT 1
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
    LIMIT 180001
  ) AS bounded_receipts;

  IF retained_receipt_count >= 180000 THEN
    RETURN QUERY SELECT 'command_quota'::text, p_conversation_id, NULL::bigint;
    RETURN;
  END IF;

  SELECT conversation.*
  INTO current_conversation
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.user_id = current_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, p_conversation_id, NULL::bigint;
    RETURN;
  END IF;
  IF current_conversation.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN QUERY SELECT
      'revision_conflict'::text,
      current_conversation.id,
      current_conversation.revision;
    RETURN;
  END IF;

  INSERT INTO public.chatbot_deleted_conversations (
    owner_id,
    conversation_id,
    delete_idempotency_key,
    delete_request_fingerprint,
    deleted_revision
  ) VALUES (
    current_owner_id,
    current_conversation.id,
    p_idempotency_key,
    p_request_fingerprint,
    current_conversation.revision
  );

  DELETE FROM public.conversations AS conversation
  WHERE conversation.id = current_conversation.id;

  INSERT INTO public.chatbot_conversation_command_receipts (
    owner_id,
    idempotency_key,
    request_fingerprint,
    command_type,
    conversation_id,
    result_revision
  ) VALUES (
    current_owner_id,
    p_idempotency_key,
    p_request_fingerprint,
    'delete',
    current_conversation.id,
    current_conversation.revision
  );

  RETURN QUERY SELECT
    'applied'::text,
    current_conversation.id,
    current_conversation.revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_chatbot_conversations(
  p_before_updated_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
BEGIN
  IF current_owner_id IS NULL
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 50
    OR ((p_before_updated_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot conversation list request';
  END IF;

  RETURN QUERY
  SELECT
    conversation.id,
    CASE
      WHEN pg_catalog.btrim(conversation.title) = '' THEN 'New Conversation'
      WHEN pg_catalog.char_length(pg_catalog.btrim(conversation.title)) > 120
        OR pg_catalog.octet_length(conversation.title) > 512
      THEN pg_catalog.substring(
        pg_catalog.btrim(conversation.title), 1, 117
      ) || '...'
      ELSE conversation.title
    END,
    conversation.created_at,
    conversation.updated_at,
    conversation.revision
  FROM public.conversations AS conversation
  WHERE conversation.user_id = current_owner_id
    AND (
      p_before_updated_at IS NULL
      OR (conversation.updated_at, conversation.id) <
        (p_before_updated_at, p_before_id)
    )
  ORDER BY conversation.updated_at DESC, conversation.id DESC
  LIMIT p_limit + 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_chatbot_conversation_page(
  p_conversation_id uuid,
  p_before_created_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
RETURNS TABLE (
  status text,
  conversation_id uuid,
  title text,
  conversation_created_at timestamptz,
  conversation_updated_at timestamptz,
  revision bigint,
  message_id uuid,
  message_role text,
  message_content text,
  message_created_at timestamptz,
  chart_config jsonb,
  follow_up_questions text[],
  data_used jsonb,
  has_more boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
  conversation_row public.conversations%ROWTYPE;
  bounded_title text;
  existing_message_count integer;
  first_message_bytes bigint;
  emitted_rows integer;
  page_byte_budget constant bigint := 786432;
BEGIN
  IF current_owner_id IS NULL
    OR p_conversation_id IS NULL
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 50
    OR ((p_before_created_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot conversation detail request';
  END IF;

  SELECT conversation.*
  INTO conversation_row
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.user_id = current_owner_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text,
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::timestamptz,
      NULL::bigint, NULL::uuid, NULL::text, NULL::text,
      NULL::timestamptz, NULL::jsonb, NULL::text[], NULL::jsonb, false;
    RETURN;
  END IF;

  bounded_title := CASE
    WHEN pg_catalog.btrim(conversation_row.title) = '' THEN 'New Conversation'
    WHEN pg_catalog.char_length(pg_catalog.btrim(conversation_row.title)) > 120
      OR pg_catalog.octet_length(conversation_row.title) > 512
    THEN pg_catalog.substring(
      pg_catalog.btrim(conversation_row.title), 1, 117
    ) || '...'
    ELSE conversation_row.title
  END;

  SELECT pg_catalog.count(*)::integer
  INTO existing_message_count
  FROM (
    SELECT 1
    FROM public.messages AS message
    WHERE message.conversation_id = conversation_row.id
    LIMIT 201
  ) AS bounded_messages;

  IF existing_message_count > 200 THEN
    RETURN QUERY SELECT
      'overflow'::text,
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::timestamptz,
      NULL::bigint, NULL::uuid, NULL::text, NULL::text,
      NULL::timestamptz, NULL::jsonb, NULL::text[], NULL::jsonb, false;
    RETURN;
  END IF;

  -- NOT VALID constraints deliberately preserve legacy rows, so classify any
  -- legacy per-field violation as a content-free overflow before returning a
  -- shape that the strict application decoder would otherwise mislabel as a
  -- transient outage forever.
  IF EXISTS (
    SELECT 1
    FROM public.messages AS message
    WHERE message.conversation_id = conversation_row.id
      AND (
        message.role::text NOT IN ('user', 'assistant')
        OR pg_catalog.char_length(pg_catalog.btrim(message.content)) < 1
        OR (
          message.role::text = 'user'
          AND pg_catalog.octet_length(message.content) > 8192
        )
        OR (
          message.role::text = 'assistant'
          AND pg_catalog.octet_length(message.content) > 32768
        )
        OR (
          message.chart_config IS NOT NULL
          AND public.chatbot_json_object_is_bounded(
            message.chart_config,
            131072
          ) IS DISTINCT FROM true
        )
        OR (
          message.data_used IS NOT NULL
          AND public.chatbot_json_object_is_bounded(
            message.data_used,
            262144
          ) IS DISTINCT FROM true
        )
        OR (
          message.follow_up_questions IS NOT NULL
          AND public.chatbot_followups_are_bounded(
            message.follow_up_questions
          ) IS DISTINCT FROM true
        )
      )
    LIMIT 1
  ) THEN
    RETURN QUERY SELECT
      'overflow'::text,
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::timestamptz,
      NULL::bigint, NULL::uuid, NULL::text, NULL::text,
      NULL::timestamptz, NULL::jsonb, NULL::text[], NULL::jsonb, false;
    RETURN;
  END IF;

  -- Measure JSON-escaped text plus jsonb's own wire representation. The fixed
  -- per-row allowance covers keys, UUIDs, timestamps, repeated conversation
  -- metadata, and PostgREST framing. A valid maximum-sized message fits alone,
  -- while every response remains below the 768 KiB aggregate payload budget.
  SELECT
    2048::bigint
      + pg_catalog.octet_length(
          pg_catalog.to_jsonb(message.content)::text
        )::bigint
      + coalesce(
          pg_catalog.octet_length(message.chart_config::text), 0
        )::bigint
      + coalesce(
          pg_catalog.octet_length(message.data_used::text), 0
        )::bigint
      + coalesce(
          pg_catalog.octet_length(
            pg_catalog.to_jsonb(message.follow_up_questions)::text
          ), 0
        )::bigint
  INTO first_message_bytes
  FROM public.messages AS message
  WHERE message.conversation_id = conversation_row.id
    AND (
      p_before_created_at IS NULL
      OR (message.created_at, message.id) <
        (p_before_created_at, p_before_id)
    )
  ORDER BY message.created_at DESC, message.id DESC
  LIMIT 1;

  IF first_message_bytes > page_byte_budget THEN
    RETURN QUERY SELECT
      'overflow'::text,
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::timestamptz,
      NULL::bigint, NULL::uuid, NULL::text, NULL::text,
      NULL::timestamptz, NULL::jsonb, NULL::text[], NULL::jsonb, false;
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate_messages AS MATERIALIZED (
    SELECT
      message.id,
      message.role::text AS role,
      message.content,
      message.created_at,
      message.chart_config,
      message.follow_up_questions,
      message.data_used,
      2048::bigint
        + pg_catalog.octet_length(
            pg_catalog.to_jsonb(message.content)::text
          )::bigint
        + coalesce(
            pg_catalog.octet_length(message.chart_config::text), 0
          )::bigint
        + coalesce(
            pg_catalog.octet_length(message.data_used::text), 0
          )::bigint
        + coalesce(
            pg_catalog.octet_length(
              pg_catalog.to_jsonb(message.follow_up_questions)::text
            ), 0
          )::bigint AS payload_bytes
    FROM public.messages AS message
    WHERE message.conversation_id = conversation_row.id
      AND (
        p_before_created_at IS NULL
        OR (message.created_at, message.id) <
          (p_before_created_at, p_before_id)
      )
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT p_limit + 1
  ),
  ranked_messages AS (
    SELECT
      candidate.*,
      pg_catalog.row_number() OVER (
        ORDER BY candidate.created_at DESC, candidate.id DESC
      ) AS ordinal,
      pg_catalog.sum(candidate.payload_bytes) OVER (
        ORDER BY candidate.created_at DESC, candidate.id DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_bytes
    FROM candidate_messages AS candidate
  ),
  page_messages AS (
    SELECT ranked.*
    FROM ranked_messages AS ranked
    WHERE ranked.ordinal <= p_limit
      AND ranked.cumulative_bytes <= page_byte_budget
  ),
  page_state AS (
    SELECT
      (SELECT pg_catalog.count(*) FROM candidate_messages) AS candidate_count,
      (SELECT pg_catalog.count(*) FROM page_messages) AS page_count
  )
  SELECT
    'ready'::text,
    conversation_row.id,
    bounded_title,
    conversation_row.created_at,
    conversation_row.updated_at,
    conversation_row.revision,
    page.id,
    page.role,
    page.content,
    page.created_at,
    page.chart_config,
    page.follow_up_questions,
    page.data_used,
    state.candidate_count > state.page_count
  FROM page_messages AS page
  CROSS JOIN page_state AS state
  ORDER BY page.created_at DESC, page.id DESC;
  GET DIAGNOSTICS emitted_rows = ROW_COUNT;

  IF emitted_rows = 0 THEN
    RETURN QUERY SELECT
      'ready'::text,
      conversation_row.id,
      bounded_title,
      conversation_row.created_at,
      conversation_row.updated_at,
      conversation_row.revision,
      NULL::uuid, NULL::text, NULL::text, NULL::timestamptz,
      NULL::jsonb, NULL::text[], NULL::jsonb, false;
  END IF;
END;
$function$;

ALTER FUNCTION public.commit_chatbot_conversation_turn(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb
) OWNER TO postgres;
ALTER FUNCTION public.delete_chatbot_conversation(uuid, bigint, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.list_chatbot_conversations(timestamptz, uuid, integer)
  OWNER TO postgres;
ALTER FUNCTION public.get_chatbot_conversation_page(
  uuid, timestamptz, uuid, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.commit_chatbot_conversation_turn(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_chatbot_conversation(
  uuid, bigint, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_chatbot_conversations(
  timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_chatbot_conversation_page(
  uuid, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_chatbot_conversation(
  uuid, bigint, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_chatbot_conversations(
  timestamptz, uuid, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chatbot_conversation_page(
  uuid, timestamptz, uuid, integer
) TO authenticated;

-- The turn primitive is internal from its first migration; M2's lease-fenced
-- combo invokes it as postgres. Browser reads use the bounded owner-derived
-- RPCs above, while the only exposed mutation is bounded owner delete.
REVOKE ALL PRIVILEGES ON TABLE public.conversations FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.messages FROM authenticated;
REVOKE ALL PRIVILEGES (
  id, user_id, title, created_at, updated_at, revision
) ON TABLE public.conversations FROM authenticated;
REVOKE ALL PRIVILEGES (
  id, conversation_id, role, content, created_at, chart_config,
  follow_up_questions, data_used
) ON TABLE public.messages FROM authenticated;

DROP POLICY IF EXISTS "Users can create their own conversations"
  ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations"
  ON public.conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations"
  ON public.conversations;
DROP POLICY IF EXISTS "Users can create messages in their conversations"
  ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages in their conversations"
  ON public.messages;

REVOKE EXECUTE ON FUNCTION public.generate_conversation_title(uuid)
  FROM authenticated;

COMMENT ON TABLE public.chatbot_conversation_command_receipts IS
  'Content-free exact-replay receipts retained for the versioned key 30-day retry window; the 180000-row owner fuse covers 86400 policy-maximum asks plus at most one delete per created conversation (172800), with buffer, without evicting a retryable key.';
COMMENT ON TABLE public.chatbot_deleted_conversations IS
  'Content-free delete replay tombstones retained for 30 days; non-null missing conversation ids are never create commands after expiry.';
COMMENT ON FUNCTION public.commit_chatbot_conversation_turn(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb
) IS 'Atomically creates or compare-and-swap appends one user/assistant turn with owner quotas and exact replay.';
COMMENT ON FUNCTION public.delete_chatbot_conversation(uuid, bigint, text, text)
  IS 'Idempotently deletes an owned conversation only at the expected revision.';
COMMENT ON FUNCTION public.list_chatbot_conversations(
  timestamptz, uuid, integer
) IS 'Returns at most 51 owner-derived conversation summaries in deterministic updated_at/id keyset order.';
COMMENT ON FUNCTION public.get_chatbot_conversation_page(
  uuid, timestamptz, uuid, integer
) IS 'Returns one newest-first owner-derived message page, capped at 50 rows and a conservative 768 KiB aggregate wire budget; foreign and absent ids are indistinguishable.';

NOTIFY pgrst, 'reload schema';

COMMIT;
