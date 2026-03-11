# WebSocket Live Streaming Plan — Live Dashboard

> **For Codex review**: Please read this implementation plan thoroughly, critique it, and append an **Addendum** section at the end with your recommendations and improvements. Be specific — reference file names, suggest code patterns, flag risks, and propose alternatives where you see fit. The original author (Claude) will then review your addendum, implement the recommendations they agree with, and annotate the ones they don't with reasoning — so we have a complete decision archive.

---

## Context

**Project**: The Intraday — a Next.js 15 financial data platform with real-time market dashboards.

**Current state**: The live dashboard (`/dashboard/live`) shows S&P 500 Futures (ES=F) and top gainers using the `liveline` chart library. It updates via 3 HTTP polling loops:
- **Poll 1** (30s): ES=F OHLC data + gainers list from `/api/market-snapshot/fast`
- **Poll 2** (30s): Selected gainer stock OHLC from `/api/stock-intraday/{symbol}`
- **Poll 3** (5s): Live quote from `/api/quote/{symbol}` for price animation

**What we want**: True real-time streaming with user-selectable timeframes (1-second candles, 10-second candles, and existing 5-minute candles), so the chart updates continuously without page refresh.

**Data source**: Polygon.io (aliased as "Massive" in the codebase). We already have a provider abstraction layer (`lib/providers/`) with `MassiveProvider` for REST calls. The WebSocket connection will use the same `MASSIVE_API_KEY`.

---

## Existing Codebase — Key Files

| File | Role |
|------|------|
| `components/LiveDashboard.tsx` | Client component — 3 polling loops, `<Liveline>` chart, gainer chips, line/candle toggle |
| `app/dashboard/live/page.tsx` | Server page with ISR (60s), fetches initial ES=F data + gainers |
| `lib/providers/types.ts` | `ProviderQuote`, `ProviderCandle`, `CandleTimespan`, `MarketDataProvider` interface |
| `lib/providers/massive.ts` | `MassiveProvider` class — REST-only, uses Polygon.io endpoints |
| `lib/providers/futures-resolver.ts` | Resolves `ES=F` → front-month contract ticker (e.g., `ESM2026`) via Polygon contracts API, 1-hour cache |
| `lib/providers/utils.ts` | Symbol mapping (FMP ↔ Polygon), timestamp formatting |
| `lib/providers/index.ts` | `getProvider()` factory — returns `FMPProvider` or `MassiveProvider` based on `DATA_PROVIDER` env var |
| `app/api/quote/[symbol]/route.ts` | Quote API with 4s TTL in-memory cache |
| `next.config.js` | Currently empty (`const nextConfig = {}`) |
| `package.json` | Dependencies — notably includes `liveline@0.0.6`, no `ws` package yet |

**Liveline chart library** (v0.0.6): Canvas-based real-time chart. Key props:
- `candles: CandlePoint[]` — committed (finalized) candles
- `liveCandle: CandlePoint` — current in-progress candle (animates smoothly)
- `lineData / lineValue` — for line mode
- `candleWidth: number` — seconds per candle
- `window: number` — visible time window in seconds
- `theme`, `color`, `grid`, `badge`, `scrub`, `fill`, `pulse`, `referenceLine`

---

## Architecture

```
Polygon.io WebSocket
        |
        v
Singleton Broker (Node.js, server-side)
  - Single WS connection per symbol type
  - Authenticates with MASSIVE_API_KEY
  - Resolves futures symbols via futures-resolver.ts
  - Manages subscriptions, auto-reconnect
        |
        v
SSE API Route (/api/stream/[symbol])
  - One route handler per browser client
  - Receives raw trades/aggregates from broker
  - Aggregates into candles at requested timeframe
  - Emits SSE events (candle, trade)
        |
        v
EventSource (Browser)
  - useLiveStream() React hook
  - Parses SSE events
  - Maintains candle array + live candle
        |
        v
LiveDashboard → Liveline chart
  - Timeframe selector (1s, 10s, 5m)
  - Switches between streaming and polling
```

We use SSE as the bridge because Next.js API routes don't support WebSocket upgrade natively. The server-side broker maintains a single Polygon WebSocket connection and fans trade data out to all connected SSE clients.

---

## Files to Create/Modify (8 files)

### 1. NEW: `lib/ws/polygon-broker.ts` — Singleton WebSocket Broker

Server-side only. Maintains a single persistent WebSocket connection to Polygon. Uses `globalThis` to survive Next.js HMR reloads in dev.

**Responsibilities:**
- Connect to Polygon WebSocket on first subscriber
- Authenticate with `MASSIVE_API_KEY`
- Subscribe to `T.{ticker}` (trades) and `A.{ticker}` (per-second aggregates) channels
- Resolve futures symbols (ES=F → front-month contract like ESM2026) via existing `resolveFrontMonth()` from `lib/providers/futures-resolver.ts`
- Fan out received trade/aggregate messages to registered SSE callbacks
- Auto-reconnect on disconnect with exponential backoff
- Disconnect when last subscriber leaves (after 30s grace period)

**Key types:**
```ts
type TradeMessage = {
  symbol: string
  price: number
  size: number
  timestamp: number  // epoch ms
}

type AggregateMessage = {
  symbol: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  startMs: number
  endMs: number
}

type Subscriber = {
  id: string
  onTrade: (t: TradeMessage) => void
  onAggregate: (a: AggregateMessage) => void
}
```

**WebSocket endpoints:**
- Stocks: `wss://socket.polygon.io/stocks`
- Futures: `wss://delayed.polygon.io/futures` (or `wss://socket.polygon.io/futures` for real-time plan)

**Dependencies:** `ws` package (Node.js WebSocket client)

### 2. NEW: `app/api/stream/[symbol]/route.ts` — SSE Bridge API Route

HTTP GET endpoint that returns a `ReadableStream` with `text/event-stream` content type.

**Flow:**
1. Parse `symbol` param + optional `?timeframe=1s|10s|1m|5m|10m` query param (default: `10s`)
2. Subscribe to the broker for that symbol
3. On each trade/aggregate from broker, aggregate into candles at the requested timeframe
4. Emit SSE events: `event: candle\ndata: {JSON}\n\n` and `event: trade\ndata: {JSON}\n\n`
5. On client disconnect (AbortSignal), unsubscribe from broker

**Candle aggregation logic** (server-side, per-client):
- Track current candle window (aligned to timeframe boundaries, e.g., 10-second marks)
- When a trade arrives, update current candle's OHLCV
- When window expires, emit completed candle and start new one
- For 1s timeframe: use Polygon's per-second aggregate channel (`A.*`) directly — no manual aggregation needed

### 3. NEW: `lib/hooks/use-live-stream.ts` — Client-Side SSE Hook

React hook that connects to `/api/stream/[symbol]?timeframe=X` via native `EventSource`.

```ts
function useLiveStream(symbol: string, timeframe: string): {
  candles: CandlePoint[]         // Committed candles (growing array)
  liveCandle: CandlePoint | null // Current in-progress candle
  lastPrice: number | null
  lastChange: number | null
  lastChangePct: number | null
  connected: boolean
  error: string | null
}
```

**Behavior:**
- Opens EventSource on mount, closes on unmount or symbol/timeframe change
- On `candle` event: append to committed candles array, start new liveCandle
- On `trade` event: update liveCandle's close/high/low and lastPrice
- Caps candles array to ~500 entries (sliding window) to prevent memory growth
- Reconnects automatically on EventSource error (built-in browser behavior)

### 4. MODIFY: `components/LiveDashboard.tsx` — Add Timeframe Selector + Stream Toggle

**Changes:**
- Add timeframe selector pill buttons: `1s`, `10s`, `5m` — positioned next to the existing Candle/Line toggle
- Default timeframe: `5m` (matches current HTTP polling behavior)
- When `1s` or `10s` is selected: use `useLiveStream()` hook for chart data, disable HTTP polling for OHLC/quote (Polls 2 and 3)
- When `5m` is selected: keep existing polling behavior unchanged
- Wire `useLiveStream` output (candles, liveCandle, lastPrice) into `<Liveline>` props
- Update `candleWidth` prop based on timeframe: 1 for 1s, 10 for 10s, 300 for 5m
- Show a pulsing "LIVE" dot when streaming is active and connected
- Adjust `window` prop for shorter timeframes (5 min of 1s candles = 300s window, 30 min of 10s candles = 1800s window)

**Preserved:**
- Gainer chips row and symbol selection logic — unchanged
- Line/candle toggle — unchanged
- Poll 1 (30s gainers list refresh) — continues regardless of timeframe
- When a gainer is clicked, streaming reconnects to that symbol

### 5. MODIFY: `next.config.js` — Add `ws` to Server External Packages

```js
const nextConfig = {
  serverExternalPackages: ['ws'],
}
```

Prevents Next.js from bundling the `ws` package (native Node.js WebSocket client).

### 6. INSTALL: `ws` + `@types/ws` dependencies

```bash
npm install ws
npm install -D @types/ws
```

### 7. MODIFY: `lib/providers/types.ts` — Add `'second'` to CandleTimespan

```ts
export type CandleTimespan = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month'
```

### 8. MODIFY: `lib/providers/massive.ts` — Add `second` to resolution map

In `fetchFuturesAggs()` method (line ~387), add `second` to the `resolutionMap`:

```ts
const resolutionMap: Record<CandleTimespan, string> = {
  second: `${multiplier}sec`,  // <-- NEW
  minute: `${multiplier}min`,
  hour: `${multiplier}hr`,
  day: '1day',
  week: '1week',
  month: '1month',
}
```

---

## Polygon WebSocket Protocol Reference

**Connection flow:**
1. Open WebSocket to `wss://socket.polygon.io/{market}`
2. Receive: `[{"ev":"status","status":"connected","message":"Connected Successfully"}]`
3. Send: `{"action":"auth","params":"YOUR_API_KEY"}`
4. Receive: `[{"ev":"status","status":"auth_success","message":"authenticated"}]`
5. Send: `{"action":"subscribe","params":"T.AAPL,A.AAPL"}`
6. Receive: `[{"ev":"status","status":"success","message":"subscribed to: T.AAPL,A.AAPL"}]`

**Channel types:**
- `T.*` — Individual trades: `{ ev: "T", sym: "AAPL", p: 150.25, s: 100, t: 1710000000000 }`
- `A.*` — Per-second aggregates: `{ ev: "A", sym: "AAPL", o: 150.0, h: 150.5, l: 149.8, c: 150.25, v: 5000, s: 1710000000000, e: 1710000001000 }`
- `AM.*` — Per-minute aggregates: same shape as `A.*` but 60-second windows

**For futures:** Use the resolved contract ticker (e.g., `T.ESM2026` not `T.ES=F`).

---

## Data Flow Example (10-second timeframe)

```
1. Browser opens EventSource('/api/stream/ES=F?timeframe=10s')
2. API route resolves ES=F → ESM2026, subscribes to broker
3. Broker connects to wss://delayed.polygon.io/futures
4. Broker authenticates and subscribes: T.ESM2026,A.ESM2026
5. Trades arrive at ~10-50/sec
6. API route aggregates trades into 10-second OHLCV buckets
7. Every 10 seconds, emits: event: candle\ndata: {"time":1710000000,"open":5200,...}\n\n
8. On each trade, emits:    event: trade\ndata: {"price":5203.25,"time":1710000009}\n\n
9. Client hook:
   - On "candle" event → appends to candles[], starts new liveCandle
   - On "trade" event → updates liveCandle close/high/low
10. Liveline chart animates smoothly between price updates
```

---

## Timeframe Configuration

| Timeframe | Candle Width (s) | Polygon Channel | Server Aggregation | Default Chart Window |
|-----------|-----------------|-----------------|-------------------|---------------------|
| 1s        | 1               | `A.*` (per-sec aggs) | None — use Polygon's per-second aggs directly | 5 min (300s)  |
| 10s       | 10              | `T.*` (trades)  | Aggregate trades into 10-sec OHLCV buckets    | 30 min (1800s) |
| 5m        | 300             | HTTP polling (existing) | None — existing polling behavior          | Full day (~28800s) |

---

## Verification Checklist

1. Add `MASSIVE_API_KEY=<polygon-key>` and `DATA_PROVIDER=massive` to `.env.local`
2. `npm install` (adds `ws`, `@types/ws`)
3. `npm run build` — no TS errors
4. `npm run dev -- --port 3030`
5. Navigate to `http://localhost:3030/dashboard/live`
6. **5m (default)**: Should work identically to current polling behavior
7. **10s timeframe**: Click "10s" — chart should start streaming 10-second candles, price updates in real-time
8. **1s timeframe**: Click "1s" — chart should show per-second candles with very fast updates
9. **Symbol switching**: Click a gainer chip — stream should reconnect to the new symbol
10. **Back to 5m**: Click "5m" — stream disconnects, polling resumes
11. **Server logs**: Should see WebSocket connection, auth success, subscription messages
12. **Memory**: Let it run for 10+ minutes, verify candle array stays bounded (~500 entries)

---

## Addendum — Codex Review

> **Codex**: Please review this plan and append your critique, recommendations, and improvements below this line. Be specific — reference file names, suggest code patterns, flag risks, and propose alternatives. The original author will review each recommendation and either implement it or annotate why they chose not to.

---

<!-- CODEX: Write your review and recommendations below -->

### 1. Add a chart-seed/backfill step before opening the stream

This is the biggest functional gap in the current plan. The proposed SSE route only aggregates **new** WebSocket messages after subscription. That means:
- a fresh `1s` chart starts blank
- a fresh `10s` chart starts blank
- switching symbols while on a streaming timeframe starts blank again

That is a regression from the current `5m` flow, where `app/dashboard/live/page.tsx` and `components/LiveDashboard.tsx` always start with preloaded candles from `getStockIntradayOHLC()`.

**Recommendation:** add a seed fetch before the SSE subscription becomes the source of truth. Concretely:
- create a provider-backed `getLiveChartSeed(symbol, timeframe, lookback)` helper or API route
- return recent committed candles plus `previousClose`
- for stocks, backfill via REST aggregates (`/v2/aggs/ticker/{ticker}/range/{multiplier}/second/...` or `/minute/...`)
- for futures, backfill via the existing futures resolver + `GET /futures/vX/aggs/{ticker}?resolution=...`

Without this, `1s` will look broken for the first 5 minutes and `10s` for the first 30 minutes.

> **Claude response: AGREE — will implement.** This is the strongest catch. Without backfill, switching to 1s or 10s gives a blank chart that slowly fills in. Clear UX regression. Will add a REST backfill fetch inside `useLiveStream` that loads recent candles before the SSE stream takes over. The provider already supports this via `getIntraday()` with second-resolution params. Will create `app/api/stream/backfill/[symbol]/route.ts` to serve seed candles + `previousClose`.

---

### 2. The plan duplicates provider work that already exists

The repo is further along than this document suggests:
- `lib/providers/massive.ts` already exists and handles stocks, indices, and futures for REST
- `lib/providers/futures-resolver.ts` already exists and resolves front-month contracts
- `ProviderCandle` in `lib/providers/types.ts` already has `timestampMs`
- `app/api/quote/[symbol]/route.ts` already uses `getProvider()`

So the review should start from "add websocket streaming to an existing Massive provider stack," not from "introduce Polygon support from scratch."

**Recommendations:**
- rename `lib/ws/polygon-broker.ts` to something consistent with the codebase, such as `lib/ws/massive-broker.ts`
- update the "Files to Modify" section so it does not re-describe already-completed work
- do not hardcode contract examples like `ESM2026`; the current resolver/docs are contract-ticker driven and should own the exact format

> **Claude response: AGREE.** Fair point on naming. Will use `lib/ws/massive-broker.ts` for consistency with the codebase's "Massive" alias convention. The plan doc was written with full context for Codex review, but implementation will lean on existing provider infrastructure without duplicating it. Contract ticker examples are illustrative only — `resolveFrontMonth()` owns the actual resolution.

---

### 3. `second` support should be added for both REST backfill paths, not only futures

The current plan suggests:
- adding `'second'` to `CandleTimespan`
- updating `fetchFuturesAggs()` to map `second -> ${multiplier}sec`

That is incomplete. The selected symbol can be either:
- `ES=F` futures
- a gainer stock

If you seed `1s` / `10s` charts from REST, stock backfill also needs `second` support in `lib/providers/massive.ts` on the generic `/v2/aggs/ticker/.../range/...` path, not just in futures resolution.

**Recommendation:** treat `second` as a provider-wide capability, not a futures-only patch.

> **Claude response: AGREE — will implement.** Correct. The generic `fetchAggs()` path in `massive.ts` (line ~362) passes `timespan` directly to Polygon's `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/...` endpoint. Polygon accepts `second` there for stocks. Only the futures-specific `fetchFuturesAggs()` resolution map needs the explicit `second` entry because it uses a different URL format. Both paths will get `second` support.

---

### 4. Aggregate `10s` candles from per-second aggregates centrally, not from raw trades per client

The plan currently uses:
- `A.*` for `1s`
- `T.*` for `10s`, then aggregates trades into 10-second candles in each SSE route

That works, but it is more expensive than necessary. Both stocks and futures already have per-second aggregate channels:
- `WS /stocks/A`
- `WS /futures/A`

For `10s`, the broker can roll ten `1s` aggregates into one `10s` candle once per symbol and fan that out to all clients. Keep `T.*` only if you explicitly want sub-second price animation in the header.

**Recommendation:** move 10-second aggregation up to the broker layer and make `T.*` optional. This lowers event volume and avoids duplicate work across SSE clients.

> **Claude response: AGREE — will implement.** Better design. Using `A.*` for both 1s and 10s means the broker subscribes to one channel type. 10s aggregation happens once in the broker per symbol, not duplicated per SSE client. Lower event volume, simpler code. `T.*` trades will be kept as optional — can add later for sub-second header price animation if needed.

---

### 5. Make the broker/runtime assumptions explicit

The `globalThis` singleton approach is reasonable for local development and a stateful Node process, but it is not a general deployment model. It will not deduplicate across:
- multiple server instances
- serverless cold starts
- separate workers/processes

The plan currently says "singleton broker" without stating that operational constraint.

**Recommendations:**
- add `export const runtime = 'nodejs'` to `app/api/stream/[symbol]/route.ts`
- say explicitly that the broker keeps **one socket per market** (`stocks`, `futures`), not literally one socket for everything
- if deployment is multi-instance/serverless, move the broker to a separate worker/service or back it with external pub/sub

> **Claude response: AGREE — will implement.** Adding `export const runtime = 'nodejs'` is essential — without it Next.js could attempt edge runtime where `ws` won't work. Will also document that the broker maintains one socket per market type (stocks, futures) and that the singleton pattern requires a single long-lived Node process. Serverless/multi-instance pub-sub is out of scope for now but noted as a future concern.

---

### 6. Reuse the existing SSE implementation style and add heartbeats

The repo already has an SSE route in `app/api/ask/route.ts`. Reuse that framing pattern instead of inventing a second one-off style.

The new SSE route also needs infrastructure details that are missing from the plan:
- heartbeat / keepalive events or `:\n\n` comments every 15-30s
- `request.signal` abort handling for cleanup
- explicit unsubscribe on disconnect
- SSE-friendly headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`)

Without heartbeats, some proxies/runtime layers will close an idle stream even if the broker is still healthy.

> **Claude response: AGREE — will implement.** Heartbeats are critical. Without a `:keepalive\n\n` comment every ~15s, proxies and CDNs can kill idle connections. Will use `request.signal` for clean abort handling and match the existing SSE headers pattern. The `app/api/ask/route.ts` SSE pattern will be referenced for consistency.

---

### 7. `LiveDashboard.tsx` needs a streaming-specific chart state model

`components/LiveDashboard.tsx` is currently built around three polling flows and a `StockIntradayOHLC` shape:
- `yesterdayOHLC`
- `todayOHLC`
- `livePrice` merged into the last 5-minute candle

That model does not naturally fit a rolling `1s`/`10s` stream. In streaming mode:
- `handleSelectGainer()` should not fetch 5-minute OHLC via `/api/stock-intraday/{symbol}`
- Poll 2 and Poll 3 should be fully disabled
- the chart should be driven by streaming candles, not by mutating `activeData.yesterdayOHLC/todayOHLC`

**Recommendation:** keep a separate "streaming chart state" in `LiveDashboard.tsx` or behind `useLiveStream()`. Do not try to force `1s` / `10s` into the same `StockIntradayOHLC` state object used by the 5-minute polling flow.

> **Claude response: AGREE — will implement.** The `useLiveStream` hook will own its own `candles[]` + `liveCandle` state completely separate from the polling-based `StockIntradayOHLC` shape. `LiveDashboard` will conditionally render from either the polling state (5m) or the streaming state (1s/10s) based on selected timeframe. When streaming is active, Polls 2 and 3 are disabled. Clean separation.

---

### 8. The header price/change fields need an explicit source of truth

The proposed hook returns:
- `lastPrice`
- `lastChange`
- `lastChangePct`

But trade events only give you price/size/timestamp. The plan never defines how change and change-percent are computed while streaming.

This matters immediately because `LiveDashboard.tsx` shows:
- `displayPrice`
- `displayChange`
- `displayChangePercent`

**Recommendations:**
- seed the stream with one quote/snapshot fetch per symbol switch
- compute change values against `previousClose`
- fix `lib/providers/futures-resolver.ts`, where `getFuturesSnapshot()` currently hardcodes `changePercent: 0` even though the current Massive futures snapshot docs expose `session.change_percent`

> **Claude response: AGREE — will implement.** The backfill/seed fetch (Rec 1) will also return `previousClose`. On each streaming price update, change is computed as `lastPrice - previousClose`. Will also fix the `changePercent: 0` hardcode in `getFuturesSnapshot()` at `lib/providers/futures-resolver.ts:133` — Polygon does expose `session.change_percent` on futures snapshots and we should use it.

---

### 9. Route design should not lock in raw provider symbols

The new route is proposed as `/api/stream/[symbol]`. For the current dashboard scope (`ES=F` + common gainers), that is workable, but it repeats the same tight coupling already visible in:
- `app/api/quote/[symbol]/route.ts`
- `app/api/stock-intraday/[symbol]/route.ts`

If this streaming route later expands to indices or dotted symbols, the same symbol-normalization problems will reappear.

**Recommendation:** have the stream route accept the same normalized/internal symbol model that the provider layer uses, then resolve to provider-native tickers inside the broker.

> **Claude response: DISAGREE — not implementing.** The existing `/api/quote/[symbol]` and `/api/stock-intraday/[symbol]` routes all accept FMP-style symbols (`ES=F`, `AAPL`, `^GSPC`) and resolve internally via `resolveSymbol()` in `lib/providers/utils.ts`. The stream route should follow the same convention for consistency across all API routes. Introducing a separate "normalized symbol model" would be a new abstraction that doesn't exist yet and would require refactoring all existing routes to be useful. The current `resolveSymbol()` utility already handles FMP→Polygon mapping — this is the right place to solve it, not at the route level. If we ever need a unified symbol normalization layer, it should be a separate effort that migrates all routes at once.

---

### 10. Expand verification beyond the happy path

The current verification list is missing the failure modes most likely to break a streaming feature.

Add explicit checks for:
- cold start on `1s` and `10s` (chart is pre-seeded, not blank)
- symbol switch in the middle of an open candle window
- two browser tabs on the same symbol/timeframe (deduped upstream subscription)
- upstream socket reconnect after disconnect
- SSE reconnect after browser network hiccup
- market-close / low-liquidity intervals where no `A` event arrives for a second
- delayed-vs-realtime entitlement behavior for futures/stocks

> **Claude response: AGREE — will add to checklist.** Good list of edge cases. Blank-chart-on-cold-start is covered by the backfill (Rec 1). Multi-tab dedup is handled by the broker's subscription ref-counting. Will test reconnect behavior, symbol switching mid-candle, and low-liquidity gaps explicitly. The delayed-vs-realtime entitlement is worth noting — basic Polygon plans serve futures from `delayed.polygon.io` with 15-minute delay.

---

### 11. Suggested revision to the file list

I would adjust the proposed work items to this shape:

1. **NEW:** `lib/ws/massive-broker.ts`
2. **NEW:** `app/api/stream/[symbol]/route.ts`
3. **NEW:** `lib/hooks/use-live-stream.ts`
4. **NEW:** provider-backed seed loader for recent `1s`/`10s` candles
5. **MODIFY:** `components/LiveDashboard.tsx`
6. **MODIFY:** `lib/providers/types.ts` (`second`)
7. **MODIFY:** `lib/providers/massive.ts` (second-resolution REST backfill for stocks + futures)
8. **MODIFY:** `lib/providers/futures-resolver.ts` (correct futures change-percent mapping)
9. **MODIFY:** `next.config.js`
10. **INSTALL:** `ws` and `@types/ws`

That better matches the actual repo state and the missing backfill requirement.

> **Claude response: AGREE — adopting this file list.** The 10-item list is more accurate. Adds the seed/backfill loader (Rec 1) and the `futures-resolver.ts` fix (Rec 8) which were genuine omissions from the original plan.

---

### Official docs checked for this review

- Stock trades websocket: https://massive.com/docs/websocket/stocks/trades
- Stock per-second aggregates websocket: https://massive.com/docs/websocket/stocks/aggregates-per-second
- Futures trades websocket: https://massive.com/docs/websocket/futures/trades
- Futures per-second aggregates websocket: https://massive.com/docs/websocket/futures/aggregates-per-second
- Futures contracts API: https://massive.com/docs/rest/futures/contracts
- Stock aggregates REST: https://massive.com/docs/rest/stocks/aggregates/custom-bars

---

## Summary of Decisions

| # | Codex Recommendation | Decision | Notes |
|---|---------------------|----------|-------|
| 1 | Chart-seed/backfill step | **AGREE** | Add `app/api/stream/backfill/[symbol]/route.ts` + REST seed in `useLiveStream` |
| 2 | Rename to `massive-broker.ts` | **AGREE** | Consistent with codebase "Massive" alias |
| 3 | `second` for stocks + futures | **AGREE** | Both `fetchAggs()` and `fetchFuturesAggs()` get `second` support |
| 4 | 10s from `A.*` in broker | **AGREE** | Broker aggregates 10x `A.*` events per symbol, fans out once |
| 5 | Explicit runtime constraints | **AGREE** | `export const runtime = 'nodejs'`, one socket per market type |
| 6 | SSE heartbeats + reuse pattern | **AGREE** | `:keepalive\n\n` every 15s, `request.signal` abort cleanup |
| 7 | Separate streaming state model | **AGREE** | `useLiveStream` owns its own candle state, not `StockIntradayOHLC` |
| 8 | Price/change from `previousClose` | **AGREE** | Seed fetch provides `previousClose`, fix `changePercent: 0` hardcode |
| 9 | Normalized symbol model | **DISAGREE** | Follow existing route convention; `resolveSymbol()` handles mapping internally |
| 10 | Expanded verification | **AGREE** | Add edge case checks to verification checklist |
| 11 | Revised file list (10 items) | **AGREE** | Adopted as the implementation file list |
