# Fix: 10-K Filing Search Issue

## Problem

When users ask for "insights from AAPL's last 10k", the chatbot responds:
> "I don't have access to AAPL's last 10-K. The most recent filing I have is a 10-Q dated August 1, 2025..."

## Root Cause

The semantic search function `search_filing_chunks` was searching across ALL filing types (both 10-K and 10-Q) without filtering. The search results would return a mix of both types:

- Search for "10-K insights" returned: 2 chunks from 10-K, 3 chunks from 10-Q
- Since 10-Q filings are more recent (2025-08-01 vs 2024-11-01), they often matched well semantically
- The LLM would see mixed results or predominantly 10-Q results and claim no 10-K access

## Solution

Added filing type filtering to the search system:

### 1. Updated Database Function (data/create-search-function.sql)
   - Added optional `filing_type_filter` parameter
   - Filters results to specific filing type when provided

### 2. Updated Search Action (app/actions/search-filings.ts)
   - Detects "10-K" or "10-Q" in search query using regex
   - Passes filing type filter to database function
   - Also updated fallback manual query to support filtering

### 3. How It Works Now

User query: "insights from AAPL's last 10k"
→ Tool selection: `searchFilings` with query "10-K insights"
→ Regex detects "10-K" in query
→ Search filters to ONLY 10-K chunks
→ LLM generates answer using ONLY 10-K data

## Required Action

Run the updated SQL in Supabase SQL Editor:

```sql
-- Located in: data/create-search-function.sql
CREATE OR REPLACE FUNCTION search_filing_chunks(
  query_embedding TEXT,
  match_count INT DEFAULT 5,
  filing_type_filter TEXT DEFAULT NULL
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
  ORDER BY fc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
```

## Verification

After running the SQL, test with:
- "insights from AAPL's last 10k" → Should return ONLY 10-K data
- "what are the risks in the latest 10-Q?" → Should return ONLY 10-Q data
- "what are the risk factors?" → Should return mixed results (no filter)

## Database Status

Current filings in database:
- 10 10-K filings (2015-2024)
- 30 10-Q filings (2015-2025)
- 46 searchable chunks from 10-K filings
- 30 searchable chunks from 10-Q filings

Most recent 10-K: Fiscal Year 2024, filed 2024-11-01
