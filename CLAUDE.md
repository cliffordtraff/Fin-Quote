# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For every project, write a detailed FORFORD.md file that explains the whole project in plain language. 

Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc). 

It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

## Project Overview

**The Intraday** (formerly Fin Quote) is a Next.js 15-based financial data platform featuring:
1. **Market Dashboard** - Real-time market data with index charts (S&P 500, NASDAQ, DOW, Russell 2000), sector heatmaps, VIX, gainers/losers, futures, and economic calendar
2. **AI-Powered Chatbot** - Natural language Q&A about Apple (AAPL) stock using a two-step LLM architecture with tool selection, data execution, answer generation, and validation (feature-flagged)
3. **Multi-Stock Charts** - Stock-specific pages with price charts and financial metrics
4. **Insider Trading** - SEC Form 4 filings with trade data (in development at `/insiders`)

**Core Design Philosophy:**
- **Safety First**: LLMs cannot execute arbitrary database queries. Instead, they select from a whitelist of pre-built "tools" (server actions) with validated inputs.
- **Server-Side Intelligence**: All LLM calls, database queries, and validation logic run server-side. The browser only handles UI.
- **Grounded Answers**: The LLM must use only fetched data; no external knowledge or hallucinations allowed.
- **Validation Pipeline**: All answers are validated against source data for number accuracy, year correctness, and citation validity, with auto-regeneration on failures.

---

## Development Commands

```bash
# Setup
npm install                         # Install dependencies
cp .env.local.example .env.local    # Configure environment variables

# Development
npm run dev                         # Start dev server (localhost:3000)
npm run dev:clean                   # Kill existing, clear .next cache, restart
npm run build                       # Production build
npm run lint                        # Run ESLint

# Testing
npm run test                        # Run Vitest in watch mode
npm run test:run                    # Run tests once (CI mode)
npm run test -- lib/__tests__/validators.test.ts  # Run single test file
npm run test:ui                     # Run Vitest with interactive UI
npm run test:coverage               # Run tests with coverage report

# Chatbot Evaluation
npx tsx scripts/evaluate.ts         # Run evaluation on golden test set
npx tsx scripts/evaluate.ts --mode fast    # Routing-only (2-3 min)
npx tsx scripts/evaluate.ts --limit 10     # First N questions only

# Data Management
npx tsx scripts/fetch-aapl-data.ts  # Fetch core financials from FMP API
npx tsx scripts/ingest-financials.ts # Load into financials_std table
npm run fetch:metrics && npm run ingest:metrics  # Extended metrics (139 metrics)
npm run generate:catalog            # Regenerate metrics catalog

# GitHub Actions (runs daily at 2am UTC)
# Workflow: .github/workflows/daily-data-update.yml
# - Fetches AAPL financial data from FMP API
# - Fetches SEC filings
# - Requires secrets: SUPABASE_URL, SUPABASE_ANON_KEY, FMP_API_KEY
```

---

## Architecture

### Two-Step LLM Flow

Every user question follows this pattern (implemented in `app/actions/ask-question.ts`):

1. **Tool Selection** → LLM receives question + conversation history + tool menu, returns JSON: `{"tool": "toolName", "args": {...}}`
2. **Tool Execution** → Server validates tool + args, executes corresponding server action, returns structured data
3. **Answer Generation** → LLM receives question + fetched facts, generates grounded answer (plain text only, no Markdown)
4. **Validation & Auto-Correction** → Validates numbers/years/citations; if medium+ severity failure, triggers auto-regeneration

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

## Key Files

### Market Dashboard
| Path | Purpose |
|------|---------|
| `app/page.tsx` | Homepage with market dashboard (indexes, sectors, gainers/losers, VIX, calendar) |
| `app/market2/page.tsx` | Alternative market layout |
| `components/MarketDashboard.tsx` | Main dashboard component |
| `components/SimpleCanvasChart.tsx` | Canvas-based mini charts for index cards |
| `components/SectorHeatmap.tsx` | Sector performance visualization |

### Chatbot (feature-flagged via `NEXT_PUBLIC_ENABLE_CHAT`)
| Path | Purpose |
|------|---------|
| `app/actions/ask-question.ts` | Main Q&A orchestration: tool selection → execution → answer → validation |
| `lib/tools.ts` | Tool definitions + prompt templates (buildToolSelectionPrompt, buildFinalAnswerPrompt) |
| `lib/validators.ts` | Answer validation (number accuracy ±2%, year correctness, filing citations) |
| `lib/regeneration.ts` | Auto-correction on validation failures |
| `lib/metric-resolver.ts` | Alias resolution ("P/E" → `peRatio`, "profit" → `net_income`) |
| `lib/chart-helpers.ts` | Chart generation for financial/price data |
| `components/Sidebar.tsx` | Chatbot UI with conversation history |

### Stock Pages
| Path | Purpose |
|------|---------|
| `app/stock/aapl/page.tsx` | AAPL stock detail page with price chart and financials |
| `app/insiders/page.tsx` | Insider trading page (in development) |
| `components/InsiderTradesTable.tsx` | Insider trades table component |

### TTM Calculations
| Path | Purpose |
|------|---------|
| `lib/ttm-calculator.ts` | TTM value calculation from quarterly data |
| `lib/ttm-config.ts` | TTM calculation type config per metric |

---

## Environment Variables

Required in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano  # Options: gpt-4o-mini, gpt-5-nano, gpt-5-mini, gpt-4o
FMP_API_KEY=your-fmp-key
```

---

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `NEXT_PUBLIC_ENABLE_CHAT` | `false` | Enables the AI chatbot feature (Chat tab in navigation + `/chatbot` route) |
| `NEXT_PUBLIC_ENABLE_MARKET` | `false` | Enables the Market tab (homepage `/`) |
| `NEXT_PUBLIC_ENABLE_MARKET2` | `false` | Enables the Market 2 tab (`/market2`) |

To enable a feature: Set to `true` in `.env.local` and restart the dev server.

**Note:** The chatbot backend code (server actions, tools, validators, database tables) remains in place even when disabled. Only the UI entry points are hidden.

---

## Critical Implementation Details

### Tool Selection Prompt (`lib/tools.ts:buildToolSelectionPrompt`)

- **Metric Mapping**: Maps user terms to exact database metrics ("profit" → `net_income`, "P/E" → use getFinancialMetric)
- **Limit Rules**: Specific years (limit: 10), year ranges (limit: N), trends (limit: 4)
- **Date Calculation**: Converts "last 7 years" to specific date ranges (from: YYYY-MM-DD)

### Answer Generation Rules (`lib/tools.ts:buildFinalAnswerPrompt`)

- Use exact values from data; format with B/M suffixes (e.g., "$383.3B")
- Only mention years/dates present in data
- Plain text only (no Markdown, bullets, tables)
- For >4 data points, write at most 2 sentences with summary + trend

### Validation & Auto-Regeneration

Validation (`lib/validators.ts`):
- Number validation: ±2% tolerance
- Year validation: all years must exist in source data
- Filing validation: citation dates must match data
- Severity levels: none, low, medium, high, critical

Auto-regeneration (`lib/regeneration.ts`):
- Triggered on medium+ severity failures
- May refetch data with corrected args (e.g., increase limit if year exists but wasn't fetched)
- Falls back to original answer if regeneration fails

### Two-Layer Metrics System

**Core metrics** (`financials_std` table, 9 metrics):
- Raw: `revenue`, `gross_profit`, `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow`, `eps`
- Calculated: `gross_margin`, `roe`, `debt_to_equity_ratio`
- Tool: `getAaplFinancialsByMetric`

**Extended metrics** (`financial_metrics` table, 139 metrics from FMP):
- Categories: Valuation, Profitability, Leverage, Efficiency, Growth, Per-Share, Capital Returns
- Alias support: "P/E" → `peRatio`, "return on equity" → `returnOnEquity`
- Tool: `getFinancialMetric` (with `listMetrics` for discovery)

### Conversation Context

- Stored in `conversations` and `messages` tables
- Last 10 messages passed to tool selection, last 4 to answer generation
- Enables follow-up questions ("What about 2022?" after asking about 2023)
- Auto-generates titles using LLM after first Q&A pair

### TTM (Trailing Twelve Months) Calculation

For quarterly data, TTM values are calculated differently by metric type (`lib/ttm-config.ts`, `lib/ttm-calculator.ts`):

| Type | Method | Examples |
|------|--------|----------|
| `sum` | Add last 4 quarters | revenue, net_income, operating_cash_flow |
| `point_in_time` | Use latest quarter | total_assets, shareholders_equity, marketCap |
| `average` | Average of 4 quarters | daysOfInventoryOnHand, cashConversionCycle |
| `derived` | Recalculate from TTM components | gross_margin (gross_profit TTM / revenue TTM) |
| `not_applicable` | Cannot be TTM'd | growth rates, P/E ratio, multi-year CAGRs |

### Admin Dashboards

- `/admin/validation` - Answer validation results and failure analysis
- `/admin/costs` - Token usage and cost tracking
- `/admin/evaluations` - Prompt evaluation run history
- `/admin/review` - Manual query review interface

---

## Testing

**Unit tests** (in `lib/__tests__/`):
- `validators.test.ts` - Number/year/filing validation
- `ttm-calculator.test.ts` - TTM calculation logic

**Golden test set**: `test-data/golden-test-set.json` (100+ questions for prompt evaluation)

**Evaluation**: `npx tsx scripts/evaluate.ts` with options:
- `--mode fast` - Routing-only evaluation (2-3 min)
- `--mode full` - End-to-end including answer generation (10+ min)
- `--llm-judge` - Add GPT-4 answer quality scoring (full mode only)
- `--limit N` - Limit to first N questions

---

## Common Workflows

### Adding a New Tool

1. Create server action in `app/actions/[tool-name].ts`
2. Add tool definition to `TOOL_MENU` in `lib/tools.ts`
3. Update `buildToolSelectionPrompt()` with routing rules
4. Add tool handler in `ask-question.ts` (search for existing tool handlers)
5. Update chart helpers if tool returns chart-able data
6. Add test cases to golden test set

### Improving Prompts

1. Update prompt in `lib/tools.ts` (`buildToolSelectionPrompt` or `buildFinalAnswerPrompt`)
2. Run evaluation: `npx tsx scripts/evaluate.ts`
3. Review validation dashboard: `/admin/validation`

### Debugging Answer Quality

1. Check `query_logs` table: `SELECT * FROM query_logs WHERE validation_passed = false ORDER BY created_at DESC LIMIT 20`
2. Review `/admin/validation` dashboard
3. Check if regeneration was attempted and succeeded
4. Update prompt/validator/regeneration logic as needed

---

## Important Constraints

- **Chatbot AAPL-only**: Chatbot tools hardcoded to Apple stock for MVP
- **Read-only**: No write operations; LLM cannot execute arbitrary queries
- **Row limits**: Financials (1-20 years), Filings (1-10), Passages (1-10)
- **Metric coverage**: Extended metrics available 2006-2025 (FMP API limits)

---

## Market Dashboard Server Actions

The homepage fetches data from these server actions in `app/actions/`:

| Action | Purpose |
|--------|---------|
| `market-data.ts` | Index data (S&P 500, NASDAQ, DOW, Russell 2000) with price history |
| `futures.ts` | Futures quotes (ES, NQ, YM, etc.) |
| `gainers.ts` / `losers.ts` | Top gainers and losers with sparkline data |
| `sectors.ts` | Sector performance for heatmap |
| `vix.ts` | VIX volatility index data |
| `economic-calendar.ts` | Upcoming economic events |
| `insider-trading.ts` | SEC Form 4 insider trades (FMP API) |

---

## Tech Stack

Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL + pgvector) · Supabase Auth (Google OAuth) · OpenAI (gpt-5-nano default) · Highcharts · lightweight-charts · Tailwind CSS · TypeScript · Vitest · FMP API
