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

### 5. Automation Success Is Not the Same as Work Success

This repo has a good example of a subtle operations bug: the **WIIM morning automation looked "failed" for several days even though most of the real work had actually happened**.

What was going on?

- The warm step ran.
- The daily WIIM generation ran.
- The morning brief row was often written.
- But some symbols timed out, or one malformed model JSON response blew up a ticker.

That created a nasty gray zone: the run was not *totally* broken, but it also was not truly complete. Some days we got `499/503` or `498/503` rows in `stock_summaries`. From a human point of view, that is "mostly worked." From an automation point of view, it should be "not done yet."

We fixed this by tightening the contract in `scripts/generate-daily-wiim-summaries.ts`:

- it now **verifies what actually landed in Supabase**
- it automatically **retries only the missing symbols**
- it uses a **slower, more patient retry pass** for the stragglers
- and if rows are still missing after recovery, the command exits non-zero on purpose

We also hardened `lib/generated-stock-why-moving.ts` so slightly malformed model JSON is repaired instead of immediately killing the symbol. That was important because one bad escape sequence should not cost us a whole daily run.

The engineering lesson is simple and worth remembering:

**A background job is not successful because the process finished. It is successful because the state you expected now exists.**

That sounds obvious, but teams forget it all the time. Good engineers verify outputs, not just execution. In practical terms, that means checking:

- did the rows get written?
- did we get all expected symbols?
- which exact symbols are missing?
- was the failure transient enough to recover automatically?

That shift in mindset is what turns "cron-ish scripts" into reliable production workflows.

### 6. A Morning Brief Is a Product, Not a Data Dump

The Morning Brief at `/dashboard/morning-brief` turns the same lesson into a
user-facing surface. The page is deliberately read-only and brings four
different clocks together:

- live pre-market and prior-session price context
- today's economic and earnings calendars
- the ranked WIIM morning run
- daily per-symbol summaries and the Finviz catalyst cache

The important architectural choice is that the page does not generate any of
this work during rendering. `lib/morning-brief.ts` is an assembly layer: it
fans out to the existing market-data actions, reads the completed WIIM rows
from Supabase, and joins the ranked tickers to both our summary and Finviz's
payload. That keeps an expensive 503-symbol generation job out of a web
request and makes provenance visible. The report can say "Our read" beside
"Finviz catalyst" because they are separate sources, not two labels for the
same text.

The status strip is part of the data contract, not decoration. It reports how
many symbols were actually stored, how many Finviz pages were refreshed, and
whether today's ranked run exists. A process saying "503 attempted" is not
enough: a provider or database can throttle writes after the fetch succeeds.
The operator should trust verified rows and explicit errors.

The first visual review found another boundary failure: the model called a
June index rebalance the reason for a July pre-market move because the news
provider had no fresh company story. Telling a model to be "timely" is not a
guardrail when every supplied article is old. Version 2 of the daily summary
contract filters news to the seven Eastern-calendar days ending on the report
date before the prompt is built. When the primary provider has nothing from
the last two days, the generator checks the independent FMP ticker-news feed
before giving up. With no timely evidence from either source, the correct
answer is `no_clear_catalyst`. The model states the event without inferring
price direction, and the card separately flags when its regular-session quote
points opposite the current WIIM move.

One small ticker bug captured the same principle. The app's canonical symbols
are `BRK.B` and `BF.B`, while Finviz expects `BRK-B` and `BF-B`. The scraper
now translates only at the provider URL boundary and continues storing the
canonical dotted symbol. Provider quirks should not leak into the product's
identity model.

The practical lesson: a useful morning report is an opinionated join over
reliable pipelines. Prioritize what changes the opening setup, keep source
boundaries visible, and make missing data look missing.

### 6.1 A Mid-Morning Brief Needs a Real Baseline

The Mid-Morning Brief at `/dashboard/mid-morning-brief` is a separate report,
not a renamed live dashboard and not an overwrite of the pre-open run. WIIM
now stores `morning` and `mid_morning` run types independently. The
mid-morning runner deliberately compares its ranking with the latest completed
morning run, then persists both the new top five and the resulting delta.

That distinction matters because "what changed?" requires two trustworthy
snapshots. The current page can pull live quotes, but it should not pretend it
knows what the user saw earlier unless that earlier state was stored. The
morning run gives us exact ranks and pre-open moves for its five stories. The
mid-morning page can then label each one as confirmed, reversed, fading, or
still developing and show which names entered or dropped from the ranking.

`lib/mid-morning-brief.ts` adds the live-session assembly layer:

- five major index quotes with both day change and change since the 9:30 open
- breadth across the canonical 503-company S&P 500 set
- current sector leadership, movers, rates, currencies, and global sessions
- completed versus still-upcoming economic events
- reported earnings leaders and remaining after-close reports
- the persisted WIIM comparison joined to refreshed Finviz catalysts and
  independently generated summaries

The page remains read-only. Expensive work still happens before rendering:
the candidate universe is refreshed, a `mid_morning` WIIM run is stored, and
the five ranked summaries are regenerated against current news. Rendering only
assembles those durable results with short-lived market quotes.

One operational detail is easy to miss: targeted five-symbol summary runs are
newer than the full 503-symbol morning run. The Morning Brief therefore chooses
its coverage run by the largest `ticker_count`, then by recency, instead of
blindly treating the newest targeted run as full-universe coverage.

The lesson is that updates need lineage. Save the baseline, save the refresh,
name the relationship between them, and keep live prices separate from the
time-stamped ranking decision.

### 7. The Quarterly Data Rabbit Hole

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
| **React** | React 19.2.1 | Current stable React 19 behavior without an RC dependency |
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

## The Newsletter Detour: Separating "Who Starts The Work" From "Who Thinks"

The newsletter system taught a subtle but important engineering lesson: **a button click is not the same thing as a model backend**.

At first, the flow was simple:

```text
Generate button -> Next.js route -> OpenAI API -> draft editor
```

That worked, but it mixed two different decisions together:

1. **Execution boundary** — where does the work run?
2. **Model backend** — which model actually generates the copy?

Those sound similar until they bite you.

The clean fix was to split them apart:

```text
Generate button -> local CLI worker -> newsletter orchestrator -> model backend
```

Now the app can keep the same one-click UX while changing the brain behind the scenes.

### Why the local worker mattered

Think of the local worker as the kitchen, not the chef.

- The **UI** is the waiter taking your order.
- The **CLI worker** is the kitchen receiving the ticket.
- The **model backend** is whichever chef is on duty.

Before this refactor, the waiter was basically calling one specific chef directly. That made every future change awkward.

After the refactor:

- the UI still just says "generate"
- the worker still owns the job boundary
- the model can be swapped from OpenAI API to Codex CLI without rewriting the editor flow

That's good architecture: one surface, one stable contract, multiple interchangeable implementations behind it.

### The bug that proved the boundary mattered

The first version of the worker returned this kind of error:

> `Unexpected token 'd', "[dotenv@17"... is not valid JSON`

That bug had nothing to do with AI quality. It was a systems bug.

What happened:

- the worker was supposed to print pure JSON to stdout
- `dotenv` printed a startup line first
- the parent process tried to parse the whole stream as JSON
- generation failed even though the logic itself was fine

The fix was two-part:

- make the worker load dotenv quietly
- harden the parent parser so harmless stdout noise does not corrupt the payload

This is classic engineering work. The glamorous part is "use AI to write the newsletter." The real product work is usually "make the boundary impossible to break by accident."

### Moving off the OpenAI API without breaking the button

Once the worker boundary existed, moving off the API got much easier.

We added a second switch inside the newsletter system:

- **generation backend**: direct path vs local worker
- **model backend**: OpenAI API vs Codex CLI

That meant we could keep the button behavior unchanged while swapping the actual generation runtime from:

- `openai.responses.create(...)`

to:

- the local `codex exec` CLI running under the ChatGPT subscription

This is one of those moments where a good abstraction pays rent immediately. The "one-click Generate" experience stayed the same, but the system stopped depending on paid API calls for newsletter generation.

### The speed trap: fewer model calls is not automatically faster

This was a good reminder that performance work is full of fake intuitions.

We initially assumed:

> "If Codex CLI startup is expensive, then merging several prompts into one giant prompt must be faster."

Reasonable guess. Wrong in practice.

For newsletter generation, the smaller prompts were often faster because:

- each prompt had a tighter job
- the input payload stayed smaller
- copy generation could run in parallel across blocks

When we merged too much into one call, the prompt became bloated with raw financial JSON for multiple charts at once. The result: **one big call that thought longer and actually ran slower**.

The better optimization ended up being more boring:

- keep the smaller task boundaries
- compact the JSON payloads
- use the lighter Codex model when quality allows

In practice, the prompt-size reduction meant replacing raw annual and quarterly statement dumps with:

- a short editorial snapshot for selection
- a chart-specific metric slice for copy

That is a better pattern in general. Give the model the data it needs for the decision in front of it, not a giant backpack of everything you happen to have.

This is a classic engineering lesson: **measure before you fall in love with the theory**.

### Pitfalls to remember

- Do not confuse **"runs locally"** with **"is free."** A local worker can still call a paid API if you let it.
- Do not confuse **"Codex the chat/app"** with **"Codex CLI the callable tool."** The first is a UI, the second is the automation surface your scripts can actually invoke.
- If two processes talk through stdout, treat stdout like a contract. One noisy log line can break everything.
- Agentic CLIs are powerful, but they are noisy by default. Use a dedicated output file or strict schema boundary instead of scraping terminal chatter.
- When you change `.env.local`, remember which process reads it:
  - the Next dev server reads env on startup
  - the worker script can load `.env.local` on each run
- When two parts of the product translate between formats, do not let each side keep its own tiny private map. We hit this in the newsletter chart editor: the editor could emit newer metric ids like `depreciationAmortization`, but the exporter still enforced an older allowlist and crashed on save. The right fix was a shared bridge module with explicit aliases plus generic snake_case/camelCase conversion, not another one-off patch.

### The more general lesson

A lot of "this should be simple" product ideas fail because the boundaries are fuzzy.

The better question is not:

> "Can the button somehow use Codex or AI?"

The better question is:

> "What contract does the button trigger, and which component is responsible for fulfilling it?"

Once you ask it that way, the design becomes much clearer.

---

## Newsletter Chart Generation: The Boundary Lesson, Again

The newsletter chart pipeline is a perfect example of why "same chart" is not the same as "same contract."

At first glance, we only need one thing: a chart in an email. But the product actually needs three related surfaces:

- a static PNG for email clients
- a reader click-through chart
- an editor iframe where we can tweak and save the chart

The early system let those surfaces share loose URL params: `range`, `interval`, `chartType`, `fundState`, `priceState`, `newsletterEditorWidth`, and so on. Fundamentals charts mostly survived because they had a full `fundState` object and the editor force-applied it after the iframe loaded. Price charts were more fragile. They inferred too much from the URL and from whatever the charting workspace already remembered.

That is how we got bugs like:

- a light newsletter editor with a dark chart canvas
- a one-month price chart with candles crammed into the left side and empty future dates on the right
- preview PNGs that looked correct while the live editor showed a different viewport

The fix is not another timeout. The fix is to make the chart a **scene**: one explicit object that can be rendered, edited, saved, and linked. Fin Quote should decide the editorial scene. Charting Platform should render and replay that scene. No surface should quietly reconstruct it from half a dozen hints.

The lesson is simple and worth remembering: when two apps collaborate, implicit state is debt. It feels fast until one old localStorage value, one iframe width, or one missing query param changes the product.

Good engineers make the boundary boring.

### Manual blank drafts

The newsletter editor now has two different creation paths, and they should stay
mentally separate:

- **Generate** asks AI to write the newsletter and pick charts.
- **Start blank** skips AI and creates a manual draft with empty copy sections.

The important implementation detail is that a blank draft cannot use a fake
fundamentals chart just because the preview is still a placeholder. Each starter
section needs a real price-chart spec from birth, including the embedded export
editor spec. Otherwise the user can create a manual newsletter, click "Edit
chart," and still be trapped in a half-connected chart workflow.

The placeholder image is only a visual placeholder. The data contract behind it
must already be real enough for the Chart Builder to open, add studies, change
formatting, save, and regenerate the PNG.

### Chart library

Charts can now be saved from the live Charting Platform into a newsletter chart
library. A library item stores both artifacts:

- the rendered PNG that email previews and Beehiiv need
- the editable price-chart export spec that the Chart Builder can reopen later

That is intentional. A PNG-only library would make insertion easy but editing
dead. A spec-only library would keep editing alive but force every preview to
rerender. The library contract is therefore "image plus scene": insert the image
into the newsletter, keep the scene beside it, and use the scene whenever the
chart needs to be edited or regenerated.

Storage follows the rest of the newsletter editor:

- signed-in users save chart rows to `newsletter_chart_library` and PNGs to the
  public `newsletter-charts` Supabase Storage bucket
- anonymous/local sessions keep using `.newsletter-chart-library` and
  `.newsletter-output` as the dev fallback

### The Chart That Was Secretly a Whole Application

The old dashboard Chart of the Day looked like one chart, but it was really a
second application hiding inside an iframe. Imagine hiring a television truck,
crew, lighting rig, and control room to display a single still photograph. The
embed downloaded the chart workspace, fonts, workers, controls, profile data,
financial bars, ratio data, and even a missing Tesla media asset. The dashboard
also probed the iframe with a `HEAD` request and could remount it after resize or
theme changes. All of that work happened before one useful picture appeared.

The fix was to reuse the chart's *meaning*, not its largest UI component. The
server now reads the saved Chart of the Day spec, fetches only the selected
annual or quarterly metrics and aligned price points, caches that compact result
for an hour, and sends a plain presentation model to a native SVG component.
The dashboard owns the typography, colors, spacing, loading behavior, and
responsive layout. A clear link still opens the full Fundamentals workspace
when somebody wants editing tools.

The architecture now looks like this:

1. Saved chart spec decides the symbol, period, metrics, and chart types.
2. A server loader retrieves only those small data series.
3. A pure presentation builder normalizes dates, values, colors, and axes.
4. The dashboard draws the result with a lightweight, accessible SVG.
5. The external workspace remains the specialist tool for deep exploration.

This is a useful engineering lesson: component reuse is not always system reuse.
Embedding an entire product can save a little code while spending a great deal
of network, CPU, visual consistency, and debugging budget. A small shared data
contract is often the cleaner seam.

The same pass fixed a subtler hydration trap. The dashboard previously called
`new Date()` independently during server and client initialization, so the
visible “Updated” time could differ while React was attaching to the server
HTML. The page now creates one ISO timestamp on the server and passes it through
as serializable initial state. The first client render therefore matches the
server exactly.

### Designing for Attention, Not Inventory

The first Market Context design treated every piece of generated analysis as if
it deserved immediate attention. It showed the complete narrative, every trend
bullet, and separate refresh controls in one large card. Nothing was technically
wrong, but the result felt like opening a filing cabinet and dumping every
folder onto the desk.

The homepage now uses progressive disclosure. One sentence answers “what
matters now,” three drivers explain why, and the full narrative remains behind
an accessible native disclosure control. One refresh action updates both the
takeaway and its drivers. The data did not become less capable; the interface
became more honest about what a reader can absorb at a glance.

That distinction matters in financial software. Density is useful when it helps
comparison, as it does in a table. Density is harmful when it gives background
commentary the same visual priority as a price move. Good dashboard design is
not the art of fitting in the most information. It is the art of deciding what
the user should notice first, what should support it, and what can wait for a
click.

Session Movers follows the same rule. The dashboard used to show long lists and
load a batch of catalyst explanations when the user switched into a separate
Reasons mode. It now shows the top eight movers on each side, keeps the complete
lists behind “View all,” and places a quiet “Why?” control beside every ticker.
Opening one row requests one explanation and reveals it in context. This is both
a design improvement and a data-loading improvement: the interface asks the
server only for the piece of analysis the reader actually requested.

### A Homepage That Remembers How You Read It

The next dashboard pass applied that attention model to the whole page. The
market tape became one compact comparison strip. Economic releases, earnings,
and news stopped competing in three equal columns and became one chronological
“Next up” feed. Cross-asset tables now open with only meaningful moves, while
the large insider, global-session, and S&P mover visualizations wait behind
small summaries. Each section also says how fresh its data is, so a reader does
not have to guess whether two neighboring numbers came from the same snapshot.

The watchlist is now a real personal tool rather than a fixed sample. Tickers
can be added, removed, dragged, or moved with keyboard-accessible controls.
Moves of three percent or more receive a restrained unusual-move marker. The
watchlist order, preferred mover session, and expanded dashboard sections are
saved in a versioned browser-local preference object. This was a deliberate
boundary: preferences work immediately without requiring sign-in, a database
migration, or a new privacy decision. Account sync can be added later without
changing the interaction model.

Browser storage has a classic React trap. The server cannot see `localStorage`,
so reading it during the first render can make the client disagree with the
HTML that arrived from the server. The preference hook first renders stable
defaults, reads storage after hydration, and only begins writing after that
read completes. Think of it like checking the coat-room ticket before hanging
up a new coat: writing the default too early would overwrite the user's real
preferences before we had looked for them.

The compact cross-asset mode also includes a useful engineering lesson:
“notable” needs an explicit rule. Futures and sectors use a one-percent daily
threshold; currencies and rates use 0.2 percent because those markets normally
move on a smaller scale. If nothing clears the threshold, the UI still shows
the largest absolute moves. A smart default should filter noise without ever
producing a mysteriously empty panel.

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

*Last updated: August 2026*

---

## The Robot That Pretended to Be a Stock

In July 2026, Vercel reported that The Intraday had used more CPU than the
Hobby plan included. The site had not crashed, but the usage graph was a useful
warning: a mostly public market-data site was doing far too much repeated work.

The logs revealed the surprise. Bytespider was moving through expensive routes
in bursts: the homepage, stock pages, insider pages, dashboards, and workspace
pages. Applebot also requested `/robots.txt`, but because the app did not have
one and the middleware treated any short path as a ticker, that request became
`/stock/ROBOTS.TXT`. A missing metadata file had accidentally become a database
and API workload.

The fix uses several layers because no single cache or bot rule is enough:

- `app/robots.ts` tells cooperative crawlers which areas are off-limits while
  continuing to allow normal search indexing.
- Middleware serves metadata before ticker shortcuts and rejects the observed
  Bytespider user agent before an expensive page function can run.
- Public pages no longer perform a Supabase authentication round trip. Only
  protected profile and admin routes need that work.
- The homepage and premarket dashboard use ISR instead of rebuilding their
  large data fan-outs for every visitor.
- Warm Vercel function instances share short-lived market-data promises. The
  cache also coalesces simultaneous misses, avoiding a “cache stampede.”
- Stock fundamentals, symbol validation, and insider trades use bounded,
  per-symbol TTL caches. Slow facts can live longer; prices stay fresh.
- The sticky price header polls the small quote endpoint instead of invoking a
  full Server Action, pauses in hidden tabs, and benefits from a short CDN
  cache.

Think of the architecture like a restaurant. `robots.txt` is the sign on the
door. Middleware is the host who turns away a known nuisance. ISR is the batch
of soup prepared once for many tables. The quote endpoint is the waiter
bringing one small update instead of asking the kitchen to remake the meal.

There are two important limits to remember. A process-level cache lives only
inside a warm Vercel instance, so it is an optimization rather than durable
storage. And `robots.txt` is etiquette, not enforcement; malicious crawlers may
ignore it. That is why the app-level block exists and why any Vercel Firewall
rule should start in **Log** mode, be reviewed, and only then be changed to
**Deny**.

The practical lesson: when compute seems inexplicably high, look at routes,
user agents, and per-request fan-out before buying a larger plan. Scaling an
unnecessary workload only makes the unnecessary workload more expensive.

### The caches that looked active but were not

The first CPU pass added `revalidate` values to several pages, but production
headers exposed a second problem: `/dashboard`, `/dashboard/premarket`,
`/insiders`, and stock pages still returned `private, no-store`. Declaring ISR
is only a promise; one request-bound dependency anywhere in the render can
break that promise.

Three examples made the rule concrete:

- Public insider reads were creating the cookie-aware Supabase client. Reading
  cookies makes the render request-specific even though the database policies
  already grant anonymous read access. These reads now use the anonymous
  client, while protected pages keep the authenticated client.
- The premarket brief made four explicit `no-store` requests for extended-hours
  movers. The brief itself is cached for five minutes, so those subrequests now
  use the same five-minute lifetime.
- A stock-page cache miss could launch a live Finviz scrape, including retries.
  Page rendering now reads only generated or persisted catalyst data. The
  explicit API endpoint still owns live refreshes.

The dashboard also used to request its slow snapshot immediately after
hydrating with the same slow data from the server. That was like serving a meal
and instantly ordering a duplicate. Long-lived tabs already have a ten-minute
refresh timer, so the redundant mount request was removed.

The experimental `/concept` page had a sharper version of the same problem. It
could request S&P 500 and roughly 3,000-symbol NYSE quote batches every two
minutes even when the market was closed or the tab was hidden. Those polls now
run only during the cash session in a visible tab, and their computed snapshots
share a two-minute persistent cache across visitors.

The engineering lesson is that cacheability is end-to-end. A cached page that
calls one cookie reader or one `no-store` fetch is still a dynamic page. Verify
the result with production response headers and Vercel route metrics, not just
the `revalidate` line in source.

---

## Approval Is Now the Start of the Newsletter

The Why This Stock Moved queue used to stop after editorial approval. The
review was durable, but an editor still had to open the newsletter tool, start
an issue, remember the catalyst copy, and choose the right chart.

Approval now starts an idempotent automation:

1. The approved review key is checked against existing newsletter issues.
2. The latest saved charts for that ticker are attached automatically.
3. If the chart library has no match, Fin Quote captures a default one-month
   price chart through the charting platform and saves it to the library.
4. The catalyst headline, summary, source, review notes, market move, and chart
   IDs become structured draft provenance.
5. Repeating the approval reopens the same issue instead of creating a
   duplicate.

The editor displays that provenance next to the publishing workflow. Recording
the Beehiiv issue URL marks the issue published, stores the URL and timestamp,
and appends status and publication events to `newsletter_draft_events`.
Newsletter History then exposes the issue stage, origin, attached-chart count,
published timestamp, and live Beehiiv link.

The workflow is deliberately nearly automatic rather than brittle. A chart
capture outage does not undo the editorial approval or lose the draft. The
issue is created with a visible `needs_chart` state and can be repaired by
approving it again after charting recovers.

Run the real integration check with:

```bash
npm run verify:catalyst-newsletter
```

That verifier renders a chart through the live local charting platform, proves
repeat approvals are idempotent, records a publication, checks the full history
sequence, and removes its disposable artifacts.

---

## Daily Newsletter Production Is a Queue, Not a Loop

Generating forty issues is different from generating one issue forty times.
The daily production system stores a run and one durable row per selected
story. Each row can be claimed, retried, repaired, and finalized independently,
while a stable source key prevents duplicate drafts after a timeout or repeated
button click.

The selector reads the full persisted WIIM universe and rejects stories without
current evidence. It also rejects stale summaries, generated text that points
opposite the current stock move, and copy that ends mid-thought. That quality
gate matters more than reaching a round target count.

Charting has its own operational boundary. Anonymous local requests retain a
small render allowance, while Fin Quote can authenticate with the shared
`NEWSLETTER_RENDER_API_KEY` for a separate batch allowance. The client still
honors `Retry-After`, retries transient failures, and leaves a visible attention
state instead of silently accepting a placeholder.

The morning board is intentionally an editorial work surface: chart-first
cards, source links, failure filters, resumable generation, and bulk Ready
transition. A completed counter is not proof, so
`npm run newsletter:verify-daily` inspects every draft and PNG before the batch
is considered done.

---

## August 2026: The Pass That Turned Guardrails Into Boundaries

This product-hardening pass was less glamorous than adding another dashboard
tile, but much more important. It answered a question every serious product
eventually has to face: **what happens when the browser lies, an API fails, a
holiday arrives, or someone deliberately asks the system to do far too much?**

The broad lesson is that a user interface is a suggestion, not a security
boundary. A hidden button can still be called. A feature flag in client
JavaScript can be ignored. An iframe's `load` event only means a document
arrived, not that the application inside is usable. And the number `0` is not
another spelling of “we do not know.”

### The Server Now Holds the Keys

Several powerful operations had grown behind internal-looking pages and route
names. That is useful organization for people, but URLs do not become private
because they contain `/admin`. The hardening pass moved authorization to the
actual point of power:

- the admin allowlist now **fails closed** when it is not configured;
- Chart of the Day publishing authenticates an administrator before touching
  the service-role database client;
- evaluation and feedback analysis authenticate before OpenAI is constructed
  into a request, then enforce bounded JSON schemas, body sizes, batch sizes,
  and concurrency;
- the annotation API accepts only canonical evaluation filenames and verified
  paths contained inside its intended directory;
- direct newsletter generation authenticates an administrator before it parses
  the request or starts provider, model, and browser work;
- Dexter's route and dormant Server Action now fail closed. The route returns
  an explicit non-cacheable `410 Gone`, and neither surface imports a process
  runner or depends on the ignored local `dexter/` checkout;
- iframe editor messages must come from both the expected origin and the
  expected child window;
- security headers now establish a Content Security Policy, disable MIME
  guessing and unnecessary browser capabilities, constrain framing, and add
  HSTS in production.

This is the difference between putting a “Staff Only” sign on a door and
actually installing a lock. The page-level checks still make the experience
pleasant, but the server-side checks are the ones that make it safe.

The dependency layer was treated as part of the same boundary. Next.js, the
MCP SDK, WebSocket support, PostCSS, Sharp, Vite's React integration, and the
TypeScript runner were moved to compatible patched versions. `npm audit
--omit=dev` reports zero production vulnerabilities for this snapshot. The
remaining audit finding is a moderate development-only `uuid` advisory pulled
in by ExcelJS; npm's suggested automatic fix would be a breaking ExcelJS
downgrade, so it is recorded instead of being "fixed" by making exports less
reliable. Incident response also rotated the exposed FMP key, the private chart
renderer key, and the daily cron secret across their production consumers.
Fixing the door does not prove nobody saw the old key, so revocation was part
of the repair rather than a someday follow-up.

The same principle applies to small maintenance scripts. Seven FMP utilities
had copied credentials or fallback credentials into source. They now share one
guard that accepts only a non-empty `FMP_API_KEY` from the environment and
exits unsuccessfully before any work when it is absent. The current copies of
the leaked value were also redacted from saved Specstory transcripts, although
Git history still makes rotation mandatory. A scheduled workflow was trimmed
at the same time: two steps fetched JSON into a disposable runner and neither
uploaded nor ingested it, so they consumed provider quota without changing the
product. The workflow now contains only durable database ingestion work.

Verification itself surfaced an important operational lesson. An early
missing-key subprocess test supplied a blank credential, but one legacy script
then loaded `.env.local` and overwrote that caller-supplied value. It briefly
performed real `shares_outstanding` updates before the test timeout stopped it.
No rollback was attempted because there was no before-state snapshot and the
writes used current provider values. The incident is recorded separately in
`docs/SECURITY_INCIDENT_2026-08-05.md`. The loader now follows dotenv's safer
rule—never overwrite an existing environment variable—and command tests run
from an empty temporary directory with credentials and dotenv controls stripped.
The memorable rule is: **a test process inherits authority unless you prove it
does not.** Isolation is part of the test, not an optional convenience.

### Zero Is a Number; Missing Is a State

Financial software has an especially expensive JavaScript trap:

```typescript
const revenue = row.revenue || 0
```

That line collapses two different facts. A legitimate zero becomes the same as
an absent value, while an API failure can become a very confident-looking
zero. One hides real data and the other invents it.

Stock overview, key statistics, and financial statements now carry missing
values as `null`, preserve real zeroes with `??`, and calculate derived values
only when their inputs actually exist. Failed loaders throw to the page's
unavailable state instead of returning a complete-looking object made of
zeroes. The presentation layer follows the same contract: `0` renders as zero;
only `null` renders as `N/A`.

The key-stat loader also fetches independent database groups concurrently and
normalizes provider payloads defensively. This made the page faster, but the
more important improvement is epistemic honesty: the product now distinguishes
“the company reported zero” from “our source did not answer.”

### The Chart Handshake Is a Receipt, Not a Doorbell

The charting workspace lives in a separate application and stays mounted while
the user moves between Price, Fundamentals, and Overview. That persistence is
why drawings and viewport state survive navigation, but it also means the host
and iframe need a real protocol.

The host now opens the protocol-complete `/tos-full` surface with an explicit
workspace mode, theme, parent origin, and page-surface palette. It accepts
messages only when both `event.origin` and `event.source` match the expected
chart frame. Most importantly, it does not consider `onLoad` a success. It
waits for the chart application's versioned `READY` message and capability
list.

Think of `load` as hearing the delivery van stop outside. `READY` is signing
for the package after checking what arrived.

Local development gets five seconds to become ready; a remote chart gets
twelve. A timeout or explicit chart error produces useful recovery actions:
**Retry** remounts the frame and **Open chart separately** lets the customer
continue outside the embed. Theme changes travel over `postMessage` when the
child supports live updates, so the full workspace does not throw away chart
state. The stock-page chart uses the same READY/source/origin discipline and
understands the older embed's typed `THEME_CHANGE` response: recoverable
interaction errors keep the last good chart visible, while that one
compatibility response triggers a theme-correct reload only when the theme
actually changed. “The settings panel could not open” is not the same as “the
chart could not initialize.”

### The Calendar Finally Knows What Year It Is

The old market-session helpers contained 2025 holiday arrays and treated every
New York timestamp as UTC-5. Both assumptions age badly. US market holidays
move, early closes have rules, and Eastern Time changes offset in summer.

The new calendar calculates NYSE holidays for the requested year, including
Good Friday and observed-date rules. It handles the subtle Saturday New Year's
case, recognizes early closes only when July 3, the Friday after Thanksgiving,
or Christmas Eve is actually a trading day, and walks backward or forward over
holidays when selecting the current or next trading session. Market status
closes the cash session at 1:00 PM on a valid early-close date.

FMP candle timestamps are now interpreted as New York wall-clock values using
the date's real IANA timezone offset. That prevents summer candles from being
shifted by an hour. Calendar code is a good example of why “simple constants”
often become correctness bugs: time is business policy wearing a clock.

### Generated Commentary Became a Published Snapshot

The dashboard browser used to be able to reach generation-oriented Server
Actions. Even if the button was hidden, a caller could spend model tokens and
replace shared commentary. The dashboard now only reads the last published
market summary, trend bullets, and calendar summaries.

Fresh generation sits behind a server-only scheduler boundary:

1. Supabase cron calls a security-definer function whose public, anonymous,
   and authenticated execution privileges are revoked.
2. The function reads the shared secret from Vault and sends it as a bearer
   token.
3. The route fails closed without `CRON_SECRET`, skips non-trading days, and
   accepts normal runs only from 10:15 through 10:29 AM Eastern.
4. The scheduler makes three attempts at 10:15, 10:22, and 10:29 Eastern;
   UTC schedules cover both daylight-saving offsets while the route's Eastern
   clock rejects calls outside the publishing window.
5. Installing the migration first removes any job with the same name, then
   creates one replacement. Reapplying it does not accumulate duplicate jobs.

Before spending model tokens, each attempt reads the latest cache rows and
compares their New York creation date with the requested market date. It skips
a complete day and regenerates only a missing summary, trends set, or calendar
pair. The route then re-reads persistence, so a failed write remains eligible
for the next retry. This pattern is worth remembering: generate once behind a
trusted boundary, publish a durable result, and let every customer read it
cheaply.

### “Why Is It Moving?” Cannot Become “Scrape Everything”

The dashboard reveals one catalyst only when a reader opens one mover. The
public API now mirrors that interaction instead of accepting a huge batch:

- one validated ticker per request;
- a 2 KiB body ceiling and one lookup at a time;
- fresh positive **and negative** cache results are honored;
- a live lookup happens only after a stale or absent cache;
- a recent provider-news headline is the final bounded fallback;
- future or older-than-three-day timestamps do not masquerade as current
  explanations.

Negative caching matters. “No trustworthy explanation found” is still useful
work, and forgetting it invites every page view to repeat the same scrape. The
general rule is to make the cost of a public endpoint resemble the small action
the customer took, not the largest array an attacker can submit.

### The Chatbot Feature Flag Now Controls Spending on the Server

The research chatbot remains feature-flagged, but the flag is now enforced at
both AI entry points rather than only in the React page. A request must pass the
server flag and Supabase authentication before any model call. The shared
policy then limits the request to:

- 48 KiB total JSON;
- a 2,000-character question;
- ten history messages, 2,000 characters each and 12,000 characters total;
- a constrained 128-character session identifier.

Only role, content, and timestamp survive normalization. Charts, tables, and
other rich UI objects are intentionally stripped before prompt construction.
GPT-5 routing is capped at 1,200 output tokens; answers and regeneration at
2,000; follow-up suggestions at 500. The browser sends only the last ten lean
messages and opens the sign-in dialog before adding a signed-out user's message
to the conversation.

Authentication is not a complete quota system, but it changes anonymous,
unbounded spend into attributable, bounded requests. A durable per-account
quota can be added later without changing this contract.

### A Finished Cron Job Should Stay Finished

The newsletter schedulers are intentionally persistent: they wake up every few
minutes so a temporary provider failure does not ruin the morning edition. That
same persistence became wasteful after success. The route kept leasing an
already completed row, refreshing its heartbeat, and increasing its invocation
counter. It was like a night watchman repeatedly waking someone up to confirm
they were still asleep.

Both the morning and mid-morning routes now read the day's run first and return
an explicit terminal skip for completed, partial, or failed work. No lease is
taken and no operational counter is rewritten. Every outcome is also emitted as
one structured JSON log record with the market date, action, stage, status,
counts, and duration, so an operator can query the story of a run instead of
reconstructing it from prose.

The same pass moved two other promises closer to the data boundary. Newsletter
item claims enforce their three-retry ceiling in both the selection query and
the conditional update; checking only in the caller had allowed another call
path to exceed the limit. WIIM summary batches now carry the full run universe
and merge it with the stored ticker list, so a run that began with 147 symbols
does not slowly claim it only covered the last three retries.

Finally, finalization no longer hides the useful chart exception. The readiness
check still says that a final chart is required, but it keeps the original
automation warning—such as a missing Chromium executable—beside that editorial
instruction. This distinction is small and operationally vital: “what must be
done” helps an editor, while “why automation could not do it” helps an engineer.

Production newsletter orchestration also treats its filesystem as temporary
workspace now. A deployed function's application bundle lives under a
read-only directory, so the local `./.newsletter-output` default could never be
a production destination. Each production invocation receives its own folder
under the operating system temp directory; local scripts keep their familiar
project folder, and explicit output paths still win. The isolation matters as
much as writability because two simultaneous newsletters should not overwrite
files that happen to share a ticker and timestamp.

That temp directory is a workbench, not an archive. Signed-in draft generation
and the authenticated generation API now publish charts to the public
`newsletter-charts` bucket and store the durable URLs. Explicit local tooling
can still decline publication and receive local chart, HTML, and preview paths;
those paths are useful inside the current invocation but are not durable links
for a later request. Any new product surface consuming that raw mode must
publish the assets before treating them as saved output.

Notification deduplication needed the same recovery mindset. A stable event key
should prevent duplicate alerts, but it must not freeze the first, broken
version forever. On conflict, the notifier now refreshes the event's current
severity, title, message, and metadata while preserving delivery and read
timestamps. Idempotency means "one evolving event," not "the first write wins
even after reality changes."

An in-app notification and a delivered alert are now two separate promises.
The database writes each new undelivered notification into a transactional
outbox. The operator-facing notification may later evolve under the same dedupe
key, but its already-enqueued webhook payload does not. That snapshot is
immutable because its stable event ID is also the receiver's idempotency key;
every retry must mean the same thing. A five-minute worker leases only a small
due batch, signs the exact raw body with a dedicated HMAC-SHA256 secret, and
sends that event ID as the idempotency key. Success atomically records both the
attempt and the notification's delivery time; failure records the error and
schedules exponential retry, capped at six hours.

This is the postal-service lesson of reliable integrations: first put the
letter in a durable mailbag, then let a separate courier retry the road. Never
make the morning report itself wait for a flaky destination. An admin-only test
route puts a real canary through the same mailbag and courier, so it exercises
signing, persistence, and transport rather than a misleading one-off `fetch`.

There is a second boundary inside the database. An authenticated browser may
mark its own notification read, once. It may not edit the recipient, content,
dedupe key, or delivery record, and it may not turn a read notification back
into an unread one. Service code owns operational truth; the browser owns only
the acknowledgement that a person saw it.

Fresh database previews caught a different kind of time-travel bug. An imported
remote-schema migration tried to remove a legacy table that production once
had, but a clean database quite reasonably did not. The migration now guards
that cleanup with `to_regclass` and conditionally executes it; databases with
the legacy table follow the old path, while new previews continue to the
recreation migration. A migration history is executable software, not a scrapbook:
every supported starting point must be able to walk through it safely.

---

## August 6, 2026: The Newsletter Finally Left The Building

For a long time, the newsletter pipeline could make excellent issues without
answering the most ordinary customer question: **did the email actually
arrive?**

On August 6, the unattended morning automation produced forty ready issues out
of forty. Each issue had current evidence, finished copy, and its own public
chart. That is a meaningful milestone, but it proves only that the kitchen
prepared forty plates. It does not prove a waiter picked one up, the dining
room received it, or the guest enjoyed it.

So we sent a one-subscriber canary through the real path. Fin Quote created a
Beehiiv draft, an unchanged resync reused the same remote post, Beehiiv
scheduled and published it, and the provider reported one message sent and one
delivered. Gmail received it with SPF, DKIM, and DMARC all passing. Lifecycle
reconciliation brought the published state back into Fin Quote, and running
that reconciliation again did not duplicate the publication history.

That sequence matters because every arrow crosses a different trust boundary:

```text
Fin Quote draft
  -> Beehiiv post
  -> scheduled publication
  -> provider delivery
  -> receiving mail server
  -> mailbox placement
  -> reader engagement
```

The final arrows are not implied by the earlier ones. Our first canary
initially landed in Spam. Authentication was correct and transport succeeded,
but the sending identity had almost no reputation history. That is not a code
failure to paper over with another green badge. It is a reputation problem to
manage with a small engaged audience, consistent cadence, careful list
hygiene, and time. We verified `theintraday.com` in Google Postmaster Tools so
spam rate and domain reputation can become observable signals rather than
folklore.

**The lesson:** an email system needs separate receipts for generation,
publication, delivery, authentication, placement, and engagement. Calling all
of them “sent” is how teams congratulate themselves while customers stare at
an empty inbox.

### Beehiiv Synchronization Needed A Checkout Counter

The happy-path version of “Send to Beehiiv” is deceptively simple:

```text
look for an existing post -> create one if missing -> save its ID
```

Now imagine two requests arrive together. Both look before either has saved an
ID. Both conclude that no post exists. Both create one. This is the database
equivalent of two cashiers selling the last concert ticket because each looked
at the seat map before the other marked it sold.

The hardened path makes the claim atomic and leased. One worker obtains the
right to perform a particular sync operation; another sees that claim instead
of racing it. Completion is fenced by the lease token, so a slow worker whose
lease expired cannot wake up later and overwrite the result of its successor.
The operation records whether it is creating or updating and leaves recovery
markers when the remote outcome is ambiguous.

That last case is the uncomfortable one. A network timeout does not tell us
whether Beehiiv rejected the request or created the post and lost the response.
Blindly retrying can produce a duplicate. Pretending success can lose the
post. The safe state is explicit uncertainty: stop automatic creation, surface
the recovery context, and require evidence before another remote mutation.

Publication selection follows the same fail-closed rule. When Beehiiv exposes
exactly one intended publication, the system can proceed. When several are
possible and configuration does not identify one exactly, guessing would send
content to the wrong audience. A useful automation should be brave about
retrying known-safe work and stubborn about ambiguous irreversible work.

### Reconciliation Is Bookkeeping With Leases

Beehiiv owns the external truth about whether a post is a draft, scheduled, or
published. Fin Quote owns the editorial record and operator experience. The
reconciler is the accountant keeping those two books aligned.

The branch now claims reconciliation work in small leased batches. Lifecycle
updates, publication metadata, and events are applied only by the worker that
still owns the lease. Side effects are idempotent, so observing the same
published post twice does not append the same milestone twice. Recently
published posts stay eligible for periodic statistics refreshes, while failed
analytics calls do not block the more important lifecycle update.

The operations page turns that bookkeeping into something a human can inspect:

- counts for the selected market date, separate from lifetime totals;
- time from generation to sync, schedule, and publication;
- reconciliation freshness and errors;
- Beehiiv sent, delivered, open, click, bounce, unsubscribe, spam, and web-view
  figures when the provider supplies them;
- webhook-outbox health and configuration validity; and
- a **Reconcile now** action that uses the same lease-fenced queue as cron.

That final point avoids a common operations mistake. A manual button should not
be a secret second implementation with different rules. It should safely ask
the production machinery to do its normal work now.

### The Migration Ledger Was A Map With Two Legends

The Supabase project and the repository had both continued evolving, but their
migration ledgers no longer told the same story. Some migrations existed only
remotely. Many local files had no remote ledger row. A handful of tables were
already live without a migration that a fresh database could replay. Two
retired tables existed in history but should not be resurrected.

Running a blind `supabase db push` in that situation is like renovating a
building from an old floor plan: the drawing may tell you to build a wall where
people are already walking.

The convergence package restores remote history byte-for-byte where possible,
adopts live tables without recreating them, codifies intentional retirements,
and separates historical ledger repair from schema changes that are genuinely
missing in production. A clean local Supabase instance has replayed the whole
history successfully. That proves the map is internally navigable.

At that checkpoint it did **not** mean production had changed; the application
was still a release gate. The release later followed the safe order: capture
the ledger and worker state, inspect a dry run, apply only the expected
migrations, verify the live objects, demand an empty second dry run, and only
then deploy application code that calls the new functions.

**The lesson:** migration history is not paperwork. It is executable recovery
infrastructure. A database you cannot recreate is a database you only partly
understand.

### A Healthy Chart Needs Both Code And An Address

The companion Charting Platform had two independent problems. Its narrow
workspace controls collided and clipped, several fields lacked accessible
names, and an old Tesla media request still haunted an interactive surface.
Separately, `charts.theintraday.com` pointed through broken DNS/custom-domain
routing even though the direct Vercel deployment was healthy.

Charting Platform PR #2 fixed the mobile and accessibility defects and removed
the stale request. The PR is merged and deployed. The custom-domain attachment
and DNS were repaired, and `https://charts.theintraday.com/health` now returns
`200`.

This is a useful reminder that “the service is up” has layers too. A healthy
deployment behind a broken public hostname is still down for customers. Code,
DNS, TLS, domain attachment, and the application health route all need to agree.

### Security Maintenance Should Follow Reality

An old automated Fin Quote security PR was still proposing a dependency change
for a repository state that no longer existed. The actual dependency baseline
is Next.js 15.5.22 with React 19.2.1, and the production dependency audit
reports no known vulnerabilities. The stale PR was closed instead of merging a
conflicting historical patch for appearances.

The engineering habit here is simple: automation raises a question; it does
not get to replace inspection. Check the resolved dependency graph, current
advisories, and actual audit result. Then either repair the current system or
close the obsolete work with evidence.

The Fin Quote launch-hardening release then completed its full validation,
production migrations, isolated deployment, promotion, and smoke checks. The
database jobs were paused before schema work and resumed only after the live
app had exercised its signed cron paths. Documentation changed state only
after those gates passed.

### How We Verify A Pass

Verification should match the risk instead of relying on one happy path:

- focused Vitest regressions cover admin gates, traversal rejection, safe
  process invocation, AI route limits, chatbot flag/auth limits, Why Moving
  fan-out, market-calendar/early-close behavior, FMP daylight-saving parsing,
  zero-vs-missing rendering, and iframe READY/retry behavior;
- the chatbot boundary alone has fourteen focused tests across its pure policy,
  streaming route, and legacy Server Action;
- TypeScript runs with `npx tsc --noEmit` rather than depending on a production
  build that may ignore type errors;
- the production Next.js build verifies route compilation and the new security
  headers/rewrites;
- the production dependency audit reports zero known vulnerabilities;
- browser checks exercise the dashboard, stock page, and local chart
  integration rather than assuming unit tests can see layout and iframe timing;
- `git diff --check` protects the handoff from malformed patches.

Exact suite counts are deliberately omitted here because they become stale as
soon as another test is added. The August 6 release record instead captures the
commands and gates: the full Vitest suite, TypeScript, ESLint, production build,
production dependency audit, clean Supabase replay, database lint, local diff,
linked migration dry run, Vercel promotion, protected-route checks, and live
reconciliation all passed.

The most reusable lesson from this pass is simple: **make invalid states
representable but unmistakable, and make expensive states reachable only
through a small authenticated door.** That is how a promising application
starts behaving like a product customers can trust.

---

## August 6, 2026: The Newsletter Learned To Distrust Green Lights

The first hardening pass taught the newsletter how to complete a long journey:
research a company, write an issue, publish it through Beehiiv, and reconcile
the result. The next pass asked a more uncomfortable question: **what if every
individual step looks green while the overall story is wrong?**

That question was not theoretical. An MTCH draft paired Match Group's financial
story with a headline about Huya's game *Triple Match 3D*. The word “Match” was
present, the article was recent, and the old checks could describe the headline
as concrete. All of those facts were true, but it was still the wrong company.
The pipeline had treated lexical overlap as identity.

This is a useful distinction for AI products. The model did not invent the
unrelated headline from nowhere; the system handed it a plausible-looking but
misidentified source. Better prose prompting would not repair that evidence
boundary. The fix had to live where sources enter the system.

### “Match” Is A Word; Match Group Is An Entity

Source integrity now fails closed unless the source itself mentions the ticker,
the complete or core canonical company name, or a deliberately reviewed brand
alias. Free-floating single-token overlap never establishes identity. Generic
and ambiguous words do not count by themselves. That rule is enforced
when Why It Is Moving evidence is generated, ranked, and selected for the daily
newsletter, so a bad association cannot simply reappear at the next handoff.

The MTCH regression is especially valuable because it looks reasonable at a
glance. Tests that use nonsense input prove very little about ambiguity; real
mistakes usually wear a convincing costume. “Triple Match 3D” now remains a
valid story about its actual subject and an invalid source for Match Group.

Think of this as checking a passport, not recognizing someone because their
shirt has the right first name. A good evidence pipeline validates who a story
is about before it asks what the story means.

### A Lease Is A Key Card, Not A Sticky Note

The daily and mid-morning automations already used leases to prevent two workers
from owning the same run. The remaining hole was subtle: a worker could pause
long enough for its lease to expire, another worker could take over, and the
original worker could wake up and write stale progress.

The database now fences every automation update with both the lease token and
the database's view of the lease expiry. A valid token with an expired lease is
not valid ownership. Claims use a short, bounded lease, active work renews it,
and every accepted progress patch renews the heartbeat atomically. Terminal
states remain terminal when a later invocation inspects the same market date.

A hotel key-card is the right analogy. Copying yesterday's card number does not
let a former guest back into a room after checkout; the lock also checks whether
the credential is still current. Lease fencing gives database rows that same
property. Forced-expiry tests now exercise takeover, reject the stale worker's
write, and prove that only the current owner can renew or advance the run.

The broader lesson is that a mutex answers “who started first?” while a fenced
lease answers “who is allowed to write **now**?” Distributed systems need the
second answer.

### Finished Work Still Needs A Delivery Receipt

There is another crash boundary after the automation reaches `completed`,
`partial`, or `failed`. The run may commit its terminal status and the process
may die one instruction before it records the operator notification. If those
two facts are treated as one operation, the dashboard says the work is over
while the person responsible for it never hears the result.

Daily and mid-morning runs now track notification attempts, the last delivery
error, and the moment all deduplicated terminal notifications became durable.
A terminal run without that timestamp remains eligible for notification retry.
Success sets the receipt once; failure records the problem without pretending
the notification happened. Existing notification dedupe keys and the
transactional webhook outbox make those retries safe rather than noisy.

It is the difference between finishing a report and obtaining a signed receipt
from the mailroom. “The PDF exists” and “the recipient's message is durably
queued” are separate truths. Reliable software records both.

### An Email Image Must Be A Fossil, Not A Whiteboard

Email is unusually hostile to mutable assets. A newsletter may be opened days
after publication, forwarded months later, or cached by an image proxy. If the
URL points to a filename that can be overwritten, yesterday's email can silently
show today's chart.

Published chart images are now content-addressed. The system validates the PNG
signature and dimensions, hashes the actual bytes with SHA-256, and stores the
image beneath a path derived from that digest with a one-year immutable cache
policy. Uploading the same bytes naturally reuses the same address; different
bytes necessarily get a different one. A storage conflict means the identical
artifact is already present, not that it should be overwritten.

A normal filename is a label on a whiteboard: someone can erase what sits
behind it. A content digest is closer to a fossil's fingerprint. The address is
evidence of the exact bytes the reader should receive.

Beehiiv delivery adds a second defensive layer. Before an image URL is allowed
into an issue, it must use HTTPS, come from an approved host, resolve only to
public addresses, survive bounded redirects under the same rules, return a
supported image body, stay within the byte limit, and have credible PNG or JPEG
headers and dimensions. That protects readers from broken images and prevents
the delivery service from becoming an accidental internal-network fetcher.

### The Last Gate Is The Inbox Gate

An issue can be editorially sound and still be a poor email. The final delivery
contract therefore checks the artifacts readers and mailbox clients actually
receive:

- the subject is clean, complete, and no longer than 60 characters;
- the preheader is normalized from the issue's intro copy and no longer than
  120 characters;
- chart and call-to-action links are credential-free HTTPS URLs;
- images include useful alt text;
- required copy and chart blocks are present; and
- the rendered HTML remains below the 90 KB safety ceiling, leaving room below
  common client clipping limits.

Subject and preheader text are normalized again at the Beehiiv boundary. This
is deliberate belt-and-suspenders engineering: the editor catches mistakes
early, while the provider adapter protects the irreversible external call even
if a future caller bypasses the editor. Validation belongs closest to both the
authoring experience and the side effect.

### A Heartbeat Needs Someone Outside The Body

Successful cron responses used to be visible only in request logs and the
automation tables they happened to update. The four critical cron routes now
write append-only heartbeat rows from invocation start through success or
failure. A health endpoint interprets missing, failed, or stale runs and returns
an unhealthy HTTP status without leaking internal errors.

That endpoint is then polled every ten minutes by a GitHub Actions watchdog.
This separation is important. An application cannot be its own only smoke
alarm: if the deployment disappears, an in-process monitor disappears with it.
The off-site watchdog fails when production is unreachable, returns a non-200,
or reports unhealthy state. Repository notifications or Vercel/on-call alerts
can then turn that failed check into a human page once their production
notification settings are connected.

The external notification webhook is intentionally optional. In-app
notifications remain the durable source of truth, and a missing or invalid
`NEWSLETTER_ALERT_WEBHOOK_URL` appears as a health warning rather than making
the core newsletter cron unhealthy. The webhook adds another road to an
operator; it is not allowed to become the engine's ignition key.

### Lifecycle Health And Statistics Health Are Different Vital Signs

Beehiiv may successfully confirm that a post is published while its optional
statistics endpoint fails. Previously that partial result could make old
numbers look freshly reconciled. Delivery rows now track when statistics were
last fetched and the last statistics error independently from lifecycle
reconciliation.

When analytics fail, the system preserves the last known statistics, records
their staleness, and still applies the authoritative lifecycle update. When
statistics recover, the fresh timestamp advances and the isolated error clears.
Deliverability alerts also wait for a meaningful sample before judging bounce,
complaint, or unsubscribe rates; a single canary should not masquerade as a
trend.

This is the medical-chart lesson: a patient's pulse and blood test are both
important, but a delayed lab result does not mean the pulse was never measured.
Keep independent signals independent, then tell the operator exactly which one
is stale.

### Every Attempt Needs Its Own Claim Check

A run-level lease prevents two workers from owning the orchestration row, but
the forty newsletter items inside that run need the same protection. Each item
claim now records a unique start time, and every success, failure, or interrupted
restore is conditional on both `status = generating` and that exact start time.
Successive attempts also receive distinct draft operation keys. A worker that
wakes after its item was reclaimed can no longer overwrite the winner's draft
or spend the winner's retry budget.

The HTTP request has an absolute deadline too. Preflight time is subtracted
before a stage begins, chart capture leaves a durable-write reserve, Supabase
reads carry the stage abort signal, and retry-attempt checkpoints are written
before expensive dispatch. A timeout is therefore a recorded, reclaimable
attempt—not an invisible second worker still running behind a 504.

This is the coat-check lesson: a room key controls the building, while the
numbered ticket controls one coat. Reliable batch systems need both levels of
ownership.

### Published Means Immutable To Automation

Draft saves now use optimistic concurrency. An update must still match the
draft's `updated_at` value and workflow status that the caller actually read.
The editor sends that version back to the server, and automated repair passes
the version attached to its claimed draft. A concurrent Beehiiv lifecycle
update therefore wins cleanly instead of being erased by stale pre-publication
JSON.

Automation also treats `published` as a one-way safety boundary. If a draft
becomes published while a finalizer or catalyst repair is working, the stale
worker returns the durable published record; it cannot remove the public URL,
downgrade the status, or rewrite published content. Human-facing APIs report a
409 conflict so an editor can reload rather than unknowingly overwrite someone
else's work.

Think of a published issue as ink on a newspaper press, not text in a shared
scratchpad. Corrections should create an intentional new operation, never
emerge accidentally from yesterday's browser tab.

### Parent And Child State Must Reconcile

The morning automation is a parent projection over one or more daily child
runs. A child issue can be repaired after the parent already reported 39 of 40
ready. Terminal parents now compare their counters and derived quality status
with the durable child projection before a cron decides to skip. If the child
state changed, the worker takes a fenced lease, clears the obsolete notification
receipt, updates or reopens the parent, and refreshes the deduplicated operator
notification with the new counts.

Finalization also inspects every database write result. Supabase returns many
write failures as resolved `{ error }` values rather than rejected promises;
ignoring that convention can make a generated item look as though it advanced
when its row never changed. Readiness, ready-state, and fallback writes now fail
loudly, which keeps the parent retryable and the watchdog honest.

This is bookkeeping with double-entry discipline: fixing the line item is not
enough until the ledger total and the receipt agree.

### Official Evidence Is The Last Safe Fallback

Provider news and the normal cache remain the fast path, but a company can have
no usable recent article—or only an entity-mismatched one. The evidence loader
now merges and ranks provider, fallback, and official SEC candidates instead of
letting one weak source replace the others. A recent company filing can serve
as the final verified catalyst when ordinary news fails. Freshness belongs to
the winning event's own URL, title, and date; a different recent article cannot
launder an old or unrelated claim.

For Match Group, that meant falling through the contaminated Huya association
to Match Group's own August 4 filing. “Use official evidence last” is a much
safer recovery rule than “use whatever text is left.”

The live repair exposed one more subtle seam. The replacement headline named
Match Group correctly, but the model shortened one sentence to “Match
reported.” That sentence was factually plausible yet failed the identity gate,
as it should: “match” is also an ordinary word. Generated summaries now have to
name the full recognized company or its ticker, and retry coverage treats an
identity-rejected summary as unfinished work. The daily repair path also
validates and refreshes both the headline **and** the summary. Checking only
the headline had allowed a corrected source to carry an older ambiguous
sentence into a fresh draft.

This is a memorable version of a general rule: when a record is a bundle of
claims, validating one field does not bless its siblings. A passport photo
matching the traveler does not prove the address printed below it. Validate
every field that can independently steer a decision, and make the repair path
refresh every field that can independently be stale.

### Failure Injection Is Rehearsal For The Bad Day

Happy-path tests prove that the feature can work once. This pass concentrated
on proving that the system does not lie when a component fails. The regression
suite deliberately injects:

- lease expiry, takeover, renewal, and a stale worker's attempted write;
- a hanging generation stage that must hit its deadline;
- a database failure between terminal run state and durable notification;
- successful lifecycle reconciliation beside a failed statistics request;
- malformed, oversized, privately resolved, or redirecting image sources;
- the real MTCH false-entity collision;
- unauthorized, failed, missing, and stale cron heartbeats;
- an older orphaned `running` heartbeat hidden behind a newer success;
- a repaired 39-of-40 child run whose parent and notification must become
  40-of-40;
- a stale editor or finalizer racing a Beehiiv publication update;
- resolved database write errors during item finalization; and
- an absent optional webhook that must warn without poisoning core health.

These are not exotic edge cases. They are the seams between databases,
providers, workers, and deployments—the places where each subsystem can be
locally honest while the product tells the wrong story. Good engineers test
the ambiguity after a side effect, the crash between two commits, the worker
that resumes after losing ownership, and the monitor that lives outside the
thing it monitors.

The database failure drills now run in pull-request CI as pgTAP tests against an
isolated local Supabase database. Application tests alone cannot prove function
privileges or lease predicates. CI replays the migrations, verifies stale-token
rejection and service-role-only RPC access, then rolls the fixtures back. The
public health check also gives each cron one scheduled period at the start of
its UTC window and explicitly looks for older abandoned heartbeats, so it does
not trade false reassurance for noisy first-tick alarms.

### Release State: Promoted, Reconciled, And Watched

The reliability follow-up is now live. The four newsletter schedules were
paused and allowed to drain; every relevant lease pool was empty. The linked
dry run contained exactly migrations `20260806135000` through
`20260806142000`, those migrations were applied in order, the linked schema
lint was clean, and the second dry run was empty. Application commit `83407ea`
then became Vercel production deployment
`dpl_CqFLdAqR2nr38zwdfj3Aca8QLJZL` before the schedules resumed.

The proof was deliberately product-shaped, not just deployment-shaped. The
quarantined Match Group issue was regenerated from the company's SEC filing;
its active draft contains no Huya or “Triple Match 3D” text. The child run and
parent automation both reconcile to 40 selected, 40 generated, 40 ready, zero
attention, and zero failed. The terminal notification receipt has one
successful attempt and no error. Daily, mid-morning, Beehiiv reconciliation,
and webhook outbox all recorded fresh successful heartbeats, the public health
route returned `200`, and all four schedules were active with no live leases.
The latest Beehiiv canary remained published with one sent, one delivered, one
open, zero bounces, zero spam reports, and a fresh error-free statistics fetch.

The release gate also passed 129 Vitest files and 682 tests, TypeScript, ESLint
with zero errors, a production build, full and production dependency audits
with zero vulnerabilities, 56/56 database assertions, Supabase Preview, and
Vercel Preview. [GitHub Status](https://www.githubstatus.com/incidents/qcvjkzcs7j74)
reported a critical Actions incident with the component in major outage: hosted
jobs were cancelled while still waiting for runners and produced no test
output. The off-site watchdog must be rerun after Actions recovers. A live
Vercel 5xx rule supplies an independent error signal in the meantime. The
optional external webhook remains intentionally unconfigured; its warning does
not weaken durable in-app notifications or core health.

**The lesson:** perfection is not a dashboard full of green boxes. It is a
system that refuses the wrong evidence, fences yesterday's worker, remembers
which receipt is still missing, preserves the exact artifact it published, and
admits plainly which release gates have not happened yet.
