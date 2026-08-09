BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'watchlists'
      AND column_name = 'symbols'
      AND data_type = 'ARRAY'
      AND is_nullable = 'YES'
  )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watchlists'
        AND column_name = 'revision'
        AND data_type = 'bigint'
        AND is_nullable = 'NO'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watchlists'
        AND column_name = 'sync_initialized_at'
        AND data_type = 'timestamp with time zone'
    ),
  'primary watchlist columns preserve null/default and versioned sync state'
);

SELECT ok(
  public.is_canonical_primary_watchlist_symbols('{}'::text[])
    AND public.is_canonical_primary_watchlist_symbols(
      ARRAY['AAPL', 'BRK.B']::text[]
    )
    AND NOT public.is_canonical_primary_watchlist_symbols(
      ARRAY['AAPL', 'AAPL']::text[]
    )
    AND NOT public.is_canonical_primary_watchlist_symbols(
      ARRAY['ES=F']::text[]
    )
    AND NOT public.is_canonical_primary_watchlist_symbols(
      ARRAY['brk-b']::text[]
    )
    AND NOT public.is_canonical_primary_watchlist_symbols(
      ARRAY[['AAPL', 'MSFT']]::text[]
    )
    AND NOT public.is_canonical_primary_watchlist_symbols(
      ARRAY[
        'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07',
        'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T14',
        'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21'
      ]::text[]
    ),
  'the database canonical invariant is unique equity symbols capped at twenty'
);

SELECT ok(
  to_regclass('public.account_watchlist_sync_receipts') IS NOT NULL
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = 'public.account_watchlist_sync_receipts'::regclass
    ),
  'durable watchlist receipts exist behind row-level security'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.watchlists', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.watchlists', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.watchlists', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.watchlists', 'DELETE')
    AND NOT has_any_column_privilege(
      'authenticated',
      'public.watchlists',
      'INSERT'
    )
    AND NOT has_any_column_privilege(
      'authenticated',
      'public.watchlists',
      'UPDATE'
    ),
  'authenticated users can read their row but cannot directly write canonical columns'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    ) AS privilege_name
    WHERE has_table_privilege(
      role_name,
      'public.account_watchlist_sync_receipts',
      privilege_name
    )
  )
    AND has_table_privilege(
      'service_role',
      'public.account_watchlist_sync_receipts',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    ),
  'sync receipts are hidden from browser roles and service-manageable'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.read_primary_watchlist()',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.read_primary_watchlist()',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.sync_primary_watchlist(text,text[],bigint,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.sync_primary_watchlist(text,text[],bigint,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.account_watchlist_initialize_locked(uuid)',
      'EXECUTE'
    ),
  'only the two auth.uid-scoped RPCs are exposed to authenticated callers'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(procedure.proconfig) AS configured(setting)
        WHERE configured.setting LIKE 'statement_timeout=%'
      )
    FROM pg_proc AS procedure
    WHERE procedure.oid = 'public.read_primary_watchlist()'::regprocedure
  )
    AND (
      SELECT procedure.prosecdef
        AND procedure.proconfig @> ARRAY['search_path=""']::text[]
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(procedure.proconfig) AS configured(setting)
          WHERE configured.setting LIKE 'statement_timeout=%'
        )
      FROM pg_proc AS procedure
      WHERE procedure.oid =
        'public.sync_primary_watchlist(text,text[],bigint,text)'::regprocedure
    ),
  'browser RPCs are security definers with empty search paths and short timeouts'
);

SELECT ok(
  position(
    'pg_advisory_xact_lock' IN pg_get_functiondef(
      'public.read_primary_watchlist()'::regprocedure
    )
  ) > 0
    AND position(
      'pg_advisory_xact_lock' IN pg_get_functiondef(
        'public.sync_primary_watchlist(text,text[],bigint,text)'::regprocedure
      )
    ) > 0
    AND position(
      'SELECT receipt.*' IN pg_get_functiondef(
        'public.sync_primary_watchlist(text,text[],bigint,text)'::regprocedure
      )
    ) < position(
      'account_watchlist_initialize_locked(owner_id)' IN pg_get_functiondef(
        'public.sync_primary_watchlist(text,text[],bigint,text)'::regprocedure
      )
    )
    AND position(
      'ON CONFLICT (user_id) DO NOTHING' IN pg_get_functiondef(
        'public.account_watchlist_initialize_locked(uuid)'::regprocedure
      )
    ) > 0,
  'per-user serialization resolves replay before mutable state and closes missing-row races'
);

INSERT INTO auth.users (id) VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000003'),
  ('a1000000-0000-4000-8000-000000000004'),
  ('a1000000-0000-4000-8000-000000000005'),
  ('a1000000-0000-4000-8000-000000000006'),
  ('a1000000-0000-4000-8000-000000000007');

-- JSON-tab precedence: only the selected tab's stock items participate.
INSERT INTO public.watchlists (user_id, tabs, active_tab_index)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  '[
    {"name":"Ignored","items":[{"type":"stock","symbol":"TSLA"}]},
    {"name":"Active","items":[
      {"type":"header","symbol":"Mega cap"},
      {"type":"stock","symbol":" brk-b "},
      {"type":"stock","symbol":"AAPL"},
      {"type":"stock","symbol":"BRK.B"},
      {"type":"stock","symbol":"ES=F"},
      {"type":"stock","symbol":"not valid!"}
    ]}
  ]'::jsonb,
  1
);

-- Existing canonical empty is authoritative over every legacy source.
INSERT INTO public.watchlists (
  user_id,
  tabs,
  active_tab_index,
  symbols
)
VALUES (
  'a1000000-0000-4000-8000-000000000002',
  '[{"items":[{"type":"stock","symbol":"AAPL"}]}]'::jsonb,
  0,
  '{}'::text[]
);

INSERT INTO public.watchlist_tabs (id, user_id, name, position) VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000003',
    'First',
    0
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000003',
    'Selected',
    1
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000004',
    'Owner fallback',
    0
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000005',
    'Other owner',
    0
  );

INSERT INTO public.watchlist_items (
  id,
  tab_id,
  type,
  position,
  symbol
)
VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'stock',
    0,
    'TSLA'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'stock',
    0,
    'msft'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000002',
    'stock',
    1,
    'brk-b'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000003',
    'stock',
    0,
    'AAPL'
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000004',
    'stock',
    0,
    'NVDA'
  );

INSERT INTO public.watchlist_settings (user_id, active_tab_id) VALUES
  (
    'a1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000002'
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000004'
  );

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT result.symbols FROM public.read_primary_watchlist() AS result),
  ARRAY['BRK.B', 'AAPL']::text[],
  'lazy import uses the active JSON tab, stock rows, normalization, and first occurrence'
);

SELECT ok(
  (
    SELECT result.revision = 0
      AND result.sync_initialized_at IS NOT NULL
    FROM public.read_primary_watchlist() AS result
  ),
  'lazy import initializes a revision-zero baseline exactly once'
);

SELECT throws_ok(
  $$UPDATE public.watchlists SET symbols = ARRAY['TSLA']::text[]$$,
  '42501',
  'permission denied for table watchlists',
  'authenticated users cannot bypass sync with a direct update'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT result.symbols FROM public.read_primary_watchlist() AS result),
  '{}'::text[],
  'existing canonical empty wins over non-empty legacy JSON'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT result.symbols FROM public.read_primary_watchlist() AS result),
  ARRAY['MSFT', 'BRK.B']::text[],
  'normalized active tab is imported after JSON has no usable source'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000004',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT result.symbols FROM public.read_primary_watchlist() AS result),
  ARRAY['AAPL']::text[],
  'a settings pointer to another owner is ignored before first-position fallback'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000006',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  (
    SELECT result.symbols IS NULL
      AND result.revision = 0
      AND result.sync_initialized_at IS NOT NULL
    FROM public.read_primary_watchlist() AS result
  ),
  'a user with no legacy source receives the product default behind a one-way fence'
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000007',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  (
    SELECT result.disposition = 'applied'
      AND result.symbols = ARRAY['AAPL', 'BRK.B']::text[]
      AND result.revision = 1
      AND result.dropped_symbols = '{}'::text[]
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY[' aapl ', 'brk-b']::text[],
      0,
      'watchlist-first-command'
    ) AS result
  ),
  'replace normalizes aliases and atomically advances the revision'
);

SELECT ok(
  (
    SELECT result.disposition = 'replayed'
      AND result.symbols = ARRAY['AAPL', 'BRK.B']::text[]
      AND result.revision = 1
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY[' aapl ', 'brk-b']::text[],
      0,
      'watchlist-first-command'
    ) AS result
  ),
  'an exact idempotency replay returns the durable snapshot'
);

SELECT ok(
  (
    SELECT result.disposition = 'conflict'
      AND result.symbols = ARRAY['AAPL', 'BRK.B']::text[]
      AND result.revision = 1
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY['MSFT']::text[],
      0,
      'watchlist-first-command'
    ) AS result
  ),
  'same idempotency key with a different payload conflicts against its receipt snapshot'
);

SELECT ok(
  (
    SELECT result.disposition = 'conflict'
      AND result.revision = 1
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY['MSFT']::text[],
      0,
      'watchlist-stale-command'
    ) AS result
  ),
  'a stale compare-and-swap returns a conflict without mutation'
);

SELECT is(
  (
    SELECT result.disposition
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY['MSFT']::text[],
      0,
      'watchlist-stale-command'
    ) AS result
  ),
  'conflict',
  'an exact retry preserves the original conflict disposition'
);

SELECT ok(
  (
    SELECT result.disposition = 'unchanged'
      AND result.revision = 1
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY['AAPL', 'BRK.B']::text[],
      1,
      'watchlist-unchanged-command'
    ) AS result
  ),
  'an equal replacement records an unchanged snapshot without revision churn'
);

SELECT ok(
  (
    SELECT result.disposition = 'applied'
      AND result.revision = 2
      AND result.symbols = ARRAY[
        'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07',
        'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T14',
        'T15', 'T16', 'T17', 'T18', 'T19'
      ]::text[]
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY[
        'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07',
        'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T14',
        'T15', 'T16', 'T17', 'T18', 'T19'
      ]::text[],
      1,
      'watchlist-long-command'
    ) AS result
  ),
  'replace keeps the supplied order below the cap'
);

SELECT ok(
  (
    SELECT result.disposition = 'applied'
      AND result.revision = 3
      AND pg_catalog.cardinality(result.symbols) = 20
      AND result.symbols[1:3] = ARRAY['T01', 'T02', 'T03']::text[]
      AND result.symbols[20] = 'N20'
      AND result.dropped_symbols = ARRAY['N21', 'N22']::text[]
    FROM public.sync_primary_watchlist(
      'merge',
      ARRAY['T05', 'N20', 'N21', 'N22']::text[],
      2,
      'watchlist-merge-command'
    ) AS result
  ),
  'merge preserves account order, appends new symbols, and reports cap loss'
);

SELECT ok(
  (
    SELECT result.disposition = 'replayed'
      AND result.dropped_symbols = ARRAY['N21', 'N22']::text[]
    FROM public.sync_primary_watchlist(
      'merge',
      ARRAY['T05', 'N20', 'N21', 'N22']::text[],
      2,
      'watchlist-merge-command'
    ) AS result
  ),
  'merge truncation is part of the durable replay receipt'
);

SELECT throws_ok(
  $$SELECT * FROM public.sync_primary_watchlist(
    'replace',
    ARRAY['BRK-B', 'BRK.B']::text[],
    3,
    'watchlist-duplicate-command'
  )$$,
  '22023',
  'Invalid or duplicate account watchlist symbols',
  'aliases that normalize to a duplicate are rejected'
);

SELECT throws_ok(
  $$SELECT * FROM public.sync_primary_watchlist(
    'replace',
    ARRAY['ES=F']::text[],
    3,
    'watchlist-derivative-command'
  )$$,
  '22023',
  'Invalid or duplicate account watchlist symbols',
  'non-equity symbols are rejected by the authoritative RPC'
);

SELECT ok(
  (
    SELECT result.disposition = 'applied'
      AND result.symbols IS NULL
      AND result.revision = 4
    FROM public.sync_primary_watchlist(
      'replace',
      NULL,
      3,
      'watchlist-default-command'
    ) AS result
  ),
  'replace with null restores the product default'
);

SELECT ok(
  (
    SELECT result.disposition = 'applied'
      AND result.symbols = '{}'::text[]
      AND result.revision = 5
    FROM public.sync_primary_watchlist(
      'replace',
      '{}'::text[],
      4,
      'watchlist-empty-command'
    ) AS result
  ),
  'replace with an empty array records intentional emptiness'
);

SELECT ok(
  (
    SELECT result.disposition = 'conflict'
      AND result.symbols = ARRAY['AAPL', 'BRK.B']::text[]
      AND result.revision = 1
    FROM public.sync_primary_watchlist(
      'replace',
      ARRAY['MSFT']::text[],
      0,
      'watchlist-stale-command'
    ) AS result
  ),
  'a conflict receipt keeps its original snapshot after the canonical head advances'
);

DO $receipt_cap$
DECLARE
  command_number integer;
BEGIN
  FOR command_number IN 1..70 LOOP
    PERFORM *
    FROM public.sync_primary_watchlist(
      'replace',
      '{}'::text[],
      NULL,
      'watchlist-cap-' || pg_catalog.lpad(command_number::text, 3, '0')
    );
  END LOOP;
END;
$receipt_cap$;

RESET ROLE;

SELECT is(
  (
    SELECT pg_catalog.count(*)
    FROM public.account_watchlist_sync_receipts AS receipt
    WHERE receipt.user_id = 'a1000000-0000-4000-8000-000000000007'
  ),
  64::bigint,
  'receipt retention is capped at the newest sixty-four commands per user'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.account_watchlist_sync_receipts AS receipt
    WHERE receipt.user_id = 'a1000000-0000-4000-8000-000000000007'
      AND receipt.request_payload ->> 'mode' = receipt.request_mode
      AND receipt.request_payload ? 'symbols'
      AND receipt.request_payload ? 'expectedRevision'
      AND receipt.request_hash ~ '^[0-9a-f]{64}$'
  ),
  'receipt identity includes mode, canonical symbols, and nullable expected revision'
);

DELETE FROM auth.users
WHERE id = 'a1000000-0000-4000-8000-000000000007';

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.watchlists
    WHERE user_id = 'a1000000-0000-4000-8000-000000000007'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_watchlist_sync_receipts
      WHERE user_id = 'a1000000-0000-4000-8000-000000000007'
    ),
  'deleting an account cascades both canonical state and hidden receipts'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.read_primary_watchlist()$$,
  '42501',
  'permission denied for function read_primary_watchlist',
  'anonymous callers cannot execute the account watchlist read RPC'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
