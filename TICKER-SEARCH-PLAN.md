# Unified Ticker Symbol Search — Implementation Plan

## What We're Doing

Right now there are two search bars: one in the Fin Quote nav bar (searches Supabase) and one inside the charting platform iframe (searches Polygon). We're going to:

1. **Replace the nav bar search** with a Polygon-powered search that has a nicer dropdown (modeled after the charting platform's design)
2. **Make it context-aware** — when you pick a symbol, it does the right thing depending on which tab you're on
3. **Hide the charting platform's own search** when it's embedded (but keep it visible when developing the charting platform standalone)

---

## Architecture

```
Nav search bar (calls Polygon /v3/reference/tickers)
  │
  ├── On Chart tab         → update URL ?symbol=AAPL → WorkspaceIframe sends SET_SYMBOL to iframe
  ├── On Fundamentals tab  → update URL ?symbol=AAPL → WorkspaceIframe sends SET_SYMBOL to iframe
  ├── On Overview tab      → update URL ?symbol=AAPL → WorkspaceIframe sends SET_SYMBOL to iframe
  ├── On Financials tab    → navigate to /stock/AAPL (FMP data)
  └── On other tabs        → navigate to /stock/AAPL (default)

Charting platform (separate codebase)
  ├── embed=true  → hide search bar (Fin Quote nav handles it)
  └── embed=false → show search bar (standalone dev mode)
```

---

## Why This Works (Polygon + FMP Compatibility)

**Polygon and FMP use the same ticker symbols.** `AAPL` is `AAPL` on both. There's no translation needed.

**The risk:** Polygon's search returns everything — stocks, ETFs, mutual funds, OTC penny stocks. FMP may not have fundamentals data for all of them.

**The fix:** Polygon's API returns a `type` field for each result:
- `CS` = Common Stock
- `ETF` = Exchange-Traded Fund
- `FUND` = Mutual Fund
- `ADRC` = ADR Common
- etc.

We filter to `CS` (common stocks), `ETF`, and `ADRC` (ADR common). Popular tickers like SPY, QQQ, VOO, BABA, and TSM all work fine on both Polygon and FMP — no reason to exclude them. We only exclude mutual funds (`FUND`) and obscure OTC types that neither provider covers well.

---

## Steps

### Step 1: Add a Polygon ticker search endpoint

**New file:** `app/api/search-tickers/route.ts`

- Calls `GET https://api.massive.com/v3/reference/tickers?search={query}&active=true&market=stocks&limit=20`
- Uses Bearer token auth (same as the rest of the Massive provider)
- Returns `{ results: [{ symbol, name, type, market }] }`
- Server-side filters to `type` in (`CS`, `ETF`, `ADRC`) — excludes mutual funds and obscure OTC types
- Sorts by relevance (exact symbol match first, then starts-with, then contains)
- Returns top 10 after filtering

### Step 2: Redesign the StockSearch dropdown

**Edit file:** `components/StockSearch.tsx`

Current search hits `/api/search-stocks` (Supabase). Change it to hit the new `/api/search-tickers` (Polygon).

Update the dropdown UI to match the charting platform's design:
- Wider dropdown
- Show ticker symbol prominently on the left, company name on the right
- Show market/exchange as a subtle badge (NYSE, NASDAQ)
- Better loading state

Keep existing features:
- 150ms debounce
- Keyboard navigation (arrow keys, Enter, Escape)
- Click-outside-to-close
- Abort controller for cancelling in-flight requests

### Step 3: Make StockSearch route-aware

**Edit files:** `components/StockSearch.tsx`, `components/Navigation.tsx`

Currently `navigateToStock()` always does `router.push('/stock/SYMBOL')`. Change it to:

```
if on /workspace/* route:
  → router.push(currentWorkspacePath + '?symbol=SYMBOL')
  → (WorkspaceIframe already reads URL params and sends SET_SYMBOL to iframe)
else:
  → router.push('/stock/SYMBOL')
```

Navigation already knows the current path via `usePathname()`. Pass a callback or the pathname down to StockSearch so it can decide where to navigate.

### Step 4: Charting platform hides search in embed mode

Handled in the charting platform codebase (Cursor) — not our concern here. The charting platform team will hide the search trigger when `embed=true` is in the URL.

---

## File Changes Summary

| File | Action | What Changes |
|------|--------|-------------|
| `app/api/search-tickers/route.ts` | **New** | Polygon ticker search endpoint |
| `components/StockSearch.tsx` | **Edit** | New API endpoint, redesigned dropdown, route-aware navigation |
| `components/Navigation.tsx` | **Edit** | Pass route context to StockSearch |
| `app/api/search-stocks/route.ts` | **Keep** | Still used by chatbot's symbol resolver — don't delete |
| `lib/symbol-resolver.ts` | **Keep** | Still used by chatbot — don't delete |

---

## Edge Cases to Handle

1. **User searches for an ETF on Fundamentals tab** — ETFs like SPY/QQQ are included and work fine on FMP
2. **Polygon API is down** — Show "Search unavailable" in dropdown, don't crash
3. **Symbol exists on Polygon but not FMP** — Rare for common stocks, but the Financials page already handles missing data gracefully
4. **Rate limiting** — 150ms debounce + abort controller keeps API calls reasonable
5. **Empty search results** — Show "No stocks found" message

---

## What We're NOT Doing

- Not removing the Supabase search entirely — `lib/symbol-resolver.ts` and `/api/search-stocks` are still used by the chatbot feature
- Not changing the Polygon provider interface (`MarketDataProvider`) — search is a separate concern from market data
- Not building bidirectional sync (iframe telling nav bar what symbol it changed to) — that's a future enhancement
