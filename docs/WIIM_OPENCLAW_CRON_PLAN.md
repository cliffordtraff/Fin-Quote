# WIIM + OpenClaw Cron Plan

## Goal
Build a scheduled WIIM pipeline that:

1. runs automatically via OpenClaw cron
2. sends a **morning top-5 newsletter candidate brief**
3. runs an **intraday rerank/delta pass**
4. stores structured results in **Supabase**
5. compares our output against **Finviz**
6. uses **batched sub-agent style workers / grouped jobs** for scraping-heavy stages so the universe does not take forever

---

## Product outcome
Each market day, the system should answer:

- What are the top 5 newsletter-worthy topics this morning?
- What changed intraday?
- Which candidate is strongest now?
- Which ideas are unique to our system vs obvious consensus?
- How did our WIIM stack compare to Finviz?

---

## High-level architecture

### Layer 1: Scheduler
Use **OpenClaw cron** for exact run timing.

Initial schedule:
- **07:45 AM America/Chicago** — morning WIIM
- **12:15 PM America/Chicago** — intraday WIIM
- optional later:
  - **03:50 PM America/Chicago** — close WIIM / eval finalizer

### Layer 2: Coordinator job
The coordinator is the top-level run entrypoint.

Responsibilities:
- determine run type (`morning`, `intraday`, `close`)
- define ticker universe / candidate universe
- split work into batches
- launch batch workers / grouped scraping jobs
- merge batch outputs
- run ranking + WIIM generation
- run Finviz comparison/evals
- persist run artifacts to Supabase
- send user-facing summary if configured

### Layer 3: Batch scraping workers
Use grouped workers for scraping-heavy stages.

Important rule:
- **Do not do one worker per ticker**
- **Do not let unlimited workers hammer Finviz**

Recommended starting values:
- batch size: **25–50 tickers**
- concurrency: **4–6 workers max**
- per-request pacing/jitter inside each worker
- retry/backoff on failures

### Layer 4: Storage
Persist everything needed for:
- history
- diffs
- evals
- debugging
- dashboards
- downstream draft generation

Primary store:
- **Supabase**

### Layer 5: Summary/output layer
Generate:
- a short morning message with **5 ranked newsletter candidates**
- an intraday delta summary
- optional close summary

Delivery:
- email and/or OpenClaw chat message

---

## Morning run behavior

### Purpose
Set the board for the day.

### Inputs
- overnight / premarket market context
- relevant news/headlines
- price movers
- earnings-related signals
- sector/theme signals
- Finviz-derived data if used in this phase
- internal ranking features

### Output
Top 5 ranked candidates, each with:
- ticker or theme
- short title
- why it matters
- confidence score
- category:
  - `newsletter`
  - `chart_of_day`
  - `roundup`
  - `watch_only`
- source tags
- whether it is:
  - `new`
  - `persistent`
  - `fading`

### Morning message format
- Candidate 1
- Candidate 2
- Candidate 3
- Candidate 4
- Candidate 5
- best overall pick
- best contrarian pick

---

## Intraday run behavior

### Purpose
Detect changes, not just rerun the same list.

### Inputs
- current session market data
- fresh headline/catalyst context
- previous morning run output
- current Finviz/peer context where applicable

### Output
- updated top 5
- delta vs morning
- top candidate changes
- confidence changes
- newly emerged stories
- invalidated/fading stories

### Intraday message rule
Only proactively notify if one of these happens:
- top candidate changed
- confidence changes materially
- a new candidate enters top tier
- a strong newsletter candidate emerges
- a strong chart candidate emerges

Otherwise:
- store results silently in Supabase

---

## Close run behavior (optional phase 2)

### Purpose
Evaluate what actually mattered and prepare tomorrow.

### Output
- what held into the close
- what faded
- what we missed
- strongest candidate for next newsletter cycle
- strongest chart candidate
- daily eval summary vs Finviz

---

## Finviz strategy

### Why grouped workers
A fully serial ticker loop is too slow.

### Correct approach
- split ticker universe into batches
- process batches concurrently but conservatively
- apply pacing inside each batch
- aggregate centrally

### Anti-patterns
- one worker per ticker
- unlimited concurrency
- every analysis worker calling Finviz independently

### Better pattern
1. fetch/ingest in controlled grouped workers
2. write batch artifacts/results
3. run ranking/evals off stored data

---

## Suggested data model (Supabase)

### Table: `wiim_runs`
One row per WIIM run.

Suggested fields:
- `id`
- `run_type` (`morning|intraday|close`)
- `started_at`
- `completed_at`
- `status`
- `summary_text`
- `top_candidate`
- `best_contrarian_candidate`
- `top_five_json`
- `delta_summary_json`
- `metadata_json`

### Table: `wiim_run_candidates`
One row per candidate in a run.

Suggested fields:
- `id`
- `wiim_run_id`
- `rank`
- `ticker`
- `theme`
- `headline`
- `why_it_matters`
- `confidence_score`
- `candidate_type`
- `state_label` (`new|persistent|fading`)
- `signals_json`
- `source_refs_json`

### Table: `wiim_batch_jobs`
Track grouped scraping jobs.

Suggested fields:
- `id`
- `wiim_run_id`
- `batch_index`
- `ticker_count`
- `status`
- `started_at`
- `completed_at`
- `success_count`
- `failure_count`
- `error_json`

### Table: `wiim_finviz_evals`
Comparison layer against Finviz.

Suggested fields:
- `id`
- `wiim_run_id`
- `eval_scope`
- `overlap_score`
- `rank_alignment_score`
- `unique_wins_json`
- `misses_json`
- `false_positive_json`
- `notes`

---

## OpenClaw cron design

### Cron job 1: morning WIIM
- schedule: `45 7 * * 1-5`
- timezone: `America/Chicago`
- target: isolated agent turn
- prompt: run morning WIIM, store results, send top-5 summary

### Cron job 2: intraday WIIM
- schedule: `15 12 * * 1-5`
- timezone: `America/Chicago`
- target: isolated agent turn
- prompt: run intraday WIIM, compare to morning, only notify on meaningful change

### Optional cron job 3: close WIIM
- schedule: `50 15 * * 1-5`
- timezone: `America/Chicago`
- target: isolated agent turn
- prompt: finalize daily eval, compare against Finviz, prep next-cycle candidates

---

## OpenClaw delivery behavior

### Morning
Always send a short summary with 5 candidates.

### Intraday
Send only if meaningful change.

### Close
Optional summary or just stored artifact.

---

## Downstream automations (phase 2+)
When confidence is high enough:
- generate newsletter draft automatically
- generate chart package automatically
- send preview email automatically
- queue for review/approval

---

## Suggested execution phases

### Phase 1 — scheduling + storage
- define run contract
- add cron jobs
- write run artifacts to Supabase
- send morning top-5 summary

### Phase 2 — grouped scraping + delta logic
- add batched worker orchestration
- implement controlled concurrency
- add morning vs intraday comparison
- add selective intraday notifications

### Phase 3 — Finviz evals
- compare rankings vs Finviz
- store overlap/miss/win metrics
- build daily eval summaries

### Phase 4 — content automation
- trigger newsletter generation from strongest candidate
- trigger chart generation package
- add approval queue

### Phase 5 — learning loop
- track approval/rejection outcomes
- track which candidates became good newsletters
- track missed stories
- improve ranking logic over time

---

## Strong recommendations

1. **Cron-first, heartbeat-second**
   - cron runs the real jobs
   - heartbeat only watches health/failures

2. **Batch scraping, don’t explode concurrency**
   - grouped workers yes
   - unbounded parallel requests no

3. **Store raw + normalized + ranked outputs**
   - otherwise debugging gets ugly fast

4. **Morning output should be 5 candidates, not 1 winner only**

5. **Intraday should focus on deltas**
   - “what changed?” is the valuable part

6. **Use Finviz as benchmark, not oracle**
   - our WIIM should become its own product layer

---

## Open questions before implementation
- exact ticker universe size for morning runs?
- full universe every run, or prioritized subset + refresh strategy?
- what confidence threshold should trigger intraday alerts?
- should morning summary go by email, chat, or both?
- should newsletter generation auto-trigger or remain manual approval only?
- what existing Supabase tables should be reused vs created fresh?

---

## Recommended next implementation steps
1. inspect current WIIM scripts/routes/data flow in Fin-Quote
2. identify existing Supabase schema that can be reused
3. define run artifact JSON contract
4. implement coordinator entrypoint
5. implement grouped scrape worker contract
6. add Supabase persistence
7. add cron jobs
8. test morning flow end-to-end
