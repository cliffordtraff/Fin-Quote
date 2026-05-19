# Newsletter Chart Generation Deep Dive

Date: 2026-05-14

## The Short Version

The newsletter chart system is failing because it is trying to make one chart mean three different things:

1. A static email image.
2. A reader click-through chart.
3. An in-app editor chart.

Those three surfaces currently share bits of URL state, but they do not share one canonical scene contract. Fundamentals charts mostly work because they already have a full `fundState` object and the editor force-applies it after the iframe says it is ready. Price charts were weaker: they relied on URL params and a generic `SET_SYMBOL` message, so local chart behavior, viewport math, and saved visual state could win races.

The better approach is to make every newsletter chart a canonical **scene**:

```
NewsletterChartScene
  -> render PNG
  -> open editor
  -> save edited state
  -> build reader link
```

Fin Quote should own editorial choices and scene persistence. Charting Platform should own scene rendering and scene replay.

## What Exists Today

Fin Quote owns:

- Newsletter orchestration in `lib/newsletter/orchestrate.ts`
- Template-to-spec resolution in `lib/newsletter/resolve-chart.ts`
- Render calls in `lib/newsletter/capture.ts`
- Draft/chart regeneration in `lib/newsletter/drafts.ts`
- Editor iframe host in `components/newsletter/NewsletterChartEditorDrawer.tsx`

Charting Platform owns:

- `POST /tos/api/newsletter/render`
- `/tos/export/newsletter`
- The price chart engine and fundamentals workspace
- The postMessage bridge used by the newsletter editor
- Newsletter render profile work (`renderProfile='newsletter'`)

That ownership split is correct. The problem is the contract between them.

## Failure Modes Found

### 1. Price charts did not get a forced state replay

Fundamentals editor flow:

- URL includes `fundState`
- iframe posts `READY`
- parent posts `APPLY_FUND_STATE`
- charting app force-applies that full state

Price editor flow before this pass:

- URL included `range`, `interval`, `chartType`
- sometimes included `priceState`
- parent sent `SET_SYMBOL`
- charting app inferred the rest

That is too soft. A chart editor should not infer state when the newsletter already knows what it wants.

### 2. Saved theme snapshots could override the newsletter theme

The charting app correctly received `theme=light`, but a captured price workspace state can include `themeColors.bg` and `themeColors.axisBg`. If those came from a dark desktop session, applying the snapshot could turn the canvas dark even while the surrounding page stayed light.

Newsletter/editor rendering should own the background. User state can carry drawings, indicators, visible range, volume visibility, and similar chart choices, but it should not silently override the email visual system.

### 3. Extra lookback became empty future space

The price renderer adds extra lookback bars in newsletter mode so static charts have better context. That is fine when enough historical bars exist. It is bad when the requested range is short and the viewport start clamps to zero: the extra "lookback" has nowhere to go, so it becomes empty space on the right side.

This is exactly the "candles on the left half, future dates on the right half" symptom.

### 4. Dimensions and docs were out of sync

The active code now uses a canonical `620 x 440` newsletter chart surface. Some docs still described the older `1200 x 675` / `1200 x 720` direction. That mismatch makes debugging painful because people argue from stale assumptions.

## Fixes Applied In This Pass

### Fin Quote

- `lib/newsletter/chart-editor.ts`
  - Price editor resolution now always creates a concrete `priceState`, even when the saved spec did not have one.
  - The iframe URL always gets `priceState`.

- `components/newsletter/NewsletterChartEditorDrawer.tsx`
  - Price editor `SET_SYMBOL` now passes `interval` and `range`.
  - Price editor now sends `APPLY_PRICE_STATE` after `READY`, mirroring the fundamentals flow.

- `lib/newsletter/__tests__/chart-editor.test.ts`
  - Added coverage for price editor URLs that start without a saved snapshot.

### Charting Platform

- `src/server/routes/tos-ui/embedBridge.ts`
  - Added `APPLY_PRICE_STATE`, which calls `window.applyPriceWorkspaceState`.

- `src/server/routes/tos-ui/bootstrap.ts`
  - Newsletter price mode strips `bg` and `axisBg` from captured theme overrides so saved dark chart state cannot beat the requested light newsletter theme.
  - Viewport sizing now caps extra lookback so it cannot turn into synthetic future-space when the left edge clamps to zero.

- `src/server/routes/tos-ui/__tests__/embedBridge.test.ts`
- `src/server/routes/tos-ui/__tests__/bootstrap.test.ts`
  - Updated focused coverage around the bridge and current newsletter-mode constants.

## The Better Architecture

### 1. Introduce a canonical scene contract

Right now `NewsletterChartSpec`, `captureSpec`, `fundState`, and `priceState` overlap. The names imply layers, but the behavior is closer to "several envelopes around mutable chart state."

Create one explicit contract:

```ts
type NewsletterChartScene =
  | NewsletterPriceScene
  | NewsletterFundamentalsScene

interface NewsletterSceneBase {
  version: 2
  mode: 'price' | 'fundamentals'
  symbol: string
  title?: string
  subtitle?: string
  theme: 'light'
  renderProfile: 'newsletter'
  width: 620
  height: 440
}

interface NewsletterPriceScene extends NewsletterSceneBase {
  mode: 'price'
  range: NewsletterPriceRange
  interval: NewsletterPriceInterval
  chartType: NewsletterPriceChartType
  state: {
    viewport?: { startIndex: number; visibleBars: number }
    rightMarginBars?: number
    indicators?: unknown[]
    drawings?: unknown[]
    volumeVisible?: boolean
    sessionVisibility?: 'all' | 'regularOnly'
    priceScale?: { min: number; max: number }
  }
}

interface NewsletterFundamentalsScene extends NewsletterSceneBase {
  mode: 'fundamentals'
  state: Record<string, unknown>
}
```

The rule: the scene is what gets rendered, edited, saved, and linked.

### 2. Make Charting Platform expose scene endpoints

Instead of Fin Quote building several URL shapes, Charting Platform should accept the scene and return deterministic outputs:

- `POST /tos/api/newsletter/render-scene` -> PNG
- `POST /tos/api/newsletter/resolve-scene-url` -> editor/click-through URL
- `/tos/newsletter/scene?scene=<base64>` -> browser replay surface

The existing `/tos/api/newsletter/render` can stay as v1 compatibility. New work should move to the v2 scene endpoint.

### 3. Make editor save return the scene, not a partial state

The iframe bridge should support:

- `APPLY_NEWSLETTER_SCENE`
- `GET_NEWSLETTER_SCENE`
- `NEWSLETTER_SCENE`

Under the hood, Charting Platform can translate that scene into price or fundamentals internals. Fin Quote should not need to know which internal workspace function was used.

### 4. Add render acceptance checks

Every PNG render should be validated before it is accepted:

- non-empty PNG
- expected dimensions
- background matches expected light palette
- no excessive right-side blank area for price charts
- no visible editor controls
- ready signal includes mode and symbol

This can be a small server-side or test helper using `sharp` plus a few pixel/color heuristics. The key is to catch "black canvas" and "half-empty chart" automatically.

### 5. Keep visual decisions in Charting Platform

Fin Quote should not pass low-level style knobs unless they are real editorial choices. Charting Platform should own:

- newsletter render profile defaults
- theme enforcement
- axis density
- right margin policy
- title/footer rendering
- viewport fallback behavior

Fin Quote should pass:

- symbol
- chart mode
- template choice
- title/subtitle
- range/interval/chart type
- saved user scene edits

## Recommended Next Milestones

1. **Stabilize v1 with the fixes from this pass.**
   Run a real TXN 1-month price-chart edit and confirm light canvas plus tight viewport.

2. **Add `NewsletterChartScene` as an internal Fin Quote type.**
   Keep converting it to the current v1 render contract for now.

3. **Add `APPLY_NEWSLETTER_SCENE` / `GET_NEWSLETTER_SCENE` to Charting Platform.**
   Leave `APPLY_PRICE_STATE` and `APPLY_FUND_STATE` as compatibility helpers.

4. **Move render URL construction behind one resolver.**
   No caller should manually know when to use `fundState`, `priceState`, `previewWidth`, `newsletterEditorWidth`, or `renderProfile`.

5. **Add PNG acceptance tests.**
   This is the guardrail that stops chart generation from becoming "looks okay on my screen" work.

## Engineering Lesson

The important pattern here is not "fix the chart." It is "make state explicit at the boundary."

When an editor iframe, a headless renderer, and an email generator all interpret the same chart through slightly different contracts, the system becomes spooky: a saved theme from yesterday, a wide iframe today, or a missing query param can change the output. A good engineer does not keep adding defensive timeouts forever. They collapse the ambiguity into one object, give that object an owner, and make every surface replay it.

