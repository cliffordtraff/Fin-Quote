# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fin Quote** is a Next.js-based financial data platform with an AI-powered Q&A chatbot that answers natural language questions about Apple (AAPL) stock. The system uses a two-step LLM architecture with tool selection, data execution, answer generation, and validation.

**Core Design Philosophy:**
- **Safety First**: LLMs cannot execute arbitrary database queries. Instead, they select from a whitelist of pre-built "tools" (server actions) with validated inputs.
- **Server-Side Intelligence**: All LLM calls, database queries, and validation logic run server-side. The browser only handles UI.
- **Grounded Answers**: The LLM must use only fetched data; no external knowledge or hallucinations allowed.
- **Validation Pipeline**: All answers are validated against source data for number accuracy, year correctness, and citation validity, with auto-regeneration on failures.

---

## Architecture

### Two-Step LLM Flow

Every user question follows this pattern (implemented in `app/actions/ask-question.ts`):

1. **Tool Selection** (lines 258-330)
   - LLM receives question + conversation history + tool menu
   - Returns JSON: `{"tool": "toolName", "args": {...}}`
   - Model: Uses `OPENAI_MODEL` (default: `gpt-5-nano`)
   - Tokens tracked for cost analysis

2. **Tool Execution** (lines 332-575)
   - Server validates tool + args
   - Executes corresponding server action
   - Returns structured data (financials, prices, filings, passages, or metrics)

3. **Answer Generation** (lines 579-650)
   - LLM receives question + fetched facts + conversation history
   - Generates grounded answer using only provided data
   - Plain text output (no Markdown, bullets, or tables)
   - Context: Last 10 messages (tool selection) or 4 messages (answer generation for gpt-5)

4. **Validation & Auto-Correction** (lines 653-796)
   - Validates numbers, years, and filing citations
   - If validation fails with medium+ severity, triggers auto-regeneration
   - May refetch data with corrected args if needed
   - Logs all attempts and results to `query_logs` table

### Available Tools

Defined in `lib/tools.ts` (TOOL_MENU):

1. **getAaplFinancialsByMetric** - Core financial metrics from `financials_std` table
   - Raw metrics: `revenue`, `gross_profit`, `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow`, `eps`
   - Calculated metrics (native support): `gross_margin`, `roe`, `debt_to_equity_ratio`
   - Returns time-series data with related metrics for ratio calculations

2. **getFinancialMetric** - Extended metrics from `financial_metrics` table (139 metrics)
   - Supports flexible aliases: "P/E" → `peRatio`, "return on equity" → `returnOnEquity`
   - Categories: Valuation, Profitability, Growth, Leverage, Efficiency, Per-Share Metrics
   - Multi-metric queries: fetch multiple metrics in one call

3. **listMetrics** - Browse available metrics catalog
   - Optional category filter
   - Returns metric names, descriptions, units, and common aliases
   - Use when uncertain which metrics are available

4. **getPrices** - Stock price history from FMP API
   - Custom date ranges: `from` (required), `to` (optional, defaults to today)
   - Supports multi-year ranges (up to 20 years)
   - Returns daily OHLCV data

5. **getRecentFilings** - SEC filing metadata (10-K, 10-Q)
   - Returns filing type, date, period, fiscal year/quarter, URL
   - Limit: 1-10 filings

6. **searchFilings** - Semantic search over SEC filing content (RAG)
   - Uses pgvector for embedding-based search
   - Returns relevant text passages with citations
   - Query: natural language, Limit: 1-10 passages

### Data Storage (Supabase)

**Core Tables:**
- `company` - Company metadata (symbol, name, sector)
- `financials_std` - Core financial metrics by year (9 metrics with 20-year history)
- `financial_metrics` - Extended metrics (139 metrics from FMP, 2006-2025)
- `filings` - SEC filing metadata with fiscal year/quarter
- `filing_chunks` - Text chunks with embeddings for semantic search (1536-dim vectors via pgvector)
- `price_history` - Historical daily stock prices (not currently used; prices fetched from FMP API)
- `query_logs` - Query logging for accuracy tracking, validation results, and cost analysis
- `conversations` - User conversation history (with auto-generated titles)
- `messages` - Individual messages within conversations (with chart configs and follow-up questions)

**Storage:**
- `filings` bucket - Original SEC filing HTML files from EDGAR

**Key Functions:**
- `search_filing_chunks()` - PostgreSQL RPC for vector similarity search using pgvector

---

## Development Commands

### Setup
```bash
npm install                         # Install dependencies
cp .env.local.example .env.local    # Configure environment variables
```

### Development
```bash
npm run dev                         # Start dev server (localhost:3000)
npm run build                       # Production build
npm run lint                        # Run ESLint
npm run test                        # Run Vitest tests
npm run test:ui                     # Run Vitest with UI
npm run test:coverage               # Run tests with coverage
npm run test:run                    # Run tests once (no watch mode)
```

### Data Management

**Core Financial Data:**
```bash
npx tsx scripts/fetch-aapl-data.ts           # Fetch from FMP API
npx tsx scripts/ingest-financials.ts         # Load into financials_std table
```

**Extended Metrics (139 metrics):**
```bash
npm run setup:metrics                        # Create financial_metrics table
npm run fetch:metrics                        # Fetch from FMP API
npm run ingest:metrics                       # Load into Supabase
npm run generate:catalog                     # Generate metrics catalog with metadata
```

**SEC Filings (RAG Pipeline):**
```bash
npx tsx scripts/fetch-sec-filings.ts         # Fetch metadata from SEC EDGAR
npx tsx scripts/ingest-filings.ts            # Load metadata into filings table
npx tsx scripts/download-filings.ts          # Download HTML files to storage
npx tsx scripts/chunk-filings.ts             # Split filings into semantic chunks
npx tsx scripts/embed-filings.ts             # Generate embeddings for vector search
```

**Data Export:**
```bash
npm run export                               # Export financial data to Excel
npm run export:catalog                       # Export metrics catalog to Excel
```

**Testing & Debugging:**
```bash
npx tsx scripts/evaluate.ts                  # Run evaluation on golden test set
node scripts/test-*.mjs                      # Various integration tests
node scripts/check-*.mjs                     # Data verification scripts
```

---

## Key Files

### Server Actions (app/actions/)

**AI Chatbot:**
- `ask-question.ts` - Main orchestration: tool selection → execution → answer generation → validation → regeneration
- `financials.ts` - Core financial metrics (9 metrics from financials_std)
- `get-financial-metric.ts` - Extended metrics with alias resolution (139 metrics from financial_metrics)
- `list-metrics.ts` - Metrics catalog discovery tool
- `prices.ts` - Stock prices from FMP API (custom date ranges)
- `filings.ts` - SEC filing metadata
- `search-filings.ts` - Semantic search over filing content (RAG)
- `conversations.ts` - Conversation persistence and auto-title generation
- `get-costs.ts` - Cost tracking analytics
- `get-recent-queries.ts` - Recent query history
- `review-query.ts` - LLM-based query evaluation

**Market Dashboard:**
- `market-data.ts` - Index data (S&P 500, NASDAQ, Dow, Russell 2000)
- `futures.ts` - Futures contracts
- `gainers.ts` - Top gainers (regular hours)
- `losers.ts` - Top losers (regular hours)
- `scan-extended-hours.ts` - Pre-market/after-hours movers
- `stocks.ts` - Featured stocks table
- `market-breadth.ts` - Market breadth indicators
- `sectors.ts` - Sector performance
- `vix.ts` - Volatility index
- `economic-calendar.ts` - Upcoming economic events

### LLM & Validation (lib/)
- `tools.ts` - Tool definitions + prompt templates for tool selection and answer generation
- `validators.ts` - Answer validation (number accuracy, year correctness, filing citations)
- `regeneration.ts` - Auto-correction logic when validation fails (with optional data refetch)
- `chart-helpers.ts` - Chart generation logic for financial and price data visualization
- `metric-resolver.ts` - Alias resolution for metric names ("P/E" → `peRatio`)
- `metric-metadata.ts` - Metadata for 139 financial metrics (descriptions, categories, units)
- `llm-judge.ts` - LLM-based evaluation of query quality and accuracy
- `market-utils.ts` - Market session detection (premarket, regular, afterhours, closed)

### Frontend (app/ & components/)
- `app/page.tsx` - Main homepage with market data dashboard
- `app/chatbot/page.tsx` - Deprecated chatbot page (functionality now in sidebar)
- `app/admin/validation/page.tsx` - Validation results dashboard
- `app/admin/costs/page.tsx` - Cost tracking dashboard
- `app/admin/review/page.tsx` - Query review interface
- `components/Sidebar.tsx` - Chatbot sidebar with conversation history
- `components/AssistantChat.tsx` - Chat UI component
- `components/FinancialChart.tsx` - Highcharts visualization for financial data
- `components/SimpleCanvasChart.tsx` - Lightweight canvas-based mini charts
- `components/Navigation.tsx` - Top navigation bar
- `components/RecentQueries.tsx` - Recent query history
- `components/ThemeToggle.tsx` - Dark/light mode toggle
- `components/AuthModal.tsx` - Authentication modal
- `components/UserMenu.tsx` - User profile menu

### Market Dashboard Components (components/)
- `GainersTable.tsx` - Top gainers table
- `LosersTable.tsx` - Top losers table
- `StocksTable.tsx` - Featured stocks
- `FuturesTable.tsx` - Futures contracts
- `MarketBreadth.tsx` - Market breadth indicators
- `SectorHeatmap.tsx` - Sector performance heatmap
- `VIXCard.tsx` - VIX volatility indicator
- `EconomicCalendar.tsx` - Economic events calendar
- `MiniPriceChart.tsx` - Small price chart for index cards

### Configuration
- `.env.local` - Environment variables (Supabase, OpenAI, FMP API keys)
- `lib/database.types.ts` - TypeScript types for Supabase schema
- `lib/supabase/client.ts` - Browser client (uses NEXT_PUBLIC_* vars)
- `lib/supabase/server.ts` - Server client (for server actions)
- `vitest.config.ts` - Vitest test configuration
- `vitest.setup.ts` - Vitest setup file with test globals

---

## Environment Variables

Required in `.env.local`:

```bash
# Supabase (public, safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI (server-only secret)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano  # Options: gpt-4o-mini, gpt-5-nano, gpt-5-mini, gpt-4o

# Financial Modeling Prep (server-only secret)
FMP_API_KEY=your-fmp-key
```

---

## Critical Implementation Details

### Tool Selection Prompt Architecture

The tool selection prompt (`lib/tools.ts:buildToolSelectionPrompt`) is highly tuned:
- **Metric Mapping**: Maps user terms to exact database metrics ("profit" → `net_income`, "P/E" → use getFinancialMetric)
- **Limit Rules**: Special handling for specific years (limit: 10), year ranges (limit: N), trends (limit: 4)
- **Date Calculation**: Converts user expressions ("last 7 years") to specific date ranges (from: YYYY-MM-DD)
- **Query Extraction**: Converts qualitative questions into semantic search queries
- **Alias Resolution**: Supports flexible metric names via alias resolver

### Answer Generation Validation

The answer prompt (`lib/tools.ts:buildFinalAnswerPrompt`) enforces strict rules:
1. **NUMBERS**: Use exact values from data; format with B/M suffixes (e.g., "$383.3B")
2. **YEARS**: Only mention years present in data; admit "I don't have data for [year]" if missing
3. **DATES**: Use exact dates from data; never approximate
4. **CITATIONS**: Only reference filings present in data
5. **CALCULATIONS**: May calculate ratios/margins from raw data (formulas provided)
6. **FORMAT**: Plain text sentences only (no Markdown, bullets, bold, italics, tables, or code blocks)
7. **CONCISENESS**: For >4 data points, write at most 2 sentences with summary + trend

### Validation System (Phase 1-3)

Implemented in `lib/validators.ts`:
- **Number Validation**: Extracts numbers from answer, compares to source data (tolerance: ±2%)
- **Year Validation**: Extracts years from answer, verifies all exist in source data
- **Filing Validation**: Extracts filing references (dates, years, quarters), verifies dates match data
- **Severity Levels**: none, low, medium, high, critical
- **Auto-Regeneration**: Triggered on medium+ severity failures (see `lib/regeneration.ts`)

### Auto-Correction with Regeneration (Phase 3)

Implemented in `lib/regeneration.ts`:
- **Trigger Conditions**: Medium+ severity validation failures
- **Action Types**: Retry with same data, or refetch data with corrected args
- **Refetch Logic**: If validation shows year exists in DB but wasn't fetched, increase limit
- **Prompt Strategy**: Explains validation errors and guides LLM to correct mistakes
- **Success Criteria**: Regenerated answer must pass all validators
- **Fallback**: On failure, uses original answer (better to show something than nothing)
- **Logging**: All attempts logged to `query_logs` with regeneration metadata

### Ratio Calculation Pattern

For questions like "What's AAPL's gross margin?", the system:
1. Tool selection picks `getAaplFinancialsByMetric` with metric: `gross_margin` (native support)
2. Tool execution fetches calculated gross margin data directly
3. Answer generation formats the answer
4. Chart helper generates ratio chart (percentage scale, not raw values)

For metrics not natively calculated:
1. Tool execution fetches related metrics (e.g., `net_income` includes `shareholders_equity`)
2. Answer generation calculates ratio from raw data using provided formula
3. Chart helper detects ratio request from user question and generates appropriate chart

### Extended Metrics System (139 Metrics)

**Implementation Status**: Fully integrated in Q&A system (Phase 4 complete)

**Tool Flow:**
1. User asks: "What's AAPL's P/E ratio?"
2. Tool selection picks `getFinancialMetric` with `metricNames: ["P/E"]` (alias support)
3. Alias resolver converts "P/E" → `peRatio`
4. Tool execution fetches from `financial_metrics` table
5. Answer generation formats response
6. (Charts not yet implemented for advanced metrics)

**Discovery Flow:**
1. User asks: "What profitability metrics are available?"
2. Tool selection picks `listMetrics` with `category: "Profitability & Returns"`
3. Tool execution fetches from metrics catalog
4. Answer generation lists available metrics with descriptions

**Metric Categories:**
- Valuation (P/E, P/B, P/S, EV/EBITDA, PEG, Market Cap, Enterprise Value)
- Profitability & Returns (ROE, ROA, ROIC, profit margins)
- Leverage & Solvency (debt ratios, interest coverage, liquidity ratios)
- Efficiency (asset turnover, inventory turnover, receivables turnover)
- Growth Rates (revenue growth, EPS growth, 3Y/5Y/10Y CAGRs)
- Per-Share Metrics (book value per share, operating cash flow per share)
- Capital Returns & Share Data (dividend yield, payout ratio, share buybacks)

### Conversation History

The system maintains conversation context:
- Stored in `conversations` and `messages` tables (persisted to Supabase)
- Passed to both tool selection and answer generation
- Limited to last 10 messages (tool selection) or 4 messages (answer generation for gpt-5)
- Enables follow-up questions like "What about 2022?" after asking about 2023
- Auto-generates conversation titles using LLM after first Q&A pair

### Cost Tracking

All queries are logged to `query_logs` table with:
- Token usage (prompt, completion, total) for each LLM call (tool selection, answer, regeneration)
- Cost calculation based on model pricing (gpt-5-nano: $0.05/1M input, $0.40/1M output)
- Embedding tokens for RAG searches ($0.02/1M)
- Query latency (tool selection, tool execution, answer generation)
- Validation results and regeneration metadata

### Market Data Dashboard

**Homepage (`app/page.tsx`):**
- Real-time market data dashboard with indices, futures, movers, sectors, VIX, economic calendar
- Client-side polling (10s intervals) for live updates
- ISR caching (60s TTL) for efficient data fetching
- Market session awareness: shows pre-market/after-hours movers based on current time
- Integrated chatbot sidebar (toggleable, conversation history, follow-up questions)

**Data Sources:**
- **FMP API**: Stock prices, market data, financials, filings
- **Supabase**: Financial data, filings, embeddings, query logs, conversations

**Market Session Detection** (`lib/market-utils.ts`):
- Determines current session: premarket, regular, afterhours, closed
- Eastern Time (ET) based logic
- Used to show relevant movers (pre-market vs regular vs after-hours)

---

## Testing Strategy

### Unit Tests

`lib/__tests__/validators.test.ts` - Comprehensive validator tests:
- Number validation with various formats (integers, decimals, billions, millions)
- Year validation with date extraction
- Filing validation with various citation formats
- Edge cases and error handling

Run with:
```bash
npm run test          # Watch mode
npm run test:run      # Single run
npm run test:ui       # Interactive UI
npm run test:coverage # Coverage report
```

### Integration Tests

Manual testing scripts in `scripts/`:
- `test-tool-selection.mjs` - Verify tool routing logic
- `test-phase-0.mjs` - Baseline accuracy tests
- `test-ratios.ts` - Verify ratio calculations
- `test-fmp-*.mjs` - Test FMP API data fetching
- `check-*.mjs` - Verify database data integrity

### Evaluation System

Golden test set in `test-data/golden-test-set.json`:
- 100+ representative questions with expected outputs
- Used for prompt evaluation and regression testing

Run with:
```bash
npx tsx scripts/evaluate.ts
```

Process:
1. Loads test questions from golden set
2. Tests with current prompts (from `lib/tools.ts`)
3. Scores tool selection accuracy, argument correctness, answer quality
4. Outputs scorecard with pass/fail rates and cost estimates

---

## Common Workflows

### Adding a New Financial Metric to Core System

1. Add column to `financials_std` table (if raw metric)
2. Add to `RawFinancialMetric` or `CalculatedFinancialMetric` type in `app/actions/financials.ts`
3. Update `getAaplFinancialsByMetric()` function to fetch and calculate if needed
4. Update metric mapping in `lib/tools.ts` (tool selection prompt)
5. If ratio metric, add calculation formula to answer generation prompt
6. Update chart helpers if needed (`lib/chart-helpers.ts`)
7. Test with evaluation script

### Adding a New Metric to Extended System (financial_metrics)

1. Ensure metric exists in FMP API data
2. Add metadata to `lib/metric-metadata.ts` (description, category, unit, aliases)
3. Test alias resolution: `node -e "console.log(require('./lib/metric-resolver').resolveMetricNames(['your alias']))"`
4. Run catalog generation: `npm run generate:catalog`
5. Test via chatbot: "What's AAPL's [your metric]?"
6. Verify in admin dashboard: `/admin/validation`

### Improving Prompts

1. Identify issue: tool selection errors, answer quality problems, validation failures
2. Update prompt in `lib/tools.ts`:
   - `buildToolSelectionPrompt()` for routing issues
   - `buildFinalAnswerPrompt()` for answer quality issues
3. Run evaluation: `npx tsx scripts/evaluate.ts`
4. Review validation dashboard: `/admin/validation`
5. Test manually with chatbot
6. Deploy if metrics improve

### Adding a New Tool

1. Create server action in `app/actions/[tool-name].ts`
2. Add tool definition to `TOOL_MENU` in `lib/tools.ts`
3. Update tool selection prompt with new tool description and routing rules
4. Add tool handler in `ask-question.ts` orchestration (lines 332-575)
5. Update chart helpers if tool returns chart-able data
6. Update UI in chatbot sidebar if new data display needed
7. Add test cases to golden test set

### Debugging Answer Quality Issues

1. Check `query_logs` table for validation results:
   ```sql
   SELECT * FROM query_logs
   WHERE validation_passed = false
   ORDER BY created_at DESC
   LIMIT 20;
   ```
2. Review validation dashboard: `/admin/validation`
3. Look at specific failed queries: tool selected, data returned, answer generated, validation errors
4. Check if regeneration was attempted and if it succeeded
5. If systematic failure, update prompt, validator, or regeneration logic
6. Test fix with evaluation script before deploying

### Adding a New Market Dashboard Component

1. Create server action in `app/actions/[component-name].ts` to fetch data
2. Add type definitions for data shape
3. Create React component in `components/[ComponentName].tsx`
4. Import and use in `app/page.tsx` with polling logic:
   ```typescript
   useEffect(() => {
     const interval = setInterval(() => {
       // Fetch data
     }, 10000) // 10s polling
     return () => clearInterval(interval)
   }, [])
   ```
5. Style with Tailwind CSS to match existing dashboard aesthetic
6. Test with real API data

---

## Important Constraints

- **AAPL-only**: All tools are hardcoded to Apple stock (ticker: AAPL) for MVP
- **Read-only**: No write operations; all queries are SELECT statements
- **Row limits**: Financials (1-20 years), Filings (1-10 filings), Passages (1-10 passages)
- **No free-form SQL**: LLM cannot write arbitrary queries; must use predefined tools
- **Server-side secrets**: API keys never exposed to browser; all in server actions
- **Metric coverage**: Extended metrics available from 2006-2025 (FMP API limits)
- **Price history**: Supports up to 20 years of daily price data via FMP API

---

## Documentation

Comprehensive planning docs in `docs/`:
- `PROJECT_PLAN.md` - Complete system architecture and phased implementation
- `TOOL_ARCHITECTURE_DECISION.md` - Two-layer architecture for metrics integration
- `EVALUATION_SYSTEM_PLAN.md` - Prompt testing and improvement system
- `ANSWER_VALIDATION_PLAN.md` - Validation pipeline design
- `PHASE_*_IMPLEMENTATION.md` - Detailed phase-by-phase implementation notes
- `COST_TRACKING_SETUP.md` - Token usage and cost analysis
- `STORAGE_SETUP.md` - Supabase storage configuration for SEC filings
- `FINANCIAL_METRICS_SETUP.md` - Extended metrics system setup
- `METRIC_DISCOVERY_EXECUTION_PLAN.md` - Discovery and execution layer design
- `PREMARKET_IMPLEMENTATION_PLAN.md` - Extended hours scanner design
- `CONVERSATION_PERSISTENCE_PLAN.md` - Conversation history implementation
- `TESTING_SETUP_GUIDE.md` - Vitest configuration and testing patterns

---

## Tech Stack Summary

- **Framework**: Next.js 14 (App Router, Server Actions, RSC)
- **Database**: Supabase (PostgreSQL with pgvector extension for embeddings)
- **Authentication**: Supabase Auth (Google OAuth)
- **LLM**: OpenAI (gpt-5-nano, gpt-4o-mini, or gpt-4o via Responses API)
- **Embeddings**: OpenAI text-embedding-3-small (1536-dim for RAG)
- **Charts**: Highcharts (financial/price charts), HTML5 Canvas (mini charts)
- **Styling**: Tailwind CSS with dark/light mode support
- **Language**: TypeScript
- **Testing**: Vitest with @testing-library/react and jsdom
- **Data APIs**: Financial Modeling Prep (FMP) for prices and extended metrics
