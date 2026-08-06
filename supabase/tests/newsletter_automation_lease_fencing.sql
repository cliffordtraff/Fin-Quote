BEGIN;

SET LOCAL search_path = public, extensions;

SELECT plan(56);

DELETE FROM public.newsletter_daily_automation_runs
WHERE market_date = DATE '2099-01-02';
DELETE FROM public.newsletter_mid_morning_runs
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_daily_automation(
      DATE '2099-01-02',
      '10000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  1::bigint,
  'daily worker A acquires the initial lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_daily_automation(
      DATE '2099-01-02',
      '10000000-0000-0000-0000-000000000002'::uuid,
      60
    )
  ),
  0::bigint,
  'daily worker B cannot take an active lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_daily_automation_claim(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000001'::uuid,
      '{"stage":"finviz","candidate_count":3}'::jsonb,
      60
    )
  ),
  1::bigint,
  'daily worker A can write through its active lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.renew_newsletter_daily_automation(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  1::bigint,
  'daily worker A can renew its active lease'
);

UPDATE public.newsletter_daily_automation_runs
SET lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_daily_automation(
      DATE '2099-01-02',
      '10000000-0000-0000-0000-000000000002'::uuid,
      60
    )
  ),
  1::bigint,
  'daily worker B takes over an expired lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_daily_automation_claim(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000001'::uuid,
      '{"stage":"failed","candidate_count":99}'::jsonb,
      60
    )
  ),
  0::bigint,
  'stale daily worker A cannot write after takeover'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.renew_newsletter_daily_automation(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  0::bigint,
  'stale daily worker A cannot renew after takeover'
);

SELECT is(
  (SELECT stage FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
  'finviz',
  'the stale daily write leaves successor state unchanged'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_daily_automation_claim(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000002'::uuid,
      '{"stage":"summaries","candidate_count":4}'::jsonb,
      60
    )
  ),
  1::bigint,
  'daily successor can write with its current lease'
);

SELECT is(
  (SELECT stage FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
  'summaries',
  'daily successor state is persisted'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_mid_morning_automation(
      DATE '2099-01-03',
      '20000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  1::bigint,
  'mid-morning worker A acquires the initial lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_mid_morning_automation(
      DATE '2099-01-03',
      '20000000-0000-0000-0000-000000000002'::uuid,
      60
    )
  ),
  0::bigint,
  'mid-morning worker B cannot take an active lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_mid_morning_automation_claim(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000001'::uuid,
      '{"stage":"finviz","candidate_count":3}'::jsonb,
      60
    )
  ),
  1::bigint,
  'mid-morning worker A can write through its active lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.renew_newsletter_mid_morning_automation(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  1::bigint,
  'mid-morning worker A can renew its active lease'
);

UPDATE public.newsletter_mid_morning_runs
SET lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_mid_morning_automation(
      DATE '2099-01-03',
      '20000000-0000-0000-0000-000000000002'::uuid,
      60
    )
  ),
  1::bigint,
  'mid-morning worker B takes over an expired lease'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_mid_morning_automation_claim(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000001'::uuid,
      '{"stage":"failed","candidate_count":99}'::jsonb,
      60
    )
  ),
  0::bigint,
  'stale mid-morning worker A cannot write after takeover'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.renew_newsletter_mid_morning_automation(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000001'::uuid,
      60
    )
  ),
  0::bigint,
  'stale mid-morning worker A cannot renew after takeover'
);

SELECT is(
  (SELECT stage FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
  'finviz',
  'the stale mid-morning write leaves successor state unchanged'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.update_newsletter_mid_morning_automation_claim(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000002'::uuid,
      '{"stage":"summaries","candidate_count":4}'::jsonb,
      60
    )
  ),
  1::bigint,
  'mid-morning successor can write with its current lease'
);

SELECT is(
  (SELECT stage FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
  'summaries',
  'mid-morning successor state is persisted'
);

UPDATE public.newsletter_daily_automation_runs
SET
  status = 'failed',
  stage = 'failed',
  lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_daily_automation(
      DATE '2099-01-02',
      '10000000-0000-0000-0000-000000000003'::uuid,
      60
    )
  ),
  1::bigint,
  'daily failed run can be claimed for an explicit recovery action'
);

SELECT is(
  (SELECT status FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
  'failed',
  'claiming preserves the failed terminal state'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_daily_notification_attempt(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      false,
      'temporary notification failure'
    )
  ),
  1::bigint,
  'daily notification failure is recorded for retry'
);

SELECT ok(
  (
    SELECT notification_attempt_count = 1
      AND notification_applied_at IS NULL
      AND notification_last_error = 'temporary notification failure'
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily notification remains pending after a failed attempt'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_daily_notification_attempt(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      true,
      NULL
    )
  ),
  1::bigint,
  'daily notification success is recorded idempotently'
);

SELECT ok(
  (
    SELECT notification_attempt_count = 2
      AND notification_applied_at IS NOT NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily notification becomes durably applied after retry'
);

UPDATE public.newsletter_mid_morning_runs
SET
  status = 'failed',
  stage = 'failed',
  lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_mid_morning_automation(
      DATE '2099-01-03',
      '20000000-0000-0000-0000-000000000003'::uuid,
      60
    )
  ),
  1::bigint,
  'mid-morning failed run can be claimed for an explicit recovery action'
);

SELECT is(
  (SELECT status FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
  'failed',
  'mid-morning claiming preserves the failed terminal state'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_mid_morning_notification_attempt(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      false,
      'temporary notification failure'
    )
  ),
  1::bigint,
  'mid-morning notification failure is recorded for retry'
);

SELECT ok(
  (
    SELECT notification_attempt_count = 1
      AND notification_applied_at IS NULL
      AND notification_last_error = 'temporary notification failure'
    FROM public.newsletter_mid_morning_runs
    WHERE market_date = DATE '2099-01-03'
  ),
  'mid-morning notification remains pending after a failed attempt'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_mid_morning_notification_attempt(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      true,
      NULL
    )
  ),
  1::bigint,
  'mid-morning notification success is recorded idempotently'
);

SELECT ok(
  (
    SELECT notification_attempt_count = 2
      AND notification_applied_at IS NOT NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_mid_morning_runs
    WHERE market_date = DATE '2099-01-03'
  ),
  'mid-morning notification becomes durably applied after retry'
);

-- A terminal failure can already have its failure notification recorded. A
-- manual retry must clear that marker under the current lease so the recovered
-- completion can be recorded independently.
UPDATE public.newsletter_daily_automation_runs
SET status = 'running'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  0::bigint,
  'daily retry notification reset rejects non-terminal runs'
);

UPDATE public.newsletter_daily_automation_runs
SET
  status = 'failed',
  stage = 'failed',
  notification_applied_at = statement_timestamp(),
  notification_last_error = 'stale terminal notification error',
  updated_at = statement_timestamp() - interval '1 day'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  1::bigint,
  'daily current lease resets a failed run notification state'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NULL
      AND notification_last_error IS NULL
      AND updated_at > statement_timestamp() - interval '1 minute'
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily reset clears notification state and updates the timestamp'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  0::bigint,
  'daily stale lease cannot reset retry notification state'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_daily_notification_attempt(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      true,
      NULL
    )
  ),
  1::bigint,
  'daily recovered completion notification can be recorded after reset'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NOT NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily recovered completion notification is durably applied'
);

UPDATE public.newsletter_daily_automation_runs
SET
  status = 'partial',
  notification_applied_at = statement_timestamp(),
  notification_last_error = 'partial terminal notification error'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  1::bigint,
  'daily current lease resets a partial run notification state'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily partial run notification reset is durable'
);

UPDATE public.newsletter_daily_automation_runs
SET
  status = 'completed',
  notification_applied_at = statement_timestamp(),
  notification_last_error = 'completed terminal notification error'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  1::bigint,
  'daily current lease resets a completed run notification state'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_daily_automation_runs
    WHERE market_date = DATE '2099-01-02'
  ),
  'daily completed run notification reset is durable'
);

UPDATE public.newsletter_daily_automation_runs
SET lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-02';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_daily_retry_notification(
      (SELECT id FROM public.newsletter_daily_automation_runs WHERE market_date = DATE '2099-01-02'),
      '10000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  0::bigint,
  'daily expired lease cannot reset retry notification state'
);

UPDATE public.newsletter_mid_morning_runs
SET status = 'completed'
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_mid_morning_retry_notification(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  0::bigint,
  'mid-morning retry notification reset rejects non-failed runs'
);

UPDATE public.newsletter_mid_morning_runs
SET
  status = 'failed',
  stage = 'failed',
  notification_applied_at = statement_timestamp(),
  notification_last_error = 'stale terminal notification error',
  updated_at = statement_timestamp() - interval '1 day'
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_mid_morning_retry_notification(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  1::bigint,
  'mid-morning current lease resets a failed run notification state'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NULL
      AND notification_last_error IS NULL
      AND updated_at > statement_timestamp() - interval '1 minute'
    FROM public.newsletter_mid_morning_runs
    WHERE market_date = DATE '2099-01-03'
  ),
  'mid-morning reset clears notification state and updates the timestamp'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_mid_morning_retry_notification(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  0::bigint,
  'mid-morning stale lease cannot reset retry notification state'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.record_newsletter_mid_morning_notification_attempt(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      true,
      NULL
    )
  ),
  1::bigint,
  'mid-morning recovered completion notification can be recorded after reset'
);

SELECT ok(
  (
    SELECT notification_applied_at IS NOT NULL
      AND notification_last_error IS NULL
    FROM public.newsletter_mid_morning_runs
    WHERE market_date = DATE '2099-01-03'
  ),
  'mid-morning recovered completion notification is durably applied'
);

UPDATE public.newsletter_mid_morning_runs
SET lease_expires_at = statement_timestamp() - interval '1 second'
WHERE market_date = DATE '2099-01-03';

SELECT is(
  (
    SELECT count(*)
    FROM public.reset_newsletter_mid_morning_retry_notification(
      (SELECT id FROM public.newsletter_mid_morning_runs WHERE market_date = DATE '2099-01-03'),
      '20000000-0000-0000-0000-000000000003'::uuid
    )
  ),
  0::bigint,
  'mid-morning expired lease cannot reset retry notification state'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.release_newsletter_daily_automation(date, uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the daily lease release RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.release_newsletter_daily_automation(date, uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the daily lease release RPC'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.release_newsletter_daily_automation(date, uuid)',
    'EXECUTE'
  ),
  'service role can execute the daily lease release RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.release_newsletter_mid_morning_automation(date, uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the mid-morning lease release RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.release_newsletter_mid_morning_automation(date, uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the mid-morning lease release RPC'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.release_newsletter_mid_morning_automation(date, uuid)',
    'EXECUTE'
  ),
  'service role can execute the mid-morning lease release RPC'
);

SELECT * FROM finish();

ROLLBACK;
