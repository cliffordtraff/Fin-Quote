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

### Full-Market WIIM Collection: Slow Beats Clever

Finviz coverage uses a slow morning conveyor rather than burst traffic. The
daily cron begins at 3:15 AM New York time and advances once per minute. Each
Finviz invocation fetches at most two symbols sequentially, with 10–16 seconds
between them, and each symbol gets one physical HTTP attempt per invocation.
The queue is the reverse of editorial rank so quiet names are handled first and
the likely newsletter stories are freshest near the 8:00 AM deadline. Progress
and the physical request count are checkpointed before every request; the run
has a hard 550-request daily ceiling.

A shared circuit breaker stops the entire conveyor on a 403, 429, recognizable
access challenge, or a batch of repeated unrecognized failures. It waits 45
minutes and permits one canary request. A second trip opens the breaker for the
rest of that run. The worker never rotates proxies or tries to evade access
controls: incomplete coverage is safer than escalating traffic after Finviz
signals that it wants requests to stop.

This distinction matters. A parent run can intentionally end as `partial` when it does not meet the configured quality threshold. That is not a migration failure and it does not mean a newsletter was sent. It means the system chose caution. The approved daily candidate-set exception supports a human-approved, date-scoped draft for such a day without quietly lowering the global threshold. It records the source run and explicit candidate IDs, creates a draft only, and leaves Beehiiv scheduling and delivery to an explicit later decision.

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

### Server Actions And Route Handlers: Two Doors For Different Traffic

The application does not need a separate Express server, but it no longer
pretends every server boundary is the same. Next.js Server Actions are the
pleasant door for trusted server-rendered reads and tightly coupled UI work:
put `'use server'` at the top of a file and React can call typed server code
without maintaining a second client SDK.

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

That is one door. Route handlers are the other. They own SSE streams, browser
commands that need cancellation, bounded public market-data APIs, explicit
CORS/origin policy, webhook verification, cache headers, and compatibility
redirects between read and write modules. The distinction became a deployment
tool too: a tiny polling GET must not statically import the Puppeteer and
newsletter-generation graph used by a mutation simply because both happen to
concern the same screen.

We still have dozens of server actions for financials, market data, and
internal composition. The rule is no longer “no fetch calls.” It is “choose
the boundary whose HTTP, lifecycle, and bundle semantics match the job.” The
chatbot and live market feeds use SSE routes because an answer must arrive in
pieces. Newsletter and review commands use bounded authenticated routes because
the browser needs abort, conflict, and retry behavior it can observe.

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

### Market Dashboard: The Art of Honest Freshness

The homepage is a market dashboard showing indexes, sectors, gainers, losers, and more. The challenge? Making it feel "live" without hammering the APIs.

**Solution: ISR + independently timed snapshots**

```typescript
export const revalidate = 60 // ISR: regenerate every 60 seconds
```

Next.js ISR (Incremental Static Regeneration) supplies an immediate first
render. After hydration, the browser treats freshness as three clocks rather
than one decorative timestamp. The four-section fast snapshot refreshes on a
serialized 60-second cadence. Slow catalysts and cross-asset data refresh on
their own path and can be requested manually. Initial global quotes retain the
time at which that initial envelope was loaded. The UI names these clocks
`fastCapturedAt`, `slowCapturedAt`, and `globalLoadedAt` because data captured
at different moments should never borrow another section's newer label.

Every snapshot carries source capture time and section-level failure
provenance. A successful empty list is real information; a failed section is
omitted so it cannot erase a healthy value already on screen. Slow
last-known-good sections keep their original timestamps, and an older response
cannot overwrite a newer render even if it wins the network race. The former
combined snapshot API is retired; `/fast`, `/slow`, and `/live-movers` each ask
only for the data their caller actually uses.

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

## Where Current Work Lives

Branch names are archaeology, not a roadmap. The canonical plan now lives in
[`docs/CURRENT_ROADMAP.md`](docs/CURRENT_ROADMAP.md). The immediate themes are
shipping the migration-first local package, earning a healthy newsletter
sending reputation, wiring the real external alert receiver, and turning the
browser-local watchlist into one account-synced ordered list without sacrificing
anonymous use. Research depth should then build on the catalyst history and
calendar rather than creating another parallel surface.

The goal is still to become a legitimate alternative to expensive data
terminals—not by matching Bloomberg feature-for-feature, but by making a
smaller set of investor workflows unusually trustworthy.

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
Vercel Preview, and a pinned Gitleaks 8.30.1 scan of the exact merged tree.
[GitHub Status](https://www.githubstatus.com/incidents/qcvjkzcs7j74) reported a
critical Actions incident with the component in major outage: the larger hosted
CI jobs were cancelled while still waiting for runners and produced no test
output. A later hosted watchdog run,
[31125987699](https://github.com/cliffordtraff/Fin-Quote/actions/runs/31125987699),
did receive a runner and passed the live production-health assertion. A
scheduled tick and the intentional-failure notification path still need proof
after Actions recovers. A live Vercel 5xx rule supplies an independent error
signal in the meantime. The optional external webhook remains intentionally
unconfigured; its warning does not weaken durable in-app notifications or core
health.

**The lesson:** perfection is not a dashboard full of green boxes. It is a
system that refuses the wrong evidence, fences yesterday's worker, remembers
which receipt is still missing, preserves the exact artifact it published, and
admits plainly which release gates have not happened yet.

---

## August 6, 2026: The Database Needed Two Locks, Not One Sign

The next deep audit began with a simple question: what is the most important
thing to improve after the newsletter can generate, publish, and report its own
health? The answer was not another chart. It was making sure every existing
surface deserved to be trusted.

Supabase exposes PostgreSQL through a convenient Data API. That convenience can
hide a crucial detail: **database authorization has two separate locks**.
PostgreSQL grants decide whether a role may attempt `SELECT`, `INSERT`,
`UPDATE`, `DELETE`, or function execution at all. Row Level Security then
decides which rows an allowed operation can touch.

Imagine an office with a front-door badge reader and locked rooms inside. A
table grant is the front-door badge; an RLS policy is the room key. Giving
someone the badge and hanging a sign that says “staff only” on an unlocked room
does not secure the files. Removing the badge while carefully programming the
room lock does not let a legitimate employee do their job. Both layers must
tell the same story.

Historical migrations had granted broad access to current and future public
tables, sequences, and functions, then expected RLS to supply all the nuance.
Some old policies also had reassuring names such as “service role” without an
actual `TO service_role` clause. In PostgreSQL, leaving out `TO` means the policy
targets `PUBLIC`. Even more subtly, RLS policies are permissive by default:
matching policies are joined with `OR`, not `AND`. One broad policy can open a
path that five careful policies appear to close.

The audit found examples across ingestion, cache, insider, evaluation, and
newsletter-selection data. Query history had an anonymous-session condition
that accepted rows with a non-empty session id, but the database had no trusted
way to prove that a caller owned the supplied id. This finding establishes that
the boundary was too broad; it is not evidence that someone exploited it.

### Authorization Is Now A Written Matrix

The repair starts by revoking the inherited browser-role grants and rebuilding
them from an explicit inventory:

- anonymous callers can read only the market and reference tables deliberately
  used by public product pages;
- signed-in callers get those reads plus narrowly defined operations on their
  own conversations, workspace documents, watchlists, and newsletter records;
- operational runs, evaluation data, ingestion state, caches, and server-owned
  writes belong to `service_role`; and
- new public-schema tables, sequences, and functions start private to browser
  roles through PostgreSQL default privileges.

Owner policies now say `TO authenticated`. Server policies say
`TO service_role`. Query logs are signed-in and tied to `auth.uid()`; there is
no caller-chosen anonymous session shortcut. Their telemetry is created by a
server-only service client, while a user may update only the two feedback
columns—not fabricate costs, validation results, or review outcomes. Newsletter
notifications use the same least-privilege idea: the reader may update
`read_at`, not quietly rewrite the notification's severity or message. Raw
filing chunks and embeddings are server-only rather than a bulk public API.

This is more maintainable than relying on policy names or institutional memory.
The role matrix is executable and reviewable. If a future feature needs a new
browser write, its migration must expand both the grant and its precise RLS
policy—and update the authorization test that describes the intended contract.

### A Powerful Function Must Still Know Who Is Calling

Database functions are doors too. A `SECURITY DEFINER` function runs with its
owner's authority, which is useful for tightly designed administrative RPCs but
dangerous as a casual shortcut. The old conversation-title helper could read a
message with elevated rights and had broad execution privileges.

Title generation now uses `SECURITY INVOKER`, so the caller keeps their normal
RLS context, and the query independently confirms that the conversation belongs
to `auth.uid()`. Only authenticated and service roles may execute it. Mutating
ingestion helpers are service-only, the stale filing-search overload is gone,
and the supported search bounds result counts instead of accepting an
unlimited request.

This is the restaurant-kitchen lesson: a waiter may need a service window, but
that does not justify handing every guest the kitchen master key. Definer-rights
functions should be rare, purpose-built, search-path safe, and tested as an
attacker would call them.

### The Service Key Belongs On The Server

Tightening the database immediately reveals code that had been depending on
overly broad access. Supported financial-metric, stock-registry, and segment
ingestion commands previously constructed clients with the public anonymous
key. They now require `SUPABASE_SERVICE_ROLE_KEY`, disable session persistence,
and fail before doing work if that server credential is missing. If an
anonymous key is accidentally copied into the service-role variable, the newly
restrictive database policies still make the write fail closed.

That failure is intentional. A pipeline that “keeps going” with weak credentials
teaches operators to reopen the database just to make a script green. A clear
configuration error preserves the boundary and tells the person running the
job exactly what must be fixed.

The same ordering rule now protects admin server actions. Review, annotation,
validation, and cost functions authenticate an administrator *before* they
construct a service-role client. Once created, that client bypasses ordinary
RLS by design. Authorization after construction is like checking a pilot's
license after takeoff: the sequence itself is part of the safety property.

### Supabase Storage Has A Platform-Owned Lock

Storage required a different kind of honesty. The underlying
`storage.objects` grants are owned by Supabase's reserved
`supabase_storage_admin` role. A normal application migration cannot assume
that role and should not claim it revoked platform-managed ACLs.

For the `filings` and `newsletter-charts` buckets, browser mutation is instead
closed at the supported boundary: Storage RLS. Policies that allowed browser
insert, overwrite, or delete are removed, public reads remain where the product
requires them, and server uploads continue through `service_role`.

The important testing lesson is to verify the effect, not a convenient proxy.
An ACL inspection alone looks alarming because the platform role deliberately
retains its grants. The regression test checks that RLS is enabled, that no
browser write policy matches either bucket, and then actually tries insert,
update, and delete operations as anonymous and authenticated callers. Those
operations must fail. That is a stronger proof than pretending ownership we do
not have.

### Financial Software Cannot Use Stage Props

The trust review also found a product problem rather than a database problem.
The Market Internals experiment drew historical advance/decline values with
`Math.random()`. The screen looked like financial analysis, but its history was
generated each time the component rendered.

Placeholder data can be useful while building a layout, but it becomes a lie
when it is reachable from production navigation without unmistakable labeling.
The random chart is gone. Market Internals is removed from navigation and its
route is a non-indexed unavailable state explaining that the feature will
return only after a verified, reproducible breadth-data source exists. Useful
live links remain, but they point only to production-backed market views.

The public schema-debug route and its ad hoc mutation helpers are gone too.
Schema work belongs in reviewable migrations and operator workflows, not in a
web page that happens to know an RPC name. Deleting that tooling reduces both
attack surface and architectural ambiguity: there is now one boring, auditable
road for database change.

### Tests Are The Map Of The Boundary

The authorization contract is covered at several levels:

- pgTAP inventories service-managed, service-only, and owner-scoped tables;
- role tests inspect grants, column privileges, policy targets, sequence access,
  function execution, owner-table RLS, and invoker/definer behavior;
- fixture tests switch between anonymous users, two signed-in owners, and the
  service role to prove both allowed work and cross-owner denial;
- Storage tests perform real forbidden writes rather than trusting policy names;
- action tests prove every admin export checks authorization before creating a
  privileged client;
- script tests reject missing or blank service-role configuration, while the
  database suite proves browser-role writes remain denied; and
- component tests preserve the honest Market Internals unavailable state and
  keep it out of navigation.

There is a useful mindset underneath all of these checks: security tests should
describe capabilities, not implementation trivia. “A policy named *private*
exists” is weak evidence. “User A cannot read User B's record, anon cannot write
this table, and only the server can execute this RPC” is a contract.

The release process later supplied that separate proof. Merge commit `cc36eab`
was promoted as Vercel production deployment
`dpl_7Xp2amJdaRFr2p6166J7oaYNdd5j`. Supabase recorded the authorization change
as migration 90, `20260806143000`, and the second linked push dry run found
nothing left to apply. The canonical site served the honest Market Internals
state, returned `404` for the retired schema route, and kept the newsletter
health monitor green.

Then the verification acted like an untrusted browser instead of trusting the
deployment receipts. A deliberate public company read returned `200`; attempts
to read query history or raw filing chunks, forge query telemetry, or execute a
privileged ingestion RPC were denied. A correctly shaped PNG upload to the
newsletter chart bucket reached the Storage authorization boundary and was
rejected with `AccessDenied`. The production schema dump independently showed
the intended grants, RLS policies, and function revocations, while the release
window contained no Vercel runtime errors. These observations prove that the
new boundary is live. They do not prove or imply that someone abused the old
one; finding an overbroad capability and finding evidence of exploitation are
different investigations.

**The lesson:** trustworthy engineering is rarely one clever lock. It is a
boring agreement between grants, policies, functions, credentials, routes, and
tests—and the discipline to remove a beautiful chart when its numbers are not
real.

---

## August 6, 2026: The UI Audit Followed The User's Eyes

After the data, newsletter, and authorization work, the next question sounded
simple: **what should we build next?** The useful answer did not come from a
feature brainstorm. It came from opening the product as a customer would.

We walked every primary destination in the navigation—thirteen routes in
all—at both a desktop width and a narrow phone width. We checked hierarchy,
overflow, loading and failure states, keyboard behavior, focus return, control
size, and whether each label described what the software really did. This was
not a screenshot beauty contest. A financial interface can look polished while
showing the wrong baseline, hiding a failed request behind zeroes, or offering
a destructive-looking button that performs a different operation.

The broad finding was that the product did not need another top-level tab. It
needed a clearer map and a stronger primary cockpit.

### The Navigation Was An Address Book, Not A Map

The old header exposed too many destinations as peers. A market dashboard,
company fundamentals, newsletter operations, and an experimental view all
competed for the same strip of space. On a phone, that inventory became a
horizontal puzzle.

The new desktop navigation groups work by intent:

- **Pulse** remains one direct, high-priority destination;
- **Briefings** contains the time-based market reports;
- **Markets** contains broad-market research surfaces;
- **Company** keeps price, fundamentals, financials, and news together while
  preserving the active ticker; and
- **Newsletter** contains the publishing surfaces an editor expects.

On mobile, those groups become a real **Browse** panel rather than a compressed
copy of the desktop row. The panel names the current context, uses touch-sized
controls, and scrolls without pushing the page wider than the viewport.
Newsletter Operations moved into the signed-in user menu because an operator
console is not a public product destination.

The interaction contract matters as much as the grouping. Menus expose their
expanded state, close on outside interaction or Escape, and return focus to the
control that opened them. The timezone and account menus follow the same
rules. There is only one utilities island, avoiding duplicate authentication
subscriptions masquerading as responsive markup.

Think of navigation like signs in an airport. A wall containing every possible
gate number is technically complete and practically useless. Good wayfinding
first tells you whether you need Departures, Arrivals, or Baggage; only then
does it show the exact gate.

### Pulse Today Became A Cockpit Instead Of A Chart Wall

Pulse Today needed the most work. The page had several technically interesting
charts, tiny controls, an always-floating detail panel, and replay behavior
whose defaults could tell a subtly false story. The result felt like four
prototypes sharing a page rather than one place for understanding the session.

The revised surface gives the selected mover one clear hierarchy. Live mode
has an honest status—live, delayed, closing snapshot, snapshot, or connecting—
instead of implying that any successful render is real time. Failed refreshes
can keep the last good candles visible, but the page says they are stale and
offers a real retry. Missing price or change data renders as missing, not as a
confident `$0.00` or `+0.00%`.

The live-detail chart is now stacked and full-width on a phone, where dragging
a floating window is a poor interaction. On larger screens it can still behave
like picture-in-picture, with pointer-safe dragging, predictable docking,
larger controls, and a clear way to hide and restore it. The former four-chart
replay wall became two named views: **Session context** and **Adaptive tape**.
That is enough comparison to be useful without making the reader decide which
of four nearly related pictures deserves attention.

Canvas charts now redraw when their container changes size, expose a useful
accessible name, and distinguish loading, empty, stale, and error states. The
line, timeframe, speed, and display controls use stable labels and pressed
states that make sense to keyboards and assistive technology. Motion-heavy
flashes, level pulses, and chart morphing honor the user's reduced-motion
preference.

### Historical Replay Must Use Historical Truth

Replay uncovered the most important correctness bug in the visual audit. A
historical session was calculating its move from a *current* quote's previous
close. The arithmetic was valid and the baseline was from the wrong day. That
is more dangerous than an obvious exception because the result looks
professional.

The replay endpoint now loads daily history beside the second candles and
selects the last real close before the replay date. If that history is absent,
the baseline remains absent; a live quote is never smuggled into the past as a
fallback. Replay defaults to the latest completed trading session and the
currently selected mover instead of a hard-coded company.

Session boundaries are treated as market rules, not decorative timestamps.
The fetch window is half-open, so the first `16:00:00` after-hours aggregate
cannot sneak into a regular-session replay and make the canvas discard the
entire cash day. NYSE early-close dates end at 1:00 PM, and the canvas shortens
its cash and after-hours scales to the same calendar. One boundary candle used
to be capable of changing the meaning of thousands of correct candles; this is
why boundary tests deserve disproportionate respect.

Provider capability is explicit too. Massive supports second-level candles;
the FMP implementation does not. The old generic call could fall through to a
daily endpoint and return an empty-looking replay. The route now fails with a
clear capability error when its Massive credential is absent. When that key is
available, replay uses Massive directly without forcing the dashboard and
other market-data surfaces away from their configured FMP provider. A feature
being unavailable is honest. A feature quietly asking the wrong endpoint is
not.

Caching and retry follow the data's clock:

- a current-session replay has a short cache lifetime because provider candles
  may still fill in;
- a non-empty completed historical window can be cached indefinitely in the
  warm process;
- an empty response is never fossilized as permanent history; and
- Retry carries a request nonce so the client starts a fresh request. Incomplete
  responses are never cached, while complete responses remain cacheable so a
  public query parameter cannot force repeated paid-provider calls.

The player now reaches 100x without scheduling one React render for every
single candle. A bounded timer measures elapsed time, accumulates the amount of
market time that should have passed, and reveals several candles in one update
when necessary. At ordinary speeds it remains smooth; at high speed it batches
work instead of turning the browser into a metronome with ten thousand tiny
jobs. The chart views share one memoized 10-second/1-minute aggregation index,
so revealing the final candle in a 23,400-candle session does not rescan the
other 23,399 timestamps.

That clock follows timestamps rather than array positions. Real second-level
feeds are sparse: forty-five quiet seconds may contain no aggregate at all, so
“advance sixty array items” does not mean “advance one minute.” Progress,
scrubbing, skipping, early quiet time, and trailing quiet time now use the exact
requested session bounds. A candle's completed OHLC becomes visible only after
its bucket has ended, avoiding the tiny but consequential look-ahead leak of
showing a second's high, low, and close at the start of that second.

Resources also follow the active mode. Entering replay removes the live symbol
subscriptions instead of keeping hidden SSE and websocket work alive. Pausing,
resetting, changing sessions, and unmounting clear playback timers; superseded
evidence requests are aborted. Good client performance often comes from
stopping work that no longer has a reader, not merely making every loop faster.

### Responsive Does Not Mean Squeezing A Table

The Insiders page showed why phone design sometimes needs a different
representation. A wide transaction table is excellent on a desktop because
rows and columns support rapid comparison. Shrinking those columns until every
value becomes an abbreviation is not responsiveness; it is concealment.

Insider transactions now remain a semantic table on desktop and become
two-column cards on mobile. The cards retain the full transaction labels,
important amounts, dates, and people without horizontal overflow. The four
filters form a keyboard-operable two-by-two tab grid on narrow screens, with
explicit loading, retry, error, and live announcements. Request races are
guarded so an older response cannot replace the result of a newer tab choice.
Sorting happens before pagination, because sorting fifty-row slices is not the
same thing as ranking the result set.

Financial statements keep the table because year-over-year comparison is the
job, but the table now owns its horizontal scroll instead of widening the whole
page. Income Statement, Balance Sheet, and Cash Flow are real tabs with
Arrow-key, Home, and End navigation, associated tab panels, captions, and
proper row and column headers. The available year columns come from all three
statement sources rather than whichever dataset happened to be inspected
first. Mobile controls wrap cleanly while the financial grid remains
deliberately scrollable.

The sticky stock-price header received a smaller but important repair. Its top
offset now accounts for the two-row responsive navigation, so the company and
price context remains visible *below* the header instead of disappearing
behind it. Sticky elements are a little like people standing in a doorway:
each can be correctly positioned alone and still block the others when they
share the room.

### A Red Button Is A Promise

The Profile page had a trust defect hiding in plain sight. It offered a red
**Delete Account** action, but the implementation only signed the user out.
That mismatch is unacceptable in either direction: a fake delete misleads the
person who expects erasure, while a mislabeled real delete would be dangerous.

The page now calls the operation what it is: **Sign out**. It explains that the
account and saved data remain, reports authentication failures, and redirects
only after Supabase confirms success. If true account deletion becomes a
product requirement, it needs its own server-owned workflow, reauthentication,
scope explanation, confirmation, deletion or retention policy, and receipt.
Changing the button copy is not a substitute for that system.

One final release lesson came from the tooling itself. The standalone lint
script used to write a file at `.next/cache/eslint`, while `next build` expects
that same path to be a directory. Running lint and then build made Next skip
its internal lint phase with an `EEXIST` warning. Pointing the standalone cache
at `.next/cache/eslint/.cache` lets both commands share the parent safely. A
green command is useful evidence; a green command that quietly skipped one of
its own checks is not.

### What Strong Engineers Do During A UI Pass

The memorable lesson is that UI quality is not the last coat of paint. It is a
cross-section of the whole system.

Strong engineers follow the interaction until it reaches truth:

- When a chart says “replay,” they ask which day's close defines the change.
- When a Retry button exists, they prove it can escape the cache that served
  the failure.
- When a speed control says 100x, they inspect how much rendering work that
  promise creates.
- When desktop markup is hidden on mobile, they ask whether its subscriptions
  and listeners are hidden too.
- When a table overflows, they decide whether comparison requires scrolling or
  whether the information needs a different mobile form.
- When a destructive label appears, they trace the action all the way to the
  database instead of trusting the color red.
- When a menu works with a mouse, they still test Escape, arrows, focus return,
  touch width, and reduced motion.

The audit and remediation are complete, but that is deliberately not a claim
that every interface is now perfect forever. The newsletter archive and editor
scalability pass is implemented and verified locally, but still awaits its
coordinated database and application release. FMP still cannot supply true
second-level replay, a real account-deletion workflow does not yet exist, and
email placement still depends on reputation evidence outside this UI. Honest
roadmaps preserve those edges. “Done” should mean the named contract was
verified—not that the product has run out of things worth improving.

---

## August 7, 2026: The Newsletter Archive Got A Card Catalog

The first newsletter archive behaved well when it held a handful of issues. It
asked for every saved draft, including the full nested JSON document, and then
painted one card for every result. That is the digital equivalent of asking a
librarian to wheel every book in the building to the front desk before telling
you which twenty-five match “AAPL.” It works beautifully during the tour and
poorly after the library becomes useful.

The scaling pass changes the archive into a real catalog. It also tightens the
editor, chart, database, and Beehiiv boundaries around it. That wider scope is
important: a fast list is not much of an improvement if opening an old issue
silently changes its chart, a stale tab overwrites a publication update, or a
retry archives half of a selection twice.

The path now looks like this:

```text
archive controls in the URL
  -> paged summary API
  -> indexed newsletter_drafts columns
  -> 25 lightweight cards + facet counts

selected cards + their updated_at versions
  -> server-only bulk RPC
  -> one transaction + one event receipt per issue
  -> reversible archive state

editor document + expected updated_at
  -> conflict-aware save/publication boundary
  -> exact chart scene and immutable image provenance
  -> Beehiiv lifecycle display
```

### An Archive Should Carry Index Cards, Not Every Book

The database still keeps `draft_json` because the editor needs the whole
issue. The archive does not. The new migration gives each draft a compact set
of catalog fields: format, featured and searchable ticker symbols, generation
time, block count, attached-chart count, and archive time. Saving a draft keeps
those columns synchronized with the document. The archive API can therefore
return subjects, statuses, tickers, dates, counts, and links without shipping
the prose, chart state, source evidence, and every other nested field for all
issues.

The synchronization is enforced twice for a reason. Application writes send
the compact fields explicitly, which keeps the intent visible in TypeScript.
A database trigger then derives them again from `draft_json`, making the
document authoritative and keeping an older application instance safe during
a rolling release. An old writer can omit every new column; the trigger fills
them before the new `NOT NULL` checks run. A caller also cannot forge a ticker
index or block count that disagrees with the saved issue. This is the database
version of a belt and suspenders: either one helps, but together they protect
the awkward moment when two application versions overlap.

This is denormalization with a job, not duplication for its own sake. The JSON
is the book; the columns are the title card. A good engineer asks two questions
before duplicating data:

1. Which read becomes materially cheaper?
2. Which write boundary guarantees that the copy cannot drift silently?

Here, the answer is a summary-only archive query plus one normalization path
for draft writes. Other callers that need only identity or workflow status use
bounded summary lookups in chunks of 100 keys, rather than falling back to the
old “load the library” helper.

Each archive page contains 25 issues. The server asks for one extra row so it
can answer “is there another page?” without running a second data query. The
continuation token contains the last row's `(generated_at, id)` pair, and both
fields are ordered descending. The timestamp expresses editorial chronology;
the ID breaks a tie when two drafts share that timestamp.

PostgreSQL timestamps can carry microseconds while JavaScript `Date` preserves
only milliseconds. An early cursor decoder helpfully round-tripped the token
through `Date`, turning `.123456` into `.123000` and creating a tiny interval
of rows that the next page would skip. The decoder now accepts only a strict,
injection-safe UTC timestamp shape and preserves its original precision. The
archive also labels and displays issue dates in UTC, matching the server's UTC
date-filter boundaries. A date picker and a card should never disagree about
which calendar day an issue belongs to.

That tie-breaker is not trivia. An offset such as “skip the first 25” becomes
unstable when a new issue arrives between requests: rows can shift, causing a
duplicate or a gap. A cursor says “continue strictly after this exact point in
the ordering.” It remains meaningful while the front of the archive changes.
The matching composite indexes let PostgreSQL follow the same route the API
describes. Separate owner and owner-plus-status keyset indexes cover Active,
Archived, and All visibility, while partial session indexes give anonymous
draft archives the same path without scanning every other ownerless session.
Subject and ticker trigram indexes cover both arms of substring search.
EXPLAIN regressions prove those paths can emit the required ordering without
returning to a growing sort.

Search, status, ticker, date range, and active/archived visibility live in the
URL. That makes a filtered archive reloadable, bookmarkable, and compatible
with the browser's Back button. Search waits 350 milliseconds so typing a word
does not fire a request for every keystroke. A newer request aborts the older
one, which prevents a slow response for “AA” from replacing a later result for
“AAPL.” Status and archive facet counts come from the same filter contract, so
the controls explain what is available instead of guessing from the current
page.

The UI has distinct first-load, load-more, empty-filter, archived-view, and
failure states. Cards use the browser's `content-visibility` optimization so
loaded rows outside the viewport do not demand full layout work. This is a
useful performance pattern: first reduce the bytes and row count at the server,
then help the browser with the remaining work. CSS alone cannot rescue an
unbounded database response.

### Archive Is A Shelf; Delete Is A Shredder

The archive deliberately does not offer bulk deletion. Archiving sets
`archived_at`; restoring clears it. The issue, its publication evidence, its
chart provenance, and its event history remain intact. The confirmation dialog
calls the operation recoverable because language should describe the actual
side effect, especially around valuable editorial work.

Owner RLS still permits authenticated users to read their archive, but browser
roles no longer receive direct insert, update, or delete privileges on drafts,
chart evidence, or draft events. Those mutations already flow through server
routes using the service role. Closing the unused browser path matters: an RLS
policy can answer “whose row is this?” while still allowing its owner to bypass
CAS, hard-delete a published issue, rewrite provenance, or forge a receipt.
Authorization needs both row ownership and a precise command boundary.

Bulk actions stop at 100 selected issues. That limit is enforced both in the
interface and in the database function. It bounds row locks, event writes, and
the size of a single mistake. When more than 100 loaded cards are present, the
interface selects the first 100 and tells the operator to finish that batch
before taking the next one.

Every selected item travels with the `updated_at` value the operator saw. The
RPC locks the requested rows in deterministic ID order and accepts the set only
if every row still belongs to that owner and every version still matches. One
stale item aborts the whole transaction. This is compare-and-swap, or CAS: “do
this only if reality is still the version I inspected.” It prevents an archive
click from erasing the significance of an edit or lifecycle update that landed
a moment later.

Retries needed another layer. The client creates an idempotency key for the
logical bulk operation, and the database writes one deduplicated archive or
restore event per draft. Repeating the exact request returns the current rows
with `changed = false` instead of producing another mutation or another set of
events. An advisory transaction lock serializes two simultaneous retries with
the same owner, action, and key. If the database finds only some of the
expected receipts, it fails closed; a partial receipt is evidence of an
inconsistent history, not permission to guess.

The first versions of this RPC exposed three wonderfully instructive race
bugs:

- checking versions before taking row locks left a window where another
  transaction could update a draft between the check and the mutation;
- reading retry receipts without serializing the idempotency key let a second
  request observe the first request halfway through its work; and
- returning a row snapshot captured before the update could perform the right
  mutation while handing the caller an old `updated_at` token.

The fixes were structural: lock before accepting the CAS set, take an advisory
lock before inspecting receipts, and return the values from the update result
instead of trusting an earlier snapshot. PostgreSQL revealed one more time
trap: `now()` is fixed at transaction start. Two changes within one transaction
could therefore keep the same optimistic-concurrency token. The draft trigger
now uses `clock_timestamp()` and guarantees at least one microsecond beyond the
previous value.

The broader lesson is that transactions are necessary but not magical. You
still have to decide what is locked, in what order, which observation the
caller receives, and how a retry recognizes completed work.

The migration itself briefly became an accidental writer. Its summary and
provenance backfills were ordinary `UPDATE` statements, so the older generic
`updated_at` triggers treated every historical row as freshly edited. That
would have invalidated every open editor token, made healthy Beehiiv receipts
look stale, and flattened chart-library recency to deployment time. The final
migration disables only the two known timestamp triggers around their own
backfills, immediately restores them, and tests both the preserved historical
values and the re-enabled trigger state. Broadly disabling triggers would have
hidden too much; naming the exact mechanism makes the exception reviewable.

### A Browser Tab Is A Forking Timeline

The editor now tells the operator whether the document is **Saved**,
**Unsaved**, **Saving**, in **Conflict**, or **Published**. Those labels are not
decoration; each corresponds to a different legal set of actions.

A save captures both the document and the edit sequence that existed when the
request began. If someone keeps typing while a slow save is in flight, the
returning response advances the known server baseline but does not declare the
newer local text saved. This fixes a classic race where “Save” appears to eat
the edits made just after the click.

The editor checks freshness when the window regains focus, when a hidden tab
becomes visible, and every 60 seconds. The response itself carries an implicit
version guard: if a save or newer baseline superseded the version that started
the check, the late freshness response is ignored. Otherwise a clean editor
can refresh automatically, while a dirty editor preserves its work and shows a
conflict.

Server updates and publication recording both require the exact
`expectedUpdatedAt` version. Editor save and regeneration mismatches return a
structured `409` with the latest durable record; publication mismatches reject
the change and leave freshness checking to retrieve that record. The operator
can then reload it or fork the preserved local document into a new draft.
Forking intentionally clears
server-owned publication metadata and produces editable draft status, while
keeping the local prose, layout, and exact chart provenance. It is the software
equivalent of photocopying your annotated page instead of scribbling over the
edition already on the newsstand.

The same snapshot rule now covers the less obvious long requests. Recording a
publication, regenerating a whole issue, saving a chart capture, and creating a
conflict fork can all finish after more typing or after another tab publishes.
Each path compares the edit sequence it started with. A late response may
advance the known server version, but it cannot erase newer text, trap it
behind a newly read-only published record, or navigate to a fork that omitted
the last keystrokes. Those outcomes become an explicit conflict with the local
snapshot still available to fork. Concurrency bugs often hide in the “side
buttons,” not only the main Save button.

A returning published record is especially important. If a save began while
the issue was editable but publication won before it returned, newer local
typing cannot merely remain marked “unsaved”: the published state removes the
ordinary Save button. The editor therefore enters the same explicit conflict
and fork workflow, preserving the local document instead of trapping it behind
a read-only edition.

The chart drawer is a true modal boundary. It owns keyboard focus, traps Tab
navigation, restores focus when it closes, and makes the editor beneath it
inert. Its save keeps the opening database version for CAS, freezes iframe
input while capture is pending, and advances its acknowledged edit sequence
after each accepted save so a second save in the same session is not mistaken
for a conflict. The parent still checks defensively: if local edits somehow
advance while chart capture is running, it preserves that prose, merges only
the server-trusted chart evidence into the forkable document, and surfaces the
new server record as a conflict.

The chart-library picker follows the same modal contract. This matters most
while inserting a saved chart performs a full-document save: keyboard focus
cannot wander into the editor underneath, and the Close action stays locked
while the request owns that snapshot. The sequence check remains as a second
line of defense. If newer local copy somehow exists when the response arrives,
the recoverable document combines that copy with only the server-trusted chart
image, labels, export URL, scene, provenance, and caption. A fork therefore
contains both pieces of work instead of forcing the operator to choose which
one to lose.

There is a subtle mirror image of that rule: an edit-sequence difference does
not always mean competing user input. A focus refresh can adopt the exact
version that a slower publication or chart-library callback is about to
return. When the `updatedAt` token is identical and the editor is still clean,
the callback is an idempotent acknowledgement, not a conflict. Version tokens
tell us whether reality differs; sequence counters tell us whether local work
happened. Reliable clients consult both.

Unsaved work also activates navigation and `beforeunload` guards. Once an issue
is published, the rich-text editor and the rest of the document become truly
read-only. The published view uses the editor's read-only rendering mode
instead of injecting raw saved HTML into a mutable surface. “Published” is now
an enforced state boundary, not merely a green badge.

### A Chart Needs Both A Photograph And A Recipe

Email needs a static image, while an editor needs enough state to reopen the
interactive chart. Saving only the PNG is like keeping a cake without the
recipe. Saving only loose chart parameters is like keeping a recipe that says
“bake until it looks right” while the oven changes every week.

Each chart now carries a provenance envelope containing:

- the immutable image URL and, when available, its SHA-256 identity;
- the interactive URL;
- the fully materialized chart scene;
- a canonical hash of that scene;
- the capture timestamp and renderer contract; and
- the chart-library source identity when one exists.

“Materialized” is the important word. Price-chart ranges and fundamentals
editor state are resolved at capture time, using one fixed timestamp, rather
than recomputed later from mutable defaults such as “last month.” Canonical JSON
sorts object keys before hashing, so semantically identical scenes receive the
same digest regardless of insertion order. Renaming a library entry changes
its label, not the captured scene it represents.

Readiness now fails closed when provenance is missing, marked legacy, uses an
old renderer contract, contains an incomplete scene, disagrees with the image
or interactive URL, or fails the scene/image digest checks. The remedy is an
explicit recapture. That may feel strict, but financial publishing should not
quietly substitute “a plausible chart” for “the chart readers actually saw.”

Provenance is server-owned evidence, not a client assertion. A browser may ask
to use a chart-library item, but the server reloads that scoped row and checks
its stored scene hash, image identity, capture time, and renderer contract.
Changing a scene while submitting a freshly computed client hash does not make
the old image truthful; it becomes legacy and needs regeneration. The same
rule applies to historical library rows, which remain readable but cannot be
laundered into current evidence by normalizing them again.

Automation also measures chart freshness from immutable `capturedAt`, never
the library row's mutable `updatedAt`. Renaming a two-month-old price chart
today makes its label current, not its pixels. Legacy rows without a valid UTC
capture timestamp fail closed and are recaptured; PostgreSQL's microsecond
`+00:00` timestamp form is accepted without pretending the rename clock is
evidence.

Capture time alone is not sufficient evidence. A same-day row written by an
older application can still carry a legacy renderer contract or a scene hash
that does not match its stored chart. Daily automation now applies the same
provenance verifier as the editor before reusing a library chart. When it
repairs a draft, it copies the complete trusted provenance envelope—not just
the new image URL and chart spec—so save normalization cannot immediately
quarantine the repaired block again.

Retries also separate **attempt identity** from **draft identity**. A new
`startedAt` value is useful for fencing the current worker, but it must not
make an editor's existing draft disappear. Daily retries reuse the item's
scoped `draftId` after proving it belongs to the same run, item, and ticker;
ordinary chart repair keeps the edited prose in that document. A source-entity
quarantine is different: potentially invalid copy is left recoverable and a
replacement is created instead of silently overwriting it.

Catalyst repair learned a related lesson. Arrays are presentation order, not
identity. Reordered blocks reconcile by stable library ID, then by a uniquely
matched semantic role; ambiguous blocks stay quarantined rather than having
commentary paired with the wrong chart by index. A new chart identity refreshes
its automatic alt text and caption while preserving demonstrably customized
headings. Whenever daily or catalyst automation changes the chart evidence
behind a Ready issue, the status returns to Review. Approval belongs to the
exact photograph-and-recipe pair the editor saw, not merely to the surrounding
paragraphs.

External assets can still be slow or unavailable. The embedded chart editor
waits up to 12 seconds for its READY handshake, then presents a timeout with a
retry and a direct-open route. An iframe load failure reaches the same honest
state immediately. Chart-library thumbnails show loading, failure, retry, and
an exact-chart link, so a broken preview does not make the underlying artifact
unreachable. Timers and pending state requests are cleaned up when the drawer
closes, which prevents a departed component from waking later and changing the
next editor session.

Filesystem paths need the same distrust as provenance. An early capture path
used a client symbol and template ID inside a filename, then called `resolve`.
`resolve` normalizes a path; it does not sandbox it, so an absolute component
or enough `..` segments could escape the writable capture directory. Capture
symbols now pass a strict market-symbol grammar, filenames use server-created
entropy instead of client template IDs, and a second containment check proves
the resolved PNG remains beneath the intended directory before the renderer
runs. Validation plus containment is deliberate defense in depth: the first
rule explains acceptable input, while the second protects the side effect if
the filename recipe changes later.

### Beehiiv Is Remote State, Not A Button Label

Beehiiv owns the remote publication lifecycle. The editor now displays that
truth as draft, scheduled, published, archived, or explicitly unknown, with
the relevant dates, last reconciliation time, freshness description, provider
link, and reconciliation error. A manual refresh asks the same lifecycle
boundary for current state rather than inventing a separate shortcut.

Scheduled, published, and archived issues have synchronization locked. That
keeps a convenient “sync” button from mutating a remote object after the point
where its audience-facing state demands more deliberate handling. Publication
recording also passes the draft version it observed, so a lifecycle update
cannot silently overwrite a concurrent editor save—and an editor cannot erase
the lifecycle update with stale JSON.

A completion timestamp is not proof of which content Beehiiv received. The
user can save version two while a slow request is still sending version one;
if the receipt merely says “finished after version two,” the interface can
mistake stale remote content for a successful sync. Operations and delivery
receipts therefore carry the exact `newsletter_drafts.updated_at` value used
to build the payload. PostgreSQL compares that value at full timestamp
precision before and after the remote call. If the draft changes in between,
the remote receipt remains durable for recovery but is reported as needing
sync instead of laundering old content into a green badge.

Legacy receipts have no such proof, so they fail closed and require one safe
resync. If the newer draft produces byte-identical Beehiiv content, the system
can attach the newer source version without writing the same post again. A v2
claim RPC adds this evidence while retaining the v1 signature for an older app
during rollout, and compatibility triggers clear stale evidence if an old
writer changes content. This is the integration equivalent of putting a serial
number on a shipping manifest: “the truck left at 4:00” matters far less than
knowing exactly which crate was on it.

A network timeout after the remote-call boundary means **unknown**, not
**failed**. Beehiiv may still apply that request after our process gives up.
The operation therefore becomes ambiguity-fenced: even a successful retry of
the same bytes cannot prove the original request has finished, so later,
different content stays blocked until the indeterminate update is resolved
with provider-side evidence. This is intentionally conservative. A green
receipt beside content that might still be overwritten is worse than a clear
manual-recovery stop.

Leases protect work only when every side effect checks them. A stale worker
once could wake after its lease expired, write an old delivery receipt, and
discover only afterward that completing its operation was no longer allowed.
Receipt persistence and operation completion now happen in one database RPC
that locks the draft and owned `remote_recorded` operation before touching the
delivery row. The same lock order coordinates manual publication: both legacy
and source-aware sync claims first lock a still-ready draft, while publication
locks the draft and rejects any claimed, remote-running, recorded, or
ambiguous operation. Whichever boundary arrives second must observe the first;
there is no missing-row gap in which both can believe they won.

This is a recurring integration rule: display the remote system's state,
record when you learned it, separate “unknown” from “not connected,” and make
terminal or externally visible states narrow the set of allowed commands.

### Tests Should Rehearse Growth And Bad Timing

The archive regression fixture contains 257 issues and walks every cursor to
prove that all IDs appear exactly once. Another loads 105 cards and proves the
selection stops at 100. Tests cover URL filters, facets, empty states,
load-more failure, retrying with the same idempotency key, refreshing after a
stale bulk conflict, edits during a slow save, a late freshness response,
structured conflict and fork behavior, published read-only rendering, chart
READY timeout, thumbnail failure, and Beehiiv lifecycle locks.

The database suite is equally important because a component test cannot prove
row locks or function privileges. A clean local Supabase replay runs 35 focused
archive assertions and 36 focused Beehiiv source-version assertions inside the
full 191-assertion database suite. It checks
owner scope, all-or-nothing CAS, duplicate input rejection, exact idempotent
replay, partial-receipt failure, receipt collisions, restore behavior,
monotonic versions, old-writer compatibility, authoritative summary triggers,
server-only mutation privileges, and query-plan index coverage. It also proves
that legacy Beehiiv evidence fails closed, v2 claims preserve the exact source
version, and browser roles cannot call the version-check boundary. Database
lint passes at error level, the replayed schema has no unexplained diff, and a manual
two-session drill shows the first request changing the row while its concurrent
retry returns unchanged with one event receipt.

The final application suite runs 159 files and 882 tests. TypeScript passes,
every changed JavaScript/TypeScript file passes ESLint with zero warnings, and
the repository-wide lint exits with zero errors (its 196 warnings predate this
package). The production build compiles the editor and API graph, generates all
47 static pages, and keeps the only output noise to the repository's existing
lint and Browserslist notices.

One application-suite failure delivered a final lesson. Older “ready” draft
fixtures had charts but no provenance, so the new readiness rule correctly
rejected them. The right response was not to weaken production safety to keep
the fixtures green. The fixtures were upgraded to create the same materialized
scene and provenance that real generation now creates. Tests should model the
contract; the contract should not be bent around yesterday's test shortcut.

The production build and browser pass each found something unit tests had not.
The first provenance implementation used Node's `crypto` module, but the
client-side workflow bar imports the same readiness check. Webpack correctly
refused to smuggle a Node-only module into the browser. The fix was a small
isomorphic SHA-256 implementation, proven against empty, ASCII, Unicode, and
multi-block standard vectors, so server publication and browser readiness use
the same synchronous digest without weakening the check or adding a bulky
polyfill.

Then the real **Start blank** button returned 500 when
`NEWSLETTER_PUBLIC_CHARTING_URL` was absent. A helper promising a *public*
chart URL had quietly fallen back to `http://localhost:3001`; the email safety
layer was right to reject it. Rendering and publishing are now separate lanes:
local chart rendering still uses localhost, while stored and email-facing
links default to `https://charts.theintraday.com`. The browser retest created,
edited, saved, searched, archived, and restored a real local draft at desktop
and mobile widths, verified the chart-library modal focus trap, reported no
console warnings or errors, and removed that test artifact. A green component suite
cannot replace following the actual button all the way through its route,
storage boundary, and rendered result.

### Release Truth Before Promotion: Local Is Not Production

At this checkpoint, the code and migrations were implemented and locally
verified but had not yet been applied to the linked Supabase project or
deployed. That distinction mattered because the new archive query expected the
new summary columns and the bulk endpoint expected the new RPC. Shipping only
one half would have turned a coherent local feature into a live incompatibility.

The safe release has a deliberate order: inspect the linked migration dry run;
apply `20260807090000_scale_newsletter_archive.sql` and then
`20260807100000_track_beehiiv_sync_source_version.sql`; verify the ledger,
schema, privileges, archive RPC, and Beehiiv v2 RPCs; promote the matching
application build; then exercise desktop and mobile search, paging,
archive/restore, conflict/fork, exact chart reopening, broken asset recovery,
and Beehiiv lifecycle locks against real saved issues.

Migration-first is not a stylistic preference. The new application selects and
writes columns that do not exist beforehand, while the migration's compatibility
triggers intentionally keep the old application working until promotion
finishes. “Ship together” is too vague for an operator; “migration, verify,
application, smoke test” is a sequence they can execute and recover from.

That last paragraph is not ceremonial caution. Good engineers keep three
claims separate: **implemented**, **verified in a controlled environment**, and
**observed working in production**. At that checkpoint the scaling pass had
earned the first two. The August 9 production record below documents how it
earned the third.

## August 8, 2026: The Workstation Learned To Keep Its Own Memory

The previous package made one newsletter issue safe to edit, archive, and
deliver. The next audit asked a broader question: **what happens when the
workstation itself has a long memory?**

That question exposed a family of problems that looked unrelated at first.
The Why Moved queue remembered only what happened to be in the latest mover
response. The live dashboard polled a broad snapshot even though it displayed
two fields. Newsletter Operations reread delivery history every 15 seconds.
The chart library returned every full chart recipe at once. A public chart
image could make many serverless isolates render the same expensive PNG. The
real-time broker could accumulate listeners whose browsers had already left.

They were all versions of the same architectural smell: **a temporary view was
being asked to serve as durable state, and an unbounded collection was being
treated like a small array.**

### The Editorial Inbox Is A Ledger, Not A Reflection

The old Why Moved admin page rebuilt its queue from today's current top movers.
Imagine running a newsroom where the assignment board is actually a mirror
pointed at the stock ticker. As soon as a symbol falls off the screen, its
unfinished assignment vanishes too. An editor could not reliably return to
yesterday's pending catalyst, because “pending” was not a stored fact.

The new editorial inbox persists discovery. Morning automation takes the top
ranked positive and negative movers, captures the candidate quote and the
catalyst evidence it saw at that moment, and ingests that pair under a stable
review key. `first_seen_at` records when the assignment entered the room;
`last_seen_at` records rediscovery without rewriting the original evidence.
Missing catalyst evidence is stored honestly as missing rather than silently
replaced with whatever a later request happens to find.

That immutability is important in financial editorial work. A current preview
can help an editor understand what changed, but it must not rewrite the source
material that justified an earlier approval. The UI therefore presents the
captured evidence and current context as two different things. One answers
“what did we review?” The other answers “what does the world look like now?”

The inbox is paged by a deterministic cursor and can browse the operational
backlog or historical statuses with date and session filters. Counts come from
the complete matching set, not merely the rows mounted in React. Pending and
needs-work assignments remain visible after the market tape moves on, while
recently resolved work stays available for context.

Bulk work has a deliberately narrow door. Up to 100 selected reviews can move
among pending, needs-work, and dismissed states in one all-or-nothing database
transaction. Every row carries its expected `updated_at` version, and every
request carries an idempotency key. A stale row rejects the set; an exact retry
returns the original receipts. Approval is excluded because approving evidence
is an editorial judgment, not a housekeeping shortcut.

This is how a queue becomes trustworthy: stable identity, immutable intake
evidence, explicit state, compare-and-swap edits, and retry receipts. A list of
objects happens to render similarly, but it does not offer the same promise.

### Poll The Answer, Not The Whole Warehouse

Several screens were spending work in proportion to everything the product had
ever stored, even though their visible answers were small.

The live dashboard is the clearest example. Its poll used the “fast” market
snapshot, which invoked thirteen loaders. The component consumed gainers and
losers. A purpose-built live-movers snapshot now calls exactly those two
loaders, with the same short freshness window. In the measured fixture, loader
invocations fell from 13 to 2 and the representative JSON response fell from
5,100 bytes to 394 bytes. The optimization is not a clever cache; it is the
more durable habit of asking the server for the shape the screen actually
uses.

Newsletter Operations had a similar problem with time instead of width. Every
15-second poll could walk as many as 10,000 Beehiiv deliveries and hydrate
draft JSON only to show 20 current-day rows. It now asks the indexed draft
summary for current business-date IDs, loads deliveries only for those IDs,
and computes lifetime lifecycle totals with five count-only queries. The
current-day lookup uses a 101st row as a sentinel: more than 100 issues fails
closed instead of displaying precise-looking partial totals.

“Business date” needed its own column. A retry can generate an August 7 issue
on August 8; `generated_at` tells us when the work happened, not which market
session the issue describes. `source_market_date` is now a trigger-owned,
indexed scalar derived from daily or catalyst source metadata, with an Eastern
generated-time fallback for manual and legacy drafts. Its backfill preserves
editor version tokens and does not make a no-op Beehiiv receipt look newly
reconciled.

The interactive chart library now follows the archive pattern rather than
selecting every full chart scene. A summary-only API pages by
`(updated_at, id)`, preserves PostgreSQL timestamp precision in its opaque
cursor, supports scoped symbol/title search, and keeps the legacy full-list
function intact for automation that genuinely needs complete chart specs.
The home and picker load a bounded first page, cancel stale searches, append
without duplicates, and lazy-load thumbnails. This distinction matters:
changing a shared function's return type would have made the UI faster by
quietly breaking daily and catalyst generation.

The reusable rule is simple: before optimizing a query, write down the exact
answer the caller needs. Summary callers should not pay for documents; one-day
callers should not scan history; visible counts should either be exact or say
they are truncated.

Static imports deserve the same scrutiny as SQL. Newsletter Operations only
needed a bounded read model every fifteen seconds, but its module also imported
daily automation, local workers, chart generation, Puppeteer, and TypeScript.
Next.js quite reasonably traced that whole graph into the GET server function:
1,001 files and roughly 25.7 MiB for a small dashboard poll. The read model now
lives in a side-effect-free module, while mutations use a separate authenticated
action route. The GET trace is 57 files and 1.294 MiB; the heavy graph remains
available only where it is actually needed. A compatibility POST redirect uses
307 so older callers keep their method, body, cookies, and authorization.

This is a useful serverless lesson: a function's deployable size is determined
by its import graph, not by the number of lines executed on the happy path.
Dynamic branching inside one route does not create a deployment boundary; a
physical route/module boundary does.

### One Screen Can Tell Time With Three Clocks

The broader Market Overview repair applied the same boundedness rule to time.
Fast prices, slow research, and initial global quotes do not share a capture
moment, so the browser no longer paints one `Date.now()` across all three. The
server emits typed envelopes with capture timestamps and a known list of failed
sections. Complete fast snapshots live for fifteen seconds; slow snapshots can
reuse a five-minute base while preserving the oldest contributing section's
real capture time. Degraded responses are `no-store`, and failed fields are
omitted rather than filled with convincing-looking empty arrays.

Both server caches own their work instead of borrowing the first caller's
AbortSignal. One shared fan-out has an eight-second logical deadline,
completion-based TTL, caller detachment, a hard allowance for abort-ignoring
physical work, and identity fences against late settlement. Runtime parsers
enforce exact fixed panels for stocks, indexes, and rates while allowing real
dynamic lists to be empty. The browser uses recursive post-settlement timers,
visibility and focus gates, per-kind generations, and capture-time comparisons;
an old response cannot erase data, clear a warning, or move a freshness clock
backward merely because it arrived last.

This distinction is easy to miss in dashboards: “we received a response now”
is not the same statement as “the provider captured these facts now.” Honest
software keeps both timestamps and displays the one the user actually means.

### Real-Time Connections Need Reservations Before They Need Cleanup

The Massive websocket broker multiplexes provider data for many SSE clients.
Its earlier cleanup happened after subscription setup. That left a narrow but
real race: a browser could abort before the route installed its listener, then
the asynchronous subscription would finish and leave a listener nobody could
ever remove.

The route now reserves capacity before returning the stream and treats cleanup
as an idempotent operation that can be called from abort handling, stream
cancel, or setup failure. Single- and multi-symbol routes deduplicate symbols,
forward cancellation after every awaited boundary, and return a typed 503 with
`Retry-After` when capacity is full. The broker bounds tickers, listeners per
ticker, and total listeners, then evicts idle ticker state after its grace
period. “We'll clean it up later” is not sufficient when “later” can race
“create.” Reservation and cleanup are one lifecycle.

Backfill also became capability-specific. The default FMP provider had been
asked for second-level bars even though its fallback endpoint returned daily
history. Filtering those midnight candles into a five-second window produced
an empty `200`, which looked like valid live history. The route now says 501
unless Massive second aggregates are configured, and the hooks expose that
degraded backfill state instead of treating empty history as success.

Massive aggregate pagination now follows authenticated, same-origin
`next_url` pages under a deadline, page cap, and row cap. Adjacent-page
timestamps are deduplicated and sorted. If a continuation fails or a bound is
reached, the provider throws a typed incomplete-data error instead of returning
a plausible prefix. A partial candle series is often more dangerous than a
visible failure because charts rarely announce which half of history is
missing.

### Live First, History Second

Pulse made one further lifecycle correction: live data should not wait behind
history. Each SSE connection now opens before its backfill request. Historical
candles merge underneath the stream, and the newer session candle wins a
timestamp collision. Strict browser-safe parsers require the requested symbol,
coherent finite OHLC values, bounded dates and volumes, at most 4,000 input rows,
and at most 500 retained rows. A malformed or wrong-symbol payload is ignored
without poisoning the same-symbol last-known-good state.

Backfill itself is a reserved resource. The client has an eight-second deadline;
the route owns a seven-second provider lease, same-key coalescing, a sixteen-job
physical cap, detached callers, and typed `503`/`504` responses. A timed-out
provider that ignores cancellation keeps its slot until it really settles, and
its late rows cannot overwrite a replacement generation. Massive receives the
exact epoch-millisecond window rather than an entire calendar day, which avoids
rejecting an ordinary liquid one-second session merely because the provider
returned more history than the screen requested.

The React hooks treat visibility as part of the subscription. Hiding or
unmounting closes SSE and aborts backfill; returning visible starts one fresh
session. Focus and visibility events share a monotonic 250-millisecond
suppression window so separate browser tasks cannot open duplicate streams.
Pulse Text's four-symbol day-candle fan-out is physically serialized as well:
the next timer begins only after the prior transport settles, while each symbol
retains its own last-good series. This is the core live-data rule: connect the
present promptly, merge history cautiously, and give every transport one
unambiguous owner.

### A Public Chart URL Should Point To An Asset, Not Start A Factory

Chart of the Day used to render on an anonymous GET. Process-local promise
coalescing helped one server instance, but two serverless isolates could still
call the headless renderer at the same time. Large responses were buffered
before their size was checked, and a forwarded `Host: localhost` could
influence the server-side render destination.

The route now derives its renderer origin only from trusted server
configuration, sends the renderer's shared authentication header, enforces a
caller-side deadline and streaming byte limit, checks PNG dimensions before
expensive transformation, and sanitizes upstream failures. Unknown query
parameters are rejected so cache keys cannot be multiplied with meaningless
variants.

More importantly, PostgreSQL arbitrates one render owner across isolates. A
canonical key combines the setting version, chart-spec hash, theme, and
renderer contract. The winner receives a fenced lease, renders once, uploads a
content-addressed PNG, and atomically publishes its immutable storage path.
Other callers receive bounded retry guidance. Three failed attempts in a
six-hour window trip a cooldown; the next window recovers automatically rather
than bricking the chart forever. If the ready storage object was deleted, the
exact pointer can be invalidated and repaired without allowing an arbitrary
path to erase state.

Successful requests now return a small 307 redirect to the shared immutable
asset. One hundred waiters no longer each clone an eight-megabyte body in
memory. The browser and CDN are good at serving files; a serverless function
should not impersonate a file server merely because it created the file.

### Admin Notes Needed Database Time And A Per-Row Outbox

Evaluation annotations used to rewrite one deployment-local JSON file. That is
fragile on a read-only serverless filesystem, loses work across instances, and
makes concurrent edits a whole-file last-writer-wins contest.

Annotations now live in the existing database table behind admin
authorization. Each request mutates exactly one question with the server's
`updated_at` as a compare-and-swap token. Browser time is never treated as
database freshness. Two admins can edit different questions independently; a
same-question conflict returns the durable winner while preserving the losing
text for review.

The React client needed the same rigor. One global debounce timer meant typing
in question two could cancel question one's save. Per-question timers fixed
that, but then out-of-order whole-file responses could regress another
optimistic row. The save queue now merges by question ID, protects pending and
in-flight rows, rebases a newer same-question edit onto the successful server
token, and serializes it behind the first request. A failed request retains the
exact unsaved row, attempts one bounded retry, and leaves a visible manual
Retry action rather than silently clearing “Saving.” Switching evaluation
files invalidates the old generation so an overlapping question ID cannot
receive a late response from a different artifact.

This bug family is a useful reminder: “debounced” is not the same as
“serialized,” and “optimistic” is not the same as “durable.” A robust client
needs an identity, a queue, a version token, and an explicit failure state.

### Observability Must Live Outside The Work It Watches

The dashboard-commentary cron previously returned HTTP 200 even when its own
result said `complete: false`. The scheduler could therefore report success
while the visible commentary remained incomplete. It now returns a failure
status, and a separate health route checks whether the three commentary
components are due and current. The production watchdog runs that check with
`always()`, so a newsletter-health failure cannot skip commentary monitoring.

Building the health route exposed a subtler deployment problem. It imported a
clock from the large daily-automation module, and Next.js traced 1,270 files,
including local credentials and newsletter artifacts, into a function that
needed only the New York date and time. The market clock moved into a tiny,
side-effect-free module. Output-file exclusions and a post-build trace verifier
now provide defense in depth. The refreshed health trace contains only the
small dependency graph and no forbidden local paths.

This is why production builds belong in CI. TypeScript proves types; unit tests
prove examples; neither shows what the deployment packager decided to copy.
The build trace is part of the security boundary.

### Read-Only Is An Authority Boundary, Not A Disabled Button

The Morning Report intentionally has a public, read-only view of the configured
automation run. The interface disabled editing, but the API originally returned
the operator's complete object: database and provider IDs, Beehiiv editor and
preview URLs, raw reconciliation errors, retry state, and private metadata. A
disabled button is a presentation choice; it is not a data-access policy.

The public response is now constructed field by field. It contains the copy,
scores, counts, safe source links, chart presentation, and published lifecycle
information needed to render the report. It never serializes internal IDs or
operator-only details, and Beehiiv's public web URL appears only after a
published lifecycle is confirmed. URLs must be public HTTPS destinations;
private, loopback, credential-bearing, or ambiguous hosts are discarded. The
client may create display-only keys after receipt, but those keys cannot reach
mutations or editor routes.

The subtle bug appeared one layer deeper during review. Projection initially
happened only when the route executed its configured-owner fallback. The session
cookie is intentionally unsigned, so a caller could choose the configured
session value, make the first lookup succeed, and bypass that branch. The final
rule is based on authority rather than control flow: full data requires a
matching authenticated owner. Production cookie equality never establishes
ownership. The anonymous local-development session remains editable because it
is an explicit development workflow, not a production authorization mechanism.

The same public boundary had a deployment-cost twin. Home needed one boolean—
whether today's automation had produced a report—but imported the whole command
engine to get it. Next.js traced 1,009 files and 25.81 MiB into `/`, including
TypeScript, Puppeteer, local datasets, tests, scripts, and newsletter generation.
A tiny reader now selects only `status,newsletter_generated_count`; the home
trace is 72 files and 1.997 MiB. CI fails if the root trace is missing, exceeds
150 files or 5 MiB, or regains any heavy/local path. A guard that silently skips
the artifact it was meant to inspect is no guard at all, so the verifier also
proves that it actually encountered the home trace.

Both fixes share one principle: boundaries should be explicit in the shape of
the code. A public DTO should not depend on remembering every secret field to
remove, and a read-only route should not depend on a command module merely
because the useful function happens to live there.

### Polling Is A Lease, Not A Metronome

Morning Review used to start another fetch every fifteen or sixty seconds
whether the previous one had finished or not. That looks harmless on a whiteboard:
draw a clock, draw an arrow, repeat. On a slow network it behaves more like
several reporters calling the same source at once, then pinning whichever answer
happens to arrive last. Hidden tabs kept calling, a report absent at page load
was never discovered, and notifications ran as a second independent request.

The client now owns one polling lease. It starts the next timeout only after the
current run-and-notification cycle settles, cancels work when the page becomes
hidden or unmounts, refreshes immediately on focus, and assigns a generation to
every request so an ignored abort cannot install stale data. Manual generation
and delivery actions invalidate the passive generation before applying their
result. Selection is retained only while the same run still contains the same
actionable items.

The server boundary was made equally literal. GET uses a small read-only module;
POST work lives behind a separate authenticated action route, with a 307 bridge
for old callers that must retain method, body, and cookies. The Morning Review
GET trace fell from 998 files and 26.45 MiB to 56 files and 1.27 MiB. A branch
inside one file would not have achieved that—the bundler follows imports, not
our intentions.

### Editorial Judgment Became Evidence Instead Of Ephemeral UI State

The old “recommended first” list was useful, but amnesiac. Every refresh ran the
algorithm again and forgot whether an editor accepted it, removed a weak story,
promoted a better catalyst, or added an issue the model missed. Trying to improve
ranking from that interface would have been like training a chef from plates
after the diners' notes were thrown away.

The new editorial shortlist is an append-only decision ledger. Each revision
stores the algorithm version, exact presented baseline, bounded catalog tokens,
final selected order, explicit human intents, structured reason codes, optional
notes, and immutable evidence for every baseline or selected issue. A small head
row identifies the current revision; old revisions remain readable. Individual
queue-item cleanup cannot punch holes in history, while intentional whole-run or
account erasure cascades the complete ledger rather than leaving orphaned actor
data.

One design lesson arrived early: a final array cannot reveal human intent. If an
editor drags A from first to fifth, B through E move mechanically. Calling all
five rows “overrides” would demand five reasons for one action and poison the
learning set. The UI therefore records the endpoint the editor actually moved,
and the domain verifies relative order among items that remain in both lists.
Removing A may shift B from absolute position two to one, but it does not invent
a promotion. Reordering and then restoring the original permutation cleans the
stale move intent.

The save boundary treats retries and concurrency as first-class data. A command
hash covers scope, expected revision, presented catalog, selection, and normalized
intents. The database takes a per-run advisory lock, resolves an exact idempotent
replay before consulting mutable automation state, locks the run, items, drafts,
and delivery evidence, checks the head revision, and inserts the revision,
entries, and new head atomically. A lost response can be retried after automation
has changed; the original receipt still wins. Reusing the key for different
content fails closed. If another editor advanced the head, a late replay returns
both its original receipt identity and the current head so the interface never
rolls backward.

Several bugs made the integrity rule sharper. The first client version rendered
the parent report snapshot but saved a separately fetched presentation; a poll
between those reads could make durable evidence claim the editor saw text that
was never on screen. GET, PUT, and conflict responses now carry the exact hydrated
run beside the presentation, and the editor renders that pinned snapshot. A
browser-safe canonical evidence module lets client and server compare identical
hashes without importing filesystem or service-role code into React. A complete
conflict snapshot is applied only when its run, presentation, head, and revision
agree; a partial conflict performs a fresh GET. Reset, remove/re-add, stale
candidate, evidence drift, slow-save, and uncertain-retry paths all have focused
regressions.

This ledger deliberately does **not** auto-tune ranking yet. Good learning systems
first collect trustworthy labels, examine whether the sample spans enough market
sessions, and distinguish correlation from editorial preference. A future ranking
change must use a new algorithm version so yesterday's judgment is never rewritten
as feedback on tomorrow's model.

### The Admin Page Stopped Carrying The Printing Press

The Why Moved inbox needed a few scalar draft labels and four editorial commands.
It nevertheless arrived in production carrying the entire newsletter workshop:
chart capture, Puppeteer, the TypeScript runtime, local datasets, generation
scripts, and test fixtures. Imagine asking the receptionist for one envelope and
making them wheel the printing press to the front desk. The page function traced
1,004 files and 28.64 MB before it rendered a single review row.

The repair was architectural rather than cosmetic. The page now reads draft
summaries through a Supabase-only module whose query projects exactly the scalar
fields the inbox displays. Browser commands use explicit authenticated HTTP
routes. Ordinary review saves, bounded bulk transitions, current-catalyst preview,
and market capture each have a small route boundary; only approval imports the
chart and newsletter automation engine it genuinely needs. Authentication runs
before body parsing, cookie-backed mutations reject cross-site origins, bodies are
bounded and validated, CAS conflicts remain 409s, idempotency keys survive bulk
retries, and every response is private and uncached.

The server render was flattened at the same time. After the admin gate, mover
discovery starts while search parameters resolve. The global historical facets do
not depend on current movers, so they begin as soon as filters are known. The inbox
waits only for the candidate keys it actually needs, and draft linkage begins as
soon as the loaded page supplies review keys instead of waiting for unrelated
facets. This is what useful concurrency looks like: not launching everything at
once, but drawing the dependency graph honestly and removing invented arrows.

The resulting page trace is 61 files and 1.54 MB, down 943 files and 27.10 MB
(93.9% and 94.6%). Routine command routes are roughly 1.4–1.55 MB. The deliberate
approval boundary remains 994 files because it really performs chart and draft
automation. A fail-closed build policy proves the page trace exists, caps it at
150 files and 5 MB, and rejects any return of command actions, generation code,
Puppeteer, OpenAI, TypeScript, datasets, scripts, VCS state, or local artifacts.
The lesson is the same as the Morning Review split: bundlers follow physical
imports, not comments that say a function is “read only.”

### A Five-Second Clock Cannot Refresh Sixty-Second Data

Live Dashboard used to look faster than it really was. The browser asked for a
quote every five seconds, but the quote route allowed a CDN to reuse it for
thirty seconds and FMP allowed Next.js to reuse the upstream response for sixty.
It was like checking a wall clock every five seconds while someone only moved
the hands once a minute: the polling was real, but the freshness promise was
not.

The provider interface now makes freshness explicit. Existing callers keep the
cached default; the live quote route deliberately asks for a live read and a
cancellation signal. FMP uses `cache: 'no-store'` for that request. Massive
threads the same contract through stock snapshots, indices, futures contract
resolution, and FMP fallback. A missing symbol or a genuine empty provider
response may become `404`; rate limits, network failures, malformed payloads,
and aborted work remain errors. Cancellation never quietly starts a fallback,
because replacing a canceled request with more work is the opposite of
canceling it.

Coalescing needed its own authority model. If the first browser's AbortSignal
owned a shared provider request, closing that tab would cancel the quote for
every other waiter. The route instead creates one internal four-second lease per
symbol. HTTP callers may stop waiting independently; the shared lease has its
own AbortController, deadline, 100-key pending cap, and 500-entry access-order
LRU. Success is timestamped at completion. A timed-out lease releases only its
own map entry, and a late provider response cannot delete or populate a newer
lease. The CDN receives a matching four-second freshness window; every error is
`no-store`.

The same lifecycle now governs intraday candles. Interval input is an integer
from one through thirty, completed data must name the requested symbol, the LRU
and pending maps have hard caps, and a twelve-second deadline prevents one
hundred hung upstream calls from pinning the process forever. On the client,
recursive timeouts start only after the prior request settles. Hidden tabs,
focus changes, symbol and timeframe switches, replay, streaming, and unmount all
retire the old generation. A ticker switch clears the old chart immediately, so
a failed MSFT request can never leave AAPL's price wearing an MSFT label.

Three review bugs made the phrase “validate provider data” much more concrete.
First, provider mappers filled missing numeric fields with zero, which could
turn an incomplete response into a believable `$0` quote and cache it. Second,
aliasing could relabel an upstream `NQUSD` response as `ES=F`, defeating a later
symbol check. Third, a front-month lookup for ES could cache `NQZ26` for an
hour, after which every layer agreed on the wrong contract. Live validation now
checks the raw ticker before aliasing, checks the delivery-month contract family
before resolver-cache admission, and rejects the missing-price zero sentinel.
It deliberately accepts a finite negative price: crude-oil futures have traded
below zero, and a financial system should not erase an uncomfortable real value
merely because a simplistic validator assumed prices are always positive.

The engineering lesson is broader than market data. A refresh interval is only
the outermost clock. Provider caches, CDNs, in-process caches, pending promises,
fallbacks, and UI generations all participate in the freshness contract. If
those clocks and identities disagree, “live” becomes a styling word. If they
agree—and failure is visible rather than fabricated—the interface can make a
promise a trader is entitled to trust.

### A Timeout Is Not A Delisting

Stock admission had made a dangerous category error: a registry outage could
become `false`, then a valid company looked “not found” for thirty minutes. The
resolver now returns three states—`valid`, `not_found`, and `unavailable`—and
only the first two are cacheable. Invalid grammar and an authoritative database
miss may produce a 404. Transport failure does not. During a registry outage,
the page admits a symbol only through a separately bounded overview-plus-profile
confirmation; heavy financial fan-out waits until that identity is established.
Both admission layers count physical work that ignored cancellation, so repeated
logical timeouts cannot manufacture more outstanding provider calls.

Class shares supplied the memorable edge case. The product speaks canonical
`BRK.B`, the FMP registry may store `BRK-B`, and blindly relabeling provider
output can turn somebody else's quote into Berkshire. One central alias
boundary now queries both database forms, converts to the vendor form only at
the provider edge, and verifies the raw upstream ticker before returning to the
canonical symbol. Futures are rejected before the stock registry is touched.

Search follows the same truth model. The full US registry is primary; a
nonempty S&P result during a primary outage is visibly degraded, while an empty
S&P subset cannot prove that a small-cap company does not exist. Dot/dash
queries are symmetric, malformed nonempty rows are failures, and the public
route owns a four-second, thirty-two-operation physical admission desk with
same-query coalescing. The browser preserves typed spaces, validates the whole
response, and fences late work. `/api/search-tickers` is retired in favor of
this one bounded contract.

### A Catalyst Should Leave A Trail

The daily “why it moved” generator had already been writing useful evidence to
`stock_summaries`; the stock page showed only today's sentence and left every
prior day dormant. Catalyst History turns that accumulated work into a product
without another model call. Its public reader selects at most 48 current-config
rows, validates bounded text and safe source URLs, keeps the newest valid row
per market date, and returns at most ten dates under a four-second deadline.
`ready`, `empty`, and `unavailable` are different outcomes.

The timeline sits behind Suspense after stock admission, so history cannot hold
the essential price page hostage. Empty history disappears; an outage is
nonfatal; and the current fallback banner is suppressed only when its normalized
text exactly duplicates the newest generated entry. Morning Review ticker links
land directly on `#catalyst-history`, turning an editorial card into the front
door of a durable company narrative. This is a good data-flywheel pattern: let
work the system already performs become more valuable with every run.

### Calendars Are Time-Zone Programs In Disguise

The old `/calendar` route promised a calendar but rendered only international
market sessions. It now places a real Monday-through-Sunday New York catalyst
calendar above those sessions. One server reference instant pins both earnings
and economic requests to the same week. Provider wall times are converted with
the actual EST/EDT offset; nonexistent spring-forward times are rejected,
fall-back ambiguity resolves deterministically, and event ordering is BMO,
market hours, then AMC.

Each feed owns a six-second transport deadline, a two-megabyte streamed body
ceiling, a 10,000-row raw cap, strict row validation, and a 100-item page cap.
The production FMP feed proved why bounds need evidence: one valid provider
week contained 6,392 rows, so the old 5,000-row ceiling rejected a healthy body
that still fit comfortably under the byte limit. The feed is global, and valid
irrelevant symbols such as international listings may contain characters our
local S&P contract rejects. Rows are therefore filtered to the eligible S&P
universe before strict local symbol validation; malformed eligible rows still
fail closed.

The UI discloses qualifying totals and truncation rather than presenting a full
week as if it were complete. A failed feed does not erase the healthy one or
the preserved International Sessions view; a legitimate empty response remains
authoritative. Day and event-type filters start on the first upcoming active
day, and S&P earnings link back to stock research. Dashboard callers keep their
smaller independent limits of ten earnings and twelve macro events.

### A Fork Is A Receipt, Not Just Another Insert

Forking an old newsletter looks like a simple copy operation until the network
drops after PostgreSQL commits. The browser cannot know whether it should retry
or whether retrying will create a twin. The original implementation also looked
up the source before checking for a replay, which meant a perfectly valid retry
could fail after the source was archived or deleted. It was asking yesterday's
document for permission to remember something the database had already done.

The repaired path gives every fork a stable idempotency key and a hash of the
exact requested snapshot. PostgreSQL takes an advisory lock and records the new
draft, creation event, and durable fork receipt in one transaction. An exact
retry resolves the receipt before consulting mutable source state. Reusing the
same key for different content returns a conflict, and replaying a receipt whose
created draft was later deleted fails closed instead of silently manufacturing a
replacement. The local JSON fallback mirrors the same rule with a single atomic
rename, so development does not teach a weaker mental model than production.

The HTTP edge is intentionally boring: source IDs must be UUIDs, content type
must really be JSON, the body is streamed through a one-megabyte ceiling, object
depth and collection sizes are bounded, prototype-pollution keys are rejected,
and validation errors happen before storage. “Validate input” is not one schema
call after `request.json()` has already allocated an unbounded attacker-controlled
object; it is a budget enforced while bytes are still arriving.

### Unsaved Work Belongs To The Boundary That Can Replace It

Several editor bugs shared a family resemblance. A publication URL could be
dirty while the parent believed the document was clean. A focus refresh could
install a newer published record over that local URL. Morning Review could key a
new run over an editorial shortlist whose unsaved decisions lived inside a child
component. The child knew something precious existed, while the parent owned the
button, poll, or identity change capable of destroying it.

The fix was not another scattered `window.confirm`. Child editors now report a
small, keyed dirty-state contract synchronously through refs. Parent components
include that state in unload and navigation guards, freshness reconciliation,
status labels, and identity rollover. Passive refreshes defer a replacement run;
interactive replacements ask explicitly; saving or resetting applies the
deferred snapshot. Structured `409` responses preserve both the latest server
record and the exact attempted document, so conflict recovery never turns into
“try to remember what you wrote.”

This is a useful React design heuristic: state should live where it is edited,
but the fact that it is dangerous to discard must reach every boundary that can
replace it. A ref-backed notification closes the tiny interval before a state
render or effect, which is exactly where focus and cross-tab races like to hide.

### A Modal Is A Tiny Temporary Application

The final accessibility pass treated dialogs as more than dark rectangles.
Opening a destructive confirmation now moves focus to a safe action, traps Tab
and Shift+Tab, locks background scrolling, marks the background inert, closes on
Escape only when safe, and restores focus to the invoking control. If success
removes that control, focus lands on a stable page heading rather than falling
back to the browser chrome. Mutation failures remain inside the active dialog as
alerts; persistent live regions sit outside inert subtrees. Expanded preview and
chart editing are mutually exclusive, so two focus managers can never compete
under stacked overlays.

These details are not decorative polish. Keyboard focus is the user's cursor.
Deleting its destination without choosing the next one is the accessibility
equivalent of deleting a mouse pointer. Alerts, polite status regions, labelled
fields, and accessible copy controls similarly turn background saves, retries,
and failures into state a screen-reader user can actually observe.

### Expensive Rendering Needs An Admission Desk

The chart collection POST can launch a browser renderer, so it now behaves like
a scarce compute boundary rather than an ordinary form endpoint. Requests need a
strict idempotency key and a normalized content fingerprint. Matching in-flight
work coalesces, successful replies receive a bounded replay window, changed
content under the same key conflicts, and failures free the key for a safe retry.
Per-owner, global, and rolling-window limits cap physical work; a timed-out
renderer keeps occupying its physical slot until it really settles, preventing
an upstream process that ignores cancellation from turning timeouts into an
unbounded queue. Request and response bodies, error diagnostics, origins, UUIDs,
and CORS headers are all bounded or allowlisted at the shared route boundary.

The distinction between logical and physical completion matters. A caller may
stop waiting, but a Puppeteer process can still be alive. Releasing capacity at
the moment the promise shown to the caller times out would make the limiter an
optimistic counter rather than a resource fence.

The in-process desk is only a courtesy; serverless instances do not share
memory. Production therefore puts the real admission ledger in PostgreSQL
behind service-role-only, `SECURITY DEFINER` acquire, complete, and fail RPCs.
A global advisory lock makes the limits real across isolates: two active jobs
per owner, four globally, and twelve new keys per owner in ten minutes. The
acquire call has its own eight-second database deadline. Every authenticated
save receives a fenced lease fixed at 180 seconds—longer than the route's
120-second invocation maximum and its 55-second logical caller budget.
Completion and failure use fresh eight-second persistence signals and require
both the current token and an unexpired lease. Successful receipts and
abandoned requests are cleaned in bounded batches after 24 hours, while rolling
rate events have their own bounded cleanup.

The HTTP caller does not own the physical save. Closing the tab detaches that
waiter; Next's `after()` registers settlement within the function lifecycle. A
late real success still completes its receipt, an ordinary render failure may
release only its current fence, and an ambiguous completion remains fenced for
replay instead of reopening duplicate work. In anonymous local development, a
new mutation scope first returns a cookie-bearing `428` and asks the browser to
retry the same idempotency key before the body is read or any side effect begins.
Production anonymous callers remain `401`. `after()` is a request-lifecycle
extension, not an immortal background worker, which is why the route maximum
and lease are deliberately ordered.

A save also derives one deterministic chart UUID and a full SHA-256 request-key
hash from the owner and idempotency key. The chart row stores that identity and
the content fingerprint under a unique index. If PostgreSQL committed the chart
but the response vanished, the retry finds and validates the existing row
before opening a browser or uploading another image. Changed content under the
same key conflicts. Durable replay receipts are size-, depth-, URL-, timestamp-,
symbol-, chart-spec-, and digest-validated before the application trusts them.
This is the exactly-once lesson in concrete form: a receipt helps, but the
durable side effect itself must also be addressable by the request identity.

### The Premarket List That Shrunk To Eight

On August 10, 2026, the production watchdog reported that the morning
newsletter had failed. GitHub Actions was only the smoke alarm. The actual fire
started at 5:00 AM ET, when Financial Modeling Prep returned healthy HTTP 200
responses but its top-50 actives, gainers, and losers lists contained only eight
usable S&P 500 names. Candidate collection requires at least thirty names, so
the automation retried twice and correctly stopped before inventing a report
from an undersized sample.

This was a useful failure because nothing was technically “down.” A green
provider response can still carry data that is too narrow for the job. Movers
feeds are like the chalkboard outside a restaurant: they highlight what is
interesting, but they are not the pantry. The repair keeps those high-signal
feeds first, then—only when the combined pool is below fifty—fetches the current
S&P 500 quote universe in bounded batches of one hundred. It ranks those
supplemental quotes by absolute percentage move, preserves the original movers,
deduplicates canonical ticker aliases such as `BRK.B`/`BRK-B`, and stops adding
names once the pool reaches fifty. Individual batch failures are tolerated; the
existing thirty-name safety gate remains the final authority.

The regression test recreates the seven-name version of the incident and proves
that the fallback produces fifty unique candidates without losing the original
names. The engineering lesson is broader than newsletters: validate the shape
and sufficiency of successful upstream data, and keep a bounded universe source
behind ranking feeds whose membership can change dramatically with the clock.

### Release Order Is An Executable Part Of The Design

This package adds durable contracts, not merely components. Its migration
order is therefore explicit:

1. `20260807090000_scale_newsletter_archive.sql`
2. `20260807100000_track_beehiiv_sync_source_version.sql`
3. `20260808090000_durable_why_moved_editorial_inbox.sql`
4. `20260808100000_durable_dashboard_chart_render_assets.sql`
5. `20260808110000_scale_newsletter_chart_library_listing.sql`
6. `20260808120000_denormalize_newsletter_draft_market_date.sql`
7. `20260808130000_persist_newsletter_editorial_shortlists.sql`
8. `20260809090000_atomic_newsletter_draft_forks.sql`
9. `20260809100000_durable_newsletter_chart_post_admission.sql`
10. verify schema, privileges, RPCs, indexes, receipts, fork replay, chart-save
    lease fencing and duplicate recovery, and shortlist history;
11. promote the matching application; then run authenticated smoke tests.

Production health then exposed one database-only eligibility edge, repaired by
the chronological follow-up
`20260809120000_skip_disconnected_beehiiv_reconciliation.sql`. It excludes an
explicitly disconnected integration from claims without deleting its delivery
history. This was applied after the initial package promotion, verified with an
empty second push dry run, and is part of the final aligned release ledger.

Migration-first matters because the new application reads new scalars and
calls new RPCs. Compatibility triggers keep old application instances valid
during the overlap and preserve historical editor timestamps during derived
backfills. Application-first would turn a planned rollout into missing-column
errors.

The application release candidate passed 250 Vitest files / 1,644 tests,
TypeScript, repository lint with zero errors (177 non-blocking legacy warnings),
a 49-page production build, and all 114 guarded server traces. A clean database
reset replayed every migration through `20260809100000`, including the final
chart-admission contract, and all 10 pgTAP files / 369 assertions passed. The
home trace policy deliberately permits only the public 150 KB S&P constituent
projection required by its catalyst feed and rejects every other `/data/` path
in that function. The larger lesson is worth keeping here: a serious
engineering pass does not end when the happy-path feature works. It follows
growth, cancellation, concurrency, packaging, retries, and release order until
each layer tells the same story.

### August 9, 2026: Production Closed The Loop

The final release did not stop at “the PR merged.” PR #16 merged the durable
archive/editor/delivery/chart-save package as `fc27eca`, after which its nine
migrations were applied in order to linked Supabase project
`hccwmbmnmbmhuslmbymq`. PR #17 merged the disconnected-Beehiiv repair as
`b2cd84b` and applied the tenth migration, `20260809120000`. PRs #18 and #19
then closed the two production catalyst-feed contract failures; final
application head `7faff05` contains both repairs.

The final hosted gates passed TypeScript, ESLint with zero errors (166
non-blocking warnings), 250 Vitest files / 1,646 tests, 11 pgTAP files / 372
assertions, a 49-unit production build, and all 114 guarded server traces.
Pinned staged-tree secret scans were clean. Local and remote migration ledgers
align through `20260809120000`, and the second linked push dry run is empty.

Vercel deployment `dpl_ATwcqNHpYRUQRSjz5vQ1RGrZJrXH` reached READY at
`theintraday-krnvfrpq9-fords-projects-b7da7491.vercel.app`. The public root and
`/api/health/newsletter` returned HTTP `200`; the health body was `healthy`,
and the settled deployment window contained no error-level or 5xx logs. A safe
reconciliation heartbeat ran with zero configured Beehiiv integrations and
returned `attempted: 0`, `updated: 0`, and no failures. It refreshed health
without synchronizing, publishing, or delivering anything. No new newsletter
canary was sent.

The watchdog proof is equally precise. Manual `workflow_dispatch` run
31125987699 showed the hosted path but never counted as schedule evidence. Real
`event=schedule` run 31318198085 correctly caught the pre-fix `503`; after the
repair, real scheduled run 31319998523 succeeded on exact deployed head
`7faff05`. The machine path is proved. Human notification and operator response
from an intentionally failing run are still unproved, and the optional external
webhook remains unconfigured. Beehiiv is also explicitly disconnected, so a
human OAuth reconnect is required before real remote sync, scheduling,
publication, or delivery. Its two historical delivery rows remain intact for
that future reconnect.

This is the useful ending: reliability work is not the absence of surprises.
It is the ability to let production reveal a bounded truth, repair only the
owned cause, and then collect evidence at every layer—ledger, tests, deployment,
health, logs, and off-site schedule—without pretending an optional or human
step happened when it did not.

---

## One Watchlist, Two Kinds Of Memory

The Market Overview already had a useful little watchlist, but it remembered
like a notebook left beside one particular browser. That is perfect for an
anonymous visitor: no account ceremony, no database dependency, and no privacy
surprise. It is frustrating for a signed-in reader who arranges a list on a
laptop and then opens the site on a phone.

The account-watchlist package keeps both virtues by refusing to invent two
competing products. Anonymous users still use the versioned browser-local list.
After authentication, the same controls attach to one canonical ordered array
on the existing `watchlists` row. `NULL` means “use the product defaults”; an
empty array means “I deliberately want no symbols.” That tiny distinction is
easy to erase with an innocent fallback expression, and doing so would make an
empty watchlist mysteriously refill itself.

Saving is treated like handing a numbered claim ticket to a coat room. The
browser supplies the revision it last saw and an idempotency key. PostgreSQL
locks the owner row, compares the revision, writes at most 20 normalized equity
symbols, and stores a bounded receipt. If the response disappears after the
commit, the same ticket returns the original result instead of applying the
reorder twice. If another device has already changed the list, the server
returns a conflict and the UI keeps the attempted order visible. Browser
storage is now a bounded offline cache, not a second authority quietly fighting
the database.

Existing users presented a second migration problem: several historical
watchlist shapes exist. The first authenticated read performs a one-time,
locked, bounded import. It prefers the active JSON list and can fall back to the
old normalized tab/item records, keeping only the first 20 valid unique equity
symbols. It never starts an endless dual-write relationship with those legacy
tables. A bridge should help everyone cross the river; it should not become a
second river to maintain.

Custom quote loading also moved from “one request per missing ticker” to one
same-origin batch. The boundary checks content type and body size, caps symbols
and physical work, validates the whole equity set against the stock registry,
and fails closed when that registry is unavailable. A caller abort detaches
only that caller; it does not cancel resolver work another request may share.

Two release bugs reinforced why packaging is part of correctness. First, the
repository's unanchored `Watchlist/` ignore rule also hid
`app/api/watchlist/` on a case-insensitive filesystem. The routes existed and
their tests passed, but Git would have omitted them. Anchoring the rule to the
root export directory made the real application routes visible to review.
Second, the clean database replay caught `pg_catalog.coalesce(...)` in the new
migration. PostgreSQL's `COALESCE` is special SQL syntax, not a namespaced
function. Correcting all nine calls turned a locally plausible migration into
one that actually replays from zero.

The release candidate now passes 187 focused account/watchlist tests and the
complete 270-file / 1,823-test Vitest suite, TypeScript, repository lint with
zero errors (166 pre-existing warnings), a 49-unit production build, 116
guarded server traces, and all 12 pgTAP files / 406 assertions after a clean
database reset through `20260809130000`. The feature remains deliberately
flagged until that migration is applied ahead of the matching application.
That order is not operational trivia; it is part of the design.

---

## The Chatbot Learned The Difference Between “Answered” And “Delivered”

A streamed chatbot answer can look finished in the browser while the system is
still in the most dangerous part of the job. Imagine a restaurant server who
brings dinner to the table, then drops the signed receipt on the walk back to
the register. The customer ate, the kitchen spent the ingredients, but the
ledger cannot prove what happened. Pressing retry should not cook a second
dinner.

The durable chatbot gives every authenticated request a claim ticket made from
an idempotency key, a command fingerprint, the target conversation revision,
and the verified account. PostgreSQL—not one particular web process—decides
whether that ticket may begin, should replay a completed result, or conflicts
with different work. Admission is intentionally narrow: one active request per
account, four active requests globally, 20 acquisitions per ten minutes, at
most six attempts, and a 180-second lease around a route whose own maximum is
120 seconds. The extra minute is a safety rail for background settlement, not
permission to let model work run forever.

The durable receipt does not become a second conversation database. It records
lifecycle state, fingerprints, attempts, leases, and content-free pointers.
The actual question, assistant answer, conversation revision, and successful
request completion are committed together. A crash before that transaction
leaves recoverable work; a lost response after it produces an exact replay.
That closes the expensive gap between “the model answered” and “the product can
prove the answer was delivered once.”

Conversation history received the same bounded treatment. Auth-derived,
keyset-paginated RPCs enforce ownership, revision checks, page sizes, and
bounded text at the database boundary. Browser roles no longer write the base
conversation and message tables directly. The request identity is also
resolved statelessly from a verified token with an expiry fence, avoiding a
surprising class of bugs where a cached cookie helper outlives the principal it
was supposed to represent.

The clean database replay caught two wonderfully unglamorous PostgreSQL
lessons. `substring` accepts schema-qualified function syntax only in its
comma-argument form, while `COALESCE` is SQL syntax and cannot be called as
`pg_catalog.coalesce`. pgTAP then caught tests that accidentally expected
revoked table privileges and a replay assertion that joined a receipt hidden
by RLS. Those were test-design bugs, not reasons to weaken production access.
Good security tests ask what each role truly needs; they do not grant extra
power merely to make an assertion convenient.

The frozen release candidate passed 25 focused files / 180 tests and the full
291-file / 1,987-test Vitest suite. TypeScript passed, ESLint reported zero
errors and 150 non-blocking warnings, the production build generated all 49
static-page units, and all 116 server traces passed the packaging guard. A
clean Supabase reset replayed through
`20260809150000_durable_chatbot_request_admission.sql`, with all 14 pgTAP files
/ 480 assertions green. Promotion order is part of the feature: apply
`20260809140000_bound_chatbot_conversations.sql`, then
`20260809150000_durable_chatbot_request_admission.sql`, verify the linked
ledger, and only then expose the matching application.

That promotion is now complete. Commit `6bd6c81` passed the protected checks
and merged through PR #22 as `6f1c4b9`. The two migrations were applied in
chronological order to linked Supabase project `hccwmbmnmbmhuslmbymq`; local
and remote ledgers align through `20260809150000`, and the second linked dry
run is empty. Production deployment `dpl_GeuEHL7uksz1bEa3gqKRKV5MTowL`
reached READY and took the `www.theintraday.com` alias. The public root and
newsletter health route returned HTTP `200`, health reported `healthy`, and
the exact deployment window contained zero error-level and zero 5xx log
entries. The smoke test did not submit a model request and no newsletter
canary was sent.

---

## The Brand Became A Building, Not A Single Room

The public `theintraday.com` address is now the front door for The Intraday's
independent trading-community research business. This market application did
not disappear; it moved into its own clearly labeled room at
`markets.theintraday.com`. The charting engine remains next door at
`charts.theintraday.com`.

That separation matters operationally. The root website can now evolve as a
focused editorial and affiliate product without inheriting market-data costs,
authentication state, or newsletter jobs. The market app keeps its own
metadata, OAuth callback, host-only cookies, cron endpoints, and chart embed
origin. Think of it as moving a busy workshop behind the storefront: customers
still know it belongs to The Intraday, but sawdust no longer lands on the sales
counter.

The migration order is deliberate: establish and verify the markets hostname,
move automated callers and authentication, then reassign the root domain. A
new Supabase migration recreates the automation functions with the markets
hostname, while the public site retains redirects for old stock, dashboard,
newsletter, and account URLs. This avoids the classic domain-cutover mistake
where the homepage looks correct but background jobs quietly call the wrong
application.
