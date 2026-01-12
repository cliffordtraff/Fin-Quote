# Segment Data Research Prompt for ChatGPT

## Project Overview

**Fin Quote** is a Next.js-based financial data platform that provides interactive financial analysis and visualization for publicly traded companies. The platform currently focuses on Apple Inc. (AAPL) as the MVP, with plans to expand to other companies.

### Current Status
- **Phase 1**: ✅ Complete - Core financial metrics visualization (revenue, net income, etc.)
- **Phase 2**: 🔄 Planning - Segment data visualization (product categories and geographic segments)

### Primary Goal
We need to acquire and visualize **segment-level financial data** for AAPL, specifically:
1. **Product Segment Revenue**: iPhone, Mac, iPad, Wearables/Home/Accessories, Services
2. **Geographic Segment Revenue**: Americas, Europe, Greater China, Japan, Rest of Asia Pacific

This data is typically found in SEC 10-K filings in tables titled "Net sales by product category" and "Net sales by reportable segment."

---

## Technical Stack

### Frontend
- **Framework**: Next.js 15.5.6 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Highcharts 12.4.0 (via `highcharts-react-official`)
- **React**: 19.0.0-rc

### Backend & Database
- **Database**: Supabase (PostgreSQL)
- **ORM/Client**: Supabase JS Client 2.39.3
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for SEC filing HTML files)

### Data Sources
- **Financial Modeling Prep (FMP) API**: Primary source for financial metrics
  - Standard financials (revenue, net income, etc.)
  - Key metrics (P/E, ROE, etc.)
  - Stock prices
  - Market data
- **SEC EDGAR**: For filing metadata and document content
- **OpenAI API**: For embeddings (vector search) and LLM-based extraction

### Key Libraries
- `highcharts` & `highcharts-react-official`: Financial charting
- `lightweight-charts`: Price/candlestick charts
- `openai`: Embeddings and LLM operations
- `exceljs`: Data export functionality

---

## Database Architecture

### Core Tables

#### 1. `financials_std` - Standard Financial Data (Wide Table)
**Purpose**: Stores basic financial metrics in columns (one row per year)

```sql
Columns:
- id (UUID, PRIMARY KEY)
- created_at (TIMESTAMPTZ)
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

**Data Source**: Financial Modeling Prep API
**Coverage**: AAPL, 2006-2025 (20 years)
**Indexes**: `(symbol, year)`

**Usage**: Fast queries for standard metrics. All related data in one row.

---

#### 2. `financial_metrics` - Extended Metrics (Key-Value Table)
**Purpose**: Stores 139+ advanced metrics in key-value format (one row per metric per year)

```sql
Columns:
- id (BIGSERIAL, PRIMARY KEY)
- symbol (TEXT)
- year (INTEGER)
- period (TEXT) - 'FY', 'Q1', 'Q2', etc.
- metric_name (TEXT) - e.g., 'peRatio', 'marketCap', 'returnOnEquity'
- metric_value (NUMERIC)
- metric_category (TEXT) - 'Valuation', 'Profitability', etc.
- data_source (TEXT) - 'FMP', 'Calculated', 'SEC'
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

**Data Source**: Financial Modeling Prep API
**Coverage**: 139 unique metrics, 2006-2025
**Indexes**: 
- `(symbol, year)`
- `(metric_name)`
- `(symbol, year DESC, metric_name)`

**Usage**: Flexible storage for calculated ratios and extended metrics.

---

#### 3. `filings` - SEC Filing Metadata
**Purpose**: Stores filing information (10-K, 10-Q)

```sql
Columns:
- id (UUID, PRIMARY KEY)
- created_at (TIMESTAMPTZ)
- ticker (TEXT) - Stock ticker
- filing_type (TEXT) - '10-K', '10-Q'
- filing_date (DATE)
- period_end_date (DATE)
- accession_number (TEXT, UNIQUE) - Unique SEC identifier
- document_url (TEXT) - URL to SEC EDGAR document
- fiscal_year (INTEGER)
- fiscal_quarter (INTEGER, nullable)
```

**Data Source**: SEC EDGAR API
**Coverage**: AAPL 10-K and 10-Q filings, 2015-present
**Indexes**: 
- `(ticker, filing_date DESC)`
- `(accession_number)`

**Usage**: Metadata for SEC filings, references to actual documents.

---

#### 4. `filing_chunks` - Filing Content for RAG Search
**Purpose**: Stores chunked text from filings with embeddings for semantic search

```sql
Columns:
- id (UUID, PRIMARY KEY)
- created_at (TIMESTAMPTZ)
- filing_id (UUID, FOREIGN KEY → filings.id)
- chunk_index (INTEGER) - Position in filing
- chunk_text (TEXT) - Actual text content
- embedding (VECTOR(1536)) - OpenAI embedding vector
- section_name (TEXT) - e.g., 'Risk Factors', 'MD&A'
- page_number (INTEGER)
- word_count (INTEGER)
```

**Data Source**: SEC EDGAR HTML files, processed and embedded
**Embeddings**: OpenAI `text-embedding-3-small` (1536 dimensions)
**Indexes**: 
- IVFFlat index on `embedding` for vector similarity search
- `(filing_id)` for lookups

**Usage**: Semantic search (RAG) for filing content. Users can ask questions about filing content.

---

#### 5. `company_metrics` - Dimensioned Metrics (Ready for Segment Data!)
**Purpose**: Stores company-specific metrics with optional dimensions (region, product, etc.)

```sql
Columns:
- id (BIGSERIAL, PRIMARY KEY)
- symbol (TEXT) - Stock ticker
- year (INTEGER) - Fiscal year
- period (TEXT) - 'FY' for annual, 'Q1', 'Q2', 'Q3', 'Q4' for quarterly
- metric_name (TEXT) - e.g., 'segment_revenue', 'units_shipped'
- metric_value (NUMERIC) - The actual value
- unit (TEXT) - 'currency', 'number', 'percentage', etc.
- dimension_type (TEXT) - 'region', 'product', 'channel', etc.
- dimension_value (TEXT) - 'Americas', 'iPhone', 'Online', etc.
- data_source (TEXT) - 'SEC', 'Company Report', 'Calculated'
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Constraints:
- UNIQUE(symbol, year, period, metric_name, dimension_type, dimension_value)
```

**Indexes**:
- `(symbol, year)`
- `(metric_name)`
- `(dimension_type, dimension_value)`
- `(symbol, metric_name)`

**Status**: ✅ Table already created! Ready to store segment data.

**Intended Usage for Phase 2**:
```sql
-- Example: iPhone revenue for 2024
INSERT INTO company_metrics (
  symbol, year, period, metric_name, metric_value, 
  unit, dimension_type, dimension_value, data_source
) VALUES (
  'AAPL', 2024, 'FY', 'segment_revenue', 200000000000,
  'currency', 'product', 'iPhone', 'SEC'
);

-- Example: Americas revenue for 2024
INSERT INTO company_metrics (
  symbol, year, period, metric_name, metric_value,
  unit, dimension_type, dimension_value, data_source
) VALUES (
  'AAPL', 2024, 'FY', 'segment_revenue', 150000000000,
  'currency', 'geographic', 'Americas', 'SEC'
);
```

---

### Other Tables (Context)

#### `query_logs` - Chatbot Query Tracking
Tracks every chatbot interaction for analysis, cost tracking, and debugging.

#### `conversations` & `messages` - Chat History
Stores user conversations with the AI chatbot.

#### `company` - Company Metadata
Basic company information (symbol, name, sector).

---

## Current Data Infrastructure

### SEC Filing Processing Pipeline

We have a complete pipeline for downloading, processing, and searching SEC filings:

#### Step 1: Fetch Filing Metadata
**Script**: `scripts/fetch-sec-filings.ts`
- Fetches filing metadata from SEC EDGAR API
- Filters to 10-K and 10-Q filings
- Extracts: type, date, accession number, document URL
- Stores in `filings` table

#### Step 2: Download Filing HTML
**Script**: `scripts/download-filings.ts`
- Downloads HTML files from SEC EDGAR
- Respects SEC User-Agent requirements
- Stores in Supabase Storage bucket `filings`
- File naming: `aapl-10-k-2024.html`

#### Step 3: Chunk Filing Content
**Script**: `scripts/chunk-filings.ts`
- Extracts clean text from HTML
- Splits into ~800-word chunks with 100-word overlap
- Preserves section information (Risk Factors, MD&A, etc.)
- Stores chunks in `filing_chunks` table (without embeddings initially)

#### Step 4: Generate Embeddings
**Script**: `scripts/embed-filings.ts` (not shown but exists)
- Generates embeddings using OpenAI `text-embedding-3-small`
- 1,536 dimensions per embedding
- Updates `filing_chunks` with vector embeddings
- Cost: ~$0.02 per 1M tokens

#### Step 5: Semantic Search
**Action**: `app/actions/search-filings.ts`
- Embeds user question using OpenAI
- Performs vector similarity search via PostgreSQL function
- Returns top-k most relevant passages with metadata

**PostgreSQL Function**:
```sql
CREATE OR REPLACE FUNCTION search_filing_chunks(
  query_embedding text,
  match_count integer DEFAULT 5
) RETURNS TABLE(...)
```

---

### Financial Data Sources

#### Financial Modeling Prep (FMP) API
**Current Usage**:
- Standard financials (`financials_std` table)
- Extended metrics (`financial_metrics` table)
- Stock prices
- Market data (gainers, losers, etc.)

**What FMP Provides**:
- ✅ Revenue, net income, operating income, etc.
- ✅ 139+ calculated ratios (P/E, ROE, margins, etc.)
- ✅ Historical data (2006-2025 for AAPL)
- ✅ Real-time quotes
- ❌ **Does NOT provide segment data** (product/geographic breakdowns)

**API Endpoints We Use**:
- `/api/v3/income-statement/{symbol}`
- `/api/v3/key-metrics/{symbol}`
- `/api/v3/ratios/{symbol}`
- `/api/v3/quote/{symbol}`
- `/api/v3/historical-price-full/{symbol}`

---

## Phase 2 Goals: Segment Data

### What We Need

#### Product Segment Data
From SEC 10-K filings, table: **"Net sales by product category"**

| Segment | Example Values (2024) |
|---------|----------------------|
| iPhone | ~$200B |
| Mac | ~$30B |
| iPad | ~$20B |
| Wearables/Home/Accessories | ~$40B |
| Services | ~$85B |

**Historical Coverage Needed**: 2015-present (10+ years)

#### Geographic Segment Data
From SEC 10-K filings, table: **"Net sales by reportable segment"**

| Segment | Example Values (2024) |
|---------|----------------------|
| Americas | ~$150B |
| Europe | ~$90B |
| Greater China | ~$70B |
| Japan | ~$20B |
| Rest of Asia Pacific | ~$30B |

**Historical Coverage Needed**: 2015-present (10+ years)

### Data Storage Plan

We will use the existing `company_metrics` table:

```sql
-- Product segment example
INSERT INTO company_metrics (
  symbol, year, period, metric_name, metric_value,
  unit, dimension_type, dimension_value, data_source
) VALUES
  ('AAPL', 2024, 'FY', 'segment_revenue', 200000000000, 'currency', 'product', 'iPhone', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 30000000000, 'currency', 'product', 'Mac', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 20000000000, 'currency', 'product', 'iPad', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 40000000000, 'currency', 'product', 'Wearables/Home/Accessories', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 85000000000, 'currency', 'product', 'Services', 'SEC');

-- Geographic segment example
INSERT INTO company_metrics (
  symbol, year, period, metric_name, metric_value,
  unit, dimension_type, dimension_value, data_source
) VALUES
  ('AAPL', 2024, 'FY', 'segment_revenue', 150000000000, 'currency', 'geographic', 'Americas', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 90000000000, 'currency', 'geographic', 'Europe', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 70000000000, 'currency', 'geographic', 'Greater China', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 20000000000, 'currency', 'geographic', 'Japan', 'SEC'),
  ('AAPL', 2024, 'FY', 'segment_revenue', 30000000000, 'currency', 'geographic', 'Rest of Asia Pacific', 'SEC');
```

### UI Integration Plan

The charting platform (`/charts` page) will add a "Segment Type" selector:
- **Standard Financials** (Phase 1) - Revenue, Net Income, etc.
- **Product Segments** (Phase 2) - iPhone, Mac, iPad, etc.
- **Geographic Segments** (Phase 2) - Americas, Europe, etc.

When "Product Segments" is selected, the metric selector will show:
- iPhone Revenue
- Mac Revenue
- iPad Revenue
- Wearables/Home/Accessories Revenue
- Services Revenue

---

## What We Need Help With

### Research Questions for ChatGPT

1. **Data Provider Options**
   - Are there commercial data providers that offer segment revenue data (product and geographic) for AAPL?
   - What are the costs, data quality, and API/documentation quality?
   - Do any providers offer historical data (2015-present)?
   - Recommendations: FinancialDatasets.ai, Amyloom, Bloomberg, Compustat, S&P Global?

2. **Automated Extraction Options**
   - What open-source tools/libraries can extract structured segment data from SEC 10-K filings?
   - Recommendations: EdgarTools, sec-parser, py-sec-edgar, OpenEDGAR?
   - How reliable are these tools for extracting tabular data (not just text)?
   - Can they handle XBRL data (structured financial data format)?

3. **Hybrid Approach (Our Preference)**
   - We already have:
     - SEC filing HTML files stored in Supabase Storage
     - Filing chunks with embeddings in `filing_chunks` table
     - OpenAI API integration for LLM operations
     - `company_metrics` table ready to store segment data
   
   - **Question**: Can we use LLM (OpenAI GPT-4) to extract segment data from filing chunks?
   - **Approach**:
     1. Search `filing_chunks` for chunks containing "Net sales by product category" or similar
     2. Retrieve relevant chunks (vector similarity search)
     3. Use OpenAI to parse tables and extract structured data
     4. Store in `company_metrics` table
   
   - **Questions**:
     - Is this approach reliable for tabular data extraction?
     - What's the cost estimate for extracting 10 years of data (10 filings)?
     - Should we use GPT-4 or GPT-4 Turbo for better table parsing?
     - Are there better prompts/techniques for extracting structured financial tables?

4. **Data Quality & Validation**
   - How can we validate extracted segment data?
   - Should segment totals match total revenue from `financials_std`?
   - What tolerance is acceptable (e.g., ±1% difference)?
   - How to handle missing data or format inconsistencies across years?

5. **Implementation Recommendations**
   - Given our infrastructure, what's the best approach?
   - Should we start with a commercial provider and migrate to automated extraction later?
   - Or build automated extraction first and use commercial provider as backup/validation?
   - What's the cost-benefit analysis?

6. **Technical Implementation Details**
   - If using LLM extraction:
     - What's the best prompt structure for extracting financial tables?
     - Should we use function calling or structured outputs?
     - How to handle multi-year extraction (batch processing)?
   
   - If using open-source tools:
     - Which tool has the best documentation and community support?
     - How to integrate with our existing TypeScript/Next.js codebase?
     - Can we run extraction scripts server-side or need separate Python service?

7. **Data Format & Structure**
   - Are there standard formats for segment data (JSON, CSV, etc.)?
   - Should we store raw values or normalized percentages?
   - How to handle segment name changes over time (e.g., "Wearables/Home/Accessories" may have been "Other Products" in earlier years)?

---

## Current Codebase Structure

### Key Files & Directories

```
fin-quote/
├── app/
│   ├── actions/
│   │   ├── financials.ts          # Server actions for financial data
│   │   ├── filings.ts             # Server actions for filing metadata
│   │   ├── search-filings.ts      # RAG search for filing content
│   │   └── chart-metrics.ts       # (Phase 1) Multi-metric fetching
│   ├── charts/
│   │   └── page.tsx                # (Phase 1) Charts visualization page
│   └── ...
├── components/
│   ├── FinancialChart.tsx          # Highcharts wrapper component
│   ├── MultiMetricChart.tsx        # (Phase 1) Multi-series chart
│   ├── MetricSelector.tsx          # Dropdown for metric selection
│   └── ...
├── lib/
│   ├── database.types.ts           # TypeScript types for Supabase
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   └── server.ts               # Server Supabase client
│   └── ...
├── scripts/
│   ├── fetch-sec-filings.ts        # Fetch filing metadata from SEC
│   ├── download-filings.ts         # Download HTML from SEC EDGAR
│   ├── chunk-filings.ts            # Chunk filing content
│   ├── embed-filings.ts            # Generate embeddings
│   └── ...
├── supabase/
│   └── migrations/
│       ├── 20241026000001_create_filings_table.sql
│       ├── 20241027000001_create_filing_chunks_table.sql
│       ├── 20251115000001_create_company_metrics_table.sql
│       └── ...
└── docs/
    ├── CHARTING_PLATFORM_PLAN.md   # Phase 1 & 2 implementation plan
    └── ...
```

### Existing Infrastructure We Can Leverage

1. **SEC Filing Storage**: HTML files in Supabase Storage
2. **Filing Chunks**: Text chunks with embeddings for semantic search
3. **Vector Search**: PostgreSQL function for finding relevant chunks
4. **LLM Integration**: OpenAI API already integrated
5. **Database Table**: `company_metrics` ready for segment data
6. **Charting Infrastructure**: Highcharts set up for multi-series charts

---

## Constraints & Requirements

### Technical Constraints
- **Language**: TypeScript/JavaScript (Node.js runtime)
- **Database**: PostgreSQL (Supabase)
- **Budget**: Prefer cost-effective solutions (OpenAI API usage is acceptable)
- **Timeline**: No strict deadline, but prefer solutions that can be implemented incrementally

### Data Requirements
- **Accuracy**: High (financial data must be correct)
- **Coverage**: 2015-present (10+ years)
- **Update Frequency**: Annual (when new 10-K filings are released)
- **Format**: Structured data (not just text)

### Business Requirements
- **Scalability**: Solution should work for other companies in the future (not just AAPL)
- **Maintainability**: Prefer solutions with good documentation and community support
- **Cost**: Balance between development time and ongoing costs

---

## Specific Questions for ChatGPT

### Primary Questions

1. **What's the best data source for AAPL segment revenue data (product and geographic)?**
   - Commercial providers vs. automated extraction
   - Cost comparison
   - Data quality comparison
   - Implementation complexity

2. **If we use automated extraction, what's the best approach given our existing infrastructure?**
   - LLM-based extraction from filing chunks
   - Open-source tools for parsing SEC filings
   - Hybrid approach

3. **What's the recommended implementation path?**
   - Start with commercial provider and migrate later?
   - Build automated extraction from the start?
   - Use both for validation?

### Secondary Questions

4. **For LLM-based extraction:**
   - Best prompts for extracting financial tables
   - Cost estimates for 10 years of data
   - Reliability and accuracy expectations
   - Error handling strategies

5. **For open-source tools:**
   - Which tool is most suitable for our use case?
   - How to integrate with TypeScript/Next.js?
   - Documentation and community support quality

6. **Data validation:**
   - How to ensure extracted data is accurate?
   - Should segment totals match total revenue?
   - Handling missing or inconsistent data

---

## Additional Context

### Why This Matters

Segment data visualization is a key differentiator for financial analysis platforms. Users want to see:
- Which products drive revenue growth (iPhone vs. Services)
- Geographic diversification (exposure to China, Europe, etc.)
- Trends over time (Services growing faster than hardware)

### Current Limitations

- FMP API doesn't provide segment data
- Manual data entry is time-consuming and error-prone
- Need scalable solution for future expansion

### Success Criteria

- ✅ Accurate segment data (2015-present)
- ✅ Automated or semi-automated extraction/ingestion
- ✅ Integration with existing charting platform
- ✅ Cost-effective solution
- ✅ Maintainable and scalable

---

## Next Steps After Research

Once we have recommendations from ChatGPT, we will:

1. **Evaluate Options**: Compare commercial providers vs. automated extraction
2. **Prototype**: Build a small proof-of-concept for the chosen approach
3. **Extract Data**: Get 10 years of historical segment data
4. **Validate**: Ensure data quality and accuracy
5. **Integrate**: Add segment visualization to the charts platform
6. **Document**: Update implementation plan with chosen approach

---

## Contact & Additional Information

If ChatGPT needs more context about:
- Specific database queries or table structures
- Code examples from our codebase
- API endpoints or data formats
- Implementation details

Please ask, and we can provide additional documentation or code snippets.

---

**End of Research Prompt**

*This document is designed to be copied into ChatGPT to get comprehensive research and recommendations on acquiring segment financial data for the Fin Quote platform.*
