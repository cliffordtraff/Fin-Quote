# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For every project, write a detailed FORFORD.md file that explains the whole project in plain language. Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc). It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

## Project Overview

**The Intraday** (formerly Fin Quote) is a Next.js 15 / React 19 financial data platform.

Primary surfaces:

- **Home / Landing** (`/`) — Either the marketing site or the main market dashboard depending on `NEXT_PUBLIC_ENABLE_LANDING`
- **Market Dashboard** (`/dashboard`) — Market overview with indices, movers, sector heatmaps, futures, news, insider activity, and AI summaries
- **Pulse Pages** (`/dashboard/pulse*`, `/dashboard/live`, `/dashboard/review-day`) — Variant market-monitoring views
- **Stock Pages** (`/stock/[symbol]`) — Price header, chart embed, key stats, financial statements, metrics charts, news, insider trades, and "why moving" context
- **Workspace** (`/workspace/chart`, `/workspace/fundamentals`, `/workspace/overview`) — Persistent iframe shell around the separate charting platform
- **Concept / Charts** (`/concept`, `/charts`, `/multi-charts`, `/charts/export`) — Specialized market and charting experiments
- **Calendar / Insiders** (`/calendar`, `/insiders`) — International calendar and insider-trading data
- **Chatbot** (`/chatbot`) — Feature-flagged AI Q&A with conversation history, evaluations, and admin review flows
- **Admin** (`/admin/*`) — Validation, evaluation, review, and cost dashboards

**Tech Stack:** Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL + pgvector) · Supabase Auth (Google OAuth) · OpenAI · Highcharts · lightweight-charts · Tailwind CSS · TypeScript · Vitest · FMP API · Massive (Polygon.io) · Puppeteer

---

## Development Commands

```bash
npm install                         # Install dependencies (runs patch-package via postinstall)
npm run dev                         # Start dev server on localhost:3000 via ./scripts/dev.sh
npm run dev:clean                   # Kill existing dev server, clear .next, restart
npm run build                       # Production build
npm run lint                        # Run ESLint

# Testing (Vitest, jsdom)
npm run test                        # Watch mode
npm run test:run                    # Single run
npm run test:ui                     # Interactive UI
npm run test:coverage               # Coverage report

# Metrics / financial data workflows
npm run setup:metrics               # Set up metrics tables/workflow
npm run fetch:metrics               # Fetch FMP metrics
npm run ingest:metrics              # Ingest fetched metrics
npm run generate:catalog            # Regenerate metrics catalog
npm run refresh:stocks              # Refresh US stock registry
npm run stocks:status               # Check registry ingestion status
npm run ingest:segments             # Ingest segment data

# Evaluation / newsletter workflows
npx tsx scripts/evaluate.ts
npx tsx scripts/evaluate.ts --mode fast
npx tsx scripts/generate-newsletter.ts --ticker AAPL
```

---

## Architecture

### App Shell and Persistent Workspace

The root layout renders the page plus a persistent workspace iframe shell:

- `app/layout.tsx`
- `components/Navigation.tsx`
- `components/WorkspaceIframe.tsx`

The iframe is mounted once and hidden/shown across route changes so chart state survives navigation. The `/workspace/*` routes are minimal shells; the real content lives in the embedded charting app controlled by `postMessage`.

### Market Data Provider Abstraction (`lib/providers/`)

Server-side market-data actions fetch through a provider interface in `lib/providers/types.ts`.

Implementations:

- **FMPProvider** (`lib/providers/fmp.ts`) — Financial Modeling Prep REST data
- **MassiveProvider** (`lib/providers/massive.ts`) — Massive/Polygon-style REST data

Select via `DATA_PROVIDER`:

- `fmp` (default)
- `massive`

The provider factory in `lib/providers/index.ts` caches the active provider instance.

### Server Actions and Route Handlers

The app uses a mix of:

- **Server actions** in `app/actions/` for market data, stock data, financials, review flows, and caches
- **Route handlers** in `app/api/` for streaming, AI endpoints, newsletters, quote/search APIs, and integrations

Key orchestrators:

- `lib/fetch-market-data.ts` — Dashboard market-data fanout
- `app/actions/chart-metrics.ts` — Metric registry, data loading, and chart-metric assembly
- `app/stock/[symbol]/page.tsx` — Main stock-page composition

### AI Surfaces

There are multiple AI surfaces in this repo:

- **Streaming Q&A** in `app/api/ask/route.ts`
- **Conversation persistence** in `app/actions/conversations.ts`
- **Market summaries and trend bullets**
- **Evaluation and review tooling** in `/admin/*`
- **Newsletter generation** in `lib/newsletter/`
- **Dexter sidecar integration** via `app/api/dexter-query/route.ts`

Important nuance: some older chat and evaluation flows still have AAPL-specific assumptions even though the broader product is now multi-symbol.

### Metrics System

Financial charting and analysis pull from multiple layers:

- `financials_std` for standardized core statement data
- `financial_metrics` for broader derived and provider-sourced metrics
- `company_metrics` for segment and company-specific dimensional data
- provider-backed price data for aligned market series

The main metric router/config lives in `app/actions/chart-metrics.ts`.

### Real-Time Streaming

Live streaming is built on:

- SSE route handlers in `app/api/stream/`
- a singleton websocket broker in `lib/ws/massive-broker.ts`

The broker multiplexes subscriptions and aggregates 1-second market data into larger candles for clients.

---

## Routing and Middleware

`middleware.ts` handles:

- **Auth protection** for `/profile` and `/admin/*`
- **Ticker shortcuts** such as `/AAPL` → `/stock/AAPL`
- **Legacy redirect** from `/company/:symbol` → `/stock/:symbol`
- **Session refresh** via Supabase SSR auth helpers

Rendering notes:

- `/dashboard` uses ISR with `revalidate = 60`
- `/stock/[symbol]` also uses `revalidate = 60`
- `/` is `force-dynamic`
- `/workspace/*` pages are layout shells for the persistent iframe flow

---

## Theme and UI

The app uses Tailwind with a custom theme centered around sage and cream tokens:

- **Sage** for accents, active states, and action colors
- **Cream** for light-mode backgrounds and borders
- **Gray 800/900** for dark mode

Useful files:

- `tailwind.config.ts`
- `app/globals.css`
- `components/ThemeProvider.tsx`
- `components/ThemeToggle.tsx`

---

## Data Storage (Supabase)

Important table groups include:

- company and security metadata
- `financials_std`
- `financial_metrics`
- `company_metrics`
- filings and filing chunks
- conversations and messages
- query logs, prompt versions, validation/review metadata
- insider-trading tables
- cache tables for market summaries, market movers, LLM outputs, and stock "why moving" data

Core references:

- `lib/database.types.ts`
- `supabase/migrations/`
- `data/MIGRATIONS.md`

Auth uses Supabase Auth through `@supabase/ssr`:

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `app/auth/`
- `app/auth/callback/route.ts`

---

## Environment Variables

Common variables used by the app:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano

FMP_API_KEY=your-fmp-key
MASSIVE_API_KEY=your-massive-key
DATA_PROVIDER=fmp                  # "fmp" or "massive"

NEXT_PUBLIC_CHARTING_URL=http://localhost:3001
NEXT_PUBLIC_COOKIE_DOMAIN=.theintraday.com

NEXT_PUBLIC_ENABLE_CHAT=false
NEXT_PUBLIC_ENABLE_LANDING=false
NEXT_PUBLIC_SHOW_STOCK_V1=false
NEXT_PUBLIC_ENABLE_MOVERS=true

NEWSLETTER_PUBLIC_CHARTING_URL=https://charts.theintraday.com
```

Dexter-related optional variables:

```bash
EXA_API_KEY=...
TAVILY_API_KEY=...
FINANCIAL_DATASETS_API_KEY=...
DEXTER_MODEL=gpt-4o
DEXTER_MODEL_PROVIDER=openai
```

---

## Common Workflows

### Adding or Updating Dashboard Data

1. Add or update a server action in `app/actions/`
2. Wire it into `lib/fetch-market-data.ts` if it belongs on the dashboard
3. Update the consuming component in `components/`
4. If needed, add fast/slow snapshot coverage in `app/api/market-snapshot/*`

### Adding or Updating a Financial Metric

1. Update metric config or loaders in `app/actions/chart-metrics.ts`
2. Ensure the underlying source exists in `financials_std`, `financial_metrics`, or `company_metrics`
3. Update metric catalog generation if needed
4. Verify the consuming chart or stock page handles the new shape

### Updating Chat / AI Prompting

1. Update prompt builders and tool definitions in `lib/tools.ts`, `lib/regeneration.ts`, or related action files
2. Run evaluation with `scripts/evaluate.ts`
3. Review failures in `/admin/evaluations` and `/admin/review`

### Updating Workspace Integration

1. Update host-side navigation and iframe behavior in `components/Navigation.tsx` and `components/WorkspaceIframe.tsx`
2. Keep the embedded charting URL and theme/symbol sync behavior aligned with the external charting app
3. Verify `/workspace/chart`, `/workspace/fundamentals`, and `/workspace/overview`

---

## Important Constraints

- The workspace experience depends on an external charting platform being available at `NEXT_PUBLIC_CHARTING_URL`
- Many ingestion, cache, and admin workflows require `SUPABASE_SERVICE_ROLE_KEY`
- `DATA_PROVIDER=massive` requires `MASSIVE_API_KEY`
- Some older AI and evaluation paths still assume AAPL-oriented tooling
- Feature flags mainly control visibility and entry points, not complete code removal
- The repository contains both production paths and experimental surfaces; check active usage before deleting old modules

---

## Accounts & Services

| Service | Plan | Cost |
|---------|------|------|
| Beehiiv | Scale | $50/month |
