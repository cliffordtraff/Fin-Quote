-- Update search_filing_chunks function to support ticker filtering
-- This allows filtering RAG search results by stock symbol

-- Drop the old function signature first (3 params)
DROP FUNCTION IF EXISTS search_filing_chunks(TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION search_filing_chunks(
  query_embedding TEXT,
  match_count INT DEFAULT 5,
  filing_type_filter TEXT DEFAULT NULL,
  ticker_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_text TEXT,
  section_name TEXT,
  filing_type TEXT,
  filing_date DATE,
  fiscal_year INT,
  fiscal_quarter INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.chunk_text,
    fc.section_name,
    f.filing_type,
    f.filing_date,
    f.fiscal_year,
    f.fiscal_quarter,
    1 - (fc.embedding <=> query_embedding::vector) AS similarity
  FROM filing_chunks fc
  INNER JOIN filings f ON fc.filing_id = f.id
  WHERE fc.embedding IS NOT NULL
    AND (filing_type_filter IS NULL OR f.filing_type = filing_type_filter)
    AND (ticker_filter IS NULL OR f.ticker = ticker_filter)
  ORDER BY fc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- Update comment with specific signature
COMMENT ON FUNCTION search_filing_chunks(TEXT, INT, TEXT, TEXT) IS 'Search filing chunks by vector similarity using cosine distance, with optional filing type and ticker filtering';
