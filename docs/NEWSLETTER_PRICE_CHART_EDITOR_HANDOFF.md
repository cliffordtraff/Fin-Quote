# Newsletter Price Chart Editor — Codex Handoff

## The Goal

The newsletter editor at `app/newsletter/editor/[id]/NewsletterDraftEditor.tsx` lets the user
edit each block of a newsletter draft. Each block has a chart (either a **fundamentals** chart
like "AMZN Gross vs Operating Margin" or a **price** chart like a TXN 1-month candlestick).

We want this end-to-end flow for *both* chart types:

1. User clicks the chart image in the newsletter preview (or a top-bar "Edit chart" button).
2. A full-screen drawer opens over the newsletter editor.
3. The drawer embeds the external charting platform in an iframe, preloaded to the block's
   exact state (ticker, metrics, range, interval, chart type, theme, …).
4. User tweaks the chart interactively (same UI as the standalone charting app).
5. User clicks **Save chart**.
6. The drawer reads the current state back from the iframe via `postMessage`, builds a new
   `NewsletterChartSpec`, and POSTs it to `/api/newsletter/drafts/[id]/regenerate-chart` which
   re-captures the PNG and persists.
7. The drawer closes; the newsletter preview refreshes with the new chart image.

**Fundamentals charts work.** Clicking a fundamentals block opens the drawer with the correct
symbol + metrics, light background, user can edit, save works, preview updates.

**Price charts don't.** This is the open problem this document is about.

---

## Repo Context

Two separate codebases are involved — work spans both.

| Codebase | Path | Port (dev) | Purpose |
|---|---|---|---|
| **Fin Quote** (this repo) | `/Users/cliffordtraff/Desktop/Coding/Fin Quote` | 3000 | Next.js 15 app. Hosts newsletter editor, drawer component, calls regenerate-chart API. |
| **Charting Platform** | `/Users/cliffordtraff/Desktop/Charting Platform` | 3001 | Express + tsx-watch app. Serves `/tos/:ticker` — the standalone charting app. Contains chart engine, fundamentals workspace, embed bridge (postMessage protocol). |

**Wiring:** Fin Quote's `next.config.js` rewrites `/tos/:path*` → `localhost:3001/tos/:path*`,
so when the drawer's iframe `src="/tos/TXN?..."` loads from the browser's POV, it's same-origin
with the parent (`localhost:3000`), but the content is proxied from the charting server.

Both dev servers run via watch (`npm run dev` on Fin Quote, `npm run dev` → `scripts/dev.mjs`
using `tsx watch` on Charting Platform). Edits to either auto-reload.

---

## The Features That Work (reference)

Before diving into the broken case, here's the working fundamentals flow — it's the model we're
trying to mirror for price.

### Fundamentals flow (works today)

- **Click interception** — `components/newsletter/NewsletterDraftEditor.tsx`'s
  `handlePreviewIframeClick` listens on the preview iframe's `contentDocument` (same-origin via
  `srcDoc`). Detects clicks on an `img` inside a `[data-newsletter-preview-block-id]` container.
  Calls `setSelectedPanel(blockId)` + `setChartEditorOpen(true)`.
- **Drawer** — `components/newsletter/NewsletterChartEditorDrawer.tsx` renders a
  fixed-inset `<div>` with an `<iframe>` pointing at the charting app.
- **Iframe URL for fundamentals** — built by
  `lib/newsletter/chart-editor.ts::resolveNewsletterChartEditor(spec)`:
  `/tos/{ticker}?view=fundamentals&theme=light&fundSymbol={ticker}&fundState={base64-json}&embed=true`.
  The `fundState` blob encodes metrics, period, chart type, year range, colors, etc.
- **Round-trip on READY** — embedBridge on the charting side fires `{v:1, type:'READY'}` after
  init. The drawer's message handler, on READY, sends
  `{v:1, type:'APPLY_FUND_STATE', payload:{fundState}}` which force-applies the full state via
  `window.applyFundamentalsWorkspaceState(fundState, { activate:true, refresh:true, ... })`.
  This is the critical step that prevents localStorage/IndexedDB-restored state from winning
  the race.
- **On Save** — drawer posts `{v:1, type:'GET_FUND_STATE'}`; bridge replies with
  `{v:1, type:'FUND_STATE', payload:{fundState, symbol}}`; drawer parses via
  `parseFundamentalsNewsletterChartSpecFromFundState` (wraps
  `lib/dashboard/chart-of-the-day-editor.ts::parseDashboardChartOfTheDayEditorSpecFromFundState`);
  POSTs updated `chartSpec` to `/api/newsletter/drafts/[id]/regenerate-chart`.

### Shared / foundational pieces

- `lib/newsletter/types.ts` — `NewsletterChartSpec = FundamentalsNewsletterChartSpec | PriceNewsletterChartSpec`,
  `NewsletterDraftBlock`, `NewsletterDraftDocument`, etc.
- `lib/newsletter/chart-spec.ts` — `isPriceNewsletterChartSpec`,
  `normalizeNewsletterPriceRange/Interval/ChartType`, `NEWSLETTER_PRICE_CHART_TYPES`.
- `lib/newsletter/charting-platform-export.ts` —
  `resolveChartingPlatformNewsletterChart(spec, options)` builds URLs. Two branches:
  `resolveFundamentalsNewsletterChart` and `resolvePriceNewsletterChart`. Both return
  `{ interactiveUrl, captureUrl, captureSpec, ... }`.
- `app/api/newsletter/drafts/[id]/regenerate-chart/route.ts` — receives
  `{ blockId, draft }`, calls `regenerateNewsletterDraftChart` in
  `lib/newsletter/drafts.ts` which normalizes the block, captures a new PNG via
  `captureChart(block.chartSpec, …)`, and persists. **No server-side changes needed** for price —
  the client just needs to mutate `draft.blocks[i].chartSpec` before posting.

---

## The Price Chart Problem

### Observed symptoms (most recent, after all fixes below)

When the user clicks a price chart block (e.g., "Earnings Spark One-Month Surge for TXN"):

1. Drawer opens. Header says "Edit chart — Earnings Spark One-Month Surge for TXN".
2. Iframe briefly shows something (hard to tell what).
3. Chart settles showing:
   - **Correct ticker** — "Texas Instruments Incorporated" (TXN). ✅
   - **Dark background** — the chart's plot area is a dark navy (approx. `#131722`), while the
     top toolbar (`1m 5m 15m 1h 4h D W` + search input) is **light**. So the page is in light
     mode but the chart engine rendered its plot area with the default dark-theme colors. ❌
   - **Wrong viewport** — daily candles for TXN 1m range occupy roughly the left half of the
     chart; the right half is empty future dates (x-axis shows `4/27, 5/4, 5/11, 5/19, 5/26,
     6/2, 6/9, 6/11` while today is ~2026-04-23 and data ends ~4/20). The chart engine is
     auto-stretching bars, leaving a huge right-margin of empty future space. ❌

The preview image in the newsletter (image 15, `components/newsletter/RichTextEditor`-rendered
HTML) shows the **correct** rendering — narrower viewport, tight framing, light background. It
uses the same URL, just rendered via Puppeteer at a fixed width/height for PNG capture. So the
chart engine *can* produce the right output; it just doesn't when loaded interactively in the
wide drawer.

### Expected behavior

- Chart loads with **light background** matching the newsletter editor.
- Viewport tight on the candles — minimal empty future space.
- User can edit (change range, interval, ticker, chart type) and hit Save → newsletter preview
  updates with a new PNG.

### Everything has been fixed *except* the dark background + wrong viewport

Earlier problems (all fixed, documented below so nothing regresses):

1. "Clicking price chart briefly shows the price chart, then flips to fundamentals chart of
   different ticker (TSLA)." → **Root cause**: async IndexedDB workspace restore in
   `Charting Platform/src/server/routes/tos-ui/persistence.ts::restoreWorkspaceState()`.
   **Fixed** by gating restore on `PERSISTENCE_EMBED_MODE = (?embed === 'true')`. Also gated
   `restorePrefs`/`persistPrefs` in `fundamentals.ts` on `FUND_EMBED_MODE`.

2. "`GET_FUND_STATE` postMessage never responds — `Could not read the chart state` error."
   → **Root cause**: bridge filtered parent origin against allowlist that only contained
   production domains (no localhost). **Fixed** by making `EMBED_ALLOWED_ORIGINS` empty by
   default when `NODE_ENV !== 'production'`, so bridge allows any origin. Fallback to env var
   remains. (See `Charting Platform/src/server/routes/tos.ts:467-481`.)

3. "Fundamentals chart editor in drawer shows GOOGL + margins despite URL being for CMCSA +
   EPS." → **Root cause**: charting app ran its legacy `restorePrefs` from localStorage which
   restored stale fundamentals state, and the URL's `fundState` param was effectively ignored.
   **Fixed** by (a) the persistence-embed-mode gates above, (b) adding `APPLY_FUND_STATE`
   message type that force-applies state via `window.applyFundamentalsWorkspaceState`.

So the fundamentals flow is fully wired. Price is what remains.

---

## Price Chart: What Has Been Tried

### Implementation currently in place

**Fin Quote side:**

`lib/newsletter/chart-editor.ts`:

```ts
export interface NewsletterPriceChartEditorResolution {
  iframePath: string
  symbol: string
}

export function resolveNewsletterPriceChartEditor(
  spec: PriceNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' } = {},
): NewsletterPriceChartEditorResolution {
  const resolved = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl: CHARTING_PROXY_BASE_URL,  // placeholder, stripped below
    theme: options.theme ?? 'light',
  })

  const url = new URL(resolved.interactiveUrl)
  url.searchParams.set('embed', 'true')

  return {
    iframePath: `${url.pathname}${url.search}`,
    symbol: resolved.ticker,
  }
}

export function parsePriceNewsletterChartSpecFromState(
  priceState: Record<string, unknown>,
  symbol: string,
  fallback: PriceNewsletterChartSpec,
): PriceNewsletterChartSpec | null {
  // builds a PriceNewsletterChartSpec from { symbol, ticker, range, interval, chartType }
  // returned by the charting app.
}
```

The produced URL (verified via curl) is:
`/tos/TXN?view=price&theme=light&range=1m&interval=D&chartType=candles&embed=true`

`components/newsletter/NewsletterChartEditorDrawer.tsx`:

- Detects price vs fundamentals via `isPriceNewsletterChartSpec(block.chartSpec)`.
- Price branch stores `{ kind: 'price', iframePath, symbol, interval, range }`.
- On `READY` message from iframe:
  - Sends `SET_THEME: light`.
  - For price: sends `SET_WORKSPACE_MODE: 'price'`, then `SET_SYMBOL: { symbolId, interval, range }`.
  - Re-sends `SET_THEME: light` after 800ms (defensive, attempt to catch post-reload re-theme).
  - Hides iframe behind a "Loading chart editor…" placeholder for 500ms after READY to avoid
    flashing stale state at the user.
- On **Save**: sends `GET_PRICE_STATE`, awaits `PRICE_STATE` reply with
  `{ priceState: {symbol, ticker, interval, range, chartType, …}, symbol }`. Calls
  `parsePriceNewsletterChartSpecFromState` to build the new spec. Mutates
  `draft.blocks[i].chartSpec`. POSTs to `/api/newsletter/drafts/[id]/regenerate-chart`.

**Charting Platform side:**

`src/server/routes/tos-ui/embedBridge.ts` — added:

```js
case 'GET_PRICE_STATE':
  var priceStateSnapshot = null;
  if (typeof window.getPriceWorkspaceState === 'function') {
    try { priceStateSnapshot = window.getPriceWorkspaceState(); } catch (_err) {}
  }
  sendMessage('PRICE_STATE', {
    priceState: priceStateSnapshot,
    symbol: getEffectiveSymbol(),
    reqId: msg.reqId || null,
  });
  break;
```

`window.getPriceWorkspaceState` is defined in `src/server/routes/tos-ui/bootstrap.ts` and
returns `{ symbol, ticker, interval, range, slotId, style, chartType, … }` by interrogating the
current chart instance.

---

### Dark background — attempts that did NOT fix it

The root cause hypothesis was *something is making the chart engine use `TOS_THEME` (dark)
despite URL `theme=light` and `data-theme='light'` on `<html>`*.

**Verified working:**

- URL reaches the server with `theme=light` (via `curl http://localhost:3001/tos/TXN?...theme=light...&embed=true` — the inline FOUC
  script shows `var forcedTheme = "light";`).
- Next.js rewrite preserves query params (`curl http://localhost:3000/tos/TXN?...` returns the
  same page with `forcedTheme = "light"`).
- FOUC script at `tos.ts:2397-2422` sets `document.documentElement.dataset.theme = "light"`
  synchronously in `<head>`, before any rendering.
- Fundamentals drawer (same infrastructure, same URL format, just `view=fundamentals`) renders
  with light background correctly.

**Things tried (none fixed the dark bg):**

1. **Send `SET_THEME: 'light'` on READY** — bridge's `handleTheme` calls
   `window.themeController.setTheme('light')` which sets `data-theme='light'`, writes
   localStorage, fires `theme-changed`, and `bootstrap.ts:435-438` listens:
   `applyThemeToAllCharts()` which calls `chartRef.resetTheme(TOS_LIGHT_THEME)` on each chart.
   Should re-theme the chart. Did not visibly change anything.

2. **Re-send `SET_THEME: 'light'` 800ms after READY** — in case the chart reload triggered by
   `SET_SYMBOL` re-initialized the chart with the wrong theme. No change.

3. **Added URL-theme fallback in `getBootstrapChartTheme`** in
   `Charting Platform/src/server/routes/tos-ui/bootstrap.ts:40-52`:

   ```js
   function getBootstrapChartTheme() {
     var isLightTheme = !!(document.documentElement && document.documentElement.dataset.theme === 'light');
     if (!isLightTheme) {
       try {
         var urlTheme = new URLSearchParams(window.location.search || '').get('theme');
         if (urlTheme === 'light') isLightTheme = true;
       } catch (_themeUrlErr) {}
     }
     var baseTheme = isLightTheme ? TosEngine.TOS_LIGHT_THEME : TosEngine.TOS_THEME;
     // ...
   }
   ```

   The idea: even if `data-theme` somehow wasn't `light` when the chart was created, pull the
   theme from the URL directly. Still dark.

4. **Disabled localStorage/IndexedDB persistence in embed mode** so nothing can pollute state.
   Didn't change the theme behavior.

**Key observation:** In the drawer, the **toolbar at the top** of the charting app (the
`1m 5m 15m 1h 4h D W` + search input + `Price | Fund | Overview` tabs) renders with **light**
colors. It's only the **chart plot area** below that's dark. This strongly suggests:

- `data-theme="light"` IS set on `<html>` (light toolbar proves it).
- The chart engine (TosEngine.createChart / lightweight-charts) is rendering the chart canvas
  with a theme/background set INDEPENDENTLY of `data-theme`.
- Either the chart was created with the wrong theme and `resetTheme(TOS_LIGHT_THEME)` doesn't
  update the plot-area background, or something is overriding the theme after creation.

**Where to dig next:**

- Check what `chartRef.resetTheme(TOS_LIGHT_THEME)` actually does internally — does it update
  layout.background, or just tick label/grid colors?
- Check `bootstrap.ts:115-131` chart creation — `theme: getBootstrapChartTheme()` is passed. Is
  the `theme` option actually wired to the chart engine's background? Or is background set by
  a separate option?
- `TosEngine.TOS_LIGHT_THEME` / `TosEngine.TOS_THEME` — these constants live in the chart
  engine bundle at
  `Charting Platform/packages/chart-engine/src/`. The bundle is built via esbuild (see
  `package.json`). Might need to inspect the bundle or source to see if `background` color is
  set and if `resetTheme` updates it.
- The `theme-changed` event listener at `bootstrap.ts:435` calls `applyThemeToAllCharts()` on
  every theme change. If that IS running, and if `applyThemeToChart(chartRef)` doesn't
  visibly update the plot-area background, the problem is inside the chart engine's
  `resetTheme` — does it update `layout.backgroundColor`?

### Wrong viewport / too many future dates — not yet tried

The drawer is full-screen (~1920px). The chart auto-sizes bars to fill the width. A 1-month
daily chart has ~22 bars. Stretching 22 bars across 1920px means either (a) huge bars or (b)
a mostly-empty right margin. We see (b) — lots of empty future space.

Hypothesis: after `loadChart('TXN', 'D', '1m')` completes, the chart's viewport is at its
default (maybe "show last N bars with X% right margin"), which on a wide screen produces the
observed behavior. In the Puppeteer capture path, the viewport is explicitly controlled via
`setViewport(...)` (see `bootstrap.ts:981-998::applyRequestedRangeViewport`).

**Not yet tried:** invoking a fit-to-data or explicit viewport call from the drawer after save
completion, OR modifying chartLoader to cap the right margin when `embed=true`.

---

## File Inventory

### Fin Quote (this repo)

| Path | Role |
|---|---|
| `app/newsletter/editor/[id]/NewsletterDraftEditor.tsx` | Main newsletter editor page. Renders preview iframe, drawer, top-bar "Edit chart" button. Click interception on preview chart images via `attachPreviewChartHandler` + `handlePreviewIframeClick`. |
| `components/newsletter/NewsletterChartEditorDrawer.tsx` | Full-screen drawer component. Contains the iframe + Save/Cancel controls. Handles postMessage round-trip for both fundamentals and price. |
| `lib/newsletter/chart-editor.ts` | URL builder (`resolveNewsletterChartEditor` for fundamentals, `resolveNewsletterPriceChartEditor` for price) and state parsers (`parseFundamentalsNewsletterChartSpecFromFundState`, `parsePriceNewsletterChartSpecFromState`). |
| `lib/newsletter/charting-platform-export.ts` | Lower-level URL builders. `resolveChartingPlatformNewsletterChart` → `resolveFundamentalsNewsletterChart` or `resolvePriceNewsletterChart`. |
| `lib/newsletter/chart-spec.ts` | Type guards and normalizers for price specs. |
| `lib/newsletter/types.ts` | Type definitions including `PriceNewsletterChartSpec`. |
| `lib/newsletter/drafts.ts` | `normalizeDraftBlock`, `regenerateNewsletterDraftChart`, `persistNewsletterDraftRow`. |
| `lib/dashboard/chart-of-the-day-editor.ts` | `parseDashboardChartOfTheDayEditorSpecFromFundState` — reused by the drawer for fundamentals parsing. |
| `app/api/newsletter/drafts/[id]/regenerate-chart/route.ts` | POST endpoint that accepts `{draft, blockId}`, calls `regenerateNewsletterDraftChart`, returns updated `NewsletterDraftRecord`. |
| `next.config.js` | Proxies `/tos/:path*` → `localhost:3001/tos/:path*` (dev) so the iframe is same-origin with the Fin Quote app. |

### Charting Platform (`/Users/cliffordtraff/Desktop/Charting Platform`)

| Path | Role |
|---|---|
| `src/server/routes/tos.ts` | Main `/tos/:ticker` Express route. Builds HTML response. Parses URL params (view, theme, range, interval, chartType, embed, fundSymbol, fundState). Assembles inline scripts. Sets CSP `frame-ancestors`. Contains FOUC theme script (lines 2397-2422). `EMBED_ALLOWED_ORIGINS` definition at line 467 (modified for dev-mode behavior). |
| `src/server/routes/tos-ui/embedBridge.ts` | Generates the postMessage bridge script. Handles incoming `SET_SYMBOL`, `SET_TIMEFRAME`, `SET_THEME`, `SET_WORKSPACE_MODE`, `SET_EMBED_SURFACE_MODE`, `OPEN_TICKER_SEARCH`, `SET_TICKER_SEARCH_QUERY`, `CLOSE_TICKER_SEARCH`, `GET_FUND_STATE`, `APPLY_FUND_STATE`, `GET_PRICE_STATE`. Sends `READY`, `ERROR`, `CROSSHAIR_MOVE`, `TICKER_SELECTED`, `TICKER_SEARCH_CLOSED`, `FUND_STATE`, `PRICE_STATE`. |
| `src/embed/protocol.ts` | Type definitions for the bridge protocol (parsing/validation). Inline bridge only checks `v` + `type`; type-specific validation is optional. |
| `src/server/routes/tos-ui/bootstrap.ts` | The big bootstrap script. Chart creation (line 115). `getBootstrapChartTheme` (line 40). `applyThemeToChart` / `applyThemeToAllCharts` (lines 362-391). `theme-changed` listener (line 435). `applyRequestedRangeViewport` (line 971). `window.getPriceWorkspaceState` (line 1101). |
| `src/server/routes/tos-ui/chartLoader.ts` | `loadChart(ticker, interval, range, options)` — handles symbol/range change, calls `applyRequestedRangeViewport` to position viewport after data load (line 174). |
| `src/server/routes/tos-ui/fundamentals.ts` | Huge file (~17,900 lines) containing fundamentals workspace script. `restorePrefs` / `persistPrefs` (lines 7659, 7709 — gated by `FUND_EMBED_MODE`). `applyPersistedFundamentalsWorkspaceState` (line 7833). `setFundWorkspaceMode` (line 16631). Init block starting line 17891. |
| `src/server/routes/tos-ui/persistence.ts` | `PERSISTENCE_EMBED_MODE` constant (added, line ~22). `restoreWorkspaceState` (line 1545) and `refreshWorkspaceFromStoreAndRestore` (line 876) — both gated on embed mode so IndexedDB doesn't clobber authoritative URL state. |
| `src/server/routes/tos-ui/themeController.ts` | Tiny theme controller. `setTheme(mode)` sets `data-theme`, writes localStorage, fires `theme-changed`. |
| `src/server/routes/tos-ui/styles.ts` | All CSS. Default `:root` colors are DARK. `:root[data-theme="light"]` overrides to light (line 85-onward). |
| `packages/chart-engine/src/` | Chart engine source — built into a bundle (esbuild). `TOS_THEME` / `TOS_LIGHT_THEME` exports likely live here. **Not yet inspected.** |
| `.env` | `EMBED_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://theintraday.com,https://www.theintraday.com`. |

---

## What Codex Should Do

### 1. Fix the dark background

The theme isn't actually propagating to the chart engine's plot-area background. Likely
candidates:

- Inspect `TosEngine.TOS_LIGHT_THEME` in the chart engine bundle source
  (`packages/chart-engine/src/`). Confirm it contains a `background` / `layout.background`
  property.
- Inspect `chartRef.resetTheme(theme)` (chart engine). Does it update
  `layout.backgroundColor` / repaint the canvas bg? Or only tick/grid colors?
- If `resetTheme` doesn't update the bg, options:
  - Add explicit `chartRef.applyOptions({ layout: { background: {...} }})` in
    `applyThemeToChart` in `bootstrap.ts`.
  - Or expose a `setBackground(color)` on the chart and call it from `applyThemeToChart` when
    theme changes.
- Double-check that `applyThemeToAllCharts()` actually runs when my `SET_THEME` arrives. Could
  add a console.log in the charting app's `theme-changed` listener temporarily for verification.
- Also possible: the chart canvas element itself has CSS `background-color` that overrides the
  engine's paint. Check `.chart-container` / `#chart-container` styling in `styles.ts`.

### 2. Fix the viewport (too many future dates)

- After `SET_SYMBOL` → `loadChart` completes in embed mode, call an explicit fit-to-data or
  viewport-reset. Reference: `bootstrap.ts:981-998::applyRequestedRangeViewport` is already
  called inside `loadChart` — but its output assumes the Puppeteer capture width, not a
  full-screen interactive iframe.
- Consider adding a new bridge message `FIT_CHART_VIEWPORT` that the drawer sends after READY
  (or after SET_SYMBOL), which invokes something like
  `chartRef.setViewport({ startIndex: 0, visibleBars: bars.length + <small right margin> })`.
- Or modify `applyRequestedRangeViewport` to cap right-margin-bars to a small number when
  `?embed=true` and not a newsletter-export.

### 3. Verify end-to-end

Once theme and viewport are fixed:

- Open a newsletter with a price block in the editor.
- Click the price chart. Drawer should open with correct ticker, light bg, tight viewport.
- Change the range (e.g., 1m → 6m), or change the ticker via the embedded search, or toggle
  chart type.
- Click **Save chart**. Drawer should close, newsletter preview should regenerate with the
  new PNG reflecting the edits.
- Verify `draft.blocks[i].chartSpec` in the saved draft has updated `range/interval/chartType/symbol`.

---

## Additional Notes / Gotchas

- **postMessage** origin: in dev with `NODE_ENV !== 'production'`, bridge allows any parent
  origin. In prod, `EMBED_ALLOWED_ORIGINS` env var must include the Fin Quote host.
- **Fin Quote dev port:** in earlier screenshots it was sometimes `localhost:3005` (Next.js
  picking a different port). Most recent sessions used `localhost:3000`. CSP `frame-ancestors`
  is permissive enough as long as `EMBED_ALLOWED_ORIGINS` includes whatever Fin Quote is
  serving on.
- **Cache busting:** the `tsx watch` on the charting side reloads on file change. Fin Quote
  uses Next.js dev HMR. When diagnosing, ensure both servers actually picked up the latest
  change (curl the page HTML and grep for the change).
- **Browser cache:** the iframe might cache aggressively. Hard-reload the Fin Quote page when
  testing.
- **The user has already approved:** disabling IndexedDB/localStorage state restore in embed
  mode is the desired behavior. The parent (newsletter editor) is authoritative.
- **Ticker context:** a user's charting-app localStorage on port 3001 often has `fundState`
  workspace state saved from prior standalone usage (it might have recently been set to
  GOOGL/TSLA/etc). The embed-mode gates prevent this from leaking in, which is correct; do
  not undo them.
- **Chart-of-the-Day editor (`components/AdminChartOfTheDayEditor.tsx`):** uses the same
  postMessage pattern but only for fundamentals. That's our reference implementation. The
  pattern there is sound.

---

## Quick Repro

1. `cd /Users/cliffordtraff/Desktop/Charting\ Platform && npm run dev` (serves :3001).
2. `cd /Users/cliffordtraff/Desktop/Coding/Fin\ Quote && npm run dev` (serves :3000).
3. Open `http://localhost:3000/newsletter/editor/{some-draft-id}`.
4. Generate a newsletter for a ticker that has a price chart block (most single-stock
   newsletters have at least one).
5. Click the price chart image in the preview (or select the block and click "Edit chart"
   in the top bar).
6. Observe: dark plot area + too much future space on the right.
7. `curl 'http://localhost:3001/tos/TXN?view=price&theme=light&range=1m&interval=D&chartType=candles&embed=true' | grep forcedTheme`
   → confirms `var forcedTheme = "light"` is in the response, so the server is doing its part.
