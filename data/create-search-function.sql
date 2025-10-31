-- Create PostgreSQL function for vector similarity search
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION search_filing_chunks(
  query_embedding TEXT,
  match_count INT DEFAULT 5
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
  ORDER BY fc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION search_filing_chunks IS 'Search filing chunks by vector similarity using cosine distance';
