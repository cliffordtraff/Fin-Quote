# Plan: Replace lightweight-charts with Charting Embed on Stock Page

## Context

The stock detail page (`/stock/[symbol]`) currently renders a price chart using `lightweight-charts` via two custom components (`StockPriceChart.tsx` → `TradingViewChart.tsx`). We want to replace this with an iframe embedding our custom charting engine at `charts.theintraday.com/embed`, which is fully self-contained (fetches its own data, renders interactive charts with toolbar).

The existing chart renders at 400px height with a timeframe selector and fullscreen toggle. The embed replaces all of this — the embed has its own toolbar.

## What Changes

### 1. Create `EmbedChart` client component

**New file:** `components/EmbedChart.tsx`

A thin client component that:
- Accepts `symbol` prop
- Detects dark/light mode by watching `document.documentElement.classList` (same pattern as `TradingViewChart.tsx` lines 118-133)
- Renders an `<iframe>` with src: `https://charts.theintraday.com/embed?symbol={symbol}&tf=D&theme={dark|light}&toolbar=simplified&origin=https://theintraday.com`
- Iframe styles: `width: 100%`, `height: 500px`, `border: none`
- Re-sets iframe src when theme changes (so the embed picks up the new theme)

Why a client component: The page is a server component and can't detect dark mode at render time (class-based strategy). The component needs to observe the `dark` class on `<html>`.

No postMessage symbol sync needed — stock pages use full page navigation (`/stock/AAPL` → `/stock/MSFT`), not client-side routing between symbols.

### 2. Update stock page to use `EmbedChart`

**File:** `app/stock/[symbol]/page.tsx`

- Replace `import StockPriceChart` with `import EmbedChart`
- Replace `<StockPriceChart symbol={normalizedSymbol} />` (line 168) with `<EmbedChart symbol={normalizedSymbol} />`
- Remove the "Open in Workspace" link and its containing div (lines 153-166) — the embed already has its own toolbar and the workspace link becomes redundant with the embedded chart
- Remove unused imports: `StockPriceChart`

### 3. Keep existing component files

`StockPriceChart.tsx` and `TradingViewChart.tsx` stay in the codebase — they're not actively harmful and could be useful for other pages in the future. We only remove the import from the stock page.

## Files to modify

| File | Action |
|------|--------|
| `components/EmbedChart.tsx` | **Create** — Thin client wrapper for charting iframe |
| `app/stock/[symbol]/page.tsx` | **Edit** — Swap `StockPriceChart` for `EmbedChart`, remove workspace link |

## Verification

1. `npm run build` passes
2. Visit `/stock/AAPL` — iframe loads with interactive chart
3. Toggle dark/light mode — iframe theme updates
4. Visit `/stock/MSFT` — different symbol loads correctly
5. No broken references to `StockPriceChart` in the stock page
