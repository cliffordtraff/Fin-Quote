# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For every project, write a detailed FORFORD.md file that explains the whole project in plain language. Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc). It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

## Project Overview

**The Intraday** (formerly Fin Quote) is a Next.js 15 / React 19 financial data platform.

- **Landing Page** (`/`) — Marketing/conversion page (components in `components/landing/`)
- **Market Dashboard** (`/dashboard`) — Real-time indices, sector heatmaps, VIX, gainers/losers, futures, economic calendar. Also has sub-routes: `/dashboard/pulse`, `/dashboard/pulse-today`, `/dashboard/live`, `/dashboard/review-day`
- **Stock Pages** (`/stock/[symbol]`) — Individual stock detail with charts, fundamentals, news
- **Workspace** (`/workspace/*`) — Chart, fundamentals, and overview sub-pages
- **Concept Page** (`/concept`) — Market-session-aware dashboard variant
- **Calendar** (`/calendar`) — Economic & earnings calendar with international data
- **Charts** (`/charts`, `/multi-charts`) — Multi-stock financial charts
- **Insiders** (`/insiders`) — SEC Form 4 insider trading data
- **AI Chatbot** (`/chatbot`) — Natural language Q&A about AAPL using two-step LLM architecture (feature-flagged via `NEXT_PUBLIC_ENABLE_CHAT`)

**Tech Stack:** Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL + pgvector) · Supabase Auth (Google OAuth) · OpenAI · Highcharts · lightweight-charts · Tailwind CSS · TypeScript · Vitest · FMP API · Massive (Polygon.io)

---

## Development Commands

```bash
npm install                         # Install dependencies (runs patch-package via postinstall)
npm run dev                         # Start dev server (localhost:3000, uses ./scripts/dev.sh)
npm run dev:clean                   # Kill existing, clear .next cache, restart
npm run build                       # Production build
npm run lint                        # Run ESLint

# Testing (Vitest, jsdom environment, globals enabled)
npm run test                        # Watch mode
npm run test:run                    # Single run (CI)
npm run test -- lib/__tests__/validators.test.ts  # Single file
npm run test:ui                     # Interactive UI
npm run test:coverage               # With coverage

# Chatbot evaluation (golden test set: test-data/golden-test-set.json)
npx tsx scripts/evaluate.ts                    # Full evaluation
npx tsx scripts/evaluate.ts --mode fast        # Routing-only (2-3 min)
npx tsx scripts/evaluate.ts --limit 10         # First N questions

# Data management
npx tsx scripts/fetch-aapl-data.ts             # Fetch core financials from FMP
npx tsx scripts/ingest-financials.ts           # Load into financials_std table
npm run fetch:metrics && npm run ingest:metrics # Extended metrics (139 metrics)
npm run generate:catalog                       # Regenerate metrics catalog
npm run refresh:stocks                         # Refresh US stock registry
```

---

## Architecture

### Market Data Provider Abstraction (`lib/providers/`)

Server actions fetch market data through a provider interface (`MarketDataProvider` in `lib/providers/types.ts`). Two implementations exist:

- **FMPProvider** (`lib/providers/fmp.ts`) — Financial Modeling Prep API (default)
- **MassiveProvider** (`lib/providers/massive.ts`) — Polygon.io via Massive

Set `DATA_PROVIDER=massive` in `.env.local` to switch. Default is `fmp`. The factory (`lib/providers/index.ts`) caches the provider instance. Some server actions (like `futures.ts`) bypass the abstraction and call FMP directly when the other provider doesn't support that data type.

### Server Actions Pattern (`app/actions/`)

All data fetching uses Next.js server actions (`'use server'`). ~60+ server actions cover market data, stock fundamentals, insider trading, earnings, news, etc. Most follow this pattern:
1. Import `getProvider()` from `@/lib/providers` (or call FMP directly)
2. Fetch and transform data
3. Return typed response

Key orchestrator: `lib/fetch-market-data.ts` runs multiple server actions in parallel for the dashboard.

### Two-Step LLM Flow (Chatbot)

Implemented in `app/actions/ask-question.ts`:

1. **Tool Selection** — LLM receives question + conversation history + tool menu (`lib/tools.ts`), returns JSON: `{"tool": "toolName", "args": {...}}`
2. **Tool Execution** — Server validates and executes the selected server action
3. **Answer Generation** — LLM receives question + fetched data, writes a grounded answer (plain text only, no Markdown)
4. **Validation** — `lib/validators.ts` checks number accuracy (±2%), year correctness, and filing citations. On medium+ severity failure, `lib/regeneration.ts` auto-regenerates.

The LLM never touches the database directly. Tool definitions and prompt templates live in `lib/tools.ts` (`TOOL_MENU`, `buildToolSelectionPrompt`, `buildFinalAnswerPrompt`).

### Two-Layer Metrics System

**Core metrics** (`financials_std` table, tool: `getAaplFinancialsByMetric`):
- 9 raw metrics: `revenue`, `gross_profit`, `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow`, `eps`
- 3 calculated: `gross_margin`, `roe`, `debt_to_equity_ratio`

**Extended metrics** (`financial_metrics` table, tool: `getFinancialMetric`):
- 139 metrics from FMP (2006-2025), organized by category (Valuation, Profitability, Growth, Leverage, Efficiency, Per-Share)
- Alias resolution in `lib/metric-resolver.ts` ("P/E" → `peRatio`, "profit" → `net_income`)
- Discovery via `listMetrics` tool; catalog generated by `npm run generate:catalog`

### TTM (Trailing Twelve Months) Calculation

`lib/ttm-config.ts` defines calculation type per metric, `lib/ttm-calculator.ts` implements:
- `sum` — Add last 4 quarters (revenue, net_income)
- `point_in_time` — Use latest quarter (total_assets, marketCap)
- `average` — Average of 4 quarters (daysOfInventoryOnHand)
- `derived` — Recalculate from TTM components (gross_margin = gross_profit TTM / revenue TTM)
- `not_applicable` — Cannot be TTM'd (growth rates, P/E ratio)

---

## Routing & Middleware

`middleware.ts` handles:
- **Auth protection**: `/profile` and `/admin/*` require Supabase session; redirects to `/auth`
- **Ticker shortcuts**: Single-segment paths that look like tickers redirect to `/stock/TICKER` (e.g., `/AAPL` → `/stock/AAPL`)
- **Legacy redirects**: `/company/AAPL` → `/stock/AAPL`
- **Reserved top-level routes**: `dashboard`, `stock`, `charts`, `calendar`, `insiders`, `chatbot`, `pricing`, `auth`, `admin`, `profile`, `workspace`, `concept` (won't be treated as tickers)

**Rendering strategies:**
- **ISR (60s)**: `/dashboard` — `export const revalidate = 60`
- **Dynamic**: `/stock/[symbol]` — `export const dynamic = 'force-dynamic'`
- **Static**: `/`, `/pricing`

**Navigation components:**
- `Navigation.tsx` — Used by all app pages. Has stock search bar, feature-flagged tabs, theme toggle, user menu. Top border: `border-b-2 border-sage-500`.
- `components/landing/LandingNav.tsx` — Marketing page nav with sign-in/sign-up CTAs.

---

## Theme System

Custom color tokens in `tailwind.config.ts`, dark mode via `class` strategy:
- **Sage** (`sage-50`–`sage-900`): Primary accent. `sage-500` (#5a6b4a) is the main accent, `sage-600` (#4a5a3a) for hover.
- **Cream** (`cream-50`–`cream-300`): Page backgrounds. `cream-100` (#f5f5f0) is the main background, `cream-300` (#e5e5e0) for borders.
- **Dark mode**: `bg-gray-900` backgrounds, `bg-gray-800` cards, `border-gray-700` borders.
- Full design system documented in `docs/APP-THEME-IMPLEMENTATION-PLAN.md`.

---

## Data Storage (Supabase)

**Key tables:**
- `company` — Company metadata (symbol, name, sector)
- `financials_std` — Core financial metrics by year (9 metrics, 20-year history)
- `financial_metrics` — Extended metrics (139 metrics from FMP, 2006-2025)
- `filings` / `filing_chunks` — SEC filing metadata and text chunks with pgvector embeddings (1536-dim) for semantic search via `search_filing_chunks()` RPC
- `query_logs` — Query logging with validation results and cost tracking
- `conversations` / `messages` — User conversation history with chart configs and follow-up questions

**Auth:** Supabase Auth with Google OAuth. Client: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server).

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano           # Options: gpt-4o-mini, gpt-5-nano, gpt-5-mini, gpt-4o
FMP_API_KEY=your-fmp-key
DATA_PROVIDER=fmp                  # "fmp" (default) or "massive"
NEXT_PUBLIC_ENABLE_CHAT=false      # Enable AI chatbot feature
```

---

## Common Workflows

### Adding a New Chatbot Tool
1. Create server action in `app/actions/[tool-name].ts`
2. Add tool definition to `TOOL_MENU` in `lib/tools.ts`
3. Update `buildToolSelectionPrompt()` with routing rules
4. Add tool handler in `ask-question.ts`
5. Update `lib/chart-helpers.ts` if tool returns chart-able data
6. Add test cases to `test-data/golden-test-set.json`

### Adding a New Dashboard Server Action
1. Create server action in `app/actions/[name].ts` using `getProvider()` or FMP directly
2. Add to parallel fetch in `lib/fetch-market-data.ts` if needed for dashboard
3. Create/update the consuming component

### Improving Chatbot Prompts
1. Update in `lib/tools.ts` (`buildToolSelectionPrompt` or `buildFinalAnswerPrompt`)
2. Run evaluation: `npx tsx scripts/evaluate.ts`
3. Review at `/admin/validation`

---

## Important Constraints

- **Chatbot is AAPL-only** for MVP (tools hardcoded to Apple stock)
- **Read-only LLM**: Cannot execute arbitrary queries; selects from whitelisted tools only
- **Row limits**: Financials (1-20 years), Filings (1-10), Passages (1-10)
- **Extended metrics**: Available 2006-2025 (FMP API limits)
- **Feature flags** control navigation visibility only; backend code remains in place when disabled
- **Daily data update**: GitHub Actions workflow (`.github/workflows/daily-data-update.yml`) runs at 2am UTC to fetch AAPL financials and SEC filings
