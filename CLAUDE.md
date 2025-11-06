# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fin Quote** is a Next.js-based financial Q&A platform that uses LLMs to answer natural language questions about Apple (AAPL) stock data. The system uses a two-step LLM architecture: (1) tool selection and (2) answer generation with validation.

**Core Design Philosophy:**
- **Safety First**: LLMs cannot execute arbitrary database queries. Instead, they select from a whitelist of pre-built "tools" (server actions) with validated inputs.
- **Server-Side Intelligence**: All LLM calls, database queries, and validation logic run server-side. The browser only handles UI.
- **Grounded Answers**: The LLM must use only fetched data; no external knowledge or hallucinations allowed.
- **Validation Pipeline**: All answers are validated against source data for number accuracy, year correctness, and citation validity.

---

## Architecture

### Two-Step LLM Flow

Every user question follows this pattern:

1. **Tool Selection** (`ask-question.ts:224-313`)
   - LLM receives question + conversation history + tool menu
   - Returns JSON: `{"tool": "toolName", "args": {...}}`
   - Model: Uses `OPENAI_MODEL` (default: `gpt-5-nano`)

2. **Tool Execution** (`ask-question.ts:316-438`)
   - Server validates tool + args
   - Executes corresponding server action
   - Returns structured data (financials, prices, filings, or passages)

3. **Answer Generation** (`ask-question.ts:441-500`)
   - LLM receives question + fetched facts + conversation history
   - Generates grounded answer using only provided data
   - Plain text output (no Markdown)

4. **Validation** (`ask-question.ts:503-658`)
   - Validates numbers, years, and filing citations
   - If validation fails with high severity, triggers auto-regeneration
   - Logs validation results to `query_logs` table

### Available Tools

Defined in `lib/tools.ts` (TOOL_MENU):

1. **getAaplFinancialsByMetric** - Income statement, balance sheet, cash flow metrics
   - Core metrics: `revenue`, `gross_profit`, `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow`, `eps`
   - Extended metrics: 139 additional financial metrics available (P/E ratio, ROE, debt ratios, growth rates, etc.)
   - Can calculate ratios: gross margin, net margin, ROE, ROA, debt-to-equity, etc.

2. **getPrices** - Stock price history
   - Ranges: `7d`, `30d`, `90d`

3. **getRecentFilings** - SEC filing metadata (10-K, 10-Q)
   - Returns filing type, date, period, URL

4. **searchFilings** - Semantic search over SEC filing content (RAG)
   - Uses pgvector for embedding-based search
   - Returns relevant text passages with citations

**Future tools (planned):**
- `listMetrics` - Discovery tool for browsing the catalog of 139 financial metrics
- Enhanced metric tool with alias resolution ("P/E ratio" → `peRatio`)

### Data Storage (Supabase)

**Tables:**
- `company` - Company metadata (symbol, name, sector)
- `financials_std` - Standardized financial metrics by year (core metrics)
- `financial_metrics` - Extended metrics (139 metrics including ratios, growth rates, valuations)
- `filings` - SEC filing metadata
- `filing_chunks` - Text chunks with embeddings for semantic search (1536-dim vectors)
- `price_history` - Daily stock prices
- `query_logs` - Query logging for accuracy tracking and cost analysis

**Storage:**
- `filings` bucket - Original SEC filing HTML files

**Key Functions:**
- `search_filing_chunks()` - PostgreSQL RPC for vector similarity search

---

## Development Commands

### Setup
```bash
npm install                    # Install dependencies
cp .env.local.example .env.local  # Configure environment variables
```

### Development
```bash
npm run dev                    # Start dev server (localhost:3000)
npm run build                  # Production build
npm run lint                   # Run ESLint
```

### Data Export
```bash
npm run export                 # Export financial data to Excel
npm run export:catalog         # Export metrics catalog to Excel
```

### Database Scripts

**Financial Data:**
```bash
# Core metrics (financials_std table)
npx tsx scripts/fetch-aapl-data.ts        # Fetch financial data from API
npx tsx scripts/ingest-financials.ts      # Load data into Supabase

# Extended metrics (financial_metrics table - 139 metrics)
npm run setup:metrics                     # Create financial_metrics table
npm run fetch:metrics                     # Fetch metrics from FMP API
npm run ingest:metrics                    # Load metrics into Supabase
```

**SEC Filings:**
```bash
npx tsx scripts/fetch-sec-filings.ts      # Fetch filing metadata from SEC EDGAR
npx tsx scripts/ingest-filings.ts         # Load metadata into Supabase
npx tsx scripts/download-filings.ts       # Download HTML files to storage
npx tsx scripts/chunk-filings.ts          # Split filings into chunks
npx tsx scripts/embed-filings.ts          # Generate embeddings for RAG
```

**Testing & Evaluation:**
```bash
npx tsx scripts/evaluate.ts               # Run prompt evaluation tests
node scripts/test-tool-selection.mjs      # Test tool selection logic
node scripts/test-phase-0.mjs             # Run baseline tests
npx tsx scripts/test-ratios.ts            # Test ratio calculations
```

**Debugging:**
```bash
node scripts/check-data.mjs               # Verify financial data
node scripts/check-filings.mjs            # Verify filing data
node scripts/test-search.mjs              # Test semantic search
```

---

## Key Files

### Server Actions (app/actions/)
- `ask-question.ts` - Main orchestration: tool selection → execution → answer generation → validation
- `financials.ts` - Fetch financial metrics from database
- `prices.ts` - Fetch stock prices from Financial Modeling Prep API
- `filings.ts` - Fetch filing metadata
- `search-filings.ts` - Semantic search over filing content (RAG)
- `get-costs.ts` - Cost tracking and analytics

### LLM Prompts & Tools (lib/)
- `tools.ts` - Tool definitions + prompt templates for tool selection and answer generation
- `validators.ts` - Answer validation (number accuracy, year correctness, filing citations)
- `regeneration.ts` - Auto-correction logic when validation fails
- `chart-helpers.ts` - Chart generation logic for financial data visualization

### Frontend (app/)
- `app/ask/page.tsx` - Main Q&A interface with conversation history
- `app/admin/validation/page.tsx` - Validation results dashboard
- `app/admin/costs/page.tsx` - Cost tracking dashboard
- `components/FinancialChart.tsx` - Highcharts visualization
- `components/RecentQueries.tsx` - Recent query history

### Configuration
- `.env.local` - Environment variables (Supabase, OpenAI, FMP API keys)
- `lib/database.types.ts` - TypeScript types for Supabase schema
- `lib/supabase/client.ts` - Browser client (uses NEXT_PUBLIC_* vars)
- `lib/supabase/server.ts` - Server client (for server actions)

---

## Environment Variables

Required in `.env.local`:

```bash
# Supabase (public, safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI (server-only secret)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano  # Options: gpt-4o-mini, gpt-5-nano, gpt-5-mini

# Financial Modeling Prep (server-only secret)
FMP_API_KEY=your-fmp-key
```

---

## Critical Implementation Details

### Tool Selection Prompt Architecture

The tool selection prompt (`lib/tools.ts:buildToolSelectionPrompt`) is highly tuned:
- **Metric Mapping**: Maps user terms like "profit", "sales", "ROE" to exact database metrics
- **Limit Rules**: Special handling for specific years (limit: 10), year ranges (limit: N), trends (limit: 4)
- **Range Mapping**: Maps user time expressions to API ranges (7d/30d/90d)
- **Query Extraction**: Converts qualitative questions into semantic search queries

### Answer Generation Validation

The answer prompt (`lib/tools.ts:buildFinalAnswerPrompt`) enforces strict validation rules:
1. **NUMBERS**: Use exact values from data; format with B/M suffixes (e.g., "$383.3B")
2. **YEARS**: Only mention years present in data; admit "I don't have data for [year]" if missing
3. **DATES**: Use exact dates from data; never approximate
4. **CITATIONS**: Only reference filings present in data
5. **CALCULATIONS**: May calculate ratios/margins from raw data (formulas provided)

### Validation System (Phase 1-3)

Implemented in `lib/validators.ts`:
- **Number Validation**: Extracts numbers from answer, compares to source data (tolerance: ±2%)
- **Year Validation**: Extracts years from answer, verifies all exist in source data
- **Filing Validation**: Extracts filing references, verifies dates match data
- **Regeneration**: If validation fails with medium+ severity, auto-regenerates answer once

### Ratio Calculation Pattern

For questions like "What's AAPL's ROE?", the system:
1. Tool selection picks `getAaplFinancialsByMetric` with metric: `net_income`
2. Tool execution fetches `net_income` + `shareholders_equity` (multi-metric fetch)
3. Answer generation calculates: ROE = (net_income / shareholders_equity) × 100
4. Chart helper generates ratio chart (not raw value chart)

This pattern works for: gross margin, net margin, operating margin, ROE, ROA, debt-to-equity, asset turnover, etc.

### Extended Metrics System (139 Metrics)

**Phase 4 Addition**: Beyond the 9 core metrics, the system now has access to 139 financial metrics from FMP API:

**Categories:**
- **Valuation Ratios**: P/E, P/B, P/S, EV/EBITDA, PEG ratio
- **Profitability & Returns**: ROE, ROA, ROIC, profit margins (gross, operating, net)
- **Leverage & Solvency**: Debt ratios, interest coverage, current/quick ratios
- **Efficiency**: Asset turnover, inventory turnover, receivables turnover
- **Growth Rates**: Revenue growth, earnings growth, dividend growth
- **Per-Share Metrics**: EPS, book value per share, operating cash flow per share
- **Dividends**: Dividend yield, payout ratio, dividend per share

**Two-Layer Architecture (Planned):**
1. **Discovery Layer**: `listMetrics` tool for browsing available metrics by category
2. **Execution Layer**: Enhanced tool with alias resolution (e.g., "P/E" → `peRatio`, "return on equity" → `returnOnEquity`)

**Current State**: Metrics stored in `financial_metrics` table, available via scripts, not yet exposed in Q&A tools

### Conversation History

The system maintains conversation context:
- Stored in client state as `ConversationHistory` array
- Passed to both tool selection and answer generation
- Limited to last 10 messages (tool selection) or 4 messages (answer generation for gpt-5)
- Enables follow-up questions like "What about 2022?" after asking about 2023

### Cost Tracking

All queries are logged to `query_logs` table with:
- Token usage (prompt, completion, total) for each LLM call
- Cost calculation based on model pricing (gpt-5-nano: $0.05/1M input, $0.40/1M output)
- Embedding tokens for RAG searches ($0.02/1M)
- Query latency (tool selection, tool execution, answer generation)

---

## Testing Strategy

### Golden Test Set

`test-data/golden-test-set.json` contains 100 representative questions with expected outputs. Used for prompt evaluation.

### Evaluation System

Run with `npx tsx scripts/evaluate.ts`:
1. Loads test questions from golden set
2. Tests with current prompt (from database `prompt_versions` table)
3. Scores tool selection accuracy, argument correctness, answer quality
4. Outputs scorecard with pass/fail rates

### Manual Testing Scripts

- `test-tool-selection.mjs` - Verify tool routing logic
- `test-phase-0.mjs` - Baseline accuracy tests
- `test-ratios.ts` - Verify ratio calculations work correctly
- `test-validators.mjs` - Test validation rules

---

## Common Workflows

### Adding a New Financial Metric

1. Check if metric exists in `financials_std` table (Supabase SQL Editor)
2. Add to `FinancialMetric` type in `app/actions/financials.ts`
3. Update metric mapping in `lib/tools.ts` (tool selection prompt)
4. If ratio metric, add calculation formula to answer generation prompt
5. Update chart helpers if needed (`lib/chart-helpers.ts`)
6. Test with evaluation script

### Improving Prompts

1. Create new prompt version in `prompt_versions` table (Supabase)
2. Run evaluation: `npx tsx scripts/evaluate.ts --compare v1 v2`
3. Review scorecard output
4. If v2 scores higher, update `lib/tools.ts` with new prompt
5. Deploy

### Adding a New Tool

1. Create server action in `app/actions/[tool-name].ts`
2. Add tool definition to `TOOL_MENU` in `lib/tools.ts`
3. Update tool selection prompt with new tool description
4. Add tool handler in `ask-question.ts` orchestration
5. Update UI to display new data type in `app/ask/page.tsx`
6. Add tests to golden test set

### Debugging Answer Quality Issues

1. Check `query_logs` table for validation results
2. Review `app/admin/validation/page.tsx` dashboard for patterns
3. Look at specific failed queries: tool selected, data returned, answer generated
4. If systematic failure, update prompt or add validation rule
5. Test fix with evaluation script before deploying

---

## Important Constraints

- **AAPL-only**: All tools are hardcoded to Apple stock (ticker: AAPL) for MVP
- **Read-only**: No write operations; all queries are SELECT statements
- **Row limits**: Financials (1-10 years), Filings (1-10 filings), Prices (7/30/90 days)
- **No free-form SQL**: LLM cannot write arbitrary queries; must use predefined tools
- **Server-side secrets**: API keys never exposed to browser; all in server actions
- **Metric coverage**: Extended metrics available from 2006-2025 (Financial Modeling Prep API)

---

## Documentation

Comprehensive planning docs in `docs/`:
- `PROJECT_PLAN.md` - Complete system architecture and phased implementation
- `RATIO_MVP_PLAN.md` - Financial ratio calculation strategy
- `EVALUATION_SYSTEM_PLAN.md` - Prompt testing and improvement system
- `COST_TRACKING_SETUP.md` - Token usage and cost analysis
- `STORAGE_SETUP.md` - Supabase storage configuration for SEC filings
- `PHASE_*_IMPLEMENTATION.md` - Detailed phase-by-phase implementation notes
- `METRIC_DISCOVERY_EXECUTION_PLAN.md` - Two-layer architecture for 139 metrics integration
- `FINANCIAL_METRIC_ROUTER_RECOMMENDATION.md` - Router design for metric handling

---

## Tech Stack Summary

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL with pgvector for embeddings)
- **Authentication**: Supabase Auth
- **LLM**: OpenAI (gpt-5-nano, gpt-4o-mini, or gpt-4o)
- **Embeddings**: OpenAI text-embedding-3-small (1536-dim)
- **Charts**: Highcharts
- **Styling**: Tailwind CSS
- **Language**: TypeScript
