# Fin Quote

Fin Quote is the main The Intraday web app. It is a Next.js 15 application that combines:

- Market dashboards
- Stock detail pages
- Financial statement and metric visualizations
- An embedded charting workspace
- AI-assisted market and financial analysis
- Admin tooling for evaluation, review, and cost tracking

The repository also includes a separate `dexter/` package used for deeper financial-research agent workflows.

## What This Repo Contains

The current app is much broader than a basic “company financial data viewer”.

Main product areas:

- `Dashboard` and pulse pages for broad market monitoring
- `Stock` pages for company-specific price, financial, news, and insider data
- `Workspace` routes that embed the separate charting platform inside a persistent iframe
- `Chatbot` and AI endpoints for financial Q&A, summaries, and experimentation
- `Newsletter` generation tooling that produces chart images and HTML output
- `Admin` pages for reviewing model output, evaluations, and API cost usage

## Stack

- Next.js 15 App Router
- React 19 RC
- TypeScript
- Tailwind CSS
- Supabase for database, auth, and storage-backed workflows
- OpenAI APIs for chat, summaries, evaluations, and newsletter generation
- FMP and Massive/Polygon-style providers for market data
- Puppeteer for chart/newsletter capture
- Vitest for unit and component tests

## Architecture Overview

### App shell

The root layout mounts the normal page content and a persistent workspace iframe shell. That lets the external charting app remain alive across route changes instead of being recreated on every navigation.

Relevant files:

- `app/layout.tsx`
- `components/Navigation.tsx`
- `components/WorkspaceIframe.tsx`

### Data layer

There are two main data paths:

1. Market data providers for quotes, candles, movers, news, and streaming.
2. Supabase-backed financial and product data for financial statements, metrics, filings, conversations, caches, and admin workflows.

The provider factory lives in `lib/providers/` and switches by `DATA_PROVIDER`:

- `fmp` for Financial Modeling Prep
- `massive` for Massive/Polygon-style REST and websocket data

### AI layer

The repo contains multiple AI surfaces:

- Streamed Q&A pipeline in `app/api/ask/route.ts`
- Market summaries and trend bullets
- Evaluation and review tooling
- Newsletter generation pipeline in `lib/newsletter/`
- Dexter sidecar agent exposed via `app/api/dexter-query/route.ts`

Some of the older chat/evaluation flows are still AAPL-centric. The rest of the product is broader.

### Real-time layer

Live streaming uses SSE endpoints on top of a singleton websocket broker for Massive data. The broker multiplexes subscriptions and aggregates 1-second data into higher-level candles.

Relevant files:

- `app/api/stream/multi/route.ts`
- `app/api/stream/[symbol]/route.ts`
- `lib/ws/massive-broker.ts`

## Key Routes

User-facing routes:

- `/dashboard`
- `/dashboard/pulse`
- `/dashboard/pulse-today`
- `/dashboard/live`
- `/stock/[symbol]`
- `/workspace/chart`
- `/workspace/fundamentals`
- `/workspace/overview`
- `/calendar`
- `/insiders`
- `/chatbot` when enabled

Admin routes:

- `/admin/review`
- `/admin/validation`
- `/admin/evaluations`
- `/admin/costs`

Auth routes:

- `/auth`
- `/auth/forgot-password`
- `/auth/reset-password`

## Project Structure

```text
app/
  actions/        Server actions for market data, financials, chat, review flows
  api/            Route handlers for streaming, chat, newsletters, search, quotes
  dashboard/      Dashboard and pulse pages
  stock/          Stock detail pages
  workspace/      Embedded charting workspace shell routes

components/       UI building blocks and dashboard modules
lib/              Providers, Supabase helpers, AI helpers, streaming, metrics logic
scripts/          Ingestion, migration, evaluation, and debugging scripts
supabase/         SQL migrations and local config
data/             SQL helpers, seed-like data, exports, backups, raw inputs
docs/             Architecture notes, plans, and implementation docs
dexter/           Separate Bun-based research agent package
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create local env file

```bash
cp .env.local.example .env.local
```

### 3. Set the required environment variables

Minimum setup for basic app usage:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
FMP_API_KEY=...
```

Required for AI features:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-nano
```

Recommended for server-side ingestion, caches, and admin workflows:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional but commonly needed:

```env
DATA_PROVIDER=fmp
MASSIVE_API_KEY=...
NEXT_PUBLIC_CHARTING_URL=http://localhost:3001
NEXT_PUBLIC_COOKIE_DOMAIN=.theintraday.com
NEXT_PUBLIC_ENABLE_CHAT=false
NEXT_PUBLIC_ENABLE_LANDING=false
NEXT_PUBLIC_SHOW_STOCK_V1=false
NEXT_PUBLIC_ENABLE_MOVERS=true
```

Notes:

- `NEXT_PUBLIC_CHARTING_URL` is required for the embedded workspace experience.
- `MASSIVE_API_KEY` is required for real-time streaming and for `DATA_PROVIDER=massive`.
- `NEXT_PUBLIC_COOKIE_DOMAIN` is used for shared-auth cookie behavior across subdomains.
- `.env.local.example` is intentionally small and not exhaustive.

### 4. Run the app

```bash
npm run dev
```

This uses `scripts/dev.sh`, which checks that port `3000` is free and runs the Next dev server.

Open `http://localhost:3000`.

## Authentication

The app uses Supabase Auth, not Firebase. Client auth is wired through `@supabase/ssr`, and middleware refreshes session state and protects routes like `/profile` and `/admin`.

Relevant files:

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `middleware.ts`
- `app/auth/`

## Database and Migrations

Supabase migrations live in `supabase/migrations/`. The schema has grown beyond the original `company` and `financials_std` tables and now includes:

- Financial metrics
- SEC filings and filing chunks
- Query logs and prompt versions
- Conversations and messages
- Company metrics and segment data
- Insider trading tables
- Several cache tables for AI and market workflows

Start here:

- `supabase/migrations/README.md`
- `data/MIGRATIONS.md`

## Scripts

Common scripts:

- `npm run dev` start the app locally
- `npm run build` production build
- `npm run test:run` run Vitest once
- `npm run export` export to Excel
- `npm run export:catalog` export metric catalog
- `npm run setup:metrics` set up financial metrics tables/workflow
- `npm run fetch:metrics` fetch FMP metrics
- `npm run ingest:metrics` ingest fetched metrics
- `npm run generate:catalog` regenerate metric catalog
- `npm run refresh:stocks` refresh stock registry
- `npm run stocks:status` inspect stock-registry ingestion status
- `npm run ingest:segments` ingest segment data

There are many additional operational scripts under `scripts/` for:

- data ingestion
- filings download and chunking
- evaluation runs
- migration helpers
- newsletter generation
- debugging and verification

## Testing

Tests run with Vitest and JSDOM.

Current automated coverage is focused on a few high-value modules such as:

- workspace iframe behavior
- navigation and stock search
- validators
- TTM calculation
- stock “why moving” parsing

Run:

```bash
npm run test:run
```

## Dexter Package

The `dexter/` directory is a separate Bun-based project for autonomous financial research. The main app can call it through `/api/dexter-query`, but it has its own dependencies, runtime, and README.

See:

- `dexter/README.md`
- `app/api/dexter-query/route.ts`

## Docs

The `docs/` directory contains implementation plans, architecture notes, migration plans, and feature writeups. It is the best place to go deeper on a specific subsystem.

Especially relevant:

- workspace iframe integration
- charting platform integration
- market-data provider migration
- evaluation system
- Supabase migrations

## Current State

This README is intentionally high-level. The repo is active and contains both production paths and experimental surfaces. When in doubt, treat these files as the main entry points:

- `app/layout.tsx`
- `components/Navigation.tsx`
- `components/WorkspaceIframe.tsx`
- `lib/fetch-market-data.ts`
- `app/stock/[symbol]/page.tsx`
- `app/api/ask/route.ts`
- `app/actions/chart-metrics.ts`

