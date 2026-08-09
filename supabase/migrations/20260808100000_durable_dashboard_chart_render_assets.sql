-- Persist dashboard chart-of-the-day renders behind a globally fenced lease.
--
-- The public image endpoint runs in many serverless isolates. Process-local
-- promise coalescing is useful, but it cannot stop two different isolates from
-- rendering the same chart at once. These functions make Postgres the global
-- arbiter and cap every immutable render key at three attempts per six-hour
-- recovery window. Anonymous and
-- authenticated Data API roles cannot read or mutate the lease table or call
-- its RPCs.

BEGIN;

CREATE TABLE public.dashboard_chart_render_assets (
  render_key text PRIMARY KEY
    CHECK (render_key ~ '^[0-9a-f]{64}$'),
  theme text NOT NULL
    CHECK (theme IN ('light', 'dark')),
  setting_version text NOT NULL
    CHECK (length(setting_version) BETWEEN 1 AND 256),
  spec_hash text NOT NULL
    CHECK (spec_hash ~ '^[0-9a-f]{64}$'),
  renderer_version text NOT NULL
    CHECK (length(renderer_version) BETWEEN 1 AND 128),
  status text NOT NULL
    CHECK (status IN ('rendering', 'ready', 'failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  storage_path text,
  image_sha256 text
    CHECK (image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer
    CHECK (byte_size IS NULL OR byte_size BETWEEN 24 AND 8388608),
  attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count BETWEEN 1 AND 3),
  attempt_window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retry_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT dashboard_chart_render_assets_state_check CHECK (
    (
      status = 'rendering'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND storage_path IS NULL
      AND image_sha256 IS NULL
      AND byte_size IS NULL
      AND completed_at IS NULL
    )
    OR (
      status = 'ready'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND storage_path IS NOT NULL
      AND image_sha256 IS NOT NULL
      AND byte_size IS NOT NULL
      AND retry_after IS NULL
      AND completed_at IS NOT NULL
    )
    OR (
      status = 'failed'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND storage_path IS NULL
      AND image_sha256 IS NULL
      AND byte_size IS NULL
      AND completed_at IS NULL
      AND retry_after IS NOT NULL
    )
  )
);

CREATE INDEX idx_dashboard_chart_render_assets_lease_expiry
  ON public.dashboard_chart_render_assets (lease_expires_at)
  WHERE status = 'rendering';

ALTER TABLE public.dashboard_chart_render_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_read_dashboard_chart_render_assets
  ON public.dashboard_chart_render_assets
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.dashboard_chart_render_assets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.dashboard_chart_render_assets TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_dashboard_chart_render_asset(
  p_render_key text,
  p_theme text,
  p_setting_version text,
  p_spec_hash text,
  p_renderer_version text,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE (
  disposition text,
  lease_token uuid,
  storage_path text,
  retry_after_seconds integer,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_token uuid := gen_random_uuid();
  lease_duration integer := greatest(60, least(coalesce(p_lease_seconds, 90), 180));
  now_at timestamptz := clock_timestamp();
  asset public.dashboard_chart_render_assets%ROWTYPE;
BEGIN
  IF coalesce(p_render_key, '') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_spec_hash, '') !~ '^[0-9a-f]{64}$'
    OR p_theme NOT IN ('light', 'dark')
    OR length(coalesce(p_setting_version, '')) NOT BETWEEN 1 AND 256
    OR length(coalesce(p_renderer_version, '')) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid dashboard chart render identity';
  END IF;

  INSERT INTO public.dashboard_chart_render_assets (
    render_key,
    theme,
    setting_version,
    spec_hash,
    renderer_version,
    status,
    lease_token,
    lease_expires_at,
    attempt_count,
    attempt_window_started_at
  ) VALUES (
    p_render_key,
    p_theme,
    p_setting_version,
    p_spec_hash,
    p_renderer_version,
    'rendering',
    claimed_token,
    now_at + make_interval(secs => lease_duration),
    1,
    now_at
  )
  ON CONFLICT (render_key) DO NOTHING
  RETURNING * INTO asset;

  IF FOUND THEN
    RETURN QUERY SELECT
      'acquired'::text,
      claimed_token,
      NULL::text,
      lease_duration,
      1;
    RETURN;
  END IF;

  SELECT stored.*
  INTO asset
  FROM public.dashboard_chart_render_assets AS stored
  WHERE stored.render_key = p_render_key
  FOR UPDATE;

  IF asset.theme IS DISTINCT FROM p_theme
    OR asset.setting_version IS DISTINCT FROM p_setting_version
    OR asset.spec_hash IS DISTINCT FROM p_spec_hash
    OR asset.renderer_version IS DISTINCT FROM p_renderer_version THEN
    RAISE EXCEPTION 'Dashboard chart render identity collision';
  END IF;

  IF asset.status = 'ready' THEN
    RETURN QUERY SELECT
      'ready'::text,
      NULL::uuid,
      asset.storage_path,
      0,
      asset.attempt_count;
    RETURN;
  END IF;

  IF asset.status = 'rendering'
    AND asset.lease_expires_at > now_at THEN
    RETURN QUERY SELECT
      'wait'::text,
      NULL::uuid,
      NULL::text,
      greatest(
        1,
        least(180, ceil(extract(epoch FROM asset.lease_expires_at - now_at))::integer)
      ),
      asset.attempt_count;
    RETURN;
  END IF;

  -- Recover automatically after a long outage without allowing a public
  -- caller to drive more than three renderer invocations in any six-hour
  -- window for one canonical asset key.
  IF asset.attempt_window_started_at <= now_at - interval '6 hours' THEN
    UPDATE public.dashboard_chart_render_assets AS stored
    SET
      status = 'rendering',
      lease_token = claimed_token,
      lease_expires_at = now_at + make_interval(secs => lease_duration),
      storage_path = NULL,
      image_sha256 = NULL,
      byte_size = NULL,
      retry_after = NULL,
      completed_at = NULL,
      attempt_count = 1,
      attempt_window_started_at = now_at,
      updated_at = now_at
    WHERE stored.render_key = p_render_key
    RETURNING stored.* INTO asset;

    RETURN QUERY SELECT
      'acquired'::text,
      claimed_token,
      NULL::text,
      lease_duration,
      1;
    RETURN;
  END IF;

  IF asset.attempt_count >= 3 THEN
    RETURN QUERY SELECT
      'failed'::text,
      NULL::uuid,
      NULL::text,
      greatest(
        1,
        least(
          21600,
          ceil(
            extract(
              epoch FROM asset.attempt_window_started_at
                + interval '6 hours' - now_at
            )
          )::integer
        )
      ),
      asset.attempt_count;
    RETURN;
  END IF;

  IF asset.status = 'failed' AND asset.retry_after > now_at THEN
    RETURN QUERY SELECT
      'failed'::text,
      NULL::uuid,
      NULL::text,
      greatest(
        1,
        least(600, ceil(extract(epoch FROM asset.retry_after - now_at))::integer)
      ),
      asset.attempt_count;
    RETURN;
  END IF;

  UPDATE public.dashboard_chart_render_assets AS stored
  SET
    status = 'rendering',
    lease_token = claimed_token,
    lease_expires_at = now_at + make_interval(secs => lease_duration),
    retry_after = NULL,
    attempt_count = stored.attempt_count + 1,
    updated_at = now_at
  WHERE stored.render_key = p_render_key
  RETURNING stored.* INTO asset;

  RETURN QUERY SELECT
    'acquired'::text,
    claimed_token,
    NULL::text,
    lease_duration,
    asset.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_dashboard_chart_render_asset(
  p_render_key text,
  p_lease_token uuid,
  p_storage_path text,
  p_image_sha256 text,
  p_byte_size integer
)
RETURNS TABLE (
  disposition text,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz := clock_timestamp();
  asset public.dashboard_chart_render_assets%ROWTYPE;
  expected_path text;
BEGIN
  IF coalesce(p_render_key, '') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_image_sha256, '') !~ '^[0-9a-f]{64}$'
    OR p_lease_token IS NULL
    OR p_byte_size IS NULL
    OR p_byte_size NOT BETWEEN 24 AND 8388608 THEN
    RAISE EXCEPTION 'Invalid completed dashboard chart asset';
  END IF;

  expected_path := 'immutable/' || substr(p_image_sha256, 1, 2)
    || '/' || p_image_sha256 || '.png';
  IF p_storage_path IS DISTINCT FROM expected_path THEN
    RAISE EXCEPTION 'Dashboard chart asset path is not content-addressed';
  END IF;

  SELECT stored.*
  INTO asset
  FROM public.dashboard_chart_render_assets AS stored
  WHERE stored.render_key = p_render_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lost'::text, NULL::text;
    RETURN;
  END IF;

  IF asset.status = 'ready' THEN
    RETURN QUERY SELECT 'ready'::text, asset.storage_path;
    RETURN;
  END IF;

  IF asset.status <> 'rendering'
    OR asset.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN QUERY SELECT 'lost'::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.dashboard_chart_render_assets AS stored
  SET
    status = 'ready',
    lease_token = NULL,
    lease_expires_at = NULL,
    storage_path = p_storage_path,
    image_sha256 = p_image_sha256,
    byte_size = p_byte_size,
    retry_after = NULL,
    completed_at = now_at,
    updated_at = now_at
  WHERE stored.render_key = p_render_key;

  RETURN QUERY SELECT 'completed'::text, p_storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_dashboard_chart_render_asset(
  p_render_key text,
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz := clock_timestamp();
BEGIN
  UPDATE public.dashboard_chart_render_assets AS stored
  SET
    status = 'failed',
    storage_path = NULL,
    image_sha256 = NULL,
    byte_size = NULL,
    retry_after = now_at,
    completed_at = NULL,
    updated_at = now_at
  WHERE stored.render_key = p_render_key
    AND stored.status = 'ready'
    AND stored.storage_path = p_storage_path;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_dashboard_chart_render_asset(
  p_render_key text,
  p_lease_token uuid,
  p_retry_after_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz := clock_timestamp();
  retry_delay integer := greatest(
    30,
    least(coalesce(p_retry_after_seconds, 60), 600)
  );
BEGIN
  UPDATE public.dashboard_chart_render_assets AS stored
  SET
    status = 'failed',
    lease_token = NULL,
    lease_expires_at = NULL,
    retry_after = now_at + make_interval(
      secs => least(
        1800,
        retry_delay * CASE stored.attempt_count
          WHEN 1 THEN 1
          WHEN 2 THEN 5
          ELSE 25
        END
      )
    ),
    updated_at = now_at
  WHERE stored.render_key = p_render_key
    AND stored.status = 'rendering'
    AND stored.lease_token = p_lease_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_dashboard_chart_render_asset(
  text, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_dashboard_chart_render_asset(
  text, uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_dashboard_chart_render_asset(
  text, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_dashboard_chart_render_asset(
  text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_dashboard_chart_render_asset(
  text, text, text, text, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_dashboard_chart_render_asset(
  text, uuid, text, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_dashboard_chart_render_asset(
  text, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_dashboard_chart_render_asset(
  text, text
) TO service_role;

COMMENT ON TABLE public.dashboard_chart_render_assets IS
  'Immutable dashboard chart assets and globally fenced render leases. Each canonical key is limited to three render attempts per six-hour recovery window.';
COMMENT ON FUNCTION public.acquire_dashboard_chart_render_asset(
  text, text, text, text, text, integer
) IS
  'Returns ready, acquired, wait, or failed while atomically fencing one render owner across serverless isolates.';
COMMENT ON FUNCTION public.complete_dashboard_chart_render_asset(
  text, uuid, text, text, integer
) IS
  'Publishes an immutable storage path only for the current render lease token.';
COMMENT ON FUNCTION public.invalidate_dashboard_chart_render_asset(text, text) IS
  'Marks a ready row retryable only when its exact immutable storage object is missing.';

NOTIFY pgrst, 'reload schema';

COMMIT;
