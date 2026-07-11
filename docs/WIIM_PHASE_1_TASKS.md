# WIIM Phase 1 Tasks

## Goal
Ship the thinnest useful version of the OpenClaw WIIM system.

Phase 1 should do **one thing well**:
- run a **morning WIIM brief**
- produce **5 ranked newsletter-topic candidates**
- store the run in Supabase
- send a short summary to Ford

Do **not** start with intraday deltas, full batch-worker orchestration, or full autonomous newsletter generation.

---

## Repo audit: what already exists

### 1) Finviz WIIM ingestion already exists
There is already a real Finviz scraping/cache layer:
- `lib/stock-why-moving.ts`

What it already does:
- fetches Finviz quote pages per symbol
- parses the embedded "why moving" payload
- normalizes headline / summary / bullet points
- caches results in memory
- caches results in Supabase table `stock_why_moving_cache`
- uses per-status TTLs:
  - found: 30 min
  - not found: 10 min
  - error: 5 min

Important implication:
- we are **not** starting from zero on WIIM ingestion
- we already have a per-symbol cached source-of-truth for Finviz why-moving data

### 2) There is already a WIIM eval script
- `scripts/run-wiim-summary-eval.ts`

What it already does:
- reads recent rows from `stock_why_moving_cache`
- generates our own summary from quote + news context
- evaluates our summary against the Finviz catalyst
- inserts generated summaries into `stock_summaries`
- inserts eval rows into `summary_evals`

Important implication:
- eval plumbing already exists
- model-backed comparison against Finviz already exists
- this script is closer to an **offline eval / benchmarking script** than a daily top-5 morning brief

### 3) Newsletter candidate logic already exists
Relevant files:
- `lib/newsletter/fetch-context.ts`
- `lib/newsletter/orchestrate.ts`
- `lib/newsletter/prompts.ts`
- `app/api/newsletter/generate/route.ts`

What already exists:
- fetches candidate stock universe from FMP actives
- merges gainers/losers and earnings reporters
- filters to S&P 500 candidates
- fetches news for top candidates
- already has a stock-picking layer for newsletters
- records picks to `newsletter_picks`

Important implication:
- we do **not** need to invent topic candidate ranking from nothing
- we can reuse and adapt existing market/newsletter candidate machinery
- the newsletter system already knows how to rank/choose stocks, even if it is not yet phrased as a 5-topic WIIM brief

### 4) Supabase-backed persistence patterns already exist
Existing storage/persistence examples:
- `stock_why_moving_cache`
- `newsletter_picks`
- `newsletter_drafts`
- `stock_summaries`
- `summary_evals`

Important implication:
- there is already an established pattern for:
  - service-role writes
  - JSON metadata storage
  - queryable run artifacts
- adding WIIM run tables is normal for this repo

### 5) Missing piece: there is no daily WIIM run/orchestrator yet
What does **not** appear to exist yet:
- a `wiim_runs` concept
- a top-5 morning brief generator
- a cron-oriented coordinator entrypoint
- a run artifact that stores ranked morning candidates
- a message/email formatter for a WIIM morning brief

This is the actual Phase 1 gap.

---

## What Phase 1 should build

### Phase 1 scope
Build a morning-only WIIM orchestrator that:

1. gathers a candidate set
2. enriches candidates with available WIIM/market/news context
3. ranks 5 morning newsletter-worthy candidates
4. stores the run in Supabase
5. formats a short summary
6. can later be called by OpenClaw cron

### Explicitly out of scope for Phase 1
- intraday reranking
- close/finalizer run
- multi-worker batch scraping
- aggressive sub-agent orchestration
- auto-generated newsletter drafts
- chart package generation
- Finviz delta notifications
- approval queue

---

## Recommended Phase 1 architecture

### New coordinator entrypoint
Create a new script, likely something like:
- `scripts/run-wiim-brief.ts`

Responsibilities:
- accept `--run-type morning`
- gather candidate universe
- gather supporting context
- compute top 5 ranked candidates
- persist run + candidate rows
- print/send a concise summary payload

### Candidate sources for v1
For v1, prefer **reuse over purity**.

Recommended starting candidate inputs:
1. existing newsletter candidate pool from `fetchMarketContext()`
2. optional recent Finviz cache hits from `stock_why_moving_cache`
3. optional recent earnings context already used by newsletter flow

This means v1 can stand on existing systems instead of waiting for a whole new ingestion layer.

### Ranking approach for v1
Do not overengineer the ranker in Phase 1.

Suggested scoring inputs:
- magnitude of move
- presence of recent news
- earnings involvement
- presence of a Finviz why-moving catalyst
- recency/quality of catalyst context
- novelty penalty based on recent `newsletter_picks`

Output for each candidate should include:
- rank
- ticker/theme
- title
- why it matters
- confidence score
- candidate type
- source tags

---

## Recommended new Supabase tables for Phase 1

### 1) `wiim_runs`
Purpose:
- one row per morning WIIM run

Suggested fields:
- `id uuid primary key`
- `run_type text` (`morning` for phase 1)
- `status text`
- `started_at timestamptz`
- `completed_at timestamptz`
- `summary_text text`
- `top_candidate text`
- `best_contrarian_candidate text null`
- `top_five_json jsonb`
- `metadata_json jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### 2) `wiim_run_candidates`
Purpose:
- one row per candidate in a WIIM run

Suggested fields:
- `id uuid primary key`
- `wiim_run_id uuid references wiim_runs(id) on delete cascade`
- `rank integer`
- `ticker text null`
- `theme text null`
- `headline text`
- `why_it_matters text`
- `confidence_score numeric`
- `candidate_type text`
- `state_label text null`
- `signals_json jsonb`
- `source_refs_json jsonb`
- `created_at timestamptz`

### Why not reuse newsletter tables?
Because WIIM runs are not the same thing as final newsletter picks or drafts.

`newsletter_picks` should remain:
- actual picked/sent/generated newsletter selections

`wiim_runs` should represent:
- ranked analytical snapshots of morning opportunity space

That separation is cleaner.

---

## Phase 1 tasks

### Task 1 — inspect current DB types and migrations more carefully
Confirm whether these tables already exist remotely even if not obvious locally:
- `stock_summaries`
- `summary_evals`
- `newsletter_picks`

Why:
- we already saw code using them
- we need schema confidence before adding new WIIM tables

Deliverable:
- short schema note appended to docs or a migration plan

### Task 2 — create Supabase migration for WIIM run tables
Create migration:
- `supabase/migrations/<timestamp>_create_wiim_runs.sql`

Include:
- `wiim_runs`
- `wiim_run_candidates`
- indexes
- updated-at trigger if desired
- RLS strategy consistent with existing project patterns

Deliverable:
- migration file
- generated type update if your workflow requires it

### Task 3 — create a WIIM run contract type
Create TypeScript types for:
- `WiimRun`
- `WiimCandidate`
- `WiimRunSummary`

Likely location:
- `lib/wiim/types.ts`

Deliverable:
- strongly typed internal contract for scripts + future API routes

### Task 4 — build candidate collection adapter
Create a small adapter that reuses newsletter market context.

Likely location:
- `lib/wiim/fetch-candidates.ts`

Responsibilities:
- call existing `fetchMarketContext()`
- normalize into a WIIM candidate input list
- optionally merge recent Finviz catalyst cache rows when available
- optionally attach recent-pick suppression data

Deliverable:
- function returning a normalized candidate list for the WIIM ranker

### Task 5 — build a thin WIIM ranker
Likely location:
- `lib/wiim/rank.ts`

Responsibilities:
- score candidates
- sort candidates
- return top 5
- generate a short `why it matters` line per candidate

Phase 1 ranker should be deterministic/simple where possible.
Model-assisted ranking can come later if needed.

Deliverable:
- top-5 ranked candidate output from existing market/news context

### Task 6 — build WIIM persistence helpers
Likely location:
- `lib/wiim/store.ts`

Responsibilities:
- insert a `wiim_runs` row
- insert candidate rows
- update status/timestamps
- fetch latest morning run if needed later

Deliverable:
- reusable persistence helpers for future cron runs

### Task 7 — build the morning run script
Create:
- `scripts/run-wiim-brief.ts`

Responsibilities:
- create run record
- fetch candidates
- rank candidates
- persist results
- print a clean summary to stdout
- optionally support `--json`

CLI idea:
- `npx tsx scripts/run-wiim-brief.ts --run-type morning`

Deliverable:
- script that can be run manually before any cron integration

### Task 8 — build a message formatter
Likely location:
- `lib/wiim/format.ts`

Responsibilities:
- format the top 5 into concise morning briefing text
- support later delivery via OpenClaw chat/email

Suggested output shape:
- headline / date
- 1 through 5 candidates
- best overall pick
- best contrarian pick (optional if enough signal)

Deliverable:
- formatter function returning plain text and/or HTML-friendly output

### Task 9 — manual end-to-end test
Run locally:
- start required services if needed
- run `scripts/run-wiim-brief.ts`
- verify Supabase inserts
- inspect output quality

Deliverable:
- one successful local morning run
- sample stored run rows
- notes on ranking quality gaps

### Task 10 — only after manual success, add OpenClaw cron
Do **not** do this before manual run quality is acceptable.

Initial cron should only run:
- morning WIIM brief

Deliverable:
- one cron job definition
- isolated agent run payload
- delivery target definition

---

## Concrete recommendation for Phase 1 implementation order

1. **Create migration for `wiim_runs` + `wiim_run_candidates`**
2. **Create `lib/wiim/types.ts`**
3. **Create `lib/wiim/fetch-candidates.ts`** using newsletter context reuse
4. **Create `lib/wiim/rank.ts`**
5. **Create `lib/wiim/store.ts`**
6. **Create `scripts/run-wiim-brief.ts`**
7. **Run locally and inspect output quality**
8. **Then add cron**

---

## Strong opinions / guidance

### 1) Reuse the newsletter candidate stack first
This repo already has candidate selection logic. Use it.
Do not start by building an entirely separate morning universe builder unless the current one proves inadequate.

### 2) Do not start Phase 1 with sub-agent scraping orchestration
That is Phase 2.
Right now we need a **useful morning brief**, not a distributed scraping framework.

### 3) Keep Phase 1 morning-only
If you try to build morning + intraday + eval + newsletter trigger at once, you will build a swamp.

### 4) Treat Finviz as enrichment + eval input, not the only signal source
You already have a better system shape than just “scrape Finviz and mirror it.” Lean into that.

---

## Best immediate next action
Start implementing **Tasks 2–7**.

That means:
- create the migration
- create the `lib/wiim/*` module skeleton
- create `scripts/run-wiim-brief.ts`
- make one manual run work

That is the correct build start.
