# Database Structure & Chatbot Optimization Guide

## Current Database Structure

### Core Tables for Chatbot

#### 1. `financials_std` - Standard Financial Data (Wide Table)
**Purpose**: Stores basic financial metrics in columns (one row per year)

```sql
Columns:
- symbol (TEXT) - Stock ticker (e.g., 'AAPL')
- year (INTEGER) - Fiscal year
- revenue (NUMERIC)
- gross_profit (NUMERIC)
- net_income (NUMERIC)
- operating_income (NUMERIC)
- total_assets (NUMERIC)
- total_liabilities (NUMERIC)
- shareholders_equity (NUMERIC)
- operating_cash_flow (NUMERIC)
- eps (NUMERIC)
```

**How Chatbot Uses It**:
- Query: `SELECT year, revenue FROM financials_std WHERE symbol='AAPL' ORDER BY year DESC LIMIT 5`
- Returns: `[{year: 2024, revenue: 383285000000}, {year: 2023, revenue: 383285000000}]`
- Sent to LLM as JSON string in prompt

**Pros**:
- Fast queries for single metrics
- All related data in one row
- Easy to calculate ratios (has all fields together)

**Cons**:
- Can't add new metrics without schema changes
- Wastes space if most fields are NULL
- Inconsistent with `financial_metrics` table structure

---

#### 2. `financial_metrics` - Extended Metrics (Key-Value Table)
**Purpose**: Stores 96+ advanced metrics in key-value format (one row per metric per year)

```sql
Columns:
- symbol (TEXT)
- year (INTEGER)
- period (TEXT) - 'FY', 'Q1', 'Q2', etc.
- metric_name (TEXT) - e.g., 'peRatio', 'marketCap', 'returnOnEquity'
- metric_value (NUMERIC)
- metric_category (TEXT) - 'Valuation', 'Profitability', etc.
- data_source (TEXT) - 'FMP', 'Calculated', 'SEC'
```

**How Chatbot Uses It**:
- Query: `SELECT year, metric_name, metric_value FROM financial_metrics WHERE symbol='AAPL' AND metric_name IN ('peRatio', 'roe') ORDER BY year DESC LIMIT 10`
- Returns: `[{year: 2024, metric_name: 'peRatio', metric_value: 28.5}, ...]`
- Sent to LLM as JSON string

**Pros**:
- Flexible: Easy to add new metrics
- Supports multiple metrics per query
- Categorized for organization

**Cons**:
- More rows = slower queries
- Requires multiple rows for one year's data
- Inconsistent structure with `financials_std`

---

#### 3. `filings` - SEC Filing Metadata
**Purpose**: Stores filing information (10-K, 10-Q)

```sql
Columns:
- ticker (TEXT)
- filing_type (TEXT) - '10-K', '10-Q'
- filing_date (DATE)
- period_end_date (DATE)
- accession_number (TEXT) - Unique SEC identifier
- document_url (TEXT)
- fiscal_year (INTEGER)
- fiscal_quarter (INTEGER)
```

**How Chatbot Uses It**:
- Query: `SELECT * FROM filings WHERE ticker='AAPL' ORDER BY filing_date DESC LIMIT 5`
- Returns metadata only (dates, types, URLs)
- Used when user asks "when was the latest filing?"

---

#### 4. `filing_chunks` - Filing Content for RAG Search
**Purpose**: Stores chunked text from filings with embeddings for semantic search

```sql
Columns:
- filing_id (UUID) - References filings table
- chunk_index (INTEGER) - Position in filing
- chunk_text (TEXT) - Actual text content
- embedding (VECTOR(1536)) - OpenAI embedding vector
- section_name (TEXT) - e.g., 'Risk Factors'
- page_number (INTEGER)
```

**How Chatbot Uses It**:
- Vector similarity search: `SELECT chunk_text, ... FROM filing_chunks WHERE embedding <-> query_embedding < 0.5 ORDER BY embedding <-> query_embedding LIMIT 5`
- Returns relevant passages when user asks "what did the 10-K say about risks?"

---

#### 5. `query_logs` - Chatbot Query Tracking
**Purpose**: Logs every chatbot interaction for analysis

```sql
Columns:
- session_id (TEXT)
- user_question (TEXT)
- tool_selected (TEXT)
- tool_args (JSONB)
- data_returned (JSONB)
- answer_generated (TEXT)
- validation_results (JSONB)
- total_cost_usd (NUMERIC)
```

**How It's Used**:
- Tracks which tools are used most
- Measures accuracy and latency
- Cost tracking
- Debugging failed queries

---

#### 6. `conversations` & `messages` - Chat History
**Purpose**: Stores user conversations

```sql
conversations:
- id (UUID)
- user_id (UUID)
- title (TEXT)
- created_at, updated_at

messages:
- conversation_id (UUID)
- role (TEXT) - 'user' or 'assistant'
- content (TEXT)
- chart_config (JSONB)
- data_used (JSONB)
- follow_up_questions (TEXT[])
```

---

## How Chatbot Queries Data

### Flow Example: "What's AAPL's revenue in 2024?"

1. **Tool Selection** → Chooses `getAaplFinancialsByMetric`
2. **Database Query**:
   ```sql
   SELECT year, revenue 
   FROM financials_std 
   WHERE symbol = 'AAPL' 
   ORDER BY year DESC 
   LIMIT 20
   ```
3. **Data Processing**:
   - Rounds numbers to 2 decimals
   - Adds related fields (for ratio calculations)
   - Formats as JSON
4. **Sent to LLM**:
   ```json
   [
     {"year": 2024, "value": 383285000000, "metric": "revenue"},
     {"year": 2023, "value": 383285000000, "metric": "revenue"}
   ]
   ```
5. **LLM Generates Answer**: "AAPL's revenue in 2024 was $383.3 billion."

---

## Issues & Improvement Opportunities

### 🔴 Critical Issues

#### 1. **Inconsistent Data Structures**
**Problem**: Two different table designs for similar data
- `financials_std`: Wide table (columns for each metric)
- `financial_metrics`: Key-value table (rows for each metric)

**Impact**:
- Confusing for LLM (different JSON shapes)
- Harder to maintain
- Inconsistent query patterns

**Solution**:
- **Option A**: Migrate everything to `financial_metrics` (key-value)
  - More flexible
  - Consistent structure
  - Easier to add metrics
- **Option B**: Keep both but add views
  - Create unified view that combines both
  - Chatbot queries view, not tables directly

---

#### 2. **No Data Validation Constraints**
**Problem**: Missing constraints on data quality

**Current**:
```sql
year INTEGER  -- No check if year is valid (e.g., 1990-2030)
metric_value NUMERIC  -- No check if value is reasonable
```

**Impact**:
- Bad data can enter database
- LLM might see impossible values (e.g., revenue = -1000)
- Harder to debug issues

**Solution**:
```sql
-- Add constraints
ALTER TABLE financials_std 
  ADD CONSTRAINT valid_year CHECK (year >= 1990 AND year <= 2030);

ALTER TABLE financials_std 
  ADD CONSTRAINT positive_revenue CHECK (revenue >= 0);

ALTER TABLE financial_metrics 
  ADD CONSTRAINT valid_metric_value CHECK (
    metric_value IS NULL OR 
    (metric_value >= -1000000000000 AND metric_value <= 1000000000000)
  );
```

---

#### 3. **Missing Indexes for Common Queries**
**Problem**: Some queries are slower than they could be

**Current Indexes**:
- ✅ `financials_std`: Has index on `(symbol, year)`
- ✅ `financial_metrics`: Has indexes on `(symbol, year)`, `(metric_name)`
- ❌ Missing: Composite indexes for common query patterns

**Solution**:
```sql
-- For queries like: "Get revenue for last 5 years"
CREATE INDEX idx_financials_std_symbol_year_desc 
  ON financials_std(symbol, year DESC);

-- For queries like: "Get P/E and ROE for 2024"
CREATE INDEX idx_financial_metrics_symbol_year_metric 
  ON financial_metrics(symbol, year DESC, metric_name);

-- For filing searches by ticker and date
CREATE INDEX idx_filings_ticker_date_type 
  ON filings(ticker, filing_date DESC, filing_type);
```

---

#### 4. **JSON Structure Sent to LLM Not Optimized**
**Problem**: Current JSON includes unnecessary fields or wrong structure

**Current** (from `financials_std`):
```json
[
  {
    "year": 2024,
    "value": 383285000000,
    "metric": "revenue",
    "revenue": 383285000000,  // Redundant!
    "shareholders_equity": 73735000000  // Not needed for revenue query
  }
]
```

**Better Structure**:
```json
[
  {
    "year": 2024,
    "revenue": 383285000000
  },
  {
    "year": 2023,
    "revenue": 383285000000
  }
]
```

**Solution**: Create a function that formats data specifically for LLM:
```sql
CREATE OR REPLACE FUNCTION format_financials_for_llm(
  p_symbol TEXT,
  p_metric TEXT,
  p_limit INTEGER
) RETURNS JSONB AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'year', year,
      p_metric, (SELECT p_metric FROM financials_std WHERE ...)
    )
  )
  FROM financials_std
  WHERE symbol = p_symbol
  ORDER BY year DESC
  LIMIT p_limit;
$$ LANGUAGE sql;
```

---

### 🟡 Medium Priority Issues

#### 5. **No Materialized Views for Common Queries**
**Problem**: Repeatedly calculating the same aggregations

**Example**: "What's the average revenue growth over 5 years?"
- Currently: Calculates in application code every time
- Better: Pre-calculate and store in materialized view

**Solution**:
```sql
CREATE MATERIALIZED VIEW financial_trends AS
SELECT 
  symbol,
  year,
  revenue,
  LAG(revenue) OVER (PARTITION BY symbol ORDER BY year) as prev_revenue,
  (revenue - LAG(revenue) OVER (PARTITION BY symbol ORDER BY year)) / 
    LAG(revenue) OVER (PARTITION BY symbol ORDER BY year) * 100 as revenue_growth_pct
FROM financials_std
ORDER BY symbol, year;

-- Refresh periodically
REFRESH MATERIALIZED VIEW financial_trends;
```

---

#### 6. **No Caching Layer**
**Problem**: Same queries run repeatedly (e.g., "revenue for last 5 years")

**Current**: Every query hits database
**Better**: Cache frequent queries

**Solution Options**:
1. **Application-level cache** (Redis/Memory)
   - Cache query results for 1 hour
   - Key: `financials:AAPL:revenue:5`
   - Value: JSON response

2. **Database-level cache** (PostgreSQL)
   - Use materialized views
   - Refresh on schedule

3. **Hybrid**: Cache in application, invalidate on data updates

---

#### 7. **Metric Names Not Normalized**
**Problem**: `metric_name` is TEXT, not enum/foreign key

**Current**:
```sql
metric_name TEXT  -- Can be anything: 'peRatio', 'P/E', 'price_to_earnings'
```

**Impact**:
- Typos possible
- Inconsistent naming
- Harder to query

**Solution**:
```sql
-- Create metrics catalog table
CREATE TABLE metric_catalog (
  canonical_name TEXT PRIMARY KEY,  -- 'peRatio'
  display_name TEXT,  -- 'P/E Ratio'
  category TEXT,
  unit TEXT,  -- 'ratio', 'percentage', 'currency'
  description TEXT
);

-- Add foreign key
ALTER TABLE financial_metrics 
  ADD CONSTRAINT fk_metric_name 
  FOREIGN KEY (metric_name) 
  REFERENCES metric_catalog(canonical_name);
```

---

### 🟢 Nice-to-Have Improvements

#### 8. **Add Data Quality Checks**
**Problem**: No way to detect bad data

**Solution**:
```sql
-- Create data quality view
CREATE VIEW data_quality_checks AS
SELECT 
  'financials_std' as table_name,
  symbol,
  COUNT(*) as row_count,
  MIN(year) as min_year,
  MAX(year) as max_year,
  COUNT(DISTINCT year) as unique_years,
  SUM(CASE WHEN revenue IS NULL THEN 1 ELSE 0 END) as null_revenue_count
FROM financials_std
GROUP BY symbol;
```

---

#### 9. **Add Query Performance Monitoring**
**Problem**: Don't know which queries are slow

**Solution**:
```sql
-- Enable query logging
ALTER DATABASE your_db SET log_min_duration_statement = 1000;  -- Log queries > 1 second

-- Or use pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

#### 10. **Optimize JSON Formatting for LLM**
**Problem**: LLM sees raw numbers like `383285000000` instead of formatted `$383.3B`

**Current**: Application formats after query
**Better**: Database function formats during query

**Solution**:
```sql
CREATE OR REPLACE FUNCTION format_currency_for_llm(value NUMERIC)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN value >= 1000000000 THEN '$' || ROUND(value / 1000000000, 1) || 'B'
    WHEN value >= 1000000 THEN '$' || ROUND(value / 1000000, 1) || 'M'
    ELSE '$' || value::TEXT
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Use in queries
SELECT 
  year,
  format_currency_for_llm(revenue) as revenue_formatted
FROM financials_std;
```

---

## Recommended Action Plan

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add data validation constraints
2. ✅ Add missing indexes
3. ✅ Create unified view for financial data
4. ✅ Optimize JSON structure sent to LLM

### Phase 2: Structural Improvements (1 week)
1. ✅ Create `metric_catalog` table
2. ✅ Add foreign key constraints
3. ✅ Create materialized views for common queries
4. ✅ Add application-level caching

### Phase 3: Advanced Optimizations (2 weeks)
1. ✅ Database query performance monitoring
2. ✅ Data quality checks
3. ✅ Automated data validation
4. ✅ Query result caching layer

---

## Example: Improved Query Structure

### Before (Current)
```typescript
// Query
const { data } = await supabase
  .from('financials_std')
  .select('year, revenue, gross_profit, net_income')
  .eq('symbol', 'AAPL')
  .order('year', { ascending: false })
  .limit(5)

// Sent to LLM
JSON.stringify(data)
// Result: [{"year": 2024, "revenue": 383285000000, "gross_profit": 180700000000, ...}]
```

### After (Improved)
```typescript
// Query with formatting
const { data } = await supabase
  .rpc('get_financials_for_llm', {
    p_symbol: 'AAPL',
    p_metric: 'revenue',
    p_limit: 5
  })

// Database function formats it
// Result: [{"year": 2024, "revenue": "$383.3B"}, {"year": 2023, "revenue": "$383.3B"}]
```

**Benefits**:
- Cleaner JSON (only what's needed)
- Pre-formatted for LLM
- Consistent structure
- Faster (less data transferred)

---

## Summary

**Current State**:
- ✅ Basic structure works
- ✅ Indexes exist for common queries
- ⚠️ Inconsistent table designs
- ⚠️ No data validation
- ⚠️ JSON not optimized for LLM

**Key Improvements**:
1. **Unify data structures** (choose one pattern)
2. **Add constraints** (prevent bad data)
3. **Optimize indexes** (faster queries)
4. **Format for LLM** (cleaner JSON)
5. **Add caching** (reduce database load)

**Priority**: Start with Phase 1 (quick wins) - they'll have immediate impact on chatbot performance and data quality.
