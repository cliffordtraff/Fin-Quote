-- Keep interactive chart-library browsing bounded as each owner's archive
-- grows. The application pages by updated_at + id, while automation retains
-- its existing complete chart-spec scan and ordering semantics.

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_owner_updated_id
  ON public.newsletter_chart_library(owner_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_owner_symbol_updated_id
  ON public.newsletter_chart_library(
    owner_id,
    symbol,
    updated_at DESC,
    id DESC
  );

-- Substring search can use these trigram indexes and PostgreSQL can bitmap-AND
-- them with the owner index above. This avoids requiring btree_gin (and a new
-- extension) merely to place owner_id inside a multicolumn GIN index.
CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_title_trgm
  ON public.newsletter_chart_library USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_symbol_trgm
  ON public.newsletter_chart_library USING gin(symbol gin_trgm_ops);
