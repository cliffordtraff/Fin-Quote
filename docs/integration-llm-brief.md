### Trading Dashboard — Integration Brief for LLMs

This document gives another large language model the minimum-but-sufficient context to integrate this project into a different codebase or a monorepo. It focuses on architecture, dependencies, API boundaries, environment variables, build/runtime assumptions, and common pitfalls.

---

## 1) High-level Overview

- App type: Next.js 15 (App Router) + optional PWA service worker + Electron 38 desktop wrapper.
- Language: TypeScript for app code and scripts; CommonJS module type at root.
- Frontend: React 19; Tailwind stack (tailwindcss, postcss, autoprefixer).
- Packaging: `electron-builder` creates macOS DMG/ZIP, Windows NSIS/portable, Linux AppImage/DEB.
- Primary domains:
  - Stock data and charting via Financial Modeling Prep (FMP) REST and WebSocket.
  - News ingestion and topic classification; optional OpenAI-powered summaries/classification.
  - Watchlist, quotes, dividends, and app settings persisted in Firebase (client + admin).
  - Subscriptions and payments via Stripe.

Key entry points:
- Web: Next.js (App Router) API routes in `app/api/**`.
- Desktop: `electron/main.js` spawns Next server and loads `http://localhost:${PORT}` into an Electron `BrowserWindow`.
- Optional proxy: standalone `server.js` Express server for TradingView symbol search (helpful when CORS blocks direct requests).

---

## 2) Repository Structure Signals

- `app/`: Next.js App Router pages and API routes.
  - `app/api/**`: REST endpoints for quotes, news, cron/cache jobs, Stripe, symbol search, etc.
  - `app/**/page.tsx`: UI routes (watchlist, pricing, news, etc.).
- `components/TradingView/**`: Chart surface using `lightweight-charts`, plus plugins (extended-hours overlay, trend lines) and UI controls.
- `hooks/**`: Data and UI hooks (quotes, extended hours, news, symbol search, chart modal, watchlist, etc.).
- `services/fmp/**`: FMP REST client, WebSocket manager, and a `getFMPService()` singleton.
- `lib/firebase/**`: Client SDK config (`NEXT_PUBLIC_*`), Admin SDK bootstrap (service account or ADC), and Firestore CRUD helpers for dividends, quotes cache, news archive, settings, symbol mapping, watchlists, metrics.
- `lib/cache/simple-cache.ts`: Small server-side in-memory TTL cache shared across API endpoints.
- `config/**`: Feature flags, news sources, topics, earnings scoring config.
- `types/**`: Central types for charts, symbols, earnings, summaries.
- `public/**`: `sw.js` (custom service worker), `workbox-*.js`, offline page, and assets.
- `electron/**`: Main and preload scripts that wrap the Next.js app for desktop distribution.
- `scripts/**`: Backfills, evaluations, classification pipelines, symbol mapping builders, and test harnesses.

---

## 3) Runtime Boundaries and Assumptions

- Node vs Edge: Endpoints that require secrets (e.g., `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`) must run on Node runtime. Files explicitly mention this where relevant.
- Electron/PWA: PWA is disabled when `ELECTRON === 'true'`. In browsers, enabling the service worker is controlled by `NEXT_PUBLIC_ENABLE_SW`.
- Realtime quotes: The WebSocket integration with FMP is encapsulated in `services/fmp/**`. The public `app/api/ws/route.ts` behaves like a REST control plane (subscribe/unsubscribe) due to Next.js API limitations for native WebSockets; true streaming may require a separate Node server if you need push.
- CORS: `next.config.js` sets permissive CORS headers on `/api/:path*`. If integrating behind a different gateway, reproduce these headers or adjust accordingly.
- Caching: Server-only in-memory TTL caches for quotes/dividends/news/metadata via `lib/cache/simple-cache.ts`. TTLs are per use (e.g., quotes ~30s, dividends ~24h).
- Firestore: Global “materialized” caches such as `quotesCache` and dividend docs are kept in Firestore with schema versioning. Admin helpers in `lib/firebase/admin.ts` write/read these and also update in-memory caches.

---

## 4) External Providers and Where Used

- Financial Modeling Prep (FMP)
  - REST: quotes, historical charts, dividends, news metadata (various endpoints).
  - WebSocket: live quotes via `services/fmp/websocket/FMPWebSocketManager.ts`. Entry via `getFMPService()` in `services/fmp/index.ts`.
  - Required env: `FMP_API_KEY`. Optional: `FMP_WS_URL` (defaults to `wss://websockets.financialmodelingprep.com`).

- Stripe
  - API routes: `app/api/stripe/**` for checkout session creation, portal session, webhook, verification, sync, payment history.
  - Required env: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`, optional `STRIPE_PORTAL_RETURN_URL`.

- Firebase
  - Client SDK in `lib/firebase/config.ts` uses `NEXT_PUBLIC_*` keys and initializes `auth` and `db`.
  - Admin SDK in `lib/firebase/admin.ts` uses `FIREBASE_SERVICE_ACCOUNT` JSON (stringified) in production or `.firebase/service-account.json` in development; falls back to ADC if necessary.
  - Collections used (observed): `dividends`, `quotesCache`, `users/*/data/watchlist`, `admin/meta/cache/activeSymbols`, metrics collections.

- OpenAI
  - News summaries/classification via `app/api/news/ai-summary/**` and `lib/news/topic-classifier.ts`.
  - Required env: `OPENAI_API_KEY`. Node runtime only (avoid Edge runtime secrets exposure).

- Alpha Vantage
  - Exposed to client via `next.config.js` `env` passthrough.
  - Optional env: `ALPHA_VANTAGE_API_KEY`.

---

## 5) Environment Variables (Grouped)

Core/runtime:
- `NODE_ENV`, `PORT`, `ELECTRON` (toggles PWA disablement)

Feature flags:
- `NEXT_PUBLIC_ENABLE_SW` — enable PWA SW in production web.
- `NEXT_PUBLIC_ENABLE_MACRO_ATTRIBUTION` — kill switch (default enabled).
- `NEXT_PUBLIC_MACRO_ATTRIBUTION_ROLLOUT` — percentage rollout (0–100).
- `NEXT_PUBLIC_MACRO_ATTRIBUTION_SYMBOLS` — comma-separated allowlist.

Firebase (client):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Firebase (admin/server):
- `FIREBASE_SERVICE_ACCOUNT` — stringified JSON of service account (prod); or `.firebase/service-account.json` in dev.

Data providers:
- `FMP_API_KEY` — required for quotes/news/dividends.
- `FMP_WS_URL` — optional WebSocket URL (defaults provided).
- `ALPHA_VANTAGE_API_KEY` — optional (exposed via Next config).

Stripe:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_PORTAL_RETURN_URL` (optional)

OpenAI:
- `OPENAI_API_KEY` — required for summaries/classification.

PWA:
- `NEXT_PUBLIC_ENABLE_SW` — must be `'true'` to register SW in web; auto-disabled when `ELECTRON === 'true'`.

---

## 6) API Surface (Selected Overview)

All under `app/api/...`:
- Admin/monitoring:
  - `admin/macro-attribution` — macro attribution metadata.
  - `monitoring/ai-summary`, `monitoring/ai-summary-metrics`, `monitoring/earnings-metrics`.
- Stocks:
  - `stocks/data`, `stocks/chart-data`, `stocks/extended-hours` — FMP-backed stock data.
  - `stocks/batch` — multi-symbol operations.
- FMP helpers:
  - `fmp/quote/[symbol]`, `fmp/quotes`, `fmp/dividends`.
- News:
  - `news/*` — multiple sources (WSJ, Barron’s, Bloomberg, NYT, Yahoo), archive, meta, classifiers (live/batch/simple), AI summaries.
- Symbols:
  - `symbols/mapping`, `symbols/mapping/batch`, `symbols/search` — mapping and discovery utilities.
- TV:
  - `tv/search` — TradingView symbol search utility (alternative to `server.js` proxy).
- Websocket control:
  - `ws` — subscribe/unsubscribe endpoints for FMP WS manager.
- Stripe:
  - `stripe/create-checkout-session`, `stripe/create-portal-session`, `stripe/payment-history`, `stripe/sync-subscription`, `stripe/verify-session`, `stripe/webhook`.
- Earnings:
  - `earnings/context` — earnings-related enrichment/context.
- Cron:
  - `cron/*` — cache warmers: update quotes, cache extended hours, update dividends, archive news, classify news, etc.

Notes:
- These endpoints frequently touch Firestore (admin or client) and/or the in-memory cache.
- CORS headers for `/api/*` are set in `next.config.js`.

---

## 7) Client/UI Layers

- Charting: `components/TradingView/TradingViewChart.tsx` with `lightweight-charts` and custom plugins:
  - `plugins/extended-hours-overlay.ts`
  - `plugins/trend-line.ts`
- UI Controls: `ChartModal`, `DrawingToolbar`, `TimeframeSelector`.
- Hooks:
  - Data acquisition: `useFMPData`, `useMergedStockData`, `useExtendedHoursData`, `useDividendData*`, `useNewsData`, `useRSSNews`, `useWSJNews`.
  - UX/State: `useSymbolSearch`, `useWatchlist*`, `useChartModal`, `useDrawingTools`, `useColumnResize`, `useSubscription`.
- Service worker: `components/ServiceWorkerProvider.tsx` consults feature flags to register the SW on web (never in Electron).

---

## 8) Data and Caching

- In-memory cache (`lib/cache/simple-cache.ts`):
  - TTL-based Map with eviction and periodic cleanup (server-only).
  - Exposed “buckets”: `quotes`, `dividends`, `news`, `metadata` and a unified facade `stockDataCache`.
  - Typical TTLs: quotes ~30 seconds, dividends 24 hours (see call sites).
- Firestore:
  - Global caches: `quotesCache` docs include `schemaVersion`, `apiVersion`, `lastUpdated`, `ttl`, `updatedBy`; API endpoints strip metadata before returning.
  - Dividends: per-symbol docs with `exDate`, `paymentDate`, `amount`, `ttl`, `lastUpdated`, `updatedBy`.
  - Watchlists: `users/{uid}/data/watchlist` structure scanned to compute active symbols set under `admin/meta/cache/activeSymbols`.

---

## 9) Build, Scripts, and Desktop Packaging

Core scripts (root `package.json`):
- `dev`/`build`/`start`: Standard Next.js lifecycle.
- `electron:dev`: Runs Next dev server and launches Electron pointing at `http://localhost:${PORT}`.
- `electron:build*`: Builds Next and packages Electron apps for each OS via `electron-builder`.
- Other utilities: `eval`, `deploy`, `fresh`, `clean`.

Scripts in `scripts/**`:
- Topic/macro classification backfills, symbol mapping builders, metrics, watchlist screenshots, and test harnesses (often require `OPENAI_API_KEY`, `FMP_API_KEY`, and Firebase `NEXT_PUBLIC_*`).

Desktop notes:
- `electron/main.js` sets `ELECTRON='true'` in spawned env to disable PWA logic and configures window/menu.
- Production starts Next via the Next CLI with `next start -p ${PORT}` inside the packaged app.

---

## 10) Integration Guidance and Pitfalls

Recommended approach (monorepo or side-by-side integration):
1) Move this project into an `apps/trading-dashboard` folder of your destination repo (or vice versa).
2) Use a single workspace root (npm/pnpm/yarn) to share dependencies and a lockfile. Pin Node version and align Next/React/Electron versions across apps if applicable.
3) Preserve secrets and feature flags by porting all env variables (see Section 5). Separate web-only `NEXT_PUBLIC_*` from server-only secrets.
4) If your host app already has a service worker, ensure only one SW is active. Keep PWA disabled for desktop by setting `ELECTRON='true'`.
5) Keep Stripe endpoints on Node runtime and configure the webhook path and signing secret in your hosting stack. Never expose `STRIPE_SECRET_KEY` to the client.
6) Keep OpenAI usage on Node runtime; do not run on Edge unless your platform supports secure secrets injection at the edge.
7) If you need true push realtime, run a dedicated Node WS server. The existing `app/api/ws` acts as a control plane and snapshot fetcher; it does not provide ongoing push over a single connection.
8) Reproduce CORS headers for `/api/*` if your reverse proxy otherwise blocks cross-origin access.
9) If merging only parts:
   - Market data: integrate `services/fmp/**` and `hooks/useFMPData.ts`, wire `FMP_API_KEY`.
   - Charting: adopt `components/TradingView/**` and dependent utilities in `utils/**`.
   - Persistence: use `lib/firebase/**` as-is and port Firestore rules/collections accordingly.
   - Payments: copy the `app/api/stripe/**` routes and configure all Stripe env vars and webhooks.

Common pitfalls:
- Edge runtime secrets: OpenAI calls fail if deployed on Edge without secrets available.
- Divergent versions: Align `next`, `react`, `electron`, and `typescript` to avoid type/runtime clashes.
- Double SW registration: Ensure PWA is off in Electron builds and controlled via `NEXT_PUBLIC_ENABLE_SW`.
- Missing FMP key: Many endpoints log warnings or return degraded data when `FMP_API_KEY` is absent.
- Stripe webhook: Must be configured in the payment provider dashboard to hit your deployed `app/api/stripe/webhook`.

---

## 11) Quickstart (for local validation)

Prereqs:
- Node 18+ recommended.
- Create `.env.local` with the env groups in Section 5 (at least Firebase client keys, `FMP_API_KEY`, `OPENAI_API_KEY` if testing AI features, and Stripe keys if testing checkout).

Local runs:
- Web only: `npm run dev` → `http://localhost:3000`
- Electron dev: `npm run electron:dev` (spawns Next and Electron; sets `ELECTRON='true'`)
- Production desktop build: `npm run electron:build:mac` (or `:win`, `:linux`)

---

## 12) Legal/Security Notes

- Do not expose server-only secrets (`STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `FMP_API_KEY`) to clients or in `NEXT_PUBLIC_*`.
- Review your platform’s data processing terms for third-party APIs (FMP, OpenAI, Stripe).
- Ensure Firestore security rules align with watchlist and user data access patterns (see `firestore.rules` in repo).

---

## 13) Pointers

- CORS headers: `next.config.js` (`/api/:path*`).
- Feature flags: `config/features.ts`.
- FMP integration: `services/fmp/**`, `app/api/stocks/**`, `app/api/cron/**`.
- News + AI: `app/api/news/**`, `lib/news/topic-classifier.ts`.
- Firebase client/admin: `lib/firebase/config.ts`, `lib/firebase/admin.ts`.
- Charting: `components/TradingView/**`, `utils/chart-helpers.ts`, `utils/chart-theme.ts`.
- Caching: `lib/cache/simple-cache.ts`.
- Electron wrapper: `electron/main.js`, `electron/preload.js`.
- TradingView symbol search proxy: `server.js` or `app/api/tv/search`.

This brief is self-contained and should enable an LLM to reason about integration points, configure required secrets, and safely reuse or adapt modules in another codebase or a monorepo.


