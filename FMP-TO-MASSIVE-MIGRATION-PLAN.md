# FMP → Massive (Polygon.io) API Migration Plan

> **For Codex:** Please review this migration plan critically. Evaluate the architecture, phasing, risk areas, and any blind spots. Then add an **Addendum** section at the end of this document with your recommendations, improvements, and any concerns. Be specific — reference file paths, API endpoints, and implementation details where relevant. After this is fed back to Claude Code, it will implement the recommendations it agrees with and annotate any it disagrees with (and why), so we have a full decision archive.

---

## Context

The Intraday (a Next.js 15 financial data platform) currently relies entirely on FMP (Financial Modeling Prep) for market data across 50+ files. We're migrating to Massive (formerly Polygon.io) for:
- **WebSocket real-time streaming** — replace 5s HTTP polling with true real-time price updates
- **1-second and 10-second candle charts** — FMP's finest granularity is 1 minute
- **Better data quality** — Massive is a direct SIP (Securities Information Processor) feed
- **11,400+ indices and full futures support**

Plan: Stocks Advanced (~$200/month).

## Tech Stack Context

- Next.js 15 (App Router) with React 19
- Supabase (PostgreSQL + pgvector) for data storage
- Tailwind CSS, TypeScript, Vitest
- Liveline charting library for real-time canvas charts
- FMP API for all market data currently
- Server actions pattern (`app/actions/`) for data fetching
- ISR (60s revalidation) on dashboard, dynamic rendering on stock pages

## Key API Differences

| | FMP | Massive |
|---|---|---|
| **Auth** | Query param `?apikey=` | Header `X-API-KEY` |
| **Base URL** | `financialmodelingprep.com/api/v3/` | `api.massive.com/v2/` |
| **Quote** | `/v3/quote/AAPL` → array | `/v3/snapshot?ticker=AAPL` → nested object |
| **OHLC** | Separate endpoints per interval | Single endpoint: `/v2/aggs/ticker/{T}/range/{mult}/{span}/{from}/{to}` |
| **Candle format** | `{ date: "2025-03-10 15:55:00", open, high, low, close }` | `{ t: 1710100500000, o, h, l, c, v }` (epoch ms) |
| **Index symbols** | `^GSPC`, `^DJI`, `^IXIC` | `I:SPX`, `I:DJI`, `I:COMP` |
| **Futures** | `ES=F`, `NQ=F` | Dedicated futures endpoint |
| **WebSocket** | None | `wss://socket.massive.com` — Q (quotes), AM (per-min), AS (per-sec) |

## What Massive Does NOT Cover (Keep FMP)

These endpoints have no Massive equivalent — keep FMP_API_KEY for them:
- **Economic Calendar** — `app/actions/economic-calendar.ts`
- **Earnings Calendar** — `app/actions/earnings-calendar.ts`
- **Insider Trading ingestion** — `scripts/ingest-fmp-insiders.ts`, `scripts/ingest-sp500-insiders.ts`
- **Shares Float bulk** — `/v4/shares_float/all` in `scan-extended-hours.ts`
- **Key Metrics / Ratios** — `/v3/key-metrics/`, `/v3/ratios/` in `stock-key-stats.ts`

**Sector performance** (`sectors.ts`) — replace with Sector SPDR ETF quotes (XLK, XLF, XLE, etc.) via Massive instead of FMP's `/v3/sectors-performance`.

---

## Phase 0: Provider Abstraction Layer

**Goal:** Create an adapter layer so server actions call provider-agnostic functions. Switch providers via env var.

### Create: `lib/providers/types.ts`
Canonical types matching what consumers already expect:
```typescript
interface ProviderQuote { symbol, name, price, change, changesPercentage, previousClose?, volume?, ... }
interface ProviderCandle { date: string, open, high, low, close, volume }
interface MarketDataProvider {
  getQuote(symbol): Promise<ProviderQuote | null>
  getQuotes(symbols): Promise<ProviderQuote[]>
  getIntraday(symbol, multiplier, timespan, from?, to?): Promise<ProviderCandle[]>
  getHistoricalDaily(symbol, from, to?): Promise<ProviderCandle[]>
  getGainers(): Promise<ProviderQuote[]>
  getLosers(): Promise<ProviderQuote[]>
  getSnapshot(tickers?): Promise<ProviderQuote[]>
}
```

### Create: `lib/providers/fmp.ts`
Wrap existing FMP fetch patterns into the provider interface. No behavior change — this just refactors existing code behind the interface.

### Create: `lib/providers/massive.ts`
Massive implementation with:
- **Symbol mapping table:** `^GSPC` → `I:SPX`, `^DJI` → `I:DJI`, `^IXIC` → `I:COMP`, `^RUT` → `I:RUT`, `^VIX` → `I:VIX`
- **Timestamp conversion:** Massive epoch ms → FMP-style `"YYYY-MM-DD HH:mm:ss"` Eastern time strings (critical — dozens of `.date.split(' ')` calls throughout codebase)
- **Response mapping:** Massive's nested snapshot → flat `ProviderQuote`

### Create: `lib/providers/index.ts`
```typescript
export function getProvider(): MarketDataProvider {
  const provider = process.env.DATA_PROVIDER || 'fmp'
  return provider === 'massive' ? new MassiveProvider() : new FMPProvider()
}
```

### Env vars
```bash
DATA_PROVIDER=massive          # Switch provider (default: fmp)
MASSIVE_API_KEY=<key>
FMP_API_KEY=...                # Keep for calendar/insider/metrics endpoints
```

---

## Phase 1: Migrate Quote Endpoints (~15 files)

The most-used FMP endpoint. Each file can be migrated and tested independently.

| File | Current FMP Call | Massive Equivalent |
|------|------------------|--------------------|
| `app/api/quote/[symbol]/route.ts` | `/v3/quote/{sym}` | `provider.getQuote()` |
| `app/api/stock-intraday/[symbol]/route.ts` | `/v3/quote/{sym}` | `provider.getQuote()` |
| `app/actions/stocks.ts` | `/v3/quote/AAPL,NVDA,...` | `provider.getQuotes()` |
| `app/actions/vix.ts` | `/v3/quote/^VIX` | `provider.getQuote('I:VIX')` |
| `app/actions/futures.ts` | `/v3/quote/ES=F,...` | `provider.getQuotes()` |
| `app/actions/stock-overview.ts` | `/v3/quote/{sym}` | `provider.getQuote()` |
| `app/actions/stock-sparkline.ts` | `/v3/quote/{sym}` | `provider.getQuote()` |
| `app/actions/sparkline-indices.ts` | `/v3/quote/{sym}` × 5 indices | `provider.getQuotes()` |
| `app/actions/global-indices.ts` | `/v3/quote/{syms}` | `provider.getQuotes()` |
| `app/actions/stock-key-stats.ts` | `/v3/quote/{sym}` | `provider.getQuote()` (metrics/ratios stay FMP) |
| `app/actions/sp500-movers.ts` | `/v3/quote/{100 syms}` × 5 batches | `provider.getSnapshot()` (single call!) |
| `app/actions/advance-decline.ts` | `/v3/quote/{syms}` | `provider.getSnapshot()` |
| `app/actions/sp500-distribution.ts` | `/v3/quote/{syms}` | `provider.getSnapshot()` |
| `app/actions/market-breadth.ts` | `/v3/quote/{syms}` | `provider.getSnapshot()` |
| `app/actions/discover-stocks.ts` | `/v3/quote/{syms}` | `provider.getQuotes()` |
| `app/actions/mag7-returns.ts` | `/v3/quote/{syms}` | `provider.getQuotes()` |
| `app/actions/forex-bonds.ts` | `/v3/quote/{syms}` | `provider.getQuotes()` |

**Massive efficiency win:** FMP requires batching 500 S&P stocks into 5 requests of 100. Massive's `/v2/snapshot/locale/us/markets/stocks/tickers` returns ALL tickers in one call.

---

## Phase 2: Migrate Historical & Intraday Data (~10 files)

All map to Massive's single aggregates endpoint: `/v2/aggs/ticker/{T}/range/{mult}/{span}/{from}/{to}`

| File | FMP Endpoint | Massive `range` params |
|------|--------------|----------------------|
| `app/actions/stock-intraday-ohlc.ts` | `historical-chart/5min/{sym}` | `5/minute/{from}/{to}` |
| `app/actions/sparkline-indices.ts` | `historical-chart/1min/{sym}` | `1/minute/{from}/{to}` |
| `app/actions/stock-sparkline.ts` | `historical-chart/5min/{sym}` | `5/minute/{from}/{to}` |
| `app/actions/market-data.ts` (782 lines, 5 functions) | `historical-chart/1min/{sym}` + `historical-price-full` | `1/minute` + `1/day` |
| `app/actions/prices.ts` | `historical-price-full`, `1hour`, `4hour` | `1/day`, `1/hour`, `4/hour` |
| `app/actions/vix.ts` | `historical-price-full/^VIX` | `I:VIX` `1/day` |
| `app/actions/futures.ts` | `historical-price-full/{sym}` | `1/day` |
| `app/actions/sp500-gainer-sparklines.ts` | `historical-chart/5min/{sym}` | `5/minute` |
| `app/actions/sp500-loser-sparklines.ts` | `historical-chart/5min/{sym}` | `5/minute` |

**Refactor opportunity:** `market-data.ts` has 5 near-identical functions (`getAaplMarketData`, `getNasdaqMarketData`, etc.). Collapse into one generic `getIndexMarketData(symbol)`.

**Critical: Timestamp conversion.** Massive returns epoch ms, code expects `"YYYY-MM-DD HH:mm:ss"`. The adapter must convert to Eastern time strings — dozens of `.date.split(' ')[0]` calls depend on this format.

---

## Phase 3: Migrate Market Movers (~6 files)

| File | FMP Endpoint | Massive Equivalent |
|------|--------------|-------------------|
| `app/actions/gainers.ts` | `stock_market/gainers` | `/v2/snapshot/.../gainers` |
| `app/actions/losers.ts` | `stock_market/losers` | `/v2/snapshot/.../losers` |
| `app/actions/most-active.ts` | `stock_market/actives` | Snapshot sorted by volume |
| `app/actions/market-movers.ts` | `pre_market_gainers`, `aftermarket_gainers`, etc. | Full snapshot includes extended hours |
| `app/actions/scan-extended-hours.ts` | `quotes/nasdaq` + `quotes/nyse` (17 API calls) | Single snapshot call |
| `app/actions/trending-stocks.ts` | `stock_market/actives` | Snapshot sorted by volume |

**Massive efficiency win:** `scan-extended-hours.ts` currently makes ~17 FMP calls to scan all NYSE+NASDAQ. Massive's full snapshot returns everything in one call with extended hours data included.

---

## Phase 4: Migrate Financial Data & Company Info (~5 files)

| File | FMP Endpoint | Massive Equivalent | Notes |
|------|--------------|-------------------|-------|
| `app/actions/get-company-profile.ts` | `/v3/profile/{sym}` | `/v3/reference/tickers/{sym}` | Massive has less detail; may keep FMP |
| `app/actions/get-income-statement.ts` | `/v3/income-statement/{sym}` | `/vX/reference/financials` | Massive's `vX` is experimental |
| `app/actions/get-stock-news.ts` | `/v3/stock_news` | `/v2/reference/news?ticker=` | Direct mapping |
| `app/actions/get-market-news.ts` | `/v4/general_news` | `/v2/reference/news` | No ticker filter |
| `app/actions/sectors.ts` | `/v3/sectors-performance` | Compute from SPDR ETF quotes | XLK, XLF, XLE, XLV, etc. |

---

## Phase 5: WebSocket Integration for Live Dashboard

**The big upgrade.** Replace HTTP polling with real-time streaming.

### Create: `app/api/live-prices/route.ts` — SSE bridge
Next.js doesn't support WebSocket routes, so use Server-Sent Events:
- Server connects to `wss://socket.massive.com/stocks` with API key
- Authenticates: `{ action: 'auth', params: MASSIVE_API_KEY }`
- Subscribes to requested symbols: `{ action: 'subscribe', params: 'Q.AAPL,AM.AAPL' }`
- Streams quote updates to client via SSE (`text/event-stream`)
- Accepts query params: `?symbols=AAPL,ES=F&channels=Q,AM`

### Modify: `components/LiveDashboard.tsx`
- Replace Poll 3 (5s `/api/quote/` HTTP) with `EventSource('/api/live-prices?symbols=ES=F&channels=Q')`
- On each SSE message: update `livePrice`, `liveCandle` — Liveline animates smoothly
- Subscribe to `AM` channel for per-minute candle updates (new candles appear in real-time)
- Keep Poll 1 (30s gainers refresh) as HTTP
- On symbol change: close old EventSource, open new one with new symbol

### Upgrade candle resolution on Live Dashboard
- Switch from 5-min candles to **10-second candles** via `/v2/aggs/ticker/{T}/range/10/second/{from}/{to}`
- Or use `AS` (per-second aggregates) WebSocket channel for indices
- Update `candleWidth` prop in Liveline from 300 to match new candle width

---

## Phase 6: Cleanup

- Remove direct FMP calls from all migrated files
- Update `.env.local.example` — document which keys are needed for what
- Update `CLAUDE.md` to reflect new architecture
- Delete FMP test scripts (`scripts/test-fmp-*.mjs`)
- Update chatbot tool descriptions in `lib/tools.ts`

---

## Implementation Order

| Phase | What | Files | Can deploy independently? |
|-------|------|-------|--------------------------|
| 0 | Provider abstraction | 4 new files in `lib/providers/` | Yes (no behavior change) |
| 1 | Quotes (~15 files) | Replace FMP quote calls with `provider.getQuote()` | Yes (env var toggle) |
| 2 | Historical/Intraday (~10 files) | Replace FMP candle calls with `provider.getIntraday()` | Yes |
| 3 | Market Movers (~6 files) | Replace gainers/losers/scan with snapshot | Yes |
| 4 | Financials (~5 files) | Company profiles, news, income statements | Yes |
| 5 | WebSocket + Live Dashboard | SSE bridge + real-time Liveline | Yes |
| 6 | Cleanup | Remove dead FMP code, update docs | Yes |

## Verification

After each phase:
1. Run `npm run dev` — all pages render without errors
2. Dashboard loads with real data (quotes, charts, movers)
3. Live Dashboard shows real-time price updates (Phase 5+)
4. Toggle `DATA_PROVIDER=fmp` / `DATA_PROVIDER=massive` — both work
5. Economic calendar and earnings still load (always FMP)
6. `npm run build` succeeds with no TS errors

## Gotchas

1. **Timestamp format** — Most critical bug source. Massive returns epoch ms, code expects `"YYYY-MM-DD HH:mm:ss"`. The adapter MUST convert, and specifically to Eastern time.
2. **Pagination** — Massive caps at 50,000 results per request. Large date ranges need `next_url` pagination. FMP doesn't paginate.
3. **Index symbols** — Not all FMP indices have Massive equivalents (Shanghai SSE `000001.SS`, Mumbai SENSEX `^BSESN`). Verify during Phase 1.
4. **Pre/post-market movers** — Massive has no dedicated pre/post-market gainer endpoints. Use full snapshot with extended hours data instead.
5. **Rate limits** — Stocks Advanced plan allows high throughput but full snapshot is rate-limited differently. The batch consolidation (500 stocks → 1 call) helps.

---

## Codebase File Map (for Codex reference)

Key directories:
- `app/actions/` — Server actions that fetch from FMP (this is where most migration happens)
- `app/api/` — API routes with in-memory caching layers
- `components/` — React components consuming the data
- `lib/` — Utilities, types, and helpers
- `app/dashboard/` — Dashboard pages (main + live)
- `app/stock/` — Individual stock pages

Current polling architecture on Live Dashboard (`components/LiveDashboard.tsx`):
- **Poll 1 (30s):** Refreshes gainers list + ES futures OHLC data
- **Poll 2 (30s):** Refreshes selected gainer's OHLC data
- **Poll 3 (5s):** Fast quote polling for live price animation (feeds into Liveline's `value` and `liveCandle` props)

The Liveline chart library (`liveline` npm package) expects:
- `data`: array of `{ time: number, value: number }` for line mode
- `candles` + `liveCandle`: `CandlePoint[]` for candlestick mode
- `value`: current live price (animates smoothly on change)
- `window`: viewport width in seconds (anchored to `now`)

---

## Codex Addendum

> **Instructions for Codex:** Add your review, critique, and recommendations below this line. Be specific about what you'd change, add, or remove from this plan. Reference specific files, phases, and implementation details. Claude Code will then review your addendum, implement what it agrees with, and annotate disagreements with reasoning.

<!-- Codex: write your addendum below -->

### 1. Re-scope Phase 0 around instrument classes, not one flat provider

The proposed `MarketDataProvider` is too stock-centric for the current codebase. The app already mixes:
- **Stocks** in `app/actions/stocks.ts`, `app/api/quote/[symbol]/route.ts`, `app/actions/sp500-movers.ts`
- **Indices** in `app/actions/vix.ts`, `app/actions/sparkline-indices.ts`, `app/actions/global-indices.ts`
- **Futures** in `app/actions/futures.ts`, `app/actions/market-data.ts`, `app/dashboard/live/page.tsx`
- **Forex / Crypto / Rates** in `app/actions/forex-bonds.ts`

Massive splits those across different endpoint families and symbol namespaces:
- Stocks: `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`, `GET /v2/aggs/ticker/{ticker}/range/{mult}/{span}/{from}/{to}`
- Indices: `GET /v3/snapshot/indices`, `GET /v2/aggs/ticker/I:SPX/range/{mult}/{span}/{from}/{to}`
- Futures: `GET /futures/vX/snapshot`, `GET /futures/vX/aggs/{ticker}`
- Forex: `GET /v2/snapshot/locale/global/markets/forex/tickers/C:EURUSD`
- Crypto: `GET /v2/snapshot/locale/global/markets/crypto/tickers/X:BTCUSD`
- Treasury yields: `GET /fed/v1/treasury-yields`

**Recommendation:** introduce `InstrumentType` plus sub-providers (`stocks`, `indices`, `futures`, `forex`, `crypto`, `rates`) behind a thin router, instead of forcing everything through one stock-shaped interface.

### 2. Futures are the biggest migration blind spot

This draft treats FMP futures aliases (`ES=F`, `NQ=F`, `CL=F`, `GC=F`, `RTY=F`) as if Massive accepts the same symbols. It does not. Massive futures APIs use real contract tickers (for example `ESZ4`) plus discovery endpoints:
- `GET /futures/vX/products`
- `GET /futures/vX/contracts`
- `GET /futures/vX/schedules`

That affects at least:
- `app/actions/futures.ts`
- `app/actions/global-indices.ts`
- `app/actions/market-data.ts`
- `app/actions/stock-intraday-ohlc.ts`
- `components/LiveDashboard.tsx`
- `app/dashboard/live/page.tsx`

**Recommendation:** add a dedicated front-month resolver before migrating futures. It should:
- map product aliases (`ES`, `NQ`, `CL`, `GC`, `RTY`) to Massive product codes
- resolve the active/front contract for a given date
- cache rollover results
- expose both the resolved contract ticker and a stable internal alias (`es_front`, `nq_front`, etc.)

If the live dashboard must stay on **S&P 500 futures**, do not silently replace it with `I:SPX`; that would remove overnight session behavior and materially change the product.

### 3. Current symbol validation will reject valid Massive symbols

Both of these routes currently reject most Massive-native symbols:
- `app/api/quote/[symbol]/route.ts`
- `app/api/stock-intraday/[symbol]/route.ts`

Their regex only accepts `^[A-Z]{1,5}(=[A-Z])?$`, which excludes:
- `I:SPX`, `I:VIX`
- `C:EURUSD`
- `X:BTCUSD`
- `BRK.B`
- real futures contracts such as `ESM6`

**Recommendation:** stop exposing provider-native symbols directly as raw route params. Add a canonical symbol codec with:
- internal route-safe IDs
- provider-specific external symbol mapping
- a normalization layer shared by server actions, routes, and UI links

### 4. Converting Massive timestamps back to FMP strings is not enough

The draft correctly calls out `.date.split(' ')` dependencies, but the codebase does more than string splitting. It also parses those strings with `new Date(...)` in multiple places, including:
- `components/LiveDashboard.tsx`
- `components/TradingViewChart.tsx`
- `components/SimpleCanvasChart.tsx`
- `app/actions/market-data.ts`
- `app/actions/prices.ts`
- `lib/chart-helpers.ts`
- `lib/price-matcher.ts`

That means a bare `"YYYY-MM-DD HH:mm:ss"` compatibility string is still unsafe because:
- JavaScript treats it as local time, not explicitly ET
- futures data is CT in Massive, not ET
- the same field is being used for both display and arithmetic

**Recommendation:** make `timestampMs` the canonical field in provider output. Keep a legacy `date` string only as a temporary adapter for old consumers. Phase 0 should include:
- a shared `formatMarketTimestamp()` helper
- a `sessionDate` / `tradingDate` field separate from display text
- a migration pass to remove `new Date(c.date)` from charting and aggregation paths

### 5. Replace hard-coded session clocks with provider status/schedule data

`lib/market-hours.ts` is ET-only and holiday-unaware. That is already brittle, and it will get worse once futures are migrated because Massive futures schedules are session-based and CT-oriented.

Relevant official endpoints:
- `GET /v1/marketstatus/now`
- `GET /v1/marketstatus/upcoming`
- `GET /futures/vX/schedules`

Affected code:
- `lib/market-hours.ts`
- `app/actions/market-movers.ts`
- `app/actions/scan-extended-hours.ts`
- `app/dashboard/live/page.tsx`

**Recommendation:** keep the local time heuristic only as fallback. Primary session logic should come from provider market-status and futures schedule data with a short shared cache.

### 6. The realtime plan needs a broker, not one upstream socket per browser

The proposed `app/api/live-prices/route.ts` SSE bridge is directionally right, but the draft currently implies one client `EventSource` would open one upstream Massive WebSocket. That does not scale and is risky on ephemeral Next.js runtimes.

There is also a channel mismatch in the draft:
- stocks quote stream is `WS /stocks/Q` and gives bid/ask, not a traded last price
- stocks trade stream is `WS /stocks/T`
- stocks per-second aggregates are `WS /stocks/A`, not `AS`
- stocks per-minute aggregates are `WS /stocks/AM`
- indices live value is `WS /indices/V`
- indices per-second/per-minute aggregates are `WS /indices/A` and `WS /indices/AM`
- futures streams are on separate `/futures/*` sockets

This matters because `components/LiveDashboard.tsx` currently renders a single `livePrice`. That is semantically closer to a trade price than an NBBO quote midpoint.

**Recommendation:**
- create a long-lived server-side broker per market (`stocks`, `indices`, `futures`) with subscription ref-counting
- fan out to browser clients via SSE
- use trade events for `livePrice`
- use aggregate events for candle updates
- add reconnect, heartbeat, and entitlement/backoff handling before rollout

### 7. Full-market snapshot is useful, but it should not become the default quote path

`GET /v2/snapshot/locale/us/markets/stocks/tickers` is a strong replacement for current quote batching in:
- `app/actions/advance-decline.ts`
- `app/actions/market-breadth.ts`
- `app/actions/sp500-distribution.ts`
- `app/actions/sp500-movers.ts`
- `app/actions/scan-extended-hours.ts`

But it is still a **10k+ ticker** response. It should not replace every targeted quote flow by default.

**Recommendation:**
- use filtered `tickers=` snapshot queries where possible
- reserve full-market snapshot for scanners and broad-market features
- cache full snapshot centrally if multiple actions depend on it
- do not fetch the full universe per request in server actions

### 8. Split mixed-asset actions before migrating them

Two files should be decomposed before any provider swap:

`app/actions/forex-bonds.ts`
- mixes forex (`EURUSD`, `USDJPY`, `GBPUSD`)
- crypto (`BTCUSD`)
- Treasury yields (`^FVX`, `^TNX`, `^TYX`)

`app/actions/global-indices.ts`
- mixes global cash indices and U.S. futures overlays

Those do not belong behind one stock-oriented provider call. Massive covers them via different APIs with different symbols and response shapes.

**Recommendation:** split these actions by asset class first, then migrate each slice to the right endpoint family.

### 9. Phase 4 coverage assumptions are outdated

The draft says Massive lacks equivalents for key metrics / ratios and implies income statements are only under an experimental endpoint. That is no longer the current picture:
- income statements: `GET /stocks/financials/v1/income-statements`
- ratios: `GET /stocks/financials/v1/ratios`
- float: `GET /stocks/vX/float`
- news: `GET /v2/reference/news`
- ticker/company overview: `GET /v3/reference/tickers/{ticker}`

That does **not** mean `app/actions/stock-key-stats.ts` can be switched wholesale. That file still expects a wide blended field set pulled from Supabase, live quote data, and provider fundamentals. But the migration plan should be updated to reflect that Massive now has stable fundamentals coverage for several Phase 4 needs.

**Recommendation:** replace the current “keep FMP for all metrics/ratios” assumption with a field-by-field gap matrix for:
- `app/actions/stock-key-stats.ts`
- `app/actions/get-income-statement.ts`
- `app/actions/get-company-profile.ts`

### 10. Move cleanup earlier, not after the migration

There are existing structural issues that will make provider diffs noisy if left in place:
- `app/actions/market-data.ts` contains repeated near-clones and at least one semantic mismatch (`getAaplMarketData()` is actually fetching S&P 500 data, with an AAPL daily fallback)
- `app/actions/sp500-movers.ts` hardcodes a large constituent list, while `app/actions/advance-decline.ts` reads `data/sp500-constituents.json`

**Recommendation:** add a `Phase 0.5` cleanup for:
- shared symbol registry
- shared quote/candle mappers
- `market-data.ts` consolidation
- route-safe symbol handling

This will make provider parity testing much easier.

### 11. Verification needs parity fixtures, not only page smoke tests

The current verification list is necessary but not sufficient. This migration needs direct provider comparisons for the same symbol/date inputs.

Add:
- `lib/providers/__tests__/symbol-mapping.test.ts`
- `lib/providers/__tests__/massive-mapping.test.ts`
- `scripts/compare-provider-parity.ts`
- `scripts/check-massive-entitlements.ts`

Minimum parity matrix:
- stock quote mapping
- index quote/value mapping
- futures front-month resolution
- daily vs intraday candle ordering
- previous-close calculation across weekends/holidays
- extended-hours movers ranking
- route handling for dotted / colon-prefixed symbols

Keep `DATA_PROVIDER=fmp` and `DATA_PROVIDER=massive` dual-run support until those comparisons are signed off.

### 12. Suggested revised phase order

1. **Phase 0:** instrument model, symbol resolver, sub-providers, parity harness
2. **Phase 0.5:** codebase cleanup (`market-data.ts`, shared symbol registries, date helpers)
3. **Phase 1:** stock quotes + stock candles
4. **Phase 2:** indices + VIX
5. **Phase 3:** futures resolution layer + futures consumers
6. **Phase 4:** movers / breadth / scanners with snapshots
7. **Phase 5:** profiles / news / fundamentals where the field gap is acceptable
8. **Phase 6:** realtime broker + live dashboard migration
9. **Phase 7:** FMP cleanup and deletion after parity sign-off

### Official Massive docs checked for this review

- WebSocket quickstart / socket URLs: https://massive.com/docs/websocket/quickstart
- Stock single snapshot: https://massive.com/docs/rest/stocks/snapshots/single-ticker-snapshot
- Stock full snapshot: https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot
- Stock top movers: https://massive.com/docs/rest/stocks/snapshots/top-market-movers
- Stock aggregates: https://massive.com/docs/rest/stocks/aggregates/custom-bars
- Index snapshot / aggregates: https://massive.com/docs/rest/indices/snapshots/indices-snapshot, https://massive.com/docs/rest/indices/aggregates/custom-bars
- Futures contracts / snapshot / aggregates / schedules: https://massive.com/docs/rest/futures/contracts, https://massive.com/docs/rest/futures/snapshots/contracts-snapshot, https://massive.com/docs/rest/futures/aggregates, https://massive.com/docs/rest/futures/schedules
- Market status / holidays: https://massive.com/docs/rest/stocks/market-operations/market-status, https://massive.com/docs/rest/stocks/market-operations/market-holidays
- Company overview / news / fundamentals: https://massive.com/docs/rest/stocks/tickers/ticker-overview, https://massive.com/docs/rest/stocks/news, https://massive.com/docs/rest/stocks/fundamentals/income-statements, https://massive.com/docs/rest/stocks/fundamentals/ratios, https://massive.com/docs/rest/stocks/fundamentals/float

---

## Claude Code Response to Codex Addendum

All 12 of Codex's factual claims were independently verified against the codebase. Below is my assessment of each recommendation — what I'm adopting, what I'm adapting, and what I'm declining (with reasoning).

### Rec 1: Instrument classes / sub-providers — PARTIALLY ADOPTED

**What Codex said:** Create `InstrumentType` plus 6 sub-providers (`stocks`, `indices`, `futures`, `forex`, `crypto`, `rates`) behind a thin router.

**My take:** The observation is correct — Massive has genuinely different endpoint families per asset class. But 6 sub-providers is over-engineering for this project's scale (single developer, <10 concurrent users). Instead, I'll keep one `MarketDataProvider` interface but have the Massive implementation **internally route** to the right Massive endpoint based on symbol type. The symbol resolver (see Rec 3) detects instrument type from the symbol and dispatches accordingly. The consumer code doesn't need to know about instrument classes — it just calls `provider.getQuote('ES=F')` and the Massive provider resolves that to the right futures endpoint internally.

**Why not full sub-providers:** This is a financial dashboard, not a multi-tenant trading platform. Adding 6 provider classes, an instrument type enum, and a router multiplies the surface area for bugs without proportional benefit. If we outgrow the single-provider approach, splitting later is straightforward since the interface boundary already exists.

### Rec 2: Futures front-month resolver — ADOPTED

**What Codex said:** FMP's `ES=F` doesn't exist in Massive. Need a dedicated front-month resolver with product mapping, active contract resolution, and rollover caching.

**My take:** This is the strongest recommendation in the review. Completely correct — Massive uses real contract tickers (`ESM6`, `ESU6`) not Yahoo-style aliases. I'll add:
- `lib/providers/futures-resolver.ts` — maps `ES` → Massive product code, resolves front-month contract via `/futures/vX/contracts`, caches with 1-hour TTL (rollovers happen quarterly, not per-request)
- Internal alias mapping: `ES=F` → resolved `ESM6` (or whatever the current front month is)
- The Live Dashboard will NOT be silently replaced with `I:SPX` — agreed that overnight futures behavior is the whole point

### Rec 3: Symbol validation regex — PARTIALLY ADOPTED

**What Codex said:** Build a full canonical symbol codec with internal route-safe IDs, provider-specific mapping, and a normalization layer.

**My take:** The regex problem is real — `^[A-Z]{1,5}(=[A-Z])?$` rejects `I:SPX`, `C:EURUSD`, `BRK.B`, `ESM6`. But a full "canonical symbol codec" with internal IDs is over-engineering. Instead:
- Update the API route validation regex to accept Massive symbols: `^[A-Z]{1,6}(\.[A-Z])?$|^[A-Z]:[A-Z]{2,10}$|^[A-Z]{2,4}=[A-Z]$`
- Add a `symbolMap` in the Massive provider that translates FMP-convention symbols to Massive symbols: `^GSPC` → `I:SPX`, `ES=F` → resolved futures contract, `EURUSD` → `C:EURUSD`
- Consumers keep using FMP-style symbols; the provider handles translation

**Why not full codec:** The codebase has ~50 files using FMP symbols. Introducing a third symbol namespace (internal canonical IDs) means touching every file to convert, which is more work than just mapping at the provider boundary. The provider abstraction already IS the normalization layer.

### Rec 4: Timestamp — use `timestampMs` as canonical — PARTIALLY ADOPTED

**What Codex said:** Make `timestampMs` the canonical field. Add `formatMarketTimestamp()` helper. Do a migration pass to remove `new Date(c.date)`.

**My take:** Adding `timestampMs` alongside `date` in `ProviderCandle` is smart — I'll do that. But doing a full migration pass to remove all `new Date(c.date)` calls across 7+ files in Phase 0 is scope creep. Instead:
- Phase 0: `ProviderCandle` has both `date: string` (ET format, backward-compat) and `timestampMs: number`
- Phase 0: Add `formatMarketTimestamp(ms: number, tz?: string): string` helper in `lib/providers/utils.ts`
- The Massive adapter converts epoch ms → both fields
- Consumers migrate from `date` to `timestampMs` organically as each file is touched in Phases 1-4
- No separate "migration pass" — the dual-field approach means nothing breaks

**Why not immediate full migration:** Touching 7 files just to change date parsing patterns before the provider is even wired up creates risk with no payoff. The dual-field approach gets the same result with zero breakage.

### Rec 5: Provider market status — DECLINED

**What Codex said:** Replace `lib/market-hours.ts` with Massive's `/v1/marketstatus/now` API endpoint.

**My take:** Adding an API call to determine market session on every page load introduces latency (~100-200ms) and a new failure point. If Massive is down, we can't even determine if the market is open. The local time heuristic in `market-hours.ts` is fast, reliable, and correct for US equity hours 99% of the time.

**What I WILL do:** Add a static US market holiday list to `lib/market-hours.ts`. This addresses the real gap (holidays treated as trading days) without adding API dependency. Holidays are published annually and barely change. A 20-line array of dates is more reliable than a network call.

**If we need it later:** Massive's market status API would be useful for international markets or complex futures session awareness. That can be added as an enhancement without replacing the local heuristic.

### Rec 6: WebSocket broker architecture — PARTIALLY ADOPTED

**What Codex said:** Create long-lived server-side broker per market with subscription ref-counting, fan out via SSE.

**My take:** The architecture is directionally right for a production app at scale. But this is a single-developer project with likely <10 concurrent users. A full broker with ref-counting is enterprise architecture.

**What I'll adopt:**
- The channel corrections are excellent: use `T` (trades) for `livePrice`, not `Q` (bid/ask). Use `AM` for per-minute candles. Use `V` for index values. These are critical correctness fixes.
- Singleton WebSocket connection on the server side (not one per browser client)
- Basic reconnect and heartbeat handling

**What I'll defer:**
- Per-market broker separation (stocks/indices/futures on separate sockets) — start with one connection
- Subscription ref-counting — not needed until we have concurrent users
- Entitlement/backoff handling — add when we hit rate limits

**Why:** YAGNI. The SSE bridge with a singleton upstream WebSocket is the right 80/20 solution. If we grow to many concurrent users, the singleton naturally evolves into a broker — the SSE fan-out pattern is the same either way.

### Rec 7: Full snapshot not default quote path — ADOPTED

**What Codex said:** Don't use full-market snapshot (10k+ tickers) for targeted quote flows. Use filtered `tickers=` queries.

**My take:** Completely agree. The plan now reflects:
- `provider.getQuote()` / `provider.getQuotes()` → Massive single/filtered snapshot
- `provider.getSnapshot()` → full-market snapshot, reserved for scanners (`sp500-movers`, `advance-decline`, `scan-extended-hours`)
- If multiple actions need the full snapshot in a single request cycle, cache it centrally with short TTL

### Rec 8: Split mixed-asset actions before migrating — ADOPTED

**What Codex said:** Decompose `forex-bonds.ts` and `global-indices.ts` by asset class before swapping providers.

**My take:** Agree. These files conflate different asset classes that map to entirely different Massive APIs. Added to Phase 0.5 (pre-migration cleanup):
- `forex-bonds.ts` → split into `forex.ts`, `crypto.ts`, `treasury-yields.ts`
- `global-indices.ts` → keep as pure indices, move futures to `futures.ts`

### Rec 9: Update Phase 4 coverage assumptions — ADOPTED

**What Codex said:** Massive now has stable fundamentals (income statements, ratios, float). Don't blanket-keep FMP for all of Phase 4.

**My take:** Good research. I'll update the plan to do a field-by-field gap analysis during Phase 4 implementation rather than assuming FMP is needed for everything. Specifically:
- News → Massive (direct mapping)
- Income statements → evaluate Massive's `GET /stocks/financials/v1/income-statements` field coverage
- Company profile → compare FMP `/v3/profile` vs Massive `/v3/reference/tickers` field sets
- Key metrics/ratios → evaluate Massive's `/stocks/financials/v1/ratios` coverage

FMP stays as fallback for any fields Massive doesn't cover.

### Rec 10: Move cleanup earlier (Phase 0.5) — ADOPTED

**What Codex said:** Clean up structural issues before migrating to avoid noisy diffs.

**My take:** Agree. Adding Phase 0.5:
- Rename `getAaplMarketData()` → `getSP500MarketData()` (verified: it fetches `^GSPC`, not AAPL)
- Consolidate 5 near-identical functions in `market-data.ts` into one generic `getIndexMarketData(symbol)`
- Unify S&P 500 constituent sources (hardcoded array in `sp500-movers.ts` vs JSON file in `advance-decline.ts`)
- Split mixed-asset actions (Rec 8)

### Rec 11: Parity testing — PARTIALLY ADOPTED

**What Codex said:** Add symbol mapping tests, provider comparison scripts, and a full parity matrix.

**My take:** Symbol mapping tests and basic comparison scripts are valuable. The full parity matrix (7 dimensions) is heavy for the current stage.

**What I'll add:**
- `lib/providers/__tests__/symbol-mapping.test.ts` — unit tests for FMP→Massive symbol translation
- `scripts/compare-providers.ts` — fetch same symbol from both providers, diff the output
- Dual-run support via `DATA_PROVIDER` env var stays until migration is complete

**What I'll skip:**
- `scripts/check-massive-entitlements.ts` — can manually verify plan entitlements
- The full 7-dimension parity matrix — overkill for a single-developer project. The comparison script covers the important cases.

### Rec 12: Revised phase order — PARTIALLY ADOPTED

**What Codex said:** 9-phase order splitting indices, futures, and movers into separate phases.

**My take:** The insight of separating futures (complex resolver needed) from stocks (straightforward mapping) is good. But 9 phases is over-segmented for practical execution. Revised order:

1. **Phase 0:** Provider abstraction + symbol resolver + futures resolver
2. **Phase 0.5:** Codebase cleanup (market-data.ts consolidation, split mixed-asset files, shared symbol registry)
3. **Phase 1:** Stock quotes + stock candles (the straightforward bulk of migration)
4. **Phase 2:** Indices + VIX + futures (now that resolver exists)
5. **Phase 3:** Market movers / scanners (snapshot-based)
6. **Phase 4:** Fundamentals / news / profiles (field-gap evaluation)
7. **Phase 5:** WebSocket + Live Dashboard (real-time upgrade)
8. **Phase 6:** FMP cleanup after parity verification

This incorporates Codex's key insight (futures separate from stocks) without fragmenting into 9 phases.

---

### Summary: Adoption Scorecard

| # | Recommendation | Verdict | Key Reason |
|---|---------------|---------|------------|
| 1 | Instrument sub-providers | Partially adopted | Internal routing in Massive provider instead of 6 classes |
| 2 | Futures front-month resolver | **Adopted** | Critical blind spot, real contract tickers required |
| 3 | Canonical symbol codec | Partially adopted | Symbol mapping at provider boundary, not a third namespace |
| 4 | `timestampMs` canonical | Partially adopted | Dual-field approach, organic consumer migration |
| 5 | Provider market status API | **Declined** | Adds latency/failure point; static holiday list instead |
| 6 | WebSocket broker | Partially adopted | Singleton + correct channels; defer ref-counting |
| 7 | Filtered snapshots | **Adopted** | Full snapshot reserved for scanners only |
| 8 | Split mixed-asset actions | **Adopted** | Added to Phase 0.5 |
| 9 | Update Phase 4 assumptions | **Adopted** | Field-by-field gap analysis instead of blanket FMP |
| 10 | Move cleanup earlier | **Adopted** | Phase 0.5 before provider migration |
| 11 | Parity testing | Partially adopted | Mapping tests + comparison script; skip full matrix |
| 12 | Revised phase order | Partially adopted | 8 phases (not 9), futures separated from stocks |
