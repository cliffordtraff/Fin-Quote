# FORFORD.md - The Story Behind The Intraday

*A financial data platform that started as a simple quote viewer and evolved into something far more ambitious.*

---

## What Is This Thing?

**The Intraday** is a Next.js-powered financial data platform. Think of it as Bloomberg Terminal's younger, cooler cousin who doesn't charge $24,000 per year. It started life as "Fin Quote" (you can still see that in the git history), but like most projects that grow beyond their original scope, it needed a name that matched its ambitions.

At its core, the platform does three things:

1. **Shows you the markets** - Real-time dashboards with S&P 500, NASDAQ, DOW, sector heatmaps, gainers/losers, futures, VIX... basically everything a trader glances at before their morning coffee.

2. **Lets you chat with financial data** - An AI chatbot that can answer questions about Apple stock (and 500 other S&P companies) using actual database queries, not hallucinated numbers. More on this architecture later—it's the interesting part.

3. **Tracks insider trades** - Because if the CEO is dumping shares, you might want to know about it.

---

## The Architecture (Or: Why We Made These Choices)

### The Two-Step LLM Flow: Teaching AI to Be Honest

Here's the central problem with AI chatbots that answer financial questions: **LLMs lie.** Not maliciously—they're just really confident about things they made up. Ask GPT about Apple's 2023 revenue and it'll give you a number. It might even be close. But "close" doesn't cut it in finance.

Our solution? **Never let the LLM touch real data directly.**

Instead, we built a two-step architecture that works like this:

```
User Question → Step 1: LLM picks a tool → Step 2: Server runs the query
              → Step 3: LLM writes answer using ONLY fetched data
              → Step 4: Validator checks the answer against source
```

The LLM's job in Step 1 is purely routing. It reads the question and returns JSON like `{"tool": "getFinancialsByMetric", "args": {"symbol": "AAPL", "metric": "revenue", "limit": 5}}`. That's it. No data access.

Then the server—not the LLM—executes the query against our Supabase database. The real numbers come back. Only THEN does the LLM get to write a response, and it's given explicit instructions: **"Use ONLY the data provided. No external knowledge. No guessing."**

And here's the paranoid part: we still don't trust it. Step 4 runs a validator that:
- Extracts every number from the LLM's answer
- Compares it against the source data (±2% tolerance)
- Checks that every year mentioned actually exists in the data
- Verifies any SEC filing citations are real

If validation fails? We regenerate the answer. If it fails again? We log it for human review.

This architecture means the LLM can never hallucinate a stock price. It can only work with what we gave it.

**The lesson here:** When accuracy matters more than convenience, put guardrails around your AI. It's more work upfront, but you'll sleep better.

### Server Actions: The Best Part of Next.js 15

The entire backend runs on Next.js Server Actions. No separate API server. No Express app. Just `'use server'` at the top of a file and you're writing backend code that the frontend can call like a function.

```typescript
// app/actions/financials.ts
'use server'

export async function getFinancialsByMetric(symbol: string, metric: string, limit: number) {
  const supabase = await createServerClient()
  const { data } = await supabase.from('financials_std').select('*')...
  return data
}
```

Then in your React component:
```typescript
const data = await getFinancialsByMetric('AAPL', 'revenue', 5)
```

No fetch calls. No API routes. No CORS. It just works.

We have 55+ server actions handling everything from market data to insider trades. The pattern is dead simple: one action per data type, clear input validation, typed returns.

**Caveat we learned the hard way:** Server Actions are great until you need to stream. The chatbot uses SSE (Server-Sent Events) through a traditional API route because Server Actions can't stream responses mid-execution.

### Supabase: PostgreSQL with Superpowers

We use Supabase as our database, which is really just PostgreSQL with a nice UI and some extras. The schema evolved organically:

**Core tables:**
- `financials_std` - Core financial metrics (revenue, net income, etc.) going back 20 years
- `financial_metrics` - 139 extended metrics from FMP API (P/E ratio, ROE, debt ratios...)
- `insider_transactions` - SEC Form 4 filings when executives buy/sell shares
- `conversations` and `messages` - Chat history for the AI
- `query_logs` - Every question the AI answers, with validation results

The interesting table is `filing_chunks` with pgvector embeddings. We chunk SEC filings into paragraphs, embed them with OpenAI, and store the vectors for semantic search. So when you ask "What did Apple say about supply chain risks?", we can actually find the relevant paragraph from their 10-K.

**Migration tip we learned:** Supabase's migration system is just SQL files in `supabase/migrations/`. Name them with timestamps (`20260124000001_create_insider_tables.sql`) and they run in order. Simple. But be careful with foreign keys—we had to run two migrations to add a unique constraint because the first one failed on duplicate data.

---

## The Parts That Make It Work

### Market Dashboard: The Art of Real-Time Data

The homepage is a market dashboard showing indexes, sectors, gainers, losers, and more. The challenge? Making it feel "live" without hammering the APIs.

**Solution: ISR + Client Polling**

```typescript
export const revalidate = 60 // ISR: regenerate every 60 seconds
```

Next.js ISR (Incremental Static Regeneration) rebuilds the page every 60 seconds server-side. But during market hours, that's not fast enough. So we added client-side polling that fetches fresh data every 30 seconds.

The result: First load is instant (pre-rendered), then it stays fresh. We're not hitting FMP's API on every page view—just once per minute on the server.

**The sparkline charts** were surprisingly tricky. We're using `lightweight-charts` for the main charts and canvas-based mini-charts for the index cards. The commit history tells the story:

- `299a56b Add index sparklines with candlestick charts`
- `321fa4c Simplify gainers/losers and fix sparkline x-axis labels`
- `3fd18d8 Enhance index sparkline x-axis with hourly labels and brackets`

Three commits just to get the X-axis labels right. Charts are a time sink.

### The Charting Platform: Highcharts vs. Lightweight Charts

We use two charting libraries:

1. **Highcharts** - For the big, interactive financial charts on the charts page. Multi-line, multi-axis, fully customizable. The trade-off is bundle size (it's a big library).

2. **lightweight-charts** (by TradingView) - For the sparklines and candlestick charts on the dashboard. Much smaller, focused on financial data.

**Why both?** Highcharts is better for complex multi-metric comparisons. Lightweight-charts is better for simple price charts where you want that "TradingView look" without the weight.

The charting platform (`/charts`) lets you compare any metric across any S&P 500 stock. The implementation went through several iterations:

1. First version: Client-side slider that filtered data locally (fast but buggy)
2. Reverted: Server-side filtering was more reliable
3. Final: Hybrid approach with debounced client updates

Check commit `e4df6fa Revert slider optimization - restore server-side filtering for correct year range`—we thought client-side filtering would be faster, but it broke year range calculations. Sometimes the "clever" solution isn't.

### TTM Calculations: The Devil in the Details

TTM (Trailing Twelve Months) sounds simple: add up the last four quarters. But financial data is never simple.

```typescript
// lib/ttm-config.ts
const TTM_CONFIG = {
  revenue: 'sum',           // Add last 4 quarters
  total_assets: 'point_in_time',  // Use latest quarter only
  gross_margin: 'derived',   // Recalculate from TTM components
  peRatio: 'not_applicable'  // Can't be TTM'd
}
```

Different metrics need different treatments:
- **Flow metrics** (revenue, cash flow): Sum of 4 quarters
- **Balance sheet** (assets, equity): Just use the latest value
- **Ratios**: Recalculate from TTM components
- **Growth rates**: Not applicable—they're already time-based

We built a whole system for this (`lib/ttm-calculator.ts`, `lib/ttm-config.ts`) because getting it wrong means your P/E ratio is nonsense.

---

## Lessons Learned (The Hard Way)

### 1. The Suspense Boundary Saga

React 19 + Next.js 15's app router is opinionated about client-side hooks. Use `useSearchParams()` in a client component? You need a Suspense boundary or the build fails.

```typescript
// This breaks the build:
export default function Page() {
  const params = useSearchParams() // Error!
}

// This works:
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PageContent />
    </Suspense>
  )
}
```

We learned this at build time: `1011fd3 Wrap homepage in Suspense for useSearchParams`. Then again: `9bbc867 Wrap chatbot page in Suspense for useSearchParams`.

**Lesson:** When upgrading to Next.js 15, grep for `useSearchParams` and add Suspense boundaries preemptively.

### 2. TypeScript and Supabase Types Don't Always Agree

Supabase generates types from your database schema. Next.js expects those types to be perfect. Reality doesn't care about either.

```javascript
// next.config.js
module.exports = {
  typescript: { ignoreBuildErrors: true },  // We gave up
  eslint: { ignoreDuringBuilds: true }
}
```

Commit `4d7bfa9 Ignore TypeScript and ESLint errors during build` tells the story. When you're moving fast and the types are fighting you, sometimes pragmatism wins.

**Better lesson:** If you're going to ignore type errors in production builds, at least run type checking in CI separately.

### 3. The Scroll Position That Wouldn't Stay

The chatbot had a maddening bug: when you submitted a question, the page wouldn't scroll to show the new message properly. Commit `cb9b79d Attempted multiple scroll positioning fixes - none successful` captures the frustration.

We tried:
- `scrollIntoView()` - Worked inconsistently
- `scrollTo()` with calculations - Broke on mobile
- RAF-based animations - Too complex, still buggy
- CSS `scroll-margin-top` - Almost worked

Eventually, we documented it (`15e7979 Document scroll issue and all attempted solutions`) and moved on. Some bugs aren't worth infinite time.

**Lesson:** When you're on attempt #5 and it still doesn't work, document what you tried and ship it "good enough." You can always come back.

### 4. The Metric Alias Problem

Users don't say "What's AAPL's peRatio?" They say "What's Apple's P/E ratio?" or "PE" or "price to earnings."

We built a metric resolver (`lib/metric-resolver.ts`) that maps human language to database columns:

```typescript
const ALIASES = {
  'P/E': 'peRatio',
  'PE ratio': 'peRatio',
  'price to earnings': 'peRatio',
  'price-to-earnings': 'peRatio',
  'profit': 'net_income',
  'earnings': 'net_income',
  'bottom line': 'net_income',
  // ... 100+ more
}
```

The LLM helps too—the tool selection prompt includes extensive mapping instructions. But we still add new aliases as users ask questions we didn't anticipate.

**Lesson:** Build for how users actually talk, not how your database is structured. Then keep expanding your dictionary.

### 5. The Quarterly Data Rabbit Hole

Annual data is easy. Quarterly data is a nightmare.

- Q4 isn't always reported separately (it's derived from annual minus Q1-Q3)
- Fiscal years don't match calendar years
- TTM needs the right 4 quarters, not just any 4
- The FMP API returns data differently than SEC filings

Commit `52dff9b Add quarterly data support and TTM calculations` was weeks of work condensed into one commit. The code handles edge cases you'd never think of.

**Lesson:** If a feature sounds simple ("just add quarterly data"), triple your time estimate.

---

## The Tech Stack and Why

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Next.js 15 | App router + Server Actions = less infrastructure |
| **React** | React 19 RC | Living on the edge, but no major issues |
| **Database** | Supabase (PostgreSQL) | Free tier is generous, pgvector for embeddings |
| **Auth** | Supabase Auth | Google OAuth out of the box |
| **LLM** | OpenAI (gpt-5-nano) | Cheap, fast, good enough for routing |
| **Charts** | Highcharts + lightweight-charts | Best of both worlds |
| **Styling** | Tailwind CSS | Ship fast, think later |
| **Data** | FMP API | Good coverage, reasonable pricing |

### Why Not...?

- **Why not a separate backend?** Server Actions handle everything we need. No reason to add complexity.
- **Why not Claude for the LLM?** OpenAI's API is more mature for our use case. Claude might be better for some things, but GPT handles tool selection reliably.
- **Why not D3 for charts?** Highcharts is higher-level. D3 is powerful but you're building everything from scratch.
- **Why not Prisma?** Supabase's client is simpler for our scale. Prisma adds ORM complexity we don't need.

---

## How Good Engineers Think

A few patterns from this codebase that reflect professional thinking:

### 1. Make Invalid States Impossible

The tool selection system doesn't just hope the LLM returns valid JSON. It validates:

```typescript
const parsed = JSON.parse(response)
if (!VALID_TOOLS.includes(parsed.tool)) {
  throw new Error(`Invalid tool: ${parsed.tool}`)
}
```

If the LLM returns garbage, we catch it immediately.

### 2. Log Everything in Development

The chatbot logs every step:
- Tool selection time
- Data fetch time
- Answer generation time
- Validation results
- Token usage

When something breaks, we know exactly where.

### 3. Feature Flags for Safety

```typescript
// .env.local
NEXT_PUBLIC_ENABLE_CHAT=false
```

The chatbot is feature-flagged. The code is there, but users don't see it unless we flip the switch. New features stay hidden until they're ready.

### 4. ISR for Performance, Polling for Freshness

The homepage doesn't regenerate on every request. It caches for 60 seconds. During market hours, client-side polling keeps it fresh. The best of both worlds.

### 5. Fail Gracefully

When the FMP API is down:
```typescript
if (!data) {
  return { error: 'Market data temporarily unavailable' }
}
```

Users see a message, not a crash.

---

## What's Next

The branch structure tells you where this is going:

- `insider-db-implementation` - Currently active, adding comprehensive insider trading
- `feature/premarket-afterhours-scanner` - Extended hours trading
- `feature/active-learning-review` - Learning from incorrect answers to improve prompts
- `Watchlist-Header` - User watchlists

The goal is to become a legitimate alternative to expensive data terminals—not by matching Bloomberg feature-for-feature, but by focusing on what retail investors actually need.

---

## Parting Thoughts

This project started as a simple experiment: "Can we make an AI that answers financial questions without lying?" The answer is yes, but it takes architecture.

The two-step LLM flow, the validation system, the extensive metric aliases—they all exist because we took the hard road. We could have shipped a chatbot that hallucinates numbers and hoped users wouldn't notice. Instead, we built something that checks its own work.

That's the difference between a demo and a product.

---

*Last updated: January 2026*
*201 commits and counting*
