# Newsletter Chart Generation — How It Actually Works

This document describes, in detail, how charts are created, edited, rendered, and embedded in our newsletter system. It is intended as a self-contained briefing so an outside reviewer can give feedback on the design without needing to read the source.

The newsletter pipeline does many other things (stock picking, copy generation, Beehiiv publishing). This document focuses **only on the charting side**.

---

## 1. The two-app architecture

There are two separate Next.js apps involved:

1. **Fin Quote (this repo)** — owns newsletter authoring, drafts, the editor UI, and orchestration. It runs on `localhost:3000` in dev and `app.theintraday.com` in prod.

2. **Charting Platform (separate repo)** — owns the actual chart rendering (Highcharts + lightweight-charts) and a headless PNG render endpoint. It runs on `localhost:3001` in dev and `charts.theintraday.com` in prod.

The two apps communicate only via **URLs with base64-encoded JSON state**. The contract between them is a `captureSpec` blob (for PNG export) and a `fundState` / `priceState` blob (for interactive view and editor mode). There is no direct API call other than the headless render endpoint.

Newsletters cannot embed iframes (email clients won't run JS), so the chart must be flattened to a PNG for the email. But we still want the same chart available as a live, interactive page when readers click through. So every chart resolves to **two URLs that describe the same chart** — one renders as PNG, the other renders interactively.

```
                ┌──────────────────────────────────────┐
                │   Fin Quote (this repo)              │
                │   - Editorial templates              │
                │   - Newsletter draft store           │
                │   - Newsletter editor UI             │
                │   - Orchestrator                     │
                └────────┬──────────────┬──────────────┘
                         │              │
              (1) POST   │              │ (2) base64 URL
              renderSpec │              │ → <img src> + <a href>
                         ▼              ▼
                ┌──────────────────────────────────────┐
                │   Charting Platform (other repo)     │
                │   - /tos/api/newsletter/render (PNG) │
                │   - /tos/export/newsletter (PNG view)│
                │   - /tos/<TICKER>?view=fundamentals  │
                │     (interactive)                    │
                └──────────────────────────────────────┘
```

---

## 2. Two chart modes

Every newsletter chart is one of two modes. They share the URL contract but use different state shapes.

### 2.1 Fundamentals charts

Bar/line/area charts of financial metrics over time (revenue, net income, EPS, margins, FCF, etc.). Supports:

- Multiple stocks (primary first, plus compare symbols)
- Multiple metrics (e.g. revenue + net income on the same chart)
- Annual or quarterly period
- Year range (min/max year)
- Optional stock-price overlay on a secondary axis
- Stacked bars
- "Index to zero" mode (normalize first data point to 0% for comparison)
- Per-metric color overrides
- Custom title / subtitle text

The TypeScript type is `FundamentalsNewsletterChartSpec` in `lib/newsletter/types.ts:62`, which extends a `ChartExportSpec` shared with another surface (chart-of-the-day editor).

### 2.2 Price charts

Time-series price charts. Supports:

- Single symbol
- Range: `1d`, `5d`, `1m`, `3m`, `6m`, `1y`, `2y`, `5y`
- Interval: `1sec` through `M` (monthly)
- Chart type: `candles`, `hollow-candles`, `ohlc-bars`, `line`, `heikin-ashi`
- An optional opaque `priceState` snapshot (passed through to the charting app without inspection)

Type: `PriceNewsletterChartSpec` in `lib/newsletter/types.ts:66`.

The discriminator is `spec.mode`. Fundamentals specs may omit `mode` (legacy default); price specs must have `mode: 'price'`.

---

## 3. End-to-end flow

```
Editorial template ──► Newsletter spec ──► URL pair ──► PNG render ──► <img> in email HTML
                                                          │
                                                          └──► Interactive link in same email
```

### 3.1 Editorial templates (the catalog of available chart types)

`lib/newsletter/editorial-templates.ts` defines a fixed catalog of chart "templates" — preset configurations like `revenue_vs_net_income`, `gross_and_operating_margins`, `price_3m_daily`, etc. Each template specifies:

- **For fundamentals**: which metrics, chart type, default period, default year range strategy (`last_n_years: 10`, `all_available`, etc.), default colors, max metric count, whether price overlay is allowed/default, title/subtitle pattern with placeholders.
- **For price**: range, interval, chart type, title/subtitle pattern.

Templates also have prose fields used by the AI: `description` (what it shows) and `whenToUse` (when to pick it). The model is given the full template list and is asked to choose which templates fit the editorial story for the current newsletter.

### 3.2 Resolving a template into a concrete spec

Once a template is picked, `resolveEditorialChart()` in `lib/newsletter/resolve-chart.ts:66` produces a fully-formed `NewsletterChartSpec`:

- Year range strategy is converted into concrete `minYear` / `maxYear` (e.g. `last_n_years: 10` with current year 2026 → `minYear: 2017, maxYear: 2026`).
- Title and subtitle patterns are filled in with `{ticker}`, `{minYear}`, `{maxYear}`.
- The caller can override period type, year range, title, subtitle, price overlay, and colors.

The resolver throws on unknown templates, empty tickers, or empty metric lists.

### 3.3 Resolving the spec into two URLs

`resolveChartingPlatformNewsletterChart()` in `lib/newsletter/charting-platform-export.ts:227` takes the spec and a `chartBaseUrl` and produces:

- **`captureUrl`** — `${chartBaseUrl}/tos/export/newsletter?spec=<base64-json>` — a static URL that points at the charting app's PNG-export route.
- **`interactiveUrl`** — `${chartBaseUrl}/tos/<TICKER>?view=fundamentals&fundState=<base64-json>` — the same chart as a live, interactive page.
- **`captureSpec`** — the unencoded blob that was base64'd into the capture URL.
- **`fundState`** — the unencoded blob that was base64'd into the interactive URL.

Encoding is base64url JSON (`Buffer.from(JSON.stringify(...)).toString('base64')` with `+/=` replaced by URL-safe equivalents — see `encodeBase64UrlJson` in `lib/newsletter/charting-platform-export.ts:77`).

#### The fundamentals `fundState` blob

Built in `resolveFundamentalsNewsletterChart()` (`charting-platform-export.ts:275`). Selected fields:

```ts
{
  active: true,
  workspaceMode: 'fundamentals',
  symbol: ticker,
  compareSymbols: [/* extra tickers */],
  period: 'annual' | 'quarter',
  chartType: 'bar' | 'line' | 'area',
  exportColors: false,
  showLabels: spec.showLabels !== false,
  showTooltip: true,
  hoverFocusEnabled: true,
  gradientBars: false,
  brandColorsMode: 'off',
  stacked: spec.stacked === true,
  indexed: spec.indexToZero === true,
  sliderOnlyMode: true,           // shows year-range slider, hides other controls
  yearRangeCustomized: <bool>,
  metricColors: { metricId: '#hex', ... },
  addedMetrics: [...],
  visibleMetrics: [...],
  activeMetric: <metric>,
  activeSeriesId: `${ticker}::${activeMetric}`,
  chartTitleCustomized: <bool>,
  chartTitleText: <string>,
  chartTitleLeft: null, chartTitleTop: null,
  autoAnnotationLeft: null, autoAnnotationTop: null,
  minYear, maxYear,
}
```

The `captureSpec` for fundamentals is then:

```ts
{
  version: 1,
  mode: 'fundamentals',
  ticker, symbol: ticker,
  theme,
  width, height,
  fundSymbol: ticker,
  fundState,    // ← the blob above, nested inside
}
```

Note that the PNG route receives `fundState` **nested inside** a `captureSpec` wrapper, while the interactive route receives `fundState` **as the top-level query param**. The two surfaces don't agree on the envelope.

#### The price `captureSpec`

Much simpler. Built in `resolvePriceNewsletterChart()` (`charting-platform-export.ts:367`):

```ts
{
  version: 1,
  mode: 'price',
  ticker, symbol: ticker,
  range, interval, chartType,
  theme, width, height,
  priceState?,    // optional opaque snapshot
}
```

The interactive URL gets the same fields as individual query params (`range`, `interval`, `chartType`, optional `priceState`).

### 3.4 Rendering the PNG

`captureChart()` in `lib/newsletter/capture.ts:49` does the actual rendering. It:

1. Calls `resolveChartingPlatformNewsletterChart()` to get the capture spec.
2. POSTs to `${chartBaseUrl}/tos/api/newsletter/render` with `{ spec: captureSpec, timeoutMs }`.
3. Expects an `image/png` response body and writes it to disk.

The charting app (other repo) is what owns Puppeteer. Fin Quote never runs a headless browser for chart rendering — it just makes an HTTP call. The render endpoint internally navigates to `/tos/export/newsletter?spec=<base64>` in a headless browser, waits for the chart to render, and screenshots it.

Errors are surfaced from the response body when content-type is JSON (`{ error: '...' }`), otherwise from raw text or HTTP status.

### 3.5 Embedding in the email

`buildNewsletterBlock()` (specifically `renderChart()` in `lib/newsletter/build-block.ts:100`) emits:

```html
<a href="${interactiveUrl}" target="_blank" style="...">
  <img src="${chartImageUrl}"
       alt="${alt}"
       width="600"
       style="display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto;" />
</a>
```

So in the email the chart is **a PNG wrapped in an anchor to the interactive URL**. Readers see a static image; clicking it opens the live chart in the browser, configured identically.

The card max-width is hardcoded to `600px` (`NEWSLETTER_CARD_MAX_WIDTH` in `build-block.ts:19`) and the image `width` attribute is set to the same. The PNG's intrinsic pixel size is unrelated to this — see §4.

---

## 4. Dimensions

All newsletter chart exports use a single canonical pipeline. Same spec → same dimensions, regardless of whether the render comes from the orchestrator, draft regeneration, or the in-app editor. The resolver lives in `lib/newsletter/render-dimensions.ts`.

### 4.1 The constants

```ts
// lib/newsletter/render-dimensions.ts
export const NEWSLETTER_CARD_MAX_WIDTH = 600          // <-- single source of truth
export const NEWSLETTER_EMAIL_DISPLAY_WIDTH = 600
export const NEWSLETTER_EMAIL_IMAGE_DPR = 2
export const NEWSLETTER_RENDER_WIDTH = 1200           // display × DPR

export const NEWSLETTER_PRICE_RENDER_WIDTH = 1200
export const NEWSLETTER_PRICE_RENDER_HEIGHT = 720

export const NEWSLETTER_FUNDAMENTALS_RENDER_WIDTH = 1200
export const NEWSLETTER_FUNDAMENTALS_RENDER_HEIGHT = 780

export const NEWSLETTER_FUNDAMENTALS_DENSE_RENDER_WIDTH = 1200
export const NEWSLETTER_FUNDAMENTALS_DENSE_RENDER_HEIGHT = 860
```

### 4.2 The model

- Email card width: **600 px**.
- Intrinsic PNG width: **1200 px** (2× DPR) — looks crisp on retina without depending on `srcset`, which is unreliable across email clients.
- Height varies per chart type but width does not, so all email images downscale to the same 600 px column with the same horizontal proportions.

### 4.3 Height per chart type

| Chart type | Width × Height | Aspect | Rule |
|---|---|---|---|
| Price | 1200 × 720 | 5:3 | All price charts. |
| Fundamentals (normal) | 1200 × 780 | ≈10:6.5 | 1–2 metrics, no compare symbol, no price overlay. |
| Fundamentals (dense) | 1200 × 860 | ≈10:7.2 | 3+ metrics, OR 2+ stocks, OR (price overlay AND 2+ metrics). |

The "dense" predicate is `isDenseFundamentalsSpec()`; the dispatcher is `getNewsletterChartRenderDimensions(spec)`. Both are exported from `render-dimensions.ts`.

### 4.4 How dimensions flow through the system

- **Capture** (`lib/newsletter/capture.ts`): `captureChart(spec, options)` defaults `width` and `height` from `getNewsletterChartRenderDimensions(spec)` when callers don't override. Callers normally don't override.
- **Orchestration** (`lib/newsletter/orchestrate.ts`): no longer threads a flat `chartRenderWidth` / `chartRenderHeight` per pipeline run. The `editorMode` flag still gates the preview-screenshot side effect (`skipPreviewCapture`) but no longer affects chart dimensions.
- **Draft regenerate** (`lib/newsletter/drafts.ts → regenerateNewsletterDraftChart`): same — it doesn't pass explicit width/height, so the regenerated chart uses the same canonical dimensions the original orchestration pass used. The `editorMode` flag has been removed from this path because it caused the editor-vs-original mismatch.
- **Editor iframe** (`lib/newsletter/chart-editor.ts`): the `newsletterEditorWidth` / `newsletterEditorHeight` URL params are now derived from `getNewsletterChartRenderDimensions(spec)`, so the chart in the editor is laid out at the same canonical size that will be exported. The iframe itself may be displayed larger visually inside the drawer, but the chart inside it is rendered for the canonical export.

### 4.5 The single override path

`NewsletterOptions.chartRenderWidth` and `NewsletterOptions.chartRenderHeight` are still accepted as opt-in overrides at the top-level `generateNewsletter` call. They pass through to `captureChart` unchanged. This is for one-off cases (custom social-image exports, scaled previews) and is never used in the normal newsletter flow.

---

## 5. The newsletter editor

`components/newsletter/NewsletterChartEditorDrawer.tsx` is the in-app editor for a single chart on a draft.

The host page **does not render the chart** — it embeds the charting app in an iframe. State sync is via `window.postMessage`.

### 5.1 Loading

1. Host calls `resolveNewsletterChartEditor()` (or `resolveNewsletterPriceChartEditor()`) with the block's `chartSpec`.
2. That returns an `iframePath` (relative — Next.js `rewrites` proxy `/tos/*` to the charting host so the iframe is same-origin and `postMessage` works).
3. The iframe URL has `embed=true`, `newsletterEditor=1`, target dimensions, and either `fundState` or `priceState` encoded in the query string.
4. The charting app boots, decodes the state, renders the chart, and posts `{ type: 'READY' }` back to the host.

### 5.2 Applying state after `READY`

On `READY`, the host posts (in order):

- `SET_THEME` with `theme: 'light'` (re-sent at +800 ms to survive any chart re-init)
- For fundamentals: `APPLY_FUND_STATE` with the host's editor `fundState` (same as capture `fundState` but with `sliderOnlyMode: false, showTooltip: true, hoverFocusEnabled: true` so the user can interact).
- For price: `SET_WORKSPACE_MODE` then `SET_SYMBOL`, repeated at +180 ms.

After ~500 ms the host fades the iframe in (`setChartVisible(true)`) to mask the boot flicker.

### 5.3 Reading state on save

When the user clicks Save, the host posts `GET_FUND_STATE` (or `GET_PRICE_STATE`) and waits for `FUND_STATE` (or `PRICE_STATE`) back, with a `READ_STATE_TIMEOUT_MS` timeout (currently a few seconds; if it fires the save resolves to null and the host shows an error).

### 5.4 Parsing state into a spec

The returned `fundState` is opaque. The host calls `parseFundamentalsNewsletterChartSpecFromFundState()` (`chart-editor.ts:86`), which delegates to `parseDashboardChartOfTheDayEditorSpecFromFundState()` in `lib/dashboard/chart-of-the-day-editor.ts`. That function knows how to read the charting app's `fundState` shape and produce a `ChartExportSpec` (with `mode: 'fundamentals'` tagged on).

For price, `parsePriceNewsletterChartSpecFromState()` (`chart-editor.ts:138`) reads `range`, `interval`, `chartType`, `symbol/ticker` from the returned state and falls back to the prior spec for anything missing.

### 5.5 Saving

The new spec replaces the block's `chartSpec` in the draft. The draft is persisted. A separate "regenerate chart PNG" action runs `captureChart()` to produce a new image at editor dimensions, writes it to `./.newsletter-output/...png` (served at `/newsletter-charts/...png` by the route handler in `app/newsletter-charts/[...path]/route.ts`), and updates `chartImageUrl` + sets `chartNeedsRegeneration: false`.

---

## 6. Metric ID translation

The newsletter spec uses one set of metric IDs (e.g. `revenue`, `net_income`, `gross_margin`). The charting app uses a different set (camelCase, with some manual aliases for things like `PE`, `PS`, `EV`).

The translation lives in `lib/charting-metric-bridge.ts`. Key functions:

- `toChartingMetricId(specMetricId: string): string` — used when building `fundState` for the charting app. Looks up in an alias table first, then falls back to snake-to-camel conversion.
- `toSpecMetricId(chartingMetricId: string): string` — the reverse direction, used when parsing iframe state back into a spec.

Both throw on empty strings. They do **not** throw on unrecognized IDs — they fall through to a generic case conversion, which may produce an ID the other side doesn't recognize.

In `charting-platform-export.ts`:

- `mapMetricColors()` translates the spec's `colors` keys via `toChartingMetricId()` — but silently drops any entry whose color is empty/non-string.
- `mapMetricId()` is called for each metric in `spec.metrics`. The result is run through `uniqueStrings()` (filters falsy values, deduplicates). If `toChartingMetricId` ever returned an empty string this would silently lose the metric — currently it throws on empty input so that's safe, but unknown IDs become whatever snake-to-camel produces and may not match any chart series.

---

## 7. URL configuration

There are two distinct charting-app base URLs the system needs:

- **`chartBaseUrl`** (for PNG rendering) — the URL the headless renderer hits. In dev this is `localhost:3001`; in prod, `charts.theintraday.com`.
- **`publicChartBaseUrl`** (for click-through links) — the URL embedded in the email's `<a href>`. This must be public-internet reachable even if the worker is on a local machine.

Resolution helpers (`charting-platform-export.ts:167–225`):

- `getDefaultChartingBaseUrl()` — reads `NEXT_PUBLIC_CHARTING_URL` env, falls back to `localhost:3001` in non-prod, else `charts.theintraday.com`.
- `getDefaultPublicChartingBaseUrl()` — reads `NEWSLETTER_PUBLIC_CHARTING_URL` env, otherwise same fallback.
- `getDefaultChartingBaseUrlForHost(hostHeader)` / `getDefaultPublicChartingBaseUrlForHost(hostHeader)` — used by request handlers. If the request came from a localhost host header, uses the local charting URL; otherwise uses the env default. This handles the case where the same code runs both locally (developer hits `localhost:3000`) and on prod (request hits `app.theintraday.com`) and needs to pick the matching charting host.

For draft preview iframes (same-origin so `postMessage` works), the code uses a sentinel URL `https://charting-proxy.theintraday.invalid` and then extracts just `pathname + search` for use as a relative path. Next.js rewrites then proxy `/tos/*` to the real charting host. This avoids cross-origin issues during editing.

---

## 8. State of the draft after generation

After full orchestration, each newsletter block is a `NewsletterDraftBlock` (`lib/newsletter/types.ts:480`) with:

```ts
{
  id: string
  layoutId: 'chart_plus_commentary'
  templateId: string             // editorial template that produced this chart
  selectionReason: string        // AI rationale for picking this template
  heading: string
  body: string                   // AI-generated commentary
  chartImageUrl: string          // local path under /newsletter-charts/ or Supabase public URL after publish
  chartAlt: string
  chartExportUrl: string         // interactive URL on the charting app
  chartSpec: NewsletterChartSpec // full spec, persisted so editor + regenerate work
  chartNeedsRegeneration: boolean
  caption?: string
  ctaText?: string
  ctaUrl?: string
  footer?: string
}
```

`chartSpec` is the source of truth. `chartImageUrl` and `chartExportUrl` are derived artifacts; both can be regenerated from `chartSpec` alone.

`chartNeedsRegeneration` is set to `true` by the editor when the spec changes and the PNG hasn't been re-captured yet. A separate "regenerate" action flips it back to `false`.

When publishing (option `publish: true`), `publishChartImages()` in `lib/newsletter/publish.ts` uploads every local PNG to Supabase Storage and rewrites `chartImageUrl` to the public Supabase URL so Beehiiv can fetch the image.

---

## 9. Quick reference — file map

| File | Role |
|---|---|
| `lib/newsletter/types.ts` | All chart spec, draft block, and orchestration types |
| `lib/newsletter/render-dimensions.ts` | The four dimension constants |
| `lib/newsletter/chart-spec.ts` | Type guards + normalizers for price chart spec fields |
| `lib/newsletter/editorial-templates.ts` | The catalog of available chart templates |
| `lib/newsletter/resolve-chart.ts` | `resolveEditorialChart()` — template + options → concrete spec |
| `lib/newsletter/charting-platform-export.ts` | `resolveChartingPlatformNewsletterChart()` — spec → captureUrl + interactiveUrl + captureSpec + fundState |
| `lib/newsletter/capture.ts` | `captureChart()` — POST captureSpec to render endpoint, write PNG to disk |
| `lib/newsletter/chart-editor.ts` | `resolveNewsletterChartEditor()` + parse-from-fundState helpers for the in-app editor |
| `lib/newsletter/build-block.ts` | Email HTML assembly for one block, including the `<a><img></a>` chart wrap |
| `lib/newsletter/assemble.ts` | Email HTML document assembly (header, blocks, footer) |
| `lib/newsletter/orchestrate.ts` | Top-level pipeline: stock pick → template select → resolve → capture → copy generation → assemble |
| `lib/newsletter/drafts.ts` | Draft persistence + the "regenerate chart" action |
| `lib/newsletter/publish.ts` | Upload chart PNGs to Supabase Storage for public-URL access from Beehiiv |
| `lib/charting-metric-bridge.ts` | Translation table between spec metric IDs and charting-app metric IDs |
| `components/newsletter/NewsletterChartEditorDrawer.tsx` | The in-app iframe-based chart editor (postMessage protocol) |

---

## 10. Open questions / known weak spots

These are areas where the design feels under-specified or where we are uncertain whether the current approach will scale. Honest feedback on any of these is welcome.

1. **Two URL surfaces with subtly different envelopes.** The PNG route receives `fundState` nested under a `captureSpec` wrapper that carries `version`, `mode`, `theme`, `width`, `height`, `ticker`, `fundSymbol`, etc. The interactive route receives `fundState` directly as a query param, with `theme` as a separate query param. They share the chart-defining state but disagree on the envelope. Should these be unified?

2. **The charting-platform contract is untyped at the boundary.** Both the `captureSpec` and the `fundState` cross the URL as `Record<string, unknown>`. There is no shared type or JSON schema between the two repos. If the charting app renames or removes a `fundState` field, this repo will keep emitting URLs that the charting app silently misinterprets.

3. **Metric ID bridge silently degrades.** `toChartingMetricId` throws only on empty strings; unknown IDs are silently converted via snake-to-camel and may not match any chart series. There is no test that round-trips every spec metric ID through the bridge and verifies the charting app accepts the result.

4. **No "PNG matches interactive view" test.** The entire premise of the design is that the PNG and the click-through page show the same chart. There is no automated test that asserts this — for example, by hitting both URLs with the same spec and pixel-diffing the result.

5. ~~Dimension dual-track.~~ **Resolved.** All exports use a single canonical pipeline keyed by spec — see §4.

6. ~~Email image scaling.~~ **Resolved.** PNG is 1200 px wide, email displays at 600 px (2× DPR baked into the single asset). No `srcset` dependency.

7. **postMessage protocol is loose.** The editor protocol uses `{ v: PM_VERSION, type, payload }` envelopes. Versioning is checked, but there is no schema validation of payloads — if the charting app posts a malformed `FUND_STATE` we won't know until parsing fails.

8. **Editor "ready" timing is heuristic.** The editor sends `SET_THEME` once on `READY`, then again at +800 ms to defeat a re-init flicker. Symbol/workspace-mode is sent twice for price charts (immediate and +180 ms). These delays are not derived from any signal from the charting app; they were tuned by hand.

9. **Two env vars + host-sniffing for URLs.** `NEXT_PUBLIC_CHARTING_URL` for the rendering URL, `NEWSLETTER_PUBLIC_CHARTING_URL` for the click-through URL, plus `isLocalChartingHost(host)` to override based on the request's Host header. This has worked but is more configuration surface than the problem may warrant.

10. **No spec version migration.** `captureSpec.version` is hardcoded to `1`. There is no plan for what happens if we need to evolve the shape — the charting app would have to handle a future v2 spec while older drafts persist a v1 spec in the database.
