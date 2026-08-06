# Supabase Migration Ledger Convergence

Last audited: 2026-08-06

This runbook repairs a split-brain migration history without rewriting production
data. Production has the right data and nearly all of the right schema, but the
repository and the Supabase migration ledger tell different stories. The repair
has two goals:

1. make a clean database reproducible from this repository; and
2. make the production ledger match that history without replaying schema that is
   already live.

No production mutation described here is routine. Use the sequence exactly,
capture every preflight artifact, and stop on the first unexpected result.

## Current Evidence

The 2026-08-06 audit found:

- 59 migrations originally in the repository;
- 27 migration versions in the linked Supabase ledger;
- 6 versions shared by both histories;
- 53 historical local-only versions;
- 21 remote-only versions;
- 6 live tables that were represented in neither history; and
- two new newsletter migrations plus the adoption and forward-convergence
  migrations created after the audit.

The schema-only production snapshot captured on 2026-08-06 has SHA-256:

    b797e0e973c27675c2e343e6759a3c14537e31c4140d4326732bf8f6df36fb56

The six adopted live tables and their approximate production sizes at audit time:

| Table | Columns | Approximate rows | Approximate size |
|---|---:|---:|---:|
| bars_daily | 8 | 12,529,085 | 1.65 GiB |
| bars_minute | 8 | 83,640,896 | 10.36 GiB |
| finviz_catalyst_snapshots | 11 | 1,452 | 720 KiB |
| ingestion_log | 6 | 1,876 | 416 KiB |
| newsletter_picks | 8 | 56 | 104 KiB |
| ticker_brand_colors | 10 | 51 | 72 KiB |

The exact table definitions, indexes, comments, grants, and RLS policies are
captured in:

    supabase/migrations/20260806132000_adopt_untracked_live_tables.sql

Production already contains those six tables. The adoption migration must be
marked applied after its fingerprint is verified; it must not be executed there.

Local validation completed on 2026-08-06:

- supabase db reset --local --no-seed replayed all 84 migrations successfully;
- supabase db diff --local --schema public reported no schema changes;
- supabase db lint --local --schema public --level error reported no errors;
- the six adopted tables matched production across all 51 columns, 8
  constraints, 11 indexes, 12 RLS policies, relation metadata, comments, and 7
  table/sequence ACLs; and
- cache access resolved to SELECT-only for anon/authenticated and full access for
  service_role.

This proves the repository replay. It does not waive the production backup,
freeze, fresh-snapshot, dry-run, or post-change gates below.

## Repository History Restored From Remote

These 21 files were fetched from the linked migration ledger and added to the
repository byte-for-byte:

- 20260320210000
- 20260320214500
- 20260321140000
- 20260321150000
- 20260322100000
- 20260322160000
- 20260322170000
- 20260402080000
- 20260402090000
- 20260403000000
- 20260403000001
- 20260403121500
- 20260403170000
- 20260403183000
- 20260403193000
- 20260403200000
- 20260404073000
- 20260404160000
- 20260404180000
- 20260404200000
- 20260406080000

Do not replace a local shared migration just because its whitespace differs from
the fetched copy. In particular, the remote body for 20260730143000 is only a
semicolon, while the repository file contains the canonical newsletter
operations schema and those objects are live. Keep the repository version.

The restored historical migrations temporarily recreate two retired objects on a
clean replay:

- ranker_config_versions.source_type_boosts_json
- finviz_wism_corpus

No current code uses them and they are absent from production. The forward
migration 20260806133000 removes them again. This preserves honest history
without resurrecting retired product behavior.

## Hard Stop Conditions

Do not begin a production repair unless all of these are true:

- Supabase reports a healthy recent backup or point-in-time recovery window.
- A restore procedure and responsible operator are identified.
- Newsletter, ingestion, and admin schema writes can be paused for the repair
  window.
- A fresh schema-only dump and migration-ledger export have been captured.
- A clean local reset passes from an empty database.
- The six adoption tables match the expected fingerprint.
- The first dry run contains exactly the three expected new executable
  migrations listed below.

If any condition fails, leave production unchanged.

## Phase 1: Freeze And Capture

1. Pause deployments, scheduled ingestion, newsletter automation, and manual
   admin writes.
2. In Supabase Dashboard, open Database > Backups. Confirm the latest backup and
   point-in-time recovery coverage. Record the restore point in the change log.
3. Capture a new schema-only dump and ledger listing:

       export AUDIT_DIR="$(mktemp -d)"
       supabase db dump --linked --schema public --file "$AUDIT_DIR/schema.sql"
       supabase migration list --linked > "$AUDIT_DIR/migration-list.txt"
       shasum -a 256 "$AUDIT_DIR/schema.sql" "$AUDIT_DIR/migration-list.txt"

4. Save the checksums outside the temporary directory before continuing.
5. Confirm no unexpected deployment or database job ran after the snapshot.

Never print a database password or connection string into the terminal log.

## Phase 2: Clean Replay

Run this against a disposable local Supabase stack:

    supabase start
    supabase db reset --local
    supabase db diff --local --schema public

Expected result:

- all migrations apply from an empty database;
- the six adoption tables exist with their exact constraints and policies;
- stock_why_moving_reviews exists;
- the three LLM cache tables expose SELECT to anon/authenticated and no DML;
- service_role retains full access;
- finviz_wism_corpus does not exist;
- source_type_boosts_json does not exist; and
- the local diff is empty.

Do not use seed data as proof of schema correctness.

## Phase 3: Read-Only Production Preflight

Run the following in a read-only transaction or through a read-only catalog
connection:

    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           count(a.attnum) FILTER (
             WHERE a.attnum > 0 AND NOT a.attisdropped
           ) AS column_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'bars_daily',
        'bars_minute',
        'finviz_catalyst_snapshots',
        'ingestion_log',
        'newsletter_picks',
        'ticker_brand_colors'
      )
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname;

Expected column counts are 8, 8, 11, 6, 8, and 10 respectively, and RLS must be
enabled on every row.

Also capture:

    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'bars_daily',
        'bars_minute',
        'finviz_catalyst_snapshots',
        'ingestion_log',
        'newsletter_picks',
        'ticker_brand_colors'
      )
    ORDER BY tablename, indexname;

    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'bars_daily',
        'bars_minute',
        'finviz_catalyst_snapshots',
        'ingestion_log',
        'newsletter_picks',
        'ticker_brand_colors'
      )
    ORDER BY tablename, policyname;

Compare the output line-for-line with 20260806132000. If a table, column,
constraint, index, comment, or policy differs, stop and update the adoption
migration from a new production dump before touching the ledger.

Confirm the two known missing effects:

    SELECT to_regclass('public.stock_why_moving_reviews');

    SELECT tablename, policyname, roles, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'market_trends_cache',
        'calendar_summaries_cache',
        'market_summary_cache'
      )
    ORDER BY tablename, policyname;

At the audit point, stock_why_moving_reviews was absent. The cache output still
contained anonymous INSERT policies and an Allow all policy. If production no
longer matches that state, stop and re-evaluate the forward migration.

## Phase 4: Apply Two Missing Historical Effects

Execute these exact repository files transactionally, one at a time:

1. supabase/migrations/20260201000002_lock_down_llm_cache_policies.sql
2. supabase/migrations/20260728000002_create_stock_why_moving_reviews.sql

With psql and a securely supplied connection URL:

    psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -1 \
      -f supabase/migrations/20260201000002_lock_down_llm_cache_policies.sql

    psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -1 \
      -f supabase/migrations/20260728000002_create_stock_why_moving_reviews.sql

If using the Supabase SQL Editor, preserve each file exactly and wrap each one in
its own transaction. Do not combine unrelated repair SQL.

Verify immediately:

- stock_why_moving_reviews has its primary key, unique review_key constraint,
  two indexes, update trigger, RLS, and table comment;
- the anonymous INSERT policies are gone from market_trends_cache and
  calendar_summaries_cache; and
- no application errors appear in database or deployment logs.

The later forward migration will canonicalize all three cache tables, including
the legacy market_summary_cache Allow all policy and table grants.

## Phase 5: Repair Historical Ledger Rows

Only after verifying the corresponding schema effects, mark these 53 historical
local-only versions applied:

    supabase migration repair --linked --status applied \
      20241025000001 20241026000001 20241027000001 20241027000002 \
      20241031000001 20241101000001 20241101000002 20241101000003 \
      20241101000004 20241102000001 20241102000002 20241102000003 \
      20241106000001 20250106 20250203000001 20251107 \
      20251115000001 20260111210625 20260111210626 20260115000001 \
      20260115000002 20260116000001 20260117000001 20260117000002 \
      20260118000001 20260118000002 20260124000001 20260124000002 \
      20260125000001 20260126000001 20260201000001 20260201000002 \
      20260201000003 20260201000004 20260203000002 20260308000001 \
      20260325000001 20260326000002 20260326000003 20260327000001 \
      20260327000002 20260327000003 20260520200500 20260601110000 \
      20260610184500 20260728000001 20260728000002 20260729095500 \
      20260729103000 20260729183000 20260729190000 20260730090000 \
      20260730100000

Then mark only the adoption migration applied:

    supabase migration repair --linked --status applied 20260806132000

Do not mark any of these new executable migrations applied:

- 20260806130000_harden_beehiiv_delivery.sql
- 20260806131000_newsletter_webhook_outbox.sql
- 20260806133000_converge_review_schema_and_cache_security.sql

Migration repair changes ledger metadata only. It is not a substitute for
executing or verifying schema.

## Phase 6: Dry Run And Apply Forward Migrations

Because the adoption version is newer than the two pending newsletter versions,
include all pending versions explicitly:

    supabase db push --linked --include-all --dry-run

The dry run must contain exactly:

1. 20260806130000_harden_beehiiv_delivery.sql
2. 20260806131000_newsletter_webhook_outbox.sql
3. 20260806133000_converge_review_schema_and_cache_security.sql

It must not propose the adoption migration, any of the 53 repaired historical
versions, or any remote-restored migration. If it does, stop.

Apply using the same scope:

    supabase db push --linked --include-all

Do not separately execute 20260806133000. Let the normal migration command own
its transaction and ledger entry.

## Phase 7: Security And Schema Verification

Verify the canonical cache policies:

    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'market_trends_cache',
        'calendar_summaries_cache',
        'market_summary_cache'
      )
    ORDER BY tablename, policyname;

Each table must have exactly:

- one SELECT policy for anon and authenticated; and
- one ALL policy for service_role.

Verify grants:

    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'market_trends_cache',
        'calendar_summaries_cache',
        'market_summary_cache'
      )
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, grantee, privilege_type;

Anon and authenticated must have SELECT only. Service_role must retain full
table privileges.

From a disposable test client using the anonymous key:

- SELECT from each cache table must succeed.
- INSERT, UPDATE, and DELETE against each cache table must fail.
- No production row should be modified during this assertion; issue writes
  inside a transaction that is always rolled back, or target a guaranteed
  invalid payload.

Also verify:

    SELECT to_regclass('public.stock_why_moving_reviews') IS NOT NULL
      AS reviews_table_present,
           to_regclass('public.finviz_wism_corpus') IS NULL
      AS retired_corpus_absent;

    SELECT NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ranker_config_versions'
        AND column_name = 'source_type_boosts_json'
    ) AS retired_column_absent;

## Phase 8: Prove Convergence

Run:

    supabase migration list --linked
    supabase db push --linked --include-all --dry-run
    supabase db diff --linked --schema public

Expected:

- local and remote version columns align;
- the second dry run has no migrations to apply; and
- the schema diff is empty or contains only explicitly reviewed platform-managed
  noise.

Save all three outputs and their checksums with the original preflight artifacts.
Resume crons and deployments only after application smoke tests and logs are
clean.

## Rollback And Recovery

Ledger repair itself has no automatic down migration. If any schema application
fails:

1. keep writes and deployments paused;
2. capture the error, current schema dump, and current ledger;
3. do not mark a failed version applied;
4. revert only the specific forward change using a reviewed transaction; and
5. restore from the confirmed backup/PITR point if data integrity is uncertain.

Never delete migration files, edit an already-applied version, or use a broad
database reset against the linked project as a recovery shortcut.
