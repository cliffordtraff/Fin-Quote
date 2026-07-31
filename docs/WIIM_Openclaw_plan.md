# WIIM Process and Handoff

This document explains how the current WIIM workflow works in `Fin-Quote`, what we changed, why we changed it, where it is still weak, and what the next coding agent should improve.

The audience is another coding agent or engineer who needs the full picture fast.

---

## 1. What WIIM is trying to do

WIIM here means a **"Why Is It Moving?"** workflow for S&P 500 stocks.

The goal is not just to list movers.
The goal is to identify the **best newsletter-worthy stock stories** by combining:

- market movement
- recent news
- earnings context
- prior recent picks
- Finviz "why moving" catalyst text

In plain English:

1. find candidate S&P 500 names
2. fetch or reuse catalyst context
3. rank them
4. produce a top-5 brief
5. store the run for comparison/evaluation

---

## 2. Current architecture

### Main scripts

- `scripts/warm-wiim-cache.ts`
  - warms Finviz-based "why moving" cache
- `scripts/run-wiim-brief.ts`
  - runs the WIIM brief and outputs JSON/text

### Main libraries

- `lib/stock-why-moving.ts`
  - fetches and parses Finviz quote pages
  - reads/writes cache in Supabase
- `lib/wiim/fetch-candidates.ts`
  - builds the WIIM candidate universe
- `lib/wiim/rank.ts`
  - scores and ranks candidates
- `lib/wiim/format.ts`
  - formats the brief text
- `lib/wiim/store.ts`
  - stores runs/candidates in Supabase
- `lib/newsletter/fetch-context.ts`
  - provides market candidate + news + earnings inputs
- `lib/sp500.ts`
  - S&P 500 symbol normalization / filtering

### Package scripts

Added / used:

- `npm run wiim:warm`
- `npm run wiim:brief`

---

## 3. The intended WIIM flow

### Step A: Warm the Finviz cache

Command:

```bash
npm run wiim:warm -- --all-sp500 --concurrency 4 --batch-size 5 --per-symbol-pause-ms 150 --jitter-ms 75
```

Purpose:

- go through a universe of symbols
- fetch Finviz quote pages
- extract the embedded "why moving" payload when present
- classify each symbol as:
  - `found`
  - `not_found`
  - `error`
- write results to `stock_why_moving_cache`

Why this exists:

The ranking step is much better if the catalyst layer is loaded **before** the brief runs.
Otherwise the brief is making decisions with partial or stale context.

### Step B: Run the brief

Command:

```bash
npm run wiim:brief -- --run-type morning --json
```

Purpose:

- fetch candidate names from the market context
- attach cached Finviz catalyst context when available
- rank top names
- produce a brief
- optionally compare against latest stored run
- store run data in Supabase

### Step C: Send via cron

Current cron jobs use this general pattern:

1. warm cache first
2. run brief second
3. send concise summary

Jobs updated:

- WIIM Morning Brief
- WIIM Midday Refresh
- WIIM Close Summary

---

## 4. Why cache warming exists

"Warm the cache" means:

- fetch Finviz pages ahead of the ranking run
- extract/store the explanation layer early
- avoid doing all of that inline during the brief

Why this is useful:

- faster brief generation
- more consistent ranking input
- less likely to miss catalysts on names outside the tiny top-mover list
- better repeatability across morning/midday/close runs

Without warming:

- a stock may have a huge move
- but the system may have no catalyst text yet
- so ranking is blinder and more random

With warming:

- the stock can be scored with catalyst text already attached
- the top-5 becomes more editorially useful

---

## 5. What changed during this work

### 5.1 Expanded warm script scope

Originally the warmer mainly supported a narrow candidate subset.
We expanded it to support:

- `--symbols AAPL,NVDA,...`
  - targeted tests
- `--all-sp500`
  - full S&P 500 warming

This was added in `scripts/warm-wiim-cache.ts`.

### 5.2 Added npm shortcuts

Added to `package.json`:

- `wiim:warm`
- `wiim:brief`

### 5.3 Updated cron prompts

Cron payloads were updated so the production WIIM runs now warm the **full S&P 500** first instead of only a tiny subset.

### 5.4 Added retries and improved quote-page classification

The Finviz scraper in `lib/stock-why-moving.ts` was hardened to:

- retry ambiguous failures
- better recognize a **normal Finviz quote page with no catalyst payload**
- avoid mislabeling those pages as parser failures

### 5.5 Added parse-failure debug capture

Added support for writing debug artifacts for true parse failures via:

- environment variable: `FINVIZ_DEBUG_DIR`
- CLI argument in the warm script:

```bash
--debug-dir /tmp/finviz-debug
```

When enabled, true parse failures write:

- `.json` metadata file
- `.html` raw page file

This is for inspecting real leftovers instead of guessing.

---

## 6. What was broken / confusing

The main confusion was this:

We initially saw a ton of `Could not parse Finviz quote page` errors during full-universe warming.
That looked like Finviz was broadly breaking the scraper.

But after inspection, many of those were **not real parser failures**.

### What was actually happening

A lot of Finviz pages were:

- valid quote pages
- returned with status 200
- contained normal quote-page HTML
- **did not contain the embedded `why-stock-moving-init-data-*` payload**

That should mean:

- `status = not_found`

But our code was often classifying those as:

- `status = error`
- `errorMessage = Could not parse Finviz quote page`

### Root cause

The old "is this a normal Finviz quote page?" detection logic was too brittle.
It relied on page markers that no longer appeared consistently, including checks around `quote.ashx`-style assumptions.

So the scraper lied to us.
Not maliciously. Just incompetently.

---

## 7. What we learned from real tests

### Small smoke test

We ran:

```bash
npm run wiim:warm -- --symbols AAPL,NVDA --concurrency 1 --batch-size 1 --per-symbol-pause-ms 100 --jitter-ms 0
```

Result:

- both succeeded

### Full-universe dry run

We ran:

```bash
npm run wiim:warm -- --all-sp500 --dry-run --concurrency 4 --batch-size 25
```

Result:

- the symbol expansion / batching logic worked
- no live Finviz writes during that run

### Full-universe real run: earlier state

One full run produced roughly:

- 503 attempted
- 150 found
- 0 not_found
- 353 error

This was obviously suspicious.
It implied the classifier was wrong.

### After classifier improvement

A later full run produced:

- 503 attempted
- 148 found
- 15 not_found
- 340 error

### After additional hardening / retry logic

A later full run produced:

- 503 attempted
- 153 found
- 32 not_found
- 318 error

So the direction improved, but not enough.

### Focused debug-style sample from the "bad" bucket

We ran this targeted set:

```bash
npm run wiim:warm -- --symbols NDAQ,NTRS,NWSA,ORLY,OTIS,OXY,PANW,PAYC,PCG,PEG --concurrency 2 --batch-size 2 --per-symbol-pause-ms 150 --jitter-ms 0 --debug-dir /tmp/finviz-debug
```

Result:

- 2 found
- 8 not_found
- 0 error

This is the key clue.

It means many symbols that looked "broken" in aggressive bulk runs are **not structurally broken**.
They often resolve fine when fetched under gentler conditions.

---

## 8. Current best interpretation

The problem is now probably a mix of:

1. **real pages with no catalyst payload**
   - should be `not_found`
2. **real pages with catalyst payload**
   - should be `found`
3. **bulk-run instability / transient page variants**
   - likely caused by more aggressive concurrency / timing
4. **some genuine remaining parser misses**
   - but likely a smaller bucket than we first thought

The important change in understanding is:

> This no longer looks like "Finviz is simply broken."
> It looks like the current scraper is partly fixed, and the remaining failures are increasingly operational / transient.

---

## 9. Current process we are using

### For smoke tests

Use explicit symbols:

```bash
npm run wiim:warm -- --symbols AAPL,NVDA
```

### For aggressive full coverage

```bash
npm run wiim:warm -- --all-sp500 --concurrency 4 --batch-size 5 --per-symbol-pause-ms 150 --jitter-ms 75
```

### For focused failure inspection

```bash
npm run wiim:warm -- --symbols NDAQ,NTRS,NWSA,ORLY,OTIS,OXY,PANW,PAYC,PCG,PEG --concurrency 2 --batch-size 2 --per-symbol-pause-ms 150 --jitter-ms 0 --debug-dir /tmp/finviz-debug
```

### For running the brief

```bash
npm run wiim:brief -- --run-type morning --json
```

---

## 10. Why we changed cron to full S&P 500 warming

Before this work, the WIIM warm step only covered a much smaller subset.
That caused obvious blind spots.

Example failure mode:

- a real story exists on an S&P 500 name
- it is not in the preloaded subset
- Finviz catalyst is missing from the brief
- ranking quality drops

The full-universe warm was introduced because it is the cleanest way to stop ranking from depending on luck.

Even if it is brute-force, it gives coverage.
Coverage first, optimization second.

That said, the current full-universe approach is still too blunt.

---

## 11. Weaknesses in the current process

### 11.1 Bulk runs are still too error-prone

Even after fixes, error counts are too high for comfort in the aggressive full-universe run.

### 11.2 We are probably scraping too aggressively

Current production-style settings:

- concurrency 4
- batch size 5
- 150ms pause + 75ms jitter

That may still be too pushy for Finviz page consistency.

### 11.3 We still brute-force too much

We are refreshing everything too aggressively instead of reusing fresh rows when safe.

### 11.4 Debugging at scale is still incomplete

Debug capture exists now, but we still need a cleaner way to summarize the residual failure bucket automatically.

---

## 12. What the next coding agent should improve

This is the actual handoff list.

### Priority 1: Prove whether gentler bulk settings fix most failures

Run controlled experiments with slower settings and compare full-run counts.

Suggested experiments:

#### Profile A
```bash
npm run wiim:warm -- --all-sp500 --concurrency 2 --batch-size 2 --per-symbol-pause-ms 250 --jitter-ms 100
```

#### Profile B
```bash
npm run wiim:warm -- --all-sp500 --concurrency 2 --batch-size 3 --per-symbol-pause-ms 300 --jitter-ms 150
```

#### Profile C
```bash
npm run wiim:warm -- --all-sp500 --concurrency 1 --batch-size 1 --per-symbol-pause-ms 200 --jitter-ms 50
```

Goal:

- compare `found / not_found / error`
- identify if errors collapse under gentler conditions

If they do, the main problem is operational.

### Priority 2: Add structured run comparison output

Create a script or report that compares warm runs by profile:

- total attempted
- found
- not_found
- error
- runtime
- error rate
- maybe repeated offenders

This will make tuning less hand-wavy.

### Priority 3: Add freshness-aware skipping

Right now we can still brute-force too much.
Add a mode that skips refetching symbols whose cache is still fresh.

Suggested policy:

- `found` rows can be reused longer
- `not_found` rows can be retried sooner
- `error` rows can be retried sooner still

This should reduce Finviz pressure and improve stability.

### Priority 4: Add second-pass retry for only bulk-run failures

Potential pattern:

1. run full universe once
2. collect `error` symbols only
3. rerun those with gentler settings
4. merge improved results

This may be much better than making the first pass extremely slow.

### Priority 5: Improve debug summarization

If `--debug-dir` is used, add a helper script to summarize debug captures by pattern:

- has script / no script
- has Cloudflare markers
- has quote title
- truncated HTML length bands
- etc.

This would make remaining edge-case classification much faster.

### Priority 6: Consider splitting warming modes by time of day

Possible production design:

- **Morning:** broader / heavier warm
- **Midday:** refresh movers + earnings + stale names
- **Close:** refresh only changed names + stale names

That would reduce unnecessary load.

---

## 13. Suggested improved production strategy

If the gentler experiments confirm better behavior, a smarter production path is probably:

### Option A: Two-pass strategy

1. pass 1: broad but moderate full-universe warm
2. pass 2: retry only failures with slower settings
3. run WIIM brief

### Option B: Freshness-aware selective strategy

1. reuse fresh `found` rows
2. refresh stale rows
3. prioritize:
   - large movers
   - earnings names
   - names in candidate universe
   - previous bulk errors

This is probably where the system should end up.

---

## 14. Files most relevant to this work

### Core runtime files

- `scripts/warm-wiim-cache.ts`
- `scripts/run-wiim-brief.ts`
- `lib/stock-why-moving.ts`
- `lib/wiim/fetch-candidates.ts`
- `lib/wiim/rank.ts`
- `lib/wiim/format.ts`
- `lib/wiim/store.ts`
- `lib/newsletter/fetch-context.ts`
- `lib/sp500.ts`

### Test file

- `lib/__tests__/stock-why-moving.test.ts`

### Useful cron context

The cron payloads were changed externally through OpenClaw cron configuration, but the effective runtime commands are the ones documented above.

---

## 15. Plain-English summary

We built a WIIM pipeline that warms Finviz catalyst data, ranks S&P 500 candidates, and produces top-5 newsletter ideas.

The major discovery from this round of work is that many scary Finviz "parse errors" were fake and caused by our own brittle classification logic; after fixing that, the remaining problem looks much more like **bulk-run instability under aggressive scraping settings** than total parser failure.

So the next agent should focus less on random regex hacking and more on:

- gentler full-universe run experiments
- structured run comparison
- freshness-aware skipping
- second-pass retries for bulk failures
- better debug summaries

That is the real path from "working prototype" to "production-worthy process."

---

## 16. Suggested prompt for Claude Code

If you want to hand this to Claude Code directly, use something like:

```text
Read docs/WIIM_PROCESS_AND_HANDOFF.md and improve the WIIM Finviz warming process.

Goals:
1. Reduce bulk-run error rate materially.
2. Add structured comparison for different warm profiles.
3. Add freshness-aware skipping so we do not brute-force all 500 names every run.
4. Add a second-pass retry path for first-pass bulk errors.
5. Improve debug reporting for true parse failures.

Please make changes in small, reviewable steps and leave the repo in a runnable state.
```

---

## 17. Opinionated conclusion

The current system is no longer a mystery, which is good.
It is also not done, which is fine.

Right now it is a **promising but still somewhat brute-force WIIM pipeline** that has enough instrumentation to improve intelligently.
That is a much better place to be than this morning.
ford@Fords-Mac-mini ~ %