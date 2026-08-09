BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.chart_render_acquire_error(
  render_key text,
  theme text,
  setting_version text,
  spec_hash text,
  renderer_version text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.acquire_dashboard_chart_render_asset(
    render_key,
    theme,
    setting_version,
    spec_hash,
    renderer_version,
    90
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.chart_render_complete_error(
  render_key text,
  lease_token uuid,
  storage_path text,
  image_sha256 text,
  byte_size integer
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.complete_dashboard_chart_render_asset(
    render_key,
    lease_token,
    storage_path,
    image_sha256,
    byte_size
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'public.dashboard_chart_render_assets',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    AND NOT has_table_privilege(
      'authenticated',
      'public.dashboard_chart_render_assets',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND has_table_privilege(
      'service_role',
      'public.dashboard_chart_render_assets',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'service_role',
      'public.dashboard_chart_render_assets',
      'INSERT,UPDATE,DELETE'
    ),
  'the render lease table is private and service role may only read it directly'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.acquire_dashboard_chart_render_asset(text,text,text,text,text,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.acquire_dashboard_chart_render_asset(text,text,text,text,text,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.acquire_dashboard_chart_render_asset(text,text,text,text,text,integer)',
      'EXECUTE'
    ),
  'only service role may acquire a dashboard chart render lease'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.complete_dashboard_chart_render_asset(text,uuid,text,text,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.complete_dashboard_chart_render_asset(text,uuid,text,text,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.complete_dashboard_chart_render_asset(text,uuid,text,text,integer)',
      'EXECUTE'
    ),
  'only service role may complete a dashboard chart render lease'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.fail_dashboard_chart_render_asset(text,uuid,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.fail_dashboard_chart_render_asset(text,uuid,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.fail_dashboard_chart_render_asset(text,uuid,integer)',
      'EXECUTE'
    ),
  'only service role may release a failed dashboard chart render lease'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.invalidate_dashboard_chart_render_asset(text,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.invalidate_dashboard_chart_render_asset(text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.invalidate_dashboard_chart_render_asset(text,text)',
      'EXECUTE'
    ),
  'only service role may invalidate a missing immutable object'
);

CREATE TEMP TABLE first_chart_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('a', 64),
  'light',
  '2026-08-08T10:00:00.000Z',
  repeat('b', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT is(
  (SELECT disposition FROM first_chart_claim),
  'acquired',
  'the first caller acquires the global render lease'
);

SELECT ok(
  (SELECT lease_token IS NOT NULL FROM first_chart_claim)
    AND (SELECT attempt_count = 1 FROM first_chart_claim),
  'the first claim receives a fenced token and attempt number'
);

CREATE TEMP TABLE competing_chart_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('a', 64),
  'light',
  '2026-08-08T10:00:00.000Z',
  repeat('b', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT ok(
  (SELECT disposition = 'wait' FROM competing_chart_claim)
    AND (SELECT lease_token IS NULL FROM competing_chart_claim)
    AND (SELECT retry_after_seconds BETWEEN 1 AND 180 FROM competing_chart_claim),
  'a competing isolate cannot receive the active lease token or start a render'
);

SELECT is(
  pg_temp.chart_render_complete_error(
    repeat('a', 64),
    (SELECT lease_token FROM first_chart_claim),
    'mutable/chart.png',
    repeat('c', 64),
    1024
  ),
  'Dashboard chart asset path is not content-addressed',
  'completion rejects mutable or caller-chosen storage paths'
);

SELECT is(
  (
    SELECT disposition
    FROM public.complete_dashboard_chart_render_asset(
      repeat('a', 64),
      '20000000-0000-4000-8000-000000000002'::uuid,
      'immutable/cc/' || repeat('c', 64) || '.png',
      repeat('c', 64),
      1024
    )
  ),
  'lost',
  'a stale or fabricated lease token cannot publish an asset'
);

CREATE TEMP TABLE completed_chart_asset AS
SELECT *
FROM public.complete_dashboard_chart_render_asset(
  repeat('a', 64),
  (SELECT lease_token FROM first_chart_claim),
  'immutable/cc/' || repeat('c', 64) || '.png',
  repeat('c', 64),
  1024
);

SELECT is(
  (SELECT disposition FROM completed_chart_asset),
  'completed',
  'the current lease owner can publish its immutable asset'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.dashboard_chart_render_assets
    WHERE render_key = repeat('a', 64)
      AND status = 'ready'
      AND storage_path = 'immutable/cc/' || repeat('c', 64) || '.png'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND completed_at IS NOT NULL
  ),
  'ready state clears lease material and retains the immutable path'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_dashboard_chart_render_asset(
      repeat('a', 64),
      'light',
      '2026-08-08T10:00:00.000Z',
      repeat('b', 64),
      'dashboard-chart-of-day-assets-v1',
      90
    )
  ),
  'ready',
  'later isolates reuse the completed asset without a render lease'
);

SELECT is(
  public.invalidate_dashboard_chart_render_asset(
    repeat('a', 64),
    'immutable/ff/' || repeat('f', 64) || '.png'
  ),
  false,
  'an obsolete or fabricated storage path cannot invalidate a ready asset'
);

SELECT is(
  public.invalidate_dashboard_chart_render_asset(
    repeat('a', 64),
    'immutable/cc/' || repeat('c', 64) || '.png'
  ),
  true,
  'the exact missing immutable path can be made retryable'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.dashboard_chart_render_assets
    WHERE render_key = repeat('a', 64)
      AND status = 'failed'
      AND storage_path IS NULL
      AND retry_after <= clock_timestamp()
  ),
  'invalidating a missing object clears its ready pointer without deleting history'
);

SELECT is(
  pg_temp.chart_render_acquire_error(
    repeat('a', 64),
    'dark',
    '2026-08-08T10:00:00.000Z',
    repeat('b', 64),
    'dashboard-chart-of-day-assets-v1'
  ),
  'Dashboard chart render identity collision',
  'a hash collision cannot alias a different canonical render identity'
);

CREATE TEMP TABLE stale_first_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('d', 64),
  'dark',
  '2026-08-08T11:00:00.000Z',
  repeat('e', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

UPDATE public.dashboard_chart_render_assets
SET lease_expires_at = clock_timestamp() - interval '1 second'
WHERE render_key = repeat('d', 64);

CREATE TEMP TABLE stale_recovery_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('d', 64),
  'dark',
  '2026-08-08T11:00:00.000Z',
  repeat('e', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT ok(
  (SELECT disposition = 'acquired' FROM stale_recovery_claim)
    AND (SELECT attempt_count = 2 FROM stale_recovery_claim)
    AND (
      SELECT stale_recovery_claim.lease_token <> stale_first_claim.lease_token
      FROM stale_recovery_claim, stale_first_claim
    ),
  'an expired lease is recovered with a new fence token and incremented attempt'
);

SELECT is(
  public.fail_dashboard_chart_render_asset(
    repeat('d', 64),
    (SELECT lease_token FROM stale_first_claim),
    60
  ),
  false,
  'the stale worker cannot fail the replacement lease'
);

SELECT is(
  public.fail_dashboard_chart_render_asset(
    repeat('d', 64),
    (SELECT lease_token FROM stale_recovery_claim),
    60
  ),
  true,
  'the current worker can record a bounded failure cooldown'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.dashboard_chart_render_assets
    WHERE render_key = repeat('d', 64)
      AND status = 'failed'
      AND retry_after > clock_timestamp()
      AND attempt_count = 2
  ),
  'a failed render cannot be retried before its cooldown expires'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_dashboard_chart_render_asset(
      repeat('d', 64),
      'dark',
      '2026-08-08T11:00:00.000Z',
      repeat('e', 64),
      'dashboard-chart-of-day-assets-v1',
      90
    )
  ),
  'failed',
  'requests during the failure cooldown do not acquire a render lease'
);

UPDATE public.dashboard_chart_render_assets
SET retry_after = clock_timestamp() - interval '1 second'
WHERE render_key = repeat('d', 64);

CREATE TEMP TABLE final_chart_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('d', 64),
  'dark',
  '2026-08-08T11:00:00.000Z',
  repeat('e', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT ok(
  (SELECT disposition = 'acquired' FROM final_chart_claim)
    AND (SELECT attempt_count = 3 FROM final_chart_claim),
  'the key receives its final permitted render attempt after cooldown'
);

SELECT is(
  public.fail_dashboard_chart_render_asset(
    repeat('d', 64),
    (SELECT lease_token FROM final_chart_claim),
    60
  ),
  true,
  'the final owner can record its failure'
);

UPDATE public.dashboard_chart_render_assets
SET retry_after = clock_timestamp() - interval '1 second'
WHERE render_key = repeat('d', 64);

CREATE TEMP TABLE exhausted_chart_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('d', 64),
  'dark',
  '2026-08-08T11:00:00.000Z',
  repeat('e', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT ok(
  (SELECT disposition = 'failed' FROM exhausted_chart_claim)
    AND (SELECT retry_after_seconds BETWEEN 1 AND 21600 FROM exhausted_chart_claim)
    AND (SELECT lease_token IS NULL FROM exhausted_chart_claim)
    AND (SELECT attempt_count = 3 FROM exhausted_chart_claim),
  'three failed attempts bound renderer work for the current six-hour window'
);

UPDATE public.dashboard_chart_render_assets
SET attempt_window_started_at = clock_timestamp() - interval '6 hours 1 second'
WHERE render_key = repeat('d', 64);

CREATE TEMP TABLE recovered_window_claim AS
SELECT *
FROM public.acquire_dashboard_chart_render_asset(
  repeat('d', 64),
  'dark',
  '2026-08-08T11:00:00.000Z',
  repeat('e', 64),
  'dashboard-chart-of-day-assets-v1',
  90
);

SELECT ok(
  (SELECT disposition = 'acquired' FROM recovered_window_claim)
    AND (SELECT attempt_count = 1 FROM recovered_window_claim)
    AND (SELECT lease_token IS NOT NULL FROM recovered_window_claim),
  'a new window automatically recovers from a prolonged renderer or storage outage'
);

SELECT ok(
  position(
    'FOR UPDATE' IN pg_get_functiondef(
      'public.acquire_dashboard_chart_render_asset(text,text,text,text,text,integer)'::regprocedure
    )
  ) > 0,
  'lease decisions serialize on the canonical render row'
);

SELECT * FROM finish();

ROLLBACK;
