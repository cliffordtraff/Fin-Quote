## Fin Quote MVP — End‑to‑End Plan (Beginner‑Friendly)

### What we’re building and why
Fin Quote is a finance Q&A web app. A user asks natural‑language questions about a stock (starting with AAPL only for MVP). The server fetches the right data from Supabase and asks an LLM to produce a short, grounded answer, plus a tiny “data used” section for transparency. The goal is a safe, reliable competitor to fiscal.ai that we can ship quickly and iterate on.

### Key principles (why this design)
- **Safety first**: The LLM does not run free‑form database queries. Instead, it can only “press” a few safe, prebuilt server functions (we call these tools). This avoids bad queries, data leaks, and unpredictable costs.
- **Predictability**: Same tool + same inputs = same query + output shape. This makes debugging and testing straightforward.
- **Server‑side brains**: All sensitive logic (database queries, LLM calls, validation) runs on the server. The browser handles UI only.
- **Small steps**: Start with one stock (AAPL) and a couple of tools, then add more capabilities once the loop works.

### Glossary (plain English)
- **Tool (server function)**: A tiny, safe function on the server that does one job, like “get AAPL revenue for the last N years.” The LLM can choose it and supply allowed inputs; the server validates and runs it.
- **Function calling**: An LLM feature where the model requests a named tool + JSON arguments; your server executes it and returns results; the model continues the conversation.
- **Reasoning**: The model deciding which tool fits and how to explain results (planning/logic). Our MVP uses single‑hop reasoning: pick one tool → fetch → answer.
- **Multi‑hop**: Answering requires several steps (e.g., fetch AAPL, fetch peers, compare). We’ll add this later.
- **RAG (Retrieval‑Augmented Generation)**: For document questions (filings/transcripts), retrieve the most relevant passages via a vector store, then answer using those passages. We’ll add this after MVP.

---

## Architecture overview

### Frontend (browser)
- Next.js app with a simple UI: text box + Ask button + answer display.
- No secrets in the browser.
- Uses `createBrowserClient()` only for UI‑safe tasks.

### Backend (server)
- Next.js server actions/API routes handle all sensitive work.
- Uses `createServerClient()` to talk to Supabase (read‑only for MVP).
- Two LLM steps per question:
  1) Selection: model picks exactly one tool from our small menu and provides JSON args.
  2) Answering: after we run the tool and get facts, the model writes the final answer using only those facts.

### Data (Supabase)
- We store standardized financials in `financials_std` and company metadata in `company`.
- For MVP, we enforce AAPL‑only and small row limits (1–8) at the tool level.

---

## Current code in the repo (important files)
- `lib/supabase/client.ts`: Creates the browser client (uses `NEXT_PUBLIC_*` env vars; no session persistence). For UI only.
- `lib/supabase/server.ts`: Creates the server client (same env vars; no session persistence). For server actions and API routes.
- `lib/database.types.ts`: Typed Supabase schema for `company` and `financials_std`.
- `app/actions/financials.ts`:
  - `getCompaniesWithFinancials()`: Example server action that composes companies with financials for display.
  - `getAaplFinancialsByMetric({ metric, limit })`: SAFE TOOL (MVP). Allowed metrics: `revenue` or `gross_profit`. Limit clamped to 1..8. Always filters to `AAPL`. Returns an array of `{ year, value, metric }`.
- `lib/tools.ts`:
  - `TOOL_MENU`: Defines the tool(s) the model can choose from.
  - `buildToolSelectionPrompt(question)`: Prompt string instructing the model to choose exactly one tool and return only JSON `{ tool, args }`.
  - `buildFinalAnswerPrompt(question, factsJson)`: Prompt string for producing a grounded answer using only provided facts.

---

## End‑to‑end question flow (single‑hop)
1) **User asks in the browser**: e.g., “How is AAPL’s revenue trending?”
2) **Server: selection step**: Call the LLM with the user’s question and the tool menu. The LLM must return only JSON: `{ tool: string, args: object }`.
3) **Server: validate**: Check the selected tool is allowed, `metric` is in `[revenue, gross_profit]`, `limit` in `[1..8]`, and ticker is fixed to `AAPL`.
4) **Server: run tool**: Execute `getAaplFinancialsByMetric(args)`, which queries Supabase safely and returns clean rows.
5) **Server: answer step**: Call the LLM with the user’s question and the returned facts; instruct it to answer using only those facts (if missing/insufficient, say “don’t know”).
6) **Server → browser**: Return the answer and a small “data used” section (the rows we fetched). Optionally stream the answer for responsiveness.

Why two model steps? It keeps the selection (what to fetch) separate from synthesis (how to explain), and both are fully server‑side for safety.

---

## Why tools (and not free‑form queries)
- **Control**: The model can only choose from our allow‑list of tools.
- **Safety**: Inputs are validated; queries are small, read‑only, and predictable.
- **Reliability**: Same tool → same output shape → easy to test, log, and cache.
- **Simplicity**: Faster to ship and simpler to understand for a first build.

We can always add more tools over time (filings, prices, ratios). If we later allow free‑form queries, we’ll add strict guardrails (allowlisted tables/columns, read‑only role + RLS, parameterized queries, small limits/timeouts, validators, and logging).

---

## Phase 1 — Ship the MVP loop (AAPL‑only)

### Scope
- One server endpoint (or server action) that orchestrates the two LLM steps and the tool call.
- One tool: `getAaplFinancialsByMetric` (metric: revenue|gross_profit; limit 1..8).
- A tiny UI (textbox + Ask + answer + “data used”).

### Acceptance criteria
- Questions like “What is AAPL’s revenue trend over the last 4 years?” return a concise, grounded answer and show the facts used.
- AAPL‑only, small limits, clear errors if inputs are invalid or data is missing.
- No secrets in the browser. LLM calls and database access are server‑only.

### Guardrails
- Validate tool selection and input ranges.
- Enforce read‑only queries and row limits.
- Timeouts for LLM and DB queries.
- Friendly “I don’t know” when facts are insufficient.
- Minimal logging: question, chosen tool, row count, latency (avoid logging PII).

---

## Phase 2 — Broaden the toolset (still single‑hop)
- Add `getRecentFilings(AAPL, limit ≤ 5)`: returns `{ type, date, title, url }` from a simple filings table.
- Add `getPrices(AAPL, small range like 30d)`: returns `{ date, close }` for simple trend context.
- Keep the same validation pattern (AAPL‑only, tight limits).

---

## Phase 3 — Minimal filings ingestion (foundation for document Q&A)
1) **Fetch**: Pull latest AAPL 10‑K/10‑Q metadata (and optionally summaries) from SEC EDGAR.
2) **Store**: Create a `filings` (or `filings_summary`) table with columns like `ticker, type, date, accession, url, source, summary`. Index by `(ticker, date)`. Deduplicate by `accession`.
3) **Expose a tool**: `getRecentFilings(AAPL, limit)` that reads from this table.

Outcome: We can answer questions like “Show AAPL’s last 3 filings” with basic citations.

---

## Phase 4 — Optional RAG for filings/transcripts (later)
- Add embeddings and a vector store (e.g., pgvector in Supabase).
- Pipeline: chunk filing text → embed → store vectors + metadata.
- At question time: embed the query → retrieve top‑k passages → include them as “facts” → answer.
- New tool: `searchFilings(ticker, query, k)` returning passages + metadata for citations.

Benefit: answers are grounded in the exact document text with citations.

---

## Phase 5 — Beyond AAPL and toward multi‑hop
- Add a ticker allow‑list (AAPL → MSFT → …) with the same tool shapes.
- Multi‑hop examples: compare AAPL to peers; compute ratios across sources; combine filings with price trends.
- Start with hand‑coded sequences; consider an agent framework (e.g., LangChain) if dynamic planning becomes necessary.

---

## Environment & configuration
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required (already used).
- LLM provider key: server‑only secret (never in the browser).
- Row Level Security (RLS): keep a read‑only access pattern for tools; avoid write paths in MVP.

---

## Developer workflow tips (first‑time friendly)
- Keep the UI simple; focus on getting the server loop right first.
- When something fails, check logs for: question, chosen tool, row count, latency.
- Add or refine a tool only when you see repeated user questions that need it.
- Prefer adding one new, well‑scoped tool over allowing free‑form queries.

---

## Summary
We’re building a safe, predictable finance Q&A app by combining:
- A simple browser UI, a server‑side LLM orchestration loop, and a small set of validated tools for data access.
- A constrained MVP (AAPL‑only, small limits) that’s easy to ship and expand.

From here, we'll:
1) ✅ Wire the end‑to‑end question flow with the existing financials tool. (COMPLETE)
2) ✅ Add `getRecentFilings` and `getPrices` as new tools. (COMPLETE)
3) ✅ Ingest AAPL filings and add RAG for citeable answers. (COMPLETE)
4) Grow to more tickers and multi‑hop questions once the core loop is reliable.

---

## Phase 1.5 — ✅ COMPLETE: Add `getPrices` Tool (Financial Modeling Prep API)

### Objective
Expand from 1 tool to 2 tools, testing multi-tool routing while keeping single-hop reasoning.

### Implementation Plan

#### 1. Environment Setup
- Add `FMP_API_KEY` to `.env.local` and `.env.local.example`
- API Key stored server-side only (never exposed to browser)

#### 2. Create New Server Action: `app/actions/prices.ts`
**Function:** `getAaplPrices({ range })`

**Inputs:**
- `range`: string enum — "7d" | "30d" | "90d" (validated, prevents excessive API calls)

**Process:**
- Calls Financial Modeling Prep API: `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=...`
- Filters to requested date range
- Returns: `Array<{ date: string, close: number }>`

**Safety Features:**
- AAPL-only (ticker hardcoded)
- Limited range options (7d, 30d, 90d only)
- Error handling for API failures
- Rate limit consideration
- Timeout protection

#### 3. Update Tool Menu: `lib/tools.ts`
**Changes:**
- Add `getPrices` to `TOOL_MENU` array with description and args
- Update `buildToolSelectionPrompt()` to include both tools
- LLM will now choose between:
  - `getAaplFinancialsByMetric` (for revenue, gross_profit questions)
  - `getPrices` (for stock price trend questions)

#### 4. Update Orchestration: `app/actions/ask-question.ts`
**Changes:**
- Add conditional logic to handle `getPrices` tool selection
- Execute appropriate tool based on LLM's choice
- Pass price data to final answer step
- Handle different data shapes (financials vs prices)

#### 5. Update UI: `app/ask/page.tsx`
**Changes:**
- Update `dataUsed` type to handle both financial metrics and price data
- Format price data in "Data Used" section:
  - Date formatting (e.g., "2024-01-15")
  - Price formatting (e.g., "$182.45")
- Maintain existing financial data display

### Example Flow

**User Question:** "What's AAPL's price trend over the last 30 days?"

**Step 1 - Selection:**
```json
{"tool": "getPrices", "args": {"range": "30d"}}
```

**Step 2 - Execution:**
- API call to FMP
- Returns 30 days of price data

**Step 3 - Answer:**
```
AAPL's stock price has increased from $175.20 to $182.45 over the
last 30 days, showing an upward trend of approximately 4.1%.
```

**Data Used Display:**
- Table showing dates and closing prices

### Testing Criteria
- ✅ Questions about prices route to `getPrices` tool
- ✅ Questions about financials still route to `getAaplFinancialsByMetric`
- ✅ Price data displays correctly in UI
- ✅ API errors are handled gracefully
- ✅ Date range validation works (rejects invalid ranges)

### Next After This
Once `getPrices` is working, options:
- ✅ Add more metrics to `getAaplFinancialsByMetric` (net_income, eps, etc.) - COMPLETE
- Begin Phase 3: filings ingestion + `getRecentFilings` tool
- Add more tickers (expand beyond AAPL-only)

---

## Phase 3 — ✅ COMPLETE: SEC Filings Ingestion + getRecentFilings Tool

### Objective
Build foundation for document-based Q&A by ingesting SEC filing metadata and exposing it via a new tool.

### Implementation Plan

#### 1. Create Database Schema
**New Table:** `filings`

**Columns:**
- `id` (uuid, primary key)
- `created_at` (timestamp)
- `ticker` (text) - Company symbol (e.g., "AAPL")
- `filing_type` (text) - "10-K", "10-Q", "8-K", etc.
- `filing_date` (date) - When filed with SEC
- `period_end_date` (date) - Fiscal period end date
- `accession_number` (text, unique) - SEC unique identifier
- `document_url` (text) - Link to filing on SEC EDGAR
- `fiscal_year` (integer) - Year of filing
- `fiscal_quarter` (integer, nullable) - Quarter (1-4) for 10-Q, null for 10-K

**Indexes:**
- `(ticker, filing_date)` - Fast queries by company and date
- `accession_number` - Ensure no duplicates

**SQL to run in Supabase:**
```sql
CREATE TABLE filings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ticker TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  filing_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  accession_number TEXT UNIQUE NOT NULL,
  document_url TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER
);

CREATE INDEX idx_filings_ticker_date ON filings(ticker, filing_date DESC);
CREATE INDEX idx_filings_accession ON filings(accession_number);
```

#### 2. Fetch SEC EDGAR Data
**Data Source:** SEC EDGAR API (free, no key required)

**Endpoint:** `https://data.sec.gov/submissions/CIK{cik}.json`
- AAPL CIK: 0000320193

**What we get:**
- Recent filings list with accession numbers, dates, types
- Filing URLs

**Script:** `scripts/fetch-sec-filings.ts`
- Fetch AAPL filings from SEC API
- Filter to 10-K and 10-Q only (ignore 8-K, etc. for MVP)
- Extract metadata: type, date, accession, URL
- Save as seed file: `data/aapl-filings.json`

**Important:** SEC requires User-Agent header with contact info

#### 3. Create Ingestion Script
**Script:** `scripts/ingest-filings.ts`
- Read from `data/aapl-filings.json`
- Check for existing filings by accession_number
- INSERT new filings, skip duplicates
- Log success/errors

**Similar to:** `scripts/ingest-financials.ts` pattern

#### 4. Create Server Action Tool
**File:** `app/actions/filings.ts`

**Function:** `getRecentFilings({ ticker, limit })`
- Validates ticker = "AAPL" (MVP)
- Validates limit 1-10
- Queries Supabase `filings` table
- Orders by filing_date DESC
- Returns: `Array<{ type, filing_date, period_end_date, url }>`

#### 5. Update Tool Menu
**File:** `lib/tools.ts`

Add new tool definition:
```typescript
{
  name: 'getRecentFilings',
  description: 'Get recent SEC filings (10-K, 10-Q) for AAPL',
  args: {
    limit: 'integer 1-10 (defaults to 5)'
  }
}
```

Update `buildToolSelectionPrompt` to include 3 tools:
1. getAaplFinancialsByMetric - financial metrics
2. getPrices - stock prices
3. getRecentFilings - SEC filings

#### 6. Update Orchestration
**File:** `app/actions/ask-question.ts`

Add third tool handler:
```typescript
else if (toolSelection.tool === 'getRecentFilings') {
  // Validate limit
  // Call getRecentFilings()
  // Set dataUsed type to 'filings'
}
```

#### 7. Update UI for Filings Data
**File:** `app/ask/page.tsx`

Extend `dataUsed` type:
```typescript
type: 'financials' | 'prices' | 'filings'
```

Add filings display table:
- Filing Type
- Filing Date
- Period End Date
- Link to SEC document

#### 8. Update Database Types
**File:** `lib/database.types.ts`

Add `filings` table type definition

### Example Flow

**User Question:** "Show me AAPL's last 3 quarterly filings"

**Step 1 - Selection:**
```json
{"tool": "getRecentFilings", "args": {"limit": 3}}
```

**Step 2 - Execution:**
- Queries Supabase for 3 most recent filings
- Returns filing metadata

**Step 3 - Answer:**
```
AAPL's last 3 quarterly filings are:
1. 10-Q for Q4 2024, filed on 2024-11-01
2. 10-Q for Q3 2024, filed on 2024-08-01
3. 10-Q for Q2 2024, filed on 2024-05-02
```

**Data Used Display:**
Table with filing type, dates, and clickable links to SEC

### Testing Criteria
- ✅ Questions about filings route to `getRecentFilings` tool
- ✅ Filings display with correct metadata
- ✅ Links to SEC EDGAR work
- ✅ No duplicate filings in database
- ✅ Handles 10-K vs 10-Q correctly

### Data Scope
- AAPL only for MVP
- Last 5-10 years of filings
- 10-K (annual) and 10-Q (quarterly) only
- Approximately 40-50 filings total

### Next After This
Once filings work:
- ✅ Phase 4: Add RAG for full-text document Q&A (COMPLETE)
- OR expand to multi-ticker support
- OR add multi-hop reasoning for complex questions

---

## Phase 4 — ✅ COMPLETE: RAG for SEC Filings (Semantic Document Search)

### Objective
Enable users to ask questions ABOUT the content of SEC filings using semantic search (RAG - Retrieval-Augmented Generation).

### What Was Built

#### 1. Database Infrastructure
- ✅ **pgvector extension enabled** - Allows storing embeddings in Postgres
- ✅ **`filing_chunks` table** - Stores text chunks with embeddings (1536-dimensional vectors)
- ✅ **Vector search index** - IVFFlat index for fast similarity search
- ✅ **`search_filing_chunks()` function** - PostgreSQL function for semantic search using cosine distance

#### 2. Storage Infrastructure
- ✅ **Supabase Storage bucket `filings`** - Stores original HTML files from SEC
- ✅ **RLS policies** - Secure access control for filing documents
- ✅ **Signed URL generation** - For secure document citations

#### 3. Data Ingestion Pipeline
Three scripts to transform SEC filings into searchable chunks:

**Script 1: `download-filings.ts`**
- Downloads HTML files from SEC EDGAR
- Stores in Supabase Storage bucket
- Respects SEC User-Agent requirements
- Handles 10-K and 10-Q filings

**Script 2: `chunk-filings.ts`**
- Extracts clean text from HTML files
- Splits into ~800-word chunks with 100-word overlap
- Preserves section information (Risk Factors, MD&A, etc.)
- Stores chunks in `filing_chunks` table

**Script 3: `embed-filings.ts`**
- Generates embeddings using OpenAI `text-embedding-3-small`
- 1,536 dimensions per embedding
- Updates `filing_chunks` with vector embeddings
- Cost: ~$0.02 per 1M tokens

#### 4. Search Action
**File:** `app/actions/search-filings.ts`
- ✅ `searchFilings({ query, limit })` server action
- Embeds user question using OpenAI
- Performs vector similarity search via `search_filing_chunks()` RPC
- Returns top-k most relevant passages with metadata
- Fallback to manual query if RPC unavailable

#### 5. Tool Integration
**File:** `lib/tools.ts`
- ✅ Added `searchFilings` to tool menu
- LLM can now choose between 4 tools:
  1. `getAaplFinancialsByMetric` - Financial numbers
  2. `getPrices` - Stock prices
  3. `getRecentFilings` - Filing metadata/list
  4. `searchFilings` - **Search filing CONTENT** (new!)

#### 6. Orchestration
**File:** `app/actions/ask-question.ts`
- ✅ Added handler for `searchFilings` tool
- Validates query and limit parameters
- Passes passages to LLM for grounded answers
- Returns passages as `type: 'passages'` for UI

#### 7. UI Enhancement
**File:** `app/ask/page.tsx`
- ✅ Displays passage results with:
  - Filing type and fiscal year/quarter
  - Filing date
  - Section name
  - Text excerpt (first 200 characters)
- Styled in blue table format matching other data types

### How It Works (End-to-End)

**User asks:** "What supply chain risks does Apple mention?"

1. **Tool Selection** - LLM routes to `searchFilings` tool
2. **Query Embedding** - Question converted to 1,536-number vector
3. **Vector Search** - Database finds 5 most similar chunk embeddings
4. **Passage Retrieval** - Returns relevant text passages with metadata
5. **Answer Generation** - LLM writes answer using ONLY those passages
6. **Citation Display** - UI shows answer + source passages

### Example Questions Now Supported

**Qualitative Document Questions:**
- "What risks does AAPL mention in their filings?"
- "What did AAPL say about competition?"
- "Explain AAPL's revenue recognition policy"
- "What supply chain challenges does AAPL face?"
- "What is AAPL's business strategy?"
- "What legal issues did AAPL disclose?"

### Technical Details

**Embedding Model:** OpenAI `text-embedding-3-small`
- 1,536 dimensions
- ~$0.02 per 1M tokens
- Fast and accurate

**Search Method:** Cosine similarity via pgvector
- `<=>` operator for cosine distance
- IVFFlat index for speed
- Sub-second searches on thousands of chunks

**Chunk Strategy:**
- ~800 words per chunk
- ~100 word overlap between chunks
- Preserves context at boundaries
- Stores section metadata

### Current Data
- ✅ 76 filing chunks embedded and searchable
- ✅ Multiple AAPL filings (10-K, 10-Q) processed
- ✅ Full semantic search operational

### Cost Analysis
- Embedding generation: ~$0.80 for 40 filings (~4,000 chunks)
- Query embedding: ~$0.0001 per question
- Highly cost-effective for RAG applications

### Benefits
- ✅ **Semantic understanding** - Finds relevant content even with different wording
- ✅ **Fast retrieval** - Sub-second search over thousands of passages
- ✅ **Grounded answers** - LLM only uses retrieved passages (no hallucination)
- ✅ **Citations** - Users see exact source passages with filing dates
- ✅ **Scalable** - Can easily add more filings and companies

### What's Next (Phase 5)
Now that Phase 4 RAG is complete, future enhancements could include:
- Expand to multiple companies (MSFT, GOOGL, TSLA, etc.)
- Multi-hop reasoning (compare risks across companies)
- Hybrid search (combine keyword + semantic)
- Add earnings call transcripts
- Temporal queries ("How have risks changed over time?")
- Entity extraction and knowledge graphs


