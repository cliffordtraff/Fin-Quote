# Newsletter AI Stock Picker + News-Aware Copy — Implementation Plan

## The Problem

Right now, generating a newsletter requires you to manually pick a stock:

```bash
npx tsx scripts/generate-newsletter.ts --ticker AAPL
```

The AI writes about Apple's financials, but it has no idea what's happening in the market *today*. The newsletter reads like a generic company profile — not a timely piece of financial journalism.

## The Solution

When you run the script without `--ticker`, the AI will:

1. **Look at the market** — fetch today's most actively traded S&P 500 stocks from FMP's `stock_market/actives` endpoint
2. **Read the news** — fetch recent headlines for those stocks from FMP's `stock_news` endpoint
3. **Pick the best story** — an LLM call evaluates which stock has the most compelling newsletter angle
4. **Write news-aware copy** — the editorial copy now references the catalyst ("After beating earnings estimates by 20%...") instead of just reciting financial data

You can still use `--ticker MSFT` to force a specific stock. When you do, the stock picker step is skipped entirely and the newsletter generates exactly as it does today.

---

## How It Works: Before vs After

### Before (current)

```
You type: --ticker AAPL
  → Fetch 7 years of AAPL financials
  → AI picks 3 charts (revenue vs income, gross margin, FCF)
  → AI writes copy: "Revenue grew 8% to $383B in 2024..."
  → Capture charts, assemble email
```

The copy is accurate but generic. There's no hook, no reason the reader should care *today*.

### After (what we're building)

```
You type: (nothing — no ticker)
  │
  ├─ NEW: Step 0 — AI Stock Picker
  │   Fetch 10 most active S&P 500 stocks + their news headlines
  │   AI sees: "NVDA +12.3% — NVIDIA beats Q4 estimates, data center revenue doubles"
  │   AI picks: NVDA, because earnings + massive move + recognizable name
  │
  ├─ Step 1: Fetch NVDA financials (same as before)
  ├─ Step 2: AI picks charts (same as before)
  ├─ Step 3-4: Capture charts (same as before)
  │
  ├─ ENHANCED: Step 5 — AI writes copy
  │   Now also sees: headlines, price move, editorial hook
  │   Writes: "After posting record data center revenue of $18.4B, NVIDIA's
  │            top-line growth has now doubled year-over-year for three
  │            consecutive quarters..."
  │
  └─ Steps 6-7: Build blocks, assemble HTML (same as before)
```

---

## Why FMP (not Massive/Polygon)?

We use two FMP API endpoints for the stock picker:

| Endpoint | What it gives us | Why we need it |
|----------|-----------------|----------------|
| `stock_market/actives` | Top 20 stocks by trading volume | The candidate pool — what's moving today |
| `stock_news?tickers=...` | Recent headlines for specific stocks | The "why" — what caused the move |

**Why not use the Massive (Polygon) provider?**

1. **CLI compatibility.** The provider abstraction layer (`lib/providers/`) is accessed through server actions that depend on Next.js runtime (`cookies()` from `next/headers`). Our CLI script runs outside Next.js. We already solved this problem for financial data in `fetch-context.ts` by querying Supabase directly. Same pattern here — call FMP directly.

2. **We need "most active" stocks, not just gainers.** Massive has `getGainers()` and `getLosers()`, but no "most active by volume" endpoint. A stock that dropped 8% on earnings is just as newsletter-worthy as one that jumped 8%. FMP's actives endpoint captures both.

3. **FMP has better news integration.** The `stock_news` endpoint returns headlines with full text snippets, publication source, and dates — exactly what the LLM needs to evaluate which stock has the best story.

**Cost:** 2 API calls per newsletter run. Your FMP plan allows 250/day.

---

## The Stock Picker Prompt

This is the new LLM call that decides which stock to write about:

**System message:**
```
You are the editor of The Intraday, a financial newsletter.
Pick ONE stock from the candidates below for today's newsletter.

Consider:
1. Does the news explain the price move? (earnings, product launch, FDA approval, etc.)
2. Is this a company most readers would recognize?
3. Would financial charts (revenue, margins, cash flow) add context to the news?
4. Is the price move significant enough to write about?

Avoid:
- Stocks that moved on no clear news (random volume spikes)
- Obscure names most readers wouldn't know
- Trivial moves (< 2% change) unless the news is exceptional
```

**User message:** 10 candidates, each formatted like:
```
NVDA (NVIDIA Corporation): $892.45, +12.34%
  - "NVIDIA Smashes Q4 Estimates as Data Center Revenue Doubles" (Reuters)
  - "AI Chip Demand Drives NVIDIA to Record Quarter" (Bloomberg)

AAPL (Apple Inc.): $178.22, -2.15%
  - "Apple Announces New AI Features for iPhone" (CNBC)
  (no other recent headlines)
```

**Output:** `{ "symbol": "NVDA", "name": "NVIDIA Corporation", "editorialHook": "After beating Q4 estimates with data center revenue doubling year-over-year, NVIDIA's margin expansion tells the deeper story of AI infrastructure demand." }`

---

## Enhanced Copy Generation

The copy prompt gets a new optional section when the AI picked the stock:

```
=== Current Market Context ===
Today's move: +12.34%
Why this stock today: After beating Q4 estimates with data center revenue
doubling year-over-year, NVIDIA's margin expansion tells the deeper story.

=== Recent Headlines ===
- "NVIDIA Smashes Q4 Estimates as Data Center Revenue Doubles" (Reuters, 2026-03-12)
- "AI Chip Demand Drives NVIDIA to Record Quarter" (Bloomberg, 2026-03-12)
```

New rule added to the system prompt: *"If market context is provided, weave the news angle into the body naturally. Reference the current event briefly, then connect it to the financial data shown in the chart."*

This is backward-compatible — when you use `--ticker`, no market context is provided and the copy prompt works exactly as before.

---

## Files Changed

| File | What changes |
|------|-------------|
| `lib/newsletter/types.ts` | Add 4 new types (StockCandidate, StockNewsItem, MarketContext, StockPickerResult). Extend NewsletterContext and NewsletterResult. |
| `lib/newsletter/fetch-context.ts` | Add `fetchMarketContext()` — calls FMP directly, filters to S&P 500, fetches news, groups by symbol. |
| `lib/newsletter/prompts.ts` | Add `buildStockPickerMessages()` + `parseStockPickerResult()`. Enhance `buildCopyGenerationMessages()` with optional news context. |
| `lib/newsletter/orchestrate.ts` | Make `ticker` optional. Insert Step 0 (stock picker). Thread `stockPickerResult` through copy generation. |
| `scripts/generate-newsletter.ts` | Make `--ticker` optional. Print stock pick details when AI picks. |
| `app/api/newsletter/generate/route.ts` | Make `ticker` optional in request body. Include stock pick in response. |
| `lib/newsletter/index.ts` | Add new type and function exports. |

---

## How to Test

```bash
# AI picks the stock (new behavior)
npx tsx scripts/generate-newsletter.ts

# Manual override (existing behavior, unchanged)
npx tsx scripts/generate-newsletter.ts --ticker AAPL

# API — AI picks
curl -X POST http://localhost:3005/api/newsletter/generate \
  -H 'Content-Type: application/json' -d '{}'

# API — manual pick
curl -X POST http://localhost:3005/api/newsletter/generate \
  -H 'Content-Type: application/json' -d '{"ticker":"MSFT"}'
```
