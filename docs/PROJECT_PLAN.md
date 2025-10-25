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
2) Add `getRecentFilings` and `getPrices` as new tools.
3) Ingest AAPL filings and (later) add RAG for citeable answers.
4) Grow to more tickers and multi‑hop questions once the core loop is reliable.

---

## Phase 1.5 — CURRENT: Add `getPrices` Tool (Financial Modeling Prep API)

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
- Add more metrics to `getAaplFinancialsByMetric` (net_income, eps, etc.)
- Begin Phase 3: filings ingestion + `getRecentFilings` tool
- Add more tickers (expand beyond AAPL-only)


