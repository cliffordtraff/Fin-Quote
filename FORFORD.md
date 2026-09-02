# The Intraday: a guided map of the project

The Intraday is a financial-information product, not merely a collection of pages that show stock prices. Its job is to turn a noisy market morning into a sequence of increasingly useful answers: what moved, why it moved, what matters, and what an editor might publish. The codebase reflects that ambition. It contains a public market experience, deeper stock research, an embedded charting workspace, and several back-office systems that gather, validate, and turn data into editorial output.

Think of the application as a newsroom with a fast data desk. Providers bring in raw market facts; the dashboard and stock pages present them; background automation gathers candidate stories; and the newsletter flow turns only sufficiently well-supported stories into a draft. A deliberate quality gate stops a thin or unreliable morning from becoming a misleading publication.

## The major rooms

Next.js 15 and React 19 provide the main building. Routes live in `app/`, using the App Router. Pages such as `app/dashboard`, `app/stock/[symbol]`, `app/calendar`, and `app/insiders` are the product surfaces. Route handlers in `app/api/` expose server-side operations, while `app/actions/` contains server actions used by the interface. Shared display pieces live in `components/`; shared business logic lives in `lib/`.

The root layout is unusual in a useful way: it keeps `components/WorkspaceIframe.tsx` mounted as navigation changes. The separate charting platform therefore keeps its state, like leaving a trading terminal open while switching tabs instead of reopening it each time. The lightweight `/workspace/*` routes are just controls for that persistent shell.

The smaller stock-page price chart in `components/EmbedChart.tsx` deliberately
uses Charting Platform Lite at `/embed/lite`, whose default runtime is the
compact Canvas2D engine. That is distinct from the persistent workspace above,
which uses the full charting application. Keeping those URLs aligned with the
two product offerings prevents an implementation detail such as “Lite-WebGL”
from becoming a third product contract.

Market data goes through `lib/providers/`. `FMPProvider` and `MassiveProvider` implement one common shape, selected by `DATA_PROVIDER`. That boundary is valuable: pages ask for a quote or financial series without needing to know which vendor supplied it. When adding a provider feature, first extend the provider type, then an implementation, then the consumer; skipping the first step usually creates vendor-specific code that is hard to maintain.

Supabase is the durable record room. It stores company data, financial statements and metrics, market caches, review metadata, conversations, and newsletter state. Types generated into `lib/database.types.ts` help TypeScript catch mismatched fields before an API call reaches production. Migrations live in `supabase/migrations/`; treat them as historical records, not a place to repair a transient run. A failing automation alert can sound like a migration problem while actually being an application-state or notification problem, so inspect the durable run and its error first.

## How the morning newsletter works

The newsletter machinery lives in `lib/newsletter/`. `daily-automation.ts` is its conductor. It advances a durable run through collection, Finviz catalyst coverage, Why-Is-It-Moving summaries, newsletter generation, and finalization. Each invocation has a time budget and a lease, so several cron calls can safely keep an interrupted run moving without doing the same work twice. Child daily runs contain the publishable issue items; the parent automation row describes the entire morning.

Candidate collection deliberately starts with the complete S&P 500 security
universe: 503 listed symbols because a few companies contribute multiple share
classes. Think of the movers feeds as the assignment editor's highlighter, not
the guest list. Actives, gainers, losers, and earnings names still supply useful
context, but batch quotes make sure every index symbol reaches the durable WIIM
run. Finviz warming then proceeds in resumable batches across that full list.
This avoids the subtle failure mode where a quiet-looking stock with important
company news never reaches the newsroom merely because it was absent from a
provider's limited top-movers endpoint.

Full-universe coverage also changes the operating math. A 503-name run should
not be mistaken for one giant request: the existing lease-backed state machine
drains work over repeated bounded invocations. If the quote provider omits an
index symbol, collection now retains that symbol with a zeroed placeholder
instead of aborting the entire morning. The missing live quote remains visible
in its evidence quality, while the company still receives Finviz coverage.
This preserves the important distinction between “we checked every company”
and “every company had a publishable catalyst.”

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

Every request outcome is also written to `finviz_catalyst_snapshots`, including
`catalyst`, `no_catalyst`, and `error` rows. The coverage ledger therefore has a
durable record even when no prose summary is generated. If the breaker opens or
the request budget is exhausted after at least 30 symbols have completed, the
run continues in an explicitly marked partial-coverage mode; below that floor,
normal retry and terminal failure handling still applies.

The expensive AI summary stage is deliberately narrower than the crawl. It
summarizes the 80 strongest evidence-bearing names, expanding up to a hard cap
of 100 when more names have real news, earnings, or a fresh Finviz catalyst.
Finviz is a discovery lead in that prompt, not verification: factual claims
must be supported by the independently gathered news or SEC packet. Stale
Finviz timestamps cannot supply a headline, source citation, or catalyst bonus.

This distinction matters. A parent run can intentionally end as `partial` when it does not meet the configured quality threshold. That is not a migration failure and it does not mean a newsletter was sent. It means the system chose caution. The approved daily candidate-set exception supports a human-approved, date-scoped draft for such a day without quietly lowering the global threshold. It records the source run and explicit candidate IDs, creates a draft only, and leaves Beehiiv scheduling and delivery to an explicit later decision.

Notifications are part of the durable workflow, not cosmetic status text. A terminal run is retried until a notification has been recorded. The important lesson from the August 2026 incident is that an intentional exception has no child newsletter run, so generic “completion” notification code must recognize it rather than throw “Missing newsletter run.” Otherwise every later cron poll reports failure even though the data workflow is correctly complete. Tests should cover both the narrow exception condition and the ordinary missing-child-run error; broad exception handling would hide real corruption.

## Data, AI, and live updates

Financial metrics have several layers. Standardized statements are in `financials_std`; broader measures in `financial_metrics`; company-specific dimensions in `company_metrics`. `app/actions/chart-metrics.ts` is the router that assembles a chart-ready series. When a chart looks wrong, trace its metric configuration and source table before changing the chart component—the visual symptom is often a data-shape issue.

The project uses AI in several focused places: streaming Q&A, market summaries, review/evaluation tooling, and newsletter drafting. Older code can still contain AAPL-oriented assumptions. Treat that as a compatibility constraint, not an invitation to copy it into new multi-symbol work. Prompt changes need evaluation, and any generated copy that may be published should keep its source and review trail.

Live market updates use SSE routes and a singleton Massive websocket broker. The broker fan-outs subscriptions and aggregates one-second ticks into larger candles. This avoids opening one upstream socket per browser tab, but makes lifecycle and subscription cleanup important.

## Working safely here

This repository often has local, uncommitted work. Start with `git status`, scope diffs to the files you need, and never clean or revert unrelated changes. Prefer small tests around the changed workflow—`npx vitest run ...`—then typecheck and build as appropriate. `npm run lint` and `npm run build` can be useful, but a targeted verification is usually the fastest signal during an operational incident.

For external effects, distinguish three states precisely: local code changed, a draft created, and content actually published/sent. A successful local run or a Beehiiv draft is not evidence of public delivery. Likewise, do not edit Supabase rows directly to “unstick” a workflow. Use the product’s retry/resume or reconciliation functions so the audit trail, leases, and notifications remain truthful.

The enduring engineering habit here is to follow the state machine, not the label on an alert. Read the current stage, timestamps, counters, and last error; identify the smallest broken assumption; repair it without weakening the safety rails; then verify the next scheduled invocation behaves normally. That is how a market-news system stays both fast and trustworthy.
