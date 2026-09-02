-- Make the Finviz transport cache an internal implementation detail.
-- Public callers receive a bounded DTO through the admitted route; they no
-- longer get a broad Data API window onto stored provider payloads.

BEGIN;

-- Raw provider documents are neither needed by readers nor safe to retain.
-- The application now writes only its bounded display projection.
UPDATE public.stock_why_moving_cache
SET raw_payload = NULL
WHERE raw_payload IS NOT NULL;

DROP POLICY IF EXISTS "Allow anonymous read for stock_why_moving_cache"
  ON public.stock_why_moving_cache;

REVOKE ALL PRIVILEGES ON TABLE public.stock_why_moving_cache
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stock_why_moving_cache
  TO service_role;

ALTER TABLE public.stock_why_moving_cache
  DROP CONSTRAINT IF EXISTS stock_why_moving_cache_bounded_projection;
ALTER TABLE public.stock_why_moving_cache
  ADD CONSTRAINT stock_why_moving_cache_bounded_projection CHECK (
    raw_payload IS NULL
    AND symbol = pg_catalog.upper(symbol)
    AND symbol ~ '^[A-Z][A-Z0-9]{0,9}(\.[A-Z0-9]{1,4})?$'
    AND pg_catalog.octet_length(symbol) <= 15
    AND (display_text IS NULL OR pg_catalog.octet_length(display_text) <= 8192)
    AND (headline IS NULL OR pg_catalog.octet_length(headline) <= 4096)
    AND (summary IS NULL OR pg_catalog.octet_length(summary) <= 32768)
    AND pg_catalog.jsonb_typeof(bullet_points) = 'array'
    AND pg_catalog.jsonb_array_length(bullet_points) <= 12
    AND pg_catalog.pg_column_size(bullet_points) <= 16384
    AND (sentiment IS NULL OR pg_catalog.octet_length(sentiment) <= 256)
    AND (source IS NULL OR pg_catalog.octet_length(source) <= 1024)
    AND (source_timestamp IS NULL OR pg_catalog.octet_length(source_timestamp) <= 64)
    AND pg_catalog.octet_length(source_url) <= 2048
    AND source_url ~ '^https://finviz\.com/quote\.ashx\?'
    AND (error_message IS NULL OR pg_catalog.octet_length(error_message) <= 2048)
    AND (
      pg_catalog.octet_length(coalesce(display_text, ''))
      + pg_catalog.octet_length(coalesce(headline, ''))
      + pg_catalog.octet_length(coalesce(summary, ''))
      + pg_catalog.pg_column_size(bullet_points)
      + pg_catalog.octet_length(coalesce(sentiment, ''))
      + pg_catalog.octet_length(coalesce(source, ''))
      + pg_catalog.octet_length(coalesce(source_timestamp, ''))
      + pg_catalog.octet_length(source_url)
      + pg_catalog.octet_length(coalesce(error_message, ''))
    ) <= 32768
    AND (
      (status = 'found' AND error_message IS NULL AND (
        display_text IS NOT NULL OR headline IS NOT NULL OR
        summary IS NOT NULL OR pg_catalog.jsonb_array_length(bullet_points) > 0
      ))
      OR (status = 'not_found' AND error_message IS NULL
        AND display_text IS NULL AND headline IS NULL AND summary IS NULL
        AND pg_catalog.jsonb_array_length(bullet_points) = 0)
      OR (status = 'error' AND error_message IS NOT NULL
        AND display_text IS NULL AND headline IS NULL AND summary IS NULL
        AND pg_catalog.jsonb_array_length(bullet_points) = 0)
    )
  ) NOT VALID;

COMMENT ON COLUMN public.stock_why_moving_cache.raw_payload IS
  'Deprecated private field; constrained to NULL. Only bounded display fields are retained.';

COMMIT;
