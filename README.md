# Fin Quote

Fin Quote is the main The Intraday web app. It is a Next.js 15 application that combines:

- Market dashboards
- Stock detail pages
- Financial statement and metric visualizations
- An embedded charting workspace
- AI-assisted market and financial analysis
- Admin tooling for evaluation, review, and cost tracking

The repository also includes a separate `dexter/` package used for deeper financial-research agent workflows.

The canonical product direction and delivery order live in
[`docs/CURRENT_ROADMAP.md`](docs/CURRENT_ROADMAP.md).

## What This Repo Contains

The current app is much broader than a basic “company financial data viewer”.

Main product areas:

- `Pulse Today` as the primary daily market cockpit, plus the broader Market Overview
- `Stock` pages for company-specific price, financial, news, and insider data
- `Workspace` routes that embed the separate charting platform inside a persistent iframe
- `Chatbot` and AI endpoints for financial Q&A, summaries, and experimentation
- `Newsletter` morning production, mid-morning deltas, reusable charts,
  Beehiiv delivery, publishing workflow, and HTML export
- `Admin` pages for catalyst review, model output, evaluations, and API cost usage

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

### Dashboard Chart of the Day

The Market Overview renders its featured fundamentals chart natively instead of
embedding the entire external charting workspace. The server resolves the saved
chart specification, loads only the selected annual or quarterly series, and
hands a compact presentation model to a theme-aware SVG chart. The full charting
workspace remains one click away for deeper editing.

Relevant files:

- `lib/dashboard/load-chart-of-the-day-presentation.ts`
- `lib/dashboard/chart-of-the-day-presentation.ts`
- `components/DashboardChartOfTheDay.tsx`

### Market Overview personalization

The Market Overview is organized as a progressive briefing: compact index
charts, price action, market context, notable cross-asset moves, one catalyst
timeline, and collapsed previews for deeper lower-page data. Browser-local,
versioned preferences remember the watchlist order, mover session, and expanded
sections without requiring sign-in. The watchlist supports adding, removing,
dragging, keyboard reordering, and restrained unusual-move markers.

Relevant files:

- `components/MarketDashboardSunday.tsx`
- `components/CatalystTimeline.tsx`
- `components/StocksTable.tsx`
- `components/useDashboardPreferences.ts`
- `lib/dashboard/preferences.ts`

## Key Routes

User-facing routes:

- `/dashboard`
- `/dashboard/pulse`
- `/dashboard/pulse-today`
- `/dashboard/morning-brief`
- `/dashboard/mid-morning-brief`
- `/newsletter/morning-review`
- `/newsletter/operations`
- `/newsletter/editor`
- `/newsletter/charts`
- `/dashboard/live`
- `/stock/[symbol]`
- `/workspace/chart`
- `/workspace/fundamentals`
- `/workspace/overview`
- `/calendar`
- `/insiders`
- `/chatbot` when enabled

Admin routes:

- `/admin`
- `/admin/why-moved`
- `/admin/chart-of-the-day`
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
NEWSLETTER_PUBLIC_CHARTING_URL=https://charts.theintraday.com
NEWSLETTER_RENDER_API_KEY=shared-render-service-secret
CRON_SECRET=scheduler-bearer-secret
NEWSLETTER_ALERT_WEBHOOK_URL=https://optional-alert-destination.example
BEEHIIV_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
BEEHIIV_PUBLICATION_ID=pub_optional-when-account-has-multiple-publications
NEXT_PUBLIC_COOKIE_DOMAIN=.theintraday.com
ADMIN_EMAILS=admin@example.com,ops@example.com
NEXT_PUBLIC_ENABLE_CHAT=false
NEXT_PUBLIC_ENABLE_LANDING=false
NEXT_PUBLIC_SHOW_STOCK_V1=false
NEXT_PUBLIC_SHOW_MOST_ACTIVE_TAB=false
NEXT_PUBLIC_ENABLE_MOVERS=true
```

Notes:

- `NEXT_PUBLIC_CHARTING_URL` is required for the embedded workspace experience.
- `NEWSLETTER_RENDER_API_KEY` must match the Charting Platform service. It
  authenticates server-rendered newsletter charts and enables the trusted
  batch-render allowance.
- `CRON_SECRET` protects the daily newsletter scheduler endpoint in production.
- `NEWSLETTER_ALERT_WEBHOOK_URL` is optional. When set, durable in-app
  completion, late, and failure notifications are also posted to that endpoint.
- `BEEHIIV_TOKEN_ENCRYPTION_KEY` encrypts Beehiiv OAuth tokens before they are
  stored. Generate a dedicated 32-byte key with `openssl rand -base64 32`.
- `MASSIVE_API_KEY` is required for real-time streaming and for `DATA_PROVIDER=massive`.
- `NEXT_PUBLIC_COOKIE_DOMAIN` is used for shared-auth cookie behavior across subdomains.
- `ADMIN_EMAILS` is the required server-side allowlist for `/admin` pages and
  protected newsletter generation. If it is missing or empty, admin access
  fails closed for every account.
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
- Durable daily newsletter runs, settings, and run items
- Durable newsletter notifications and mid-morning automation runs
- Beehiiv draft, scheduled, published, and reconciliation state

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
- `npm run wiim:brief -- --run-type morning --compare-latest` persist the
  ranked morning WIIM universe
- `npm run newsletter:run-automation -- --until-complete` advance Finviz,
  WIIM, original summaries, charts, and newsletter generation until the report
  is ready
- `npm run newsletter:run-mid-morning -- --until-complete` refresh live
  candidates, persist a second WIIM run, generate fresh top-five summaries, and
  calculate the delta from the morning report
- `npm run newsletter:verify-daily` verify a complete daily newsletter batch

There are many additional operational scripts under `scripts/` for:

- data ingestion
- filings download and chunking
- evaluation runs
- migration helpers
- newsletter generation
- debugging and verification

## Newsletter Operations

The weekday morning scheduler treats the configured generation hour as a
ready-by deadline. It begins up to three hours earlier, skips market holidays,
and retries bounded stages until noon ET. The mid-morning delta starts at
10:15 AM ET and has the same noon recovery boundary.

The Morning Report recommends five editorial candidates and exposes the full
delivery lifecycle on each issue:

```text
Generated -> Ready -> Beehiiv Draft -> Scheduled -> Published
```

Signed-in users can create, open, and synchronize a Beehiiv draft directly from
each report card. Scheduling and publishing remain explicit actions in Beehiiv;
the reconciliation job mirrors those states back into Fin Quote every 15
minutes and records publication metadata automatically.

The signed-in operator surface at `/newsletter/operations` combines morning and
mid-morning stage progress, provider counts, issue retries, Beehiiv lifecycle
state, notification history, and recent run durations. `Run now` advances one
leased stage immediately. A failed run exposes `Retry stage`, which resumes the
recorded failed stage without repeating completed collection work.

Production reports:

- `https://www.theintraday.com/newsletter/morning-review`
- `https://www.theintraday.com/dashboard/mid-morning-brief`

## Daily Newsletter Production

Open `http://localhost:3000/newsletter/morning-review` to review the daily
production queue.

The workflow is:

1. The morning WIIM job persists the full ranked candidate universe, not just
   the five stories shown in the brief.
2. The daily selector chooses 30, 40, or 50 current stories using source
   freshness, catalyst strength, move size, novelty, and generated-summary
   quality.
3. Each issue is created idempotently with source provenance, editorial copy,
   and a current one-month chart.
4. The review board exposes failures separately, supports resumable chart
   repair, and keeps clean issues selectable in one action.
5. `Select clean` followed by `Mark ready` moves the verified set into the
   existing Ready publishing stage.

From an issue editor, `Send to Beehiiv` creates an editable Beehiiv draft on
the first click and syncs the same draft on later clicks. The connection uses
Beehiiv MCP OAuth; no Beehiiv API key is stored in the browser. Publishing and
scheduling remain explicit review actions in Beehiiv. `HTML fallback` copies
the same rendered issue and opens a blank Beehiiv draft when MCP is unavailable.

Supabase Cron calls the protected Vercel worker every two minutes across a UTC
window that covers 5:00-8:00 AM New York time through daylight-saving changes.
Each invocation fits the Vercel Hobby 60-second function limit, atomically
leases the day, and advances one bounded, resumable stage: candidate collection,
Finviz refresh, WIIM ranking, original Fin Quote summaries, chart and email
generation, then final quality checks. Clean drafts are marked Ready
automatically. The Vault secret named `newsletter_daily_cron_secret` must match
the Vercel `CRON_SECRET`.

Configure exactly one production recipient with
`NEWSLETTER_AUTOMATION_OWNER_ID` (preferred) or
`NEWSLETTER_AUTOMATION_SESSION_ID`. During the weekday morning window, `/`
opens the finished report as soon as the automation reaches a terminal state.

Before treating a run as complete, execute:

```bash
npm run newsletter:verify-daily -- \
  --run-id <newsletter_daily_runs.id> \
  --expect 40 \
  --require-ready
```

The verifier checks counters, statuses, uniqueness, current source evidence,
directional consistency, complete copy, provenance, chart linkage, distinct
PNG files, minimum dimensions, and nonblank image content.

## Testing

Tests run with Vitest and JSDOM.

Current automated coverage is focused on a few high-value modules such as:

- workspace iframe behavior
- navigation and stock search
- validators
- TTM calculation
- stock “why moving” parsing
- Chart of the Day data shaping and native rendering
- dashboard preference parsing, editable watchlists, and catalyst ordering

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
