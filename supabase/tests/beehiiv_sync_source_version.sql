BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  to_regprocedure(
    'public.claim_newsletter_beehiiv_sync(uuid,uuid,text,text,text,text,text,uuid,integer)'
  ) IS NOT NULL
    AND to_regprocedure(
      'public.claim_newsletter_beehiiv_sync_v2(uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer)'
    ) IS NOT NULL,
  'the v1 claim remains available while the source-aware v2 claim is added'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.claim_newsletter_beehiiv_sync_v2(uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.claim_newsletter_beehiiv_sync_v2(uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.claim_newsletter_beehiiv_sync_v2(uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer)',
      'EXECUTE'
    ),
  'only the service role can claim a source-aware Beehiiv sync'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.is_newsletter_draft_source_version_current(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.is_newsletter_draft_source_version_current(uuid,uuid,timestamptz)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.is_newsletter_draft_source_version_current(uuid,uuid,timestamptz)',
      'EXECUTE'
    ),
  'source-version checks are server-only'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rebind_newsletter_beehiiv_delivery_source_version(uuid,uuid,text,text,text,timestamptz,timestamptz)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.rebind_newsletter_beehiiv_delivery_source_version(uuid,uuid,text,text,text,timestamptz,timestamptz)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.rebind_newsletter_beehiiv_delivery_source_version(uuid,uuid,text,text,text,timestamptz,timestamptz)',
      'EXECUTE'
    ),
  'only the service role can CAS-rebind a Beehiiv receipt'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.persist_newsletter_beehiiv_sync_receipt(uuid,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.persist_newsletter_beehiiv_sync_receipt(uuid,uuid,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.persist_newsletter_beehiiv_sync_receipt(uuid,uuid,uuid)',
      'EXECUTE'
    ),
  'only the service role can atomically persist and complete a Beehiiv receipt'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.clear_stale_beehiiv_source_draft_version()',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.clear_stale_beehiiv_source_draft_version()',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.clear_stale_beehiiv_source_draft_version()',
      'EXECUTE'
    ),
  'the rolling-writer evidence trigger is not browser-executable'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.fence_indeterminate_beehiiv_update()',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.fence_indeterminate_beehiiv_update()',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.fence_indeterminate_beehiiv_update()',
      'EXECUTE'
    ),
  'the indeterminate-update fence is not browser-executable'
);

INSERT INTO auth.users (id)
VALUES ('b1000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  generated_at,
  created_at,
  updated_at
)
VALUES (
  'b2000000-0000-0000-0000-000000000001'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'beehiiv-source-version-test',
  'AAPL',
  'ready',
  'Apple setup',
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'subjectLine', 'Apple setup',
    'generatedAt', '2026-08-07T14:30:00.123456Z',
    'blocks', '[]'::jsonb
  ),
  '<p>Apple setup</p>',
  '2026-08-07T14:30:00.123456Z'::timestamptz,
  '2026-08-07T14:30:00.123456Z'::timestamptz,
  '2026-08-07T14:30:00.123456Z'::timestamptz
);

SELECT is(
  (
    SELECT operation.source_draft_updated_at
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'create',
      'operation-v1',
      'content-v1',
      'Apple setup',
      '2026-08-07T14:30:00.123456Z'::timestamptz,
      'b3000000-0000-0000-0000-000000000001'::uuid,
      90
    ) AS operation
  ),
  '2026-08-07T14:30:00.123456Z'::timestamptz,
  'v2 durably records the exact source draft version on the operation'
);

SELECT ok(
  public.is_newsletter_draft_source_version_current(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000001'::uuid,
    '2026-08-07T14:30:00.123456Z'::timestamptz
  ),
  'the database accepts the exact microsecond source version'
);

SELECT ok(
  NOT public.is_newsletter_draft_source_version_current(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000001'::uuid,
    '2026-08-07T14:30:00.123455Z'::timestamptz
  ),
  'the database rejects a source version separated by one microsecond'
);

INSERT INTO public.newsletter_beehiiv_deliveries (
  id,
  draft_id,
  owner_id,
  publication_id,
  beehiiv_post_id,
  title,
  editor_url,
  content_hash,
  source_draft_updated_at
)
VALUES (
  'b4000000-0000-0000-0000-000000000001'::uuid,
  'b2000000-0000-0000-0000-000000000001'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'publication-1',
  'post-1',
  'Apple setup',
  'https://app.beehiiv.com/posts/post-1',
  'content-v1',
  '2026-08-07T14:30:00.123456Z'::timestamptz
);

UPDATE public.newsletter_beehiiv_deliveries
SET content_hash = 'content-from-old-app-v2'
WHERE id = 'b4000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT source_draft_updated_at
    FROM public.newsletter_beehiiv_deliveries
    WHERE id = 'b4000000-0000-0000-0000-000000000001'::uuid
  ),
  NULL::timestamptz,
  'an old delivery writer cannot carry stale source evidence to new content'
);

UPDATE public.newsletter_beehiiv_sync_operations
SET content_hash = 'operation-from-old-app-v2'
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT source_draft_updated_at
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  NULL::timestamptz,
  'an old operation writer cannot carry stale source evidence to new content'
);

-- A process can die after crossing the update boundary. Even the legacy v1
-- claim must not let a different payload overtake that request after expiry,
-- because the old remote call can still finish last.
UPDATE public.newsletter_beehiiv_sync_operations
SET
  publication_id = 'publication-1',
  operation_kind = 'update',
  operation_key = 'operation-timeout-v1',
  content_hash = 'content-timeout-v1',
  source_draft_updated_at = (
    SELECT updated_at
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  title = 'Apple setup timeout',
  sync_state = 'updating',
  lease_token = 'b3000000-0000-0000-0000-000000000010'::uuid,
  lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second',
  last_error = NULL
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'operation-new-v2',
      'content-new-v2',
      'Apple setup newer',
      'b3000000-0000-0000-0000-000000000011'::uuid,
      90
    ) AS operation
  ),
  'ambiguous',
  'an expired legacy update claim is ambiguity-fenced before newer bytes can run'
);

SELECT is(
  (
    SELECT content_hash
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  'content-timeout-v1',
  'the fence preserves the possibly in-flight payload instead of recording the newer hash'
);

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'operation-timeout-v1',
      'content-timeout-v1',
      'Apple setup timeout retry',
      (
        SELECT updated_at
        FROM public.newsletter_drafts
        WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
      ),
      'b3000000-0000-0000-0000-000000000012'::uuid,
      90
    ) AS operation
  ),
  'ambiguous',
  'an exact retry cannot clear ambiguity while the original update may still apply later'
);

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'operation-after-exact-retry-v2',
      'content-after-exact-retry-v2',
      'Apple setup after ambiguous retry',
      (
        SELECT updated_at
        FROM public.newsletter_drafts
        WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
      ),
      'b3000000-0000-0000-0000-000000000013'::uuid,
      90
    ) AS operation
  ),
  'ambiguous',
  'different bytes remain fenced after an attempted exact retry'
);

-- During migration-first rolling deploys, the old application marks every
-- update exception failed. Reset this row to a completed v2 operation, then
-- have legacy v1 reclaim the exact same hash. V1 must still clear source
-- evidence because the old caller cannot attest which draft version it read.
UPDATE public.newsletter_beehiiv_sync_operations
SET
  sync_state = 'completed',
  lease_token = NULL,
  lease_expires_at = NULL,
  last_error = NULL,
  completed_at = pg_catalog.clock_timestamp()
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'operation-timeout-v1',
      'content-timeout-v1',
      'Apple setup legacy same-hash retry',
      'b3000000-0000-0000-0000-000000000020'::uuid,
      90
    ) AS operation
  ),
  'claimed',
  'legacy v1 can reclaim a completed same-hash operation'
);

SELECT is(
  (
    SELECT source_draft_updated_at
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  NULL::timestamptz,
  'legacy v1 clears inherited source evidence even when the hash is unchanged'
);

UPDATE public.newsletter_beehiiv_sync_operations
SET sync_state = 'updating'
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  AND lease_token = 'b3000000-0000-0000-0000-000000000020'::uuid;

UPDATE public.newsletter_beehiiv_sync_operations
SET
  sync_state = 'failed',
  lease_token = NULL,
  lease_expires_at = NULL,
  last_error = 'Legacy client timed out during update'
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT sync_state
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  'ambiguous',
  'a legacy updating-to-failed timeout is ambiguity-fenced during rolling deploy'
);

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'newer-after-legacy-timeout',
      'newer-content-after-legacy-timeout',
      'Newer content',
      (
        SELECT updated_at
        FROM public.newsletter_drafts
        WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
      ),
      'b3000000-0000-0000-0000-000000000021'::uuid,
      90
    ) AS operation
  ),
  'ambiguous',
  'different content cannot overtake a late legacy update timeout'
);

DELETE FROM public.newsletter_beehiiv_sync_operations
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

-- Model a legacy failed update that committed immediately before the migration
-- backfill became visible. The claim-time defense must preserve and permanently
-- fence its old payload even if such a boundary row survives the eager update.
INSERT INTO public.newsletter_beehiiv_sync_operations (
  draft_id,
  owner_id,
  publication_id,
  operation_kind,
  operation_key,
  content_hash,
  title,
  sync_state,
  lease_token,
  lease_expires_at,
  last_error
)
VALUES (
  'b2000000-0000-0000-0000-000000000001'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'publication-1',
  'update',
  'pre-migration-failed-v1',
  'pre-migration-failed-content-v1',
  'Pre-migration failed update',
  'failed',
  NULL,
  NULL,
  'Legacy update request timed out'
);

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'after-pre-migration-failure-v2',
      'after-pre-migration-failure-content-v2',
      'New content after legacy failure',
      (
        SELECT updated_at
        FROM public.newsletter_drafts
        WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
      ),
      'b3000000-0000-0000-0000-000000000022'::uuid,
      90
    ) AS operation
  ),
  'ambiguous',
  'a pre-migration failed update cannot be reclaimed as newer content'
);

SELECT is(
  (
    SELECT content_hash
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  'pre-migration-failed-content-v1',
  'the pre-migration failure fence preserves the possibly late payload'
);

DELETE FROM public.newsletter_beehiiv_sync_operations
WHERE draft_id = 'b2000000-0000-0000-0000-000000000001'::uuid;

-- The application preflight is backed by the same-transaction database gate,
-- so a stale managed receipt cannot win a race and publish a newer local row.
INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  generated_at,
  created_at,
  updated_at
)
VALUES (
  'b2000000-0000-0000-0000-000000000002'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'beehiiv-stale-publication-test',
  'MSFT',
  'ready',
  'Microsoft setup',
  jsonb_build_object(
    'ticker', 'MSFT',
    'format', 'single_stock',
    'subjectLine', 'Microsoft setup',
    'generatedAt', '2026-08-07T14:30:00.223456Z',
    'blocks', '[]'::jsonb
  ),
  '<p>Microsoft setup</p>',
  '2026-08-07T14:30:00.223456Z'::timestamptz,
  '2026-08-07T14:30:00.223456Z'::timestamptz,
  '2026-08-07T14:30:00.223456Z'::timestamptz
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_beehiiv_sync_v2(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000002'::uuid,
      'publication-1',
      'create',
      'stale-source-create',
      'stale-source-content',
      'Microsoft setup stale source',
      '2026-08-07T14:30:00.223455Z'::timestamptz,
      'b3000000-0000-0000-0000-000000000029'::uuid,
      90
    )
  ),
  0::bigint,
  'v2 refuses a claim whose exact draft source version is stale'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_beehiiv_sync_operations
    WHERE draft_id = 'b2000000-0000-0000-0000-000000000002'::uuid
  ),
  0::bigint,
  'a stale v2 source check leaves no operation phantom for publication'
);

CREATE TEMP TABLE beehiiv_publication_gate_errors (
  message text NOT NULL
) ON COMMIT DROP;

SELECT is(
  (
    SELECT operation.sync_state
    FROM public.claim_newsletter_beehiiv_sync(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000002'::uuid,
      'publication-1',
      'create',
      'initial-create-in-flight',
      'initial-create-content',
      'Microsoft setup',
      'b3000000-0000-0000-0000-000000000030'::uuid,
      90
    ) AS operation
  ),
  'claimed',
  'legacy v1 can claim only while the owned draft is ready'
);

UPDATE public.newsletter_beehiiv_sync_operations
SET sync_state = 'creating'
WHERE draft_id = 'b2000000-0000-0000-0000-000000000002'::uuid
  AND lease_token = 'b3000000-0000-0000-0000-000000000030'::uuid;

DO $test$
BEGIN
  BEGIN
    UPDATE public.newsletter_drafts
    SET
      status = 'published',
      beehiiv_url = 'https://theintraday.beehiiv.com/p/microsoft-setup',
      published_at = '2026-08-07T15:00:00.000000Z'::timestamptz,
      draft_json = jsonb_set(
        draft_json,
        '{publication}',
        jsonb_build_object(
          'beehiivUrl', 'https://theintraday.beehiiv.com/p/microsoft-setup',
          'publishedAt', '2026-08-07T15:00:00.000000Z'
        )
      )
    WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO beehiiv_publication_gate_errors (message)
    VALUES (SQLERRM);
  END;
END;
$test$;

SELECT is(
  (SELECT message FROM beehiiv_publication_gate_errors LIMIT 1),
  'Managed Beehiiv sync is still in flight or needs recovery',
  'manual publication is blocked while an initial managed create is in flight'
);

SELECT is(
  (
    SELECT status
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid
  ),
  'ready',
  'the in-flight create publication gate leaves the local draft unpublished'
);

DELETE FROM public.newsletter_beehiiv_sync_operations
WHERE draft_id = 'b2000000-0000-0000-0000-000000000002'::uuid;

TRUNCATE beehiiv_publication_gate_errors;

INSERT INTO public.newsletter_beehiiv_deliveries (
  id,
  draft_id,
  owner_id,
  publication_id,
  beehiiv_post_id,
  title,
  editor_url,
  content_hash,
  source_draft_updated_at
)
VALUES (
  'b4000000-0000-0000-0000-000000000002'::uuid,
  'b2000000-0000-0000-0000-000000000002'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'publication-1',
  'post-stale',
  'Microsoft setup',
  'https://app.beehiiv.com/posts/post-stale',
  'content-stale',
  '2026-08-07T14:30:00.223455Z'::timestamptz
);

DO $test$
BEGIN
  BEGIN
    UPDATE public.newsletter_drafts
    SET
      status = 'published',
      beehiiv_url = 'https://theintraday.beehiiv.com/p/microsoft-setup',
      published_at = '2026-08-07T15:00:00.000000Z'::timestamptz,
      draft_json = jsonb_set(
        draft_json,
        '{publication}',
        jsonb_build_object(
          'beehiivUrl', 'https://theintraday.beehiiv.com/p/microsoft-setup',
          'publishedAt', '2026-08-07T15:00:00.000000Z'
        )
      )
    WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO beehiiv_publication_gate_errors (message)
    VALUES (SQLERRM);
  END;
END;
$test$;

SELECT is(
  (SELECT message FROM beehiiv_publication_gate_errors LIMIT 1),
  'Managed Beehiiv publication source version does not match the saved draft version',
  'the atomic publication gate rejects a managed receipt for an older draft version'
);

SELECT is(
  (
    SELECT status
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid
  ),
  'ready',
  'a rejected stale managed publication leaves the local draft unpublished'
);

-- Reset the delivery to an exact-current receipt, then prove publication and
-- archive bookkeeping advance the content-version receipt atomically.
UPDATE public.newsletter_beehiiv_deliveries
SET
  beehiiv_post_id = 'post-1',
  content_hash = 'content-v1',
  source_draft_updated_at = (
    SELECT updated_at
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
  )
WHERE id = 'b4000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.newsletter_drafts
SET
  status = 'published',
  beehiiv_url = 'https://theintraday.beehiiv.com/p/apple-setup',
  published_at = '2026-08-07T15:00:00.000000Z'::timestamptz,
  draft_json = jsonb_set(
    draft_json,
    '{publication}',
    jsonb_build_object(
      'beehiivUrl', 'https://theintraday.beehiiv.com/p/apple-setup',
      'publishedAt', '2026-08-07T15:00:00.000000Z'
    )
  )
WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT delivery.source_draft_updated_at
    FROM public.newsletter_beehiiv_deliveries AS delivery
    WHERE delivery.id = 'b4000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    SELECT draft.updated_at
    FROM public.newsletter_drafts AS draft
    WHERE draft.id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  'normal managed publication atomically rebinds its receipt and does not create false Needs sync'
);

UPDATE public.newsletter_drafts
SET archived_at = '2026-08-07T15:05:00.000000Z'::timestamptz
WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT delivery.source_draft_updated_at
    FROM public.newsletter_beehiiv_deliveries AS delivery
    WHERE delivery.id = 'b4000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    SELECT draft.updated_at
    FROM public.newsletter_drafts AS draft
    WHERE draft.id = 'b2000000-0000-0000-0000-000000000001'::uuid
  ),
  'archive-only bookkeeping preserves the exact-current content receipt'
);

-- A real content edit does not get the metadata-only exemption.
UPDATE public.newsletter_drafts
SET draft_json = jsonb_set(
  draft_json,
  '{subjectLine}',
  to_jsonb('Apple setup edited after publication'::text)
)
WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid;

SELECT ok(
  NOT public.is_newsletter_draft_source_version_current(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000001'::uuid,
    (
      SELECT source_draft_updated_at
      FROM public.newsletter_beehiiv_deliveries
      WHERE id = 'b4000000-0000-0000-0000-000000000001'::uuid
    )
  ),
  'a genuine edited version remains a source mismatch after publication'
);

-- Once a newer sync receipt wins, a stale unchanged-content caller cannot
-- rebind over it even though the draft source version itself is current.
UPDATE public.newsletter_beehiiv_deliveries
SET
  beehiiv_post_id = 'post-2',
  content_hash = 'content-v2',
  source_draft_updated_at = (
    SELECT updated_at
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
  )
WHERE id = 'b4000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT count(*)
    FROM public.rebind_newsletter_beehiiv_delivery_source_version(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'post-1',
      'content-v1',
      '2026-08-07T14:30:00.123456Z'::timestamptz,
      (
        SELECT updated_at
        FROM public.newsletter_drafts
        WHERE id = 'b2000000-0000-0000-0000-000000000001'::uuid
      )
    )
  ),
  0::bigint,
  'a stale no-op receipt CAS cannot overwrite a newer delivery receipt'
);

-- Reproduce the A/B/C stale recovery race. A owns a recorded result and
-- stalls. B reclaims and completes it. C then syncs newer bytes. When A wakes,
-- the atomic RPC must reject A before touching C's delivery receipt.
INSERT INTO public.newsletter_beehiiv_sync_operations (
  draft_id,
  owner_id,
  publication_id,
  operation_kind,
  operation_key,
  content_hash,
  source_draft_updated_at,
  title,
  sync_state,
  remote_post_id,
  remote_preview_url,
  remote_editor_url,
  lease_token,
  lease_expires_at,
  last_error,
  completed_at
)
VALUES (
  'b2000000-0000-0000-0000-000000000002'::uuid,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'publication-1',
  'update',
  'recovery-a-v1',
  'recovery-content-v1',
  (
    SELECT updated_at
    FROM public.newsletter_drafts
    WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid
  ),
  'Recovery V1',
  'remote_recorded',
  'post-1',
  NULL,
  'https://app.beehiiv.com/posts/post-1',
  'b3000000-0000-0000-0000-000000000040'::uuid,
  pg_catalog.clock_timestamp() - interval '1 second',
  NULL,
  NULL
);

DO $test$
DECLARE
  claimed public.newsletter_beehiiv_sync_operations%ROWTYPE;
  persisted public.newsletter_beehiiv_deliveries%ROWTYPE;
BEGIN
  SELECT operation.*
  INTO claimed
  FROM public.claim_newsletter_beehiiv_sync_v2(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'publication-1',
    'update',
    'recovery-a-v1',
    'recovery-content-v1',
    'Recovery V1',
    (
      SELECT updated_at
      FROM public.newsletter_drafts
      WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid
    ),
    'b3000000-0000-0000-0000-000000000041'::uuid,
    90
  ) AS operation;

  SELECT delivery.*
  INTO persisted
  FROM public.persist_newsletter_beehiiv_sync_receipt(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'b3000000-0000-0000-0000-000000000041'::uuid
  ) AS delivery;

  SELECT operation.*
  INTO claimed
  FROM public.claim_newsletter_beehiiv_sync_v2(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'publication-1',
    'update',
    'recovery-c-v2',
    'recovery-content-v2',
    'Recovery V2',
    (
      SELECT updated_at
      FROM public.newsletter_drafts
      WHERE id = 'b2000000-0000-0000-0000-000000000002'::uuid
    ),
    'b3000000-0000-0000-0000-000000000042'::uuid,
    90
  ) AS operation;

  UPDATE public.newsletter_beehiiv_sync_operations AS operation
  SET
    sync_state = 'remote_recorded',
    remote_post_id = 'post-recovery-2',
    remote_preview_url = NULL,
    remote_editor_url = 'https://app.beehiiv.com/posts/post-recovery-2'
  WHERE operation.draft_id = 'b2000000-0000-0000-0000-000000000002'::uuid
    AND operation.lease_token = 'b3000000-0000-0000-0000-000000000042'::uuid;

  SELECT delivery.*
  INTO persisted
  FROM public.persist_newsletter_beehiiv_sync_receipt(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'b3000000-0000-0000-0000-000000000042'::uuid
  ) AS delivery;
END;
$test$;

SELECT is(
  (
    SELECT count(*)
    FROM public.persist_newsletter_beehiiv_sync_receipt(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000002'::uuid,
      'b3000000-0000-0000-0000-000000000040'::uuid
    )
  ),
  0::bigint,
  'stalled recovery A cannot persist after its lease was superseded'
);

SELECT is(
  (
    SELECT content_hash
    FROM public.newsletter_beehiiv_deliveries
    WHERE id = 'b4000000-0000-0000-0000-000000000002'::uuid
  ),
  'recovery-content-v2',
  'stalled recovery A cannot overwrite the newer receipt persisted by C'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_beehiiv_sync(
      'b1000000-0000-0000-0000-000000000001'::uuid,
      'b2000000-0000-0000-0000-000000000001'::uuid,
      'publication-1',
      'update',
      'legacy-after-publication',
      'legacy-after-publication-content',
      'Legacy after publication',
      'b3000000-0000-0000-0000-000000000043'::uuid,
      90
    )
  ),
  0::bigint,
  'publication-first leaves the draft non-ready so legacy v1 cannot claim'
);

SELECT * FROM finish();

ROLLBACK;
