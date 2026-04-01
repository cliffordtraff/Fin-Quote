# FORFORD.md - The Story Behind The Intraday

*A financial data platform that started as a simple quote viewer and evolved into something far more ambitious.*

---

## What Is This Thing?

**The Intraday** is a Next.js 15/React 19 financial data platform. Think of it as Bloomberg Terminal's younger, cooler cousin who doesn't charge $24,000 per year. It started life as "Fin Quote" (you can still see that in the git history), but like most projects that grow beyond their original scope, it needed a name that matched its ambitions.

At its core, the platform does several things:

1. **Shows you the markets** - Real-time dashboards with S&P 500, NASDAQ, DOW, sector heatmaps, gainers/losers, futures, VIX, earnings calendars, economic events — basically everything a trader glances at before their morning coffee.

2. **Deep stock analysis** - Individual stock pages with price charts, key stats, financial statements, insider trades, and AI-generated "why is this moving?" context.

3. **Lets you chat with financial data** - An AI chatbot that answers questions about stocks using actual database queries, not hallucinated numbers.

4. **Tracks insider trades** - Because if the CEO is dumping shares, you might want to know about it.

5. **Generates newsletters** - A 16-file pipeline that orchestrates data fetching, chart generation (with Puppeteer screenshots), editorial content generation, and email assembly.

6. **Persistent charting workspace** - An iframe-based workspace that keeps chart state alive across navigation, communicating with the host app via postMessage.

---

## The Architecture (Or: Why We Made These Choices)

### The Big Picture

```
Browser  <-->  Next.js App Router  <-->  Server Actions / API Routes
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
              Data Providers            Supabase (DB)            OpenAI (AI)
              (FMP / Massive)           (PostgreSQL +            (GPT models)
                    |                    pgvector)
              External APIs
        (FMP, Polygon.io, SEC)
```

The architecture follows a **server-centric** pattern. Most data fetching happens on the server through Next.js Server Actions (the `'use server'` directive), with the client primarily rendering pre-fetched data and polling for updates. This keeps API keys server-side and lets you leverage ISR (Incremental Static Regeneration) for caching.

### The Data Provider Abstraction — Swapping Engines Mid-Flight

One of the smartest architectural decisions is the **provider abstraction layer** in `lib/providers/`. Instead of hardcoding calls to a specific financial API, all market data flows through a `MarketDataProvider` interface:

```typescript
interface MarketDataProvider {
  getQuote(symbol: string): Promise<ProviderQuote | null>
  getQuotes(symbols: string[]): Promise<ProviderQuote[]>
  getIntraday(...): Promise<ProviderCandle[]>
  getHistoricalDaily(...): Promise<ProviderCandle[]>
  getGainers(): Promise<ProviderQuote[]>
  getLosers(): Promise<ProviderQuote[]>
  getSnapshot(tickers?): Promise<ProviderQuote[]>
  getNews(symbol, limit?): Promise<ProviderNews[]>
}
```

Two implementations exist: `FMPProvider` (Financial Modeling Prep) and `MassiveProvider` (Polygon.io). Switching between them is a single environment variable: `DATA_PROVIDER=massive`. The factory in `lib/providers/index.ts` caches the active provider for the process lifetime.

**Why this matters:** Financial data APIs are expensive. Providers change pricing, rate limits, and data quality. Having a clean abstraction means you can switch providers (or add new ones) without touching any of the 60+ server actions that consume market data. This is the **Strategy Pattern** done right in a real-world setting.

### The Dashboard Data Pipeline — 25 Parallel Requests

The dashboard (`lib/fetch-market-data.ts`) is the most complex data orchestration in the app. When you load the market dashboard, it fires off **25+ parallel requests**:

- Major indices (SPX, NASDAQ, DOW, Russell)
- Session-aware movers (premarket, regular, afterhours)
- S&P 500 top gainers/losers with sparklines
- Futures with YTD history
- Sector performance
- Economic calendar, earnings calendar
- Market news, insider trades
- Global indices, forex/bonds
- An AI-generated market summary and trend bullets

All wrapped in `Promise.all()` with individual `.catch(() => null)` fallbacks. If the futures API is down, you still get everything else.

The data is split into "fast" and "slow" tiers, exposed through `/api/market-snapshot/fast` and `/api/market-snapshot/slow`, so the UI can show quick data immediately and fill in the rest progressively.

### The WebSocket Broker — Real-Time Without the Chaos

`lib/ws/massive-broker.ts` is probably the most carefully engineered piece of infrastructure in the codebase. It's a singleton WebSocket broker that:

1. **Multiplexes subscriptions** — Multiple UI components can subscribe to the same ticker without opening duplicate connections
2. **Aggregates candles** — Raw 1-second market data gets bucketed into 10-second candles server-side
3. **30-second grace period** before disconnecting — prevents rapid connect/disconnect churn when users navigate between pages
4. **Exponential backoff reconnection** — retries with increasing delays up to 30 seconds
5. **Circuit breaker** — After 3 consecutive auth failures, it stops trying

This is the kind of code that separates production systems from demos. The grace period alone prevents a common bug where switching between stock pages causes connection storms.

### The Two-Step LLM Flow: Teaching AI to Be Honest

Here's the central problem with AI chatbots that answer financial questions: **LLMs lie.** Not maliciously — they're just really confident about things they made up.

The solution: **Never let the LLM touch real data directly.**

```
User Question → Step 1: LLM picks a tool → Step 2: Server runs the query
              → Step 3: LLM writes answer using ONLY fetched data
              → Step 4: Validator checks the answer against source
```

The LLM's job in Step 1 is purely routing — it returns JSON like `{"tool": "getFinancialsByMetric", "args": {"symbol": "AAPL", "metric": "revenue"}}`. Then the server executes the query. Only then does the LLM compose an answer, constrained to the actual data.

Step 4 validates: extracts every number from the answer, compares against source data (±2% tolerance), checks that cited years exist in the data. If validation fails, the answer is regenerated or flagged for human review.

The streaming pipeline uses SSE (Server-Sent Events) through `/api/ask`, emitting events for each stage: `flow`, `data`, `answer`, `validation`, `followup`, `complete`.

### The Newsletter System — A Mini Publishing Platform

The `lib/newsletter/` directory is a 16-file pipeline that reads like a small publishing company:

- `fetch-context.ts` (26KB) — Aggregates market data for newsletter content
- `orchestrate.ts` (26KB) — Multi-step workflow coordination
- `prompts.ts` (28KB) — Editorial AI prompts
- `assemble.ts` (16KB) — Email composition
- `capture.ts` — Puppeteer screenshots of the charting platform
- `drafts.ts` (23KB) — Draft persistence and management

### The Persistent Workspace — Iframe State Survival

The workspace uses a persistent iframe (`components/WorkspaceIframe.tsx`, 19KB) that stays mounted across route changes. Chart state (zoom level, indicators, drawings) survives navigation. Communication happens via `postMessage`. This is pragmatic — rather than fighting React's lifecycle to preserve complex charting state, the iframe is simply always there, shown or hidden as needed.

---

## The Codebase by the Numbers

| Metric | Count |
|--------|-------|
| TypeScript/TSX files | 500+ |
| Server actions | 60+ |
| React components | 76+ |
| API route handlers | 25+ |
| Test files | 26+ |
| NPM scripts | 17 |
| Lines in database.types.ts | 900+ |

### Directory Structure

```
app/
  actions/          # 60+ server actions (the data layer)
  api/              # 25+ API route handlers (streaming, webhooks, snapshots)
  dashboard/        # Market overview (ISR, revalidate=60)
  stock/[symbol]/   # Individual stock pages (ISR, revalidate=60)
  workspace/        # Persistent iframe shell
  admin/            # Admin tools (costs, validation, review, evaluations)
  chatbot/          # AI Q&A interface
  auth/             # Authentication (Google OAuth via Supabase)

components/         # 76+ React components
  landing/          # Marketing site components (10 files)
  __tests__/        # 10 component test files

lib/
  providers/        # FMP + Massive data provider abstraction
  supabase/         # Database clients (browser, server, service-role)
  ws/               # WebSocket broker (massive-broker.ts)
  newsletter/       # Newsletter generation pipeline (16 files)
  hooks/            # Custom hooks (useLiveStream, useReplay, useMultiStream)
  dashboard/        # Chart-of-the-day feature
  tools.ts          # AI tool definitions (45KB)
  validators.ts     # Zod validation schemas (29KB)
  chart-helpers.ts  # Chart rendering helpers (24KB)
  metric-metadata.ts # 139+ metric descriptions (30KB)
  database.types.ts # Auto-generated Supabase types (36KB)

scripts/            # 100+ ingestion, migration, and utility scripts
```

---

## The Tech Stack and Why

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Next.js 15 (App Router) | Server Actions = less infrastructure. ISR = free caching. Layout system enables persistent iframe. |
| **React** | React 19 RC | Concurrent features and Suspense boundaries throughout |
| **Database** | Supabase (PostgreSQL + pgvector) | Auth, database, and vector store in one. Generous free tier. |
| **Auth** | Supabase Auth | Google OAuth out of the box |
| **LLM** | OpenAI (gpt-5-nano) | Cheap, fast, reliable for tool selection |
| **Charts** | Highcharts + lightweight-charts | Highcharts for complex multi-metric. LWC for performant candlesticks. |
| **Styling** | Tailwind CSS | Custom sage/cream theme with dark mode via class toggle |
| **Validation** | Zod 4 | Runtime validation at system boundaries |
| **Testing** | Vitest + Testing Library | Fast, modern, React component support |
| **Browser Automation** | Puppeteer | Newsletter chart screenshots |
| **Data** | FMP API + Massive/Polygon.io | Abstracted behind provider interface |

---

## Lessons Learned (The Hard Way)

### 1. The Hardcoded API Key Problem

**Bug found during this review:** Four script files contain a hardcoded FMP API key as a fallback: `process.env.FMP_API_KEY || '9gzCQW...'`. This is dangerous because:
- Scripts get committed to git. Git history is forever.
- Fallback keys mean the script "works" even when env isn't configured, hiding configuration problems.
- The production code in `lib/providers/fmp.ts` does it right — it throws if `FMP_API_KEY` is not set.

**Lesson:** Convenience fallbacks for secrets create a false sense of security. Make missing configuration loud and immediate. Always fail fast.

### 2. The `any` Type Epidemic

The codebase has `strict: true` in tsconfig.json — great. But there are **100+ explicit `any` annotations** that bypass the type checker. Like having a burglar alarm with the back door open.

The worst areas:
- **Provider response handling** — External API responses typed as `any` means field name typos become runtime bugs instead of compile-time errors
- **Highcharts formatters** — The `this` context is genuinely hard to type (justified `any` with eslint-disable)
- **Error catch blocks** — `catch (err: any)` everywhere; `unknown` is safer and purpose-built for this

**Lesson:** `any` is technical debt that compounds. Start with `unknown` and narrow.

### 3. Graceful Degradation is Non-Negotiable

The dashboard's approach is exemplary:

```typescript
const [indices, movers, futures, ...rest] = await Promise.all([
  fetchIndices().catch(() => null),
  fetchMovers().catch(() => []),
  fetchFutures().catch(() => null),
  // ... 20 more
])
```

If any source fails, the rest still load. This is crucial when aggregating 25+ external sources — without isolated failure handling, one flaky API blanks the entire page.

**Lesson:** In systems that aggregate multiple data sources, always isolate failures. Let each source fail independently.

### 4. The ISR + Polling Sweet Spot

Dashboard and stock pages use `revalidate = 60` — regenerated at most once per minute. The home page uses `force-dynamic`. During market hours, client-side polling supplements with fresh data every 30 seconds.

**Lesson:** Not everything needs to be real-time. Choose caching strategy based on user expectations and cost constraints, not engineering purity.

### 5. The Suspense Boundary Saga

React 19 + Next.js 15 is opinionated about client-side hooks. `useSearchParams()` in a client component without a Suspense boundary = build failure. The git history tells the story:
- `Add Suspense wrapper for homepage useSearchParams`
- `Wrap chatbot page in Suspense for useSearchParams`

**Lesson:** When upgrading to Next.js 15, grep for `useSearchParams` and add Suspense boundaries preemptively.

### 6. Quarterly Data is a Rabbit Hole

Annual data is easy. Quarterly is a nightmare:
- Q4 isn't always reported separately (derived from annual minus Q1-Q3)
- Fiscal years don't match calendar years
- TTM needs the *right* 4 quarters, not just any 4
- FMP API returns data differently than SEC filings

We built a whole TTM system (`lib/ttm-calculator.ts`, `lib/ttm-config.ts`) with per-metric aggregation strategies: `sum` for flows, `point_in_time` for balance sheet, `derived` for recalculated ratios.

**Lesson:** If a feature sounds simple ("just add quarterly data"), triple your time estimate.

### 7. The Missing ESLint Configuration

There's no custom ESLint configuration — only Next.js defaults. For 500+ files, this is a missed opportunity. Custom rules could have prevented the `any` proliferation, inconsistent error handling, and console.log in production code.

**Lesson:** Set up linting rules early. The cost of adding them later increases exponentially with codebase size.

### 8. Server Actions vs. API Routes — Know When to Use Each

The codebase uses both, and the split follows a clear pattern:
- **Server Actions** for data consumed by server components (dashboard data, stock data, financials)
- **API Routes** for streaming (SSE for the chatbot), external integrations, and endpoints needing HTTP-level control (custom headers, cache directives, WebSocket upgrades)

**Lesson:** Server Actions aren't a replacement for API routes — they're a complement. Use Server Actions for the common case and API routes when you need protocol-level control.

---

## How Good Engineers Think (Patterns from This Codebase)

### 1. Abstractions Over External Dependencies Pay Off

The provider abstraction (`lib/providers/`) lets you compare data quality between providers, failover during outages, negotiate pricing, or add new sources — by changing one file instead of 60+.

### 2. Make Invalid States Impossible

The tool selection system doesn't hope the LLM returns valid JSON. It validates:
```typescript
const parsed = JSON.parse(response)
if (!VALID_TOOLS.includes(parsed.tool)) {
  throw new Error(`Invalid tool: ${parsed.tool}`)
}
```

### 3. Log Everything in Development

The chatbot logs tool selection time, data fetch time, answer generation time, validation results, and token usage. When something breaks, you know exactly where.

### 4. Feature Flags for Safety

```bash
NEXT_PUBLIC_ENABLE_CHAT=false
NEXT_PUBLIC_ENABLE_LANDING=false
NEXT_PUBLIC_SHOW_STOCK_V1=false
```

New features stay hidden until ready. The code is deployed but invisible until the flag flips.

### 5. Think About Human Interaction Patterns

The WebSocket broker's 30-second grace period exists because users navigate back and forth. Network connections are expensive to establish. A small delay before cleanup dramatically improves perceived performance.

### 6. Progressive Loading is User Respect

Fast/slow data tiers, SSE streaming, Suspense boundaries — the user sees something useful immediately, with richer data filling in over seconds. Never make users stare at a spinner when you could show partial results.

---

## What's Worth Improving

Based on a thorough review of the codebase:

1. **Replace `any` with proper types** — Start with provider layer and server actions. Use `unknown` for catch blocks. Highest-impact type safety improvement.

2. **Remove hardcoded API keys** from scripts. Rotate the exposed key immediately.

3. **Add custom ESLint rules** — At minimum: `no-explicit-any` (warn), `no-console` (warn for production code).

4. **Replace console.log with structured logging** in production code, especially `lib/ws/massive-broker.ts` (8 instances).

5. **Break up large components** — `PulseTodayDashboard.tsx` (113KB) and `MultiMetricChart.tsx` (56KB) need decomposition.

6. **Increase test coverage** — 26 test files for 500+ source files. The critical paths (providers, server actions, WebSocket broker) need more tests.

7. **Add React error boundaries** at the route level to prevent single-component crashes from blanking pages.

---

## Parting Thoughts

This project started as a simple experiment: "Can we make an AI that answers financial questions without lying?" The answer is yes, but it takes architecture.

The two-step LLM flow, the validation system, the provider abstraction, the graceful degradation, the WebSocket lifecycle management — they all exist because the team took the hard road. They could have shipped a chatbot that hallucinates numbers and hoped users wouldn't notice. Instead, they built something that checks its own work.

The codebase isn't pristine — there are `any` types, hardcoded keys, and components that need splitting. But the architectural decisions show experienced thinking about the problems that actually matter in production. The code works, scales reasonably, and can be maintained by someone who didn't write it.

That's the bar.

---

*Last updated: April 2026*
