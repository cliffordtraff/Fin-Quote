-- Fence daily and mid-morning automation writes to the active, unexpired
-- lease. A worker that resumes after a takeover must never mutate the run.

CREATE OR REPLACE FUNCTION public.claim_newsletter_daily_automation(
  p_market_date date,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.newsletter_daily_automation_runs (market_date)
  VALUES (p_market_date)
  ON CONFLICT (market_date) DO NOTHING;

  RETURN QUERY
  UPDATE public.newsletter_daily_automation_runs AS run
  SET
    lease_token = p_lease_token,
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    ),
    status = CASE
      WHEN run.status IN ('completed', 'partial', 'failed') THEN run.status
      ELSE 'running'
    END,
    started_at = coalesce(run.started_at, clock_timestamp()),
    last_heartbeat_at = clock_timestamp(),
    invocation_count = run.invocation_count + 1
  WHERE run.market_date = p_market_date
    AND (
      run.lease_expires_at IS NULL
      OR run.lease_expires_at < clock_timestamp()
      OR run.lease_token = p_lease_token
    )
  RETURNING run.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_newsletter_daily_automation(
  p_run_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_daily_automation_runs AS run
  SET
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    ),
    last_heartbeat_at = clock_timestamp()
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
$$;

CREATE OR REPLACE FUNCTION public.update_newsletter_daily_automation_claim(
  p_run_id uuid,
  p_lease_token uuid,
  p_patch jsonb,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.newsletter_daily_automation_runs%ROWTYPE;
  patched_row public.newsletter_daily_automation_runs%ROWTYPE;
BEGIN
  IF jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Newsletter daily automation patch must be a JSON object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) AS patch_key(key)
    WHERE NOT patch_key.key = ANY (ARRAY[
      'status',
      'stage',
      'candidate_symbols',
      'candidate_count',
      'finviz_completed_count',
      'finviz_found_count',
      'finviz_error_count',
      'summary_completed_count',
      'summary_generated_count',
      'summary_no_result_count',
      'summary_error_count',
      'wiim_run_id',
      'newsletter_scope_count',
      'newsletter_completed_scope_count',
      'newsletter_selected_count',
      'newsletter_generated_count',
      'newsletter_ready_count',
      'newsletter_attention_count',
      'newsletter_failed_count',
      'last_error',
      'metadata_json',
      'completed_at'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'Newsletter daily automation patch contains unsupported fields';
  END IF;

  SELECT run.*
  INTO current_row
  FROM public.newsletter_daily_automation_runs AS run
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  patched_row := jsonb_populate_record(
    current_row,
    coalesce(p_patch, '{}'::jsonb)
  );

  RETURN QUERY
  UPDATE public.newsletter_daily_automation_runs AS run
  SET
    status = patched_row.status,
    stage = patched_row.stage,
    candidate_symbols = patched_row.candidate_symbols,
    candidate_count = patched_row.candidate_count,
    finviz_completed_count = patched_row.finviz_completed_count,
    finviz_found_count = patched_row.finviz_found_count,
    finviz_error_count = patched_row.finviz_error_count,
    summary_completed_count = patched_row.summary_completed_count,
    summary_generated_count = patched_row.summary_generated_count,
    summary_no_result_count = patched_row.summary_no_result_count,
    summary_error_count = patched_row.summary_error_count,
    wiim_run_id = patched_row.wiim_run_id,
    newsletter_scope_count = patched_row.newsletter_scope_count,
    newsletter_completed_scope_count = patched_row.newsletter_completed_scope_count,
    newsletter_selected_count = patched_row.newsletter_selected_count,
    newsletter_generated_count = patched_row.newsletter_generated_count,
    newsletter_ready_count = patched_row.newsletter_ready_count,
    newsletter_attention_count = patched_row.newsletter_attention_count,
    newsletter_failed_count = patched_row.newsletter_failed_count,
    last_error = patched_row.last_error,
    metadata_json = patched_row.metadata_json,
    completed_at = patched_row.completed_at,
    last_heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    )
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_newsletter_mid_morning_automation(
  p_market_date date,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.newsletter_mid_morning_runs (market_date)
  VALUES (p_market_date)
  ON CONFLICT (market_date) DO NOTHING;

  RETURN QUERY
  UPDATE public.newsletter_mid_morning_runs AS run
  SET
    lease_token = p_lease_token,
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    ),
    status = CASE
      WHEN run.status IN ('completed', 'partial', 'failed') THEN run.status
      ELSE 'running'
    END,
    started_at = coalesce(run.started_at, clock_timestamp()),
    last_heartbeat_at = clock_timestamp(),
    invocation_count = run.invocation_count + 1
  WHERE run.market_date = p_market_date
    AND (
      run.lease_expires_at IS NULL
      OR run.lease_expires_at < clock_timestamp()
      OR run.lease_token = p_lease_token
    )
  RETURNING run.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_newsletter_mid_morning_automation(
  p_run_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_mid_morning_runs AS run
  SET
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    ),
    last_heartbeat_at = clock_timestamp()
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
$$;

CREATE OR REPLACE FUNCTION public.update_newsletter_mid_morning_automation_claim(
  p_run_id uuid,
  p_lease_token uuid,
  p_patch jsonb,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.newsletter_mid_morning_runs%ROWTYPE;
  patched_row public.newsletter_mid_morning_runs%ROWTYPE;
BEGIN
  IF jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Newsletter mid-morning automation patch must be a JSON object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) AS patch_key(key)
    WHERE NOT patch_key.key = ANY (ARRAY[
      'status',
      'stage',
      'candidate_symbols',
      'candidate_count',
      'finviz_completed_count',
      'finviz_found_count',
      'finviz_error_count',
      'morning_wiim_run_id',
      'mid_morning_wiim_run_id',
      'summary_completed_count',
      'summary_generated_count',
      'summary_error_count',
      'meaningful_change',
      'last_error',
      'metadata_json',
      'completed_at'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'Newsletter mid-morning automation patch contains unsupported fields';
  END IF;

  SELECT run.*
  INTO current_row
  FROM public.newsletter_mid_morning_runs AS run
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  patched_row := jsonb_populate_record(
    current_row,
    coalesce(p_patch, '{}'::jsonb)
  );

  RETURN QUERY
  UPDATE public.newsletter_mid_morning_runs AS run
  SET
    status = patched_row.status,
    stage = patched_row.stage,
    candidate_symbols = patched_row.candidate_symbols,
    candidate_count = patched_row.candidate_count,
    finviz_completed_count = patched_row.finviz_completed_count,
    finviz_found_count = patched_row.finviz_found_count,
    finviz_error_count = patched_row.finviz_error_count,
    morning_wiim_run_id = patched_row.morning_wiim_run_id,
    mid_morning_wiim_run_id = patched_row.mid_morning_wiim_run_id,
    summary_completed_count = patched_row.summary_completed_count,
    summary_generated_count = patched_row.summary_generated_count,
    summary_error_count = patched_row.summary_error_count,
    meaningful_change = patched_row.meaningful_change,
    last_error = patched_row.last_error,
    metadata_json = patched_row.metadata_json,
    completed_at = patched_row.completed_at,
    last_heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 60), 120))
    )
  WHERE run.id = p_run_id
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_daily_automation(date, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_newsletter_daily_automation(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_newsletter_daily_automation_claim(uuid, uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_newsletter_daily_automation(date, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_newsletter_mid_morning_automation(date, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_newsletter_mid_morning_automation(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_newsletter_mid_morning_automation_claim(uuid, uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_newsletter_mid_morning_automation(date, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_newsletter_daily_automation(date, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_newsletter_daily_automation(uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_newsletter_daily_automation_claim(uuid, uuid, jsonb, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_newsletter_daily_automation(date, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_mid_morning_automation(date, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_newsletter_mid_morning_automation(uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_newsletter_mid_morning_automation_claim(uuid, uuid, jsonb, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_newsletter_mid_morning_automation(date, uuid)
  TO service_role;

COMMENT ON FUNCTION public.renew_newsletter_daily_automation(uuid, uuid, integer) IS
  'Renews an active daily automation lease; an expired or stale token returns no row.';
COMMENT ON FUNCTION public.update_newsletter_daily_automation_claim(uuid, uuid, jsonb, integer) IS
  'Applies an allowlisted daily automation patch only while the supplied lease is active, and renews that lease atomically.';
COMMENT ON FUNCTION public.renew_newsletter_mid_morning_automation(uuid, uuid, integer) IS
  'Renews an active mid-morning automation lease; an expired or stale token returns no row.';
COMMENT ON FUNCTION public.update_newsletter_mid_morning_automation_claim(uuid, uuid, jsonb, integer) IS
  'Applies an allowlisted mid-morning automation patch only while the supplied lease is active, and renews that lease atomically.';

NOTIFY pgrst, 'reload schema';
