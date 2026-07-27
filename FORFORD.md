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

*Last updated: July 2026*
*201 commits and counting*

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
