# Newsletter Local Worker CLI Plan

## Goal

Keep the **existing one-click newsletter UX** while moving the AI-generation step behind a **local CLI worker** boundary.

The user should still:

1. click `Generate`
2. wait
3. land in the normal newsletter editor with a finished draft

The visible product behavior should not change.

## Current Status

Implemented locally:

- `Generate` still uses the normal one-click UI
- newsletter creation/regeneration runs through the local CLI worker boundary
- the generation pipeline now has a separate model-backend layer
- default local model backend is `codex_cli`
- verified local runtime: Codex CLI via ChatGPT subscription

Still optional:

- keep `openai_api` available as a fallback model backend
- upgrade from the CLI worker to a localhost service later if queueing or warm state matters

---

## What We Are Actually Changing

Today, the newsletter flow goes:

- UI: `app/newsletter/editor/NewsletterDraftCreate.tsx`
- API route: `app/api/newsletter/drafts/route.ts`
- draft orchestration: `lib/newsletter/drafts.ts`
- AI generation: `lib/newsletter/orchestrate.ts`
- model calls: `openai.responses.create(...)`

The new design keeps the same outer flow, but changes the **AI execution layer**:

- UI still posts to `/api/newsletter/drafts`
- draft route still creates a draft
- chart rendering still happens inside the app
- draft storage still happens inside the app
- Beehiiv export still happens inside the app
- only the **AI generation step** moves behind a local CLI worker

---

## Target Architecture

### Existing behavior

`Generate` -> Next.js API route -> `generateNewsletter()` -> OpenAI API -> draft saved -> editor opens

### Target behavior

`Generate` -> Next.js API route -> local CLI worker -> normalized JSON -> draft saved -> editor opens

The CLI worker is **not** the whole newsletter pipeline.

It should only own:

- stock selection
- roundup selection
- intro / subject line generation
- chart template selection
- block copy generation

The app should continue to own:

- context fetching
- chart spec resolution
- chart capture
- draft persistence
- editor rendering
- Beehiiv export

That keeps the boundary narrow and lowers risk.

---

## Recommended Execution Boundary

The cleanest split is:

### App-side orchestration

Existing files to keep in charge:

- `app/api/newsletter/drafts/route.ts`
- `app/api/newsletter/drafts/[id]/regenerate-newsletter/route.ts`
- `lib/newsletter/drafts.ts`
- `lib/newsletter/resolve-chart.ts`
- `lib/newsletter/capture.ts`
- `lib/newsletter/assemble.ts`

### Local worker-side generation

New script:

- `scripts/generate-newsletter-local.ts`

Its contract:

- input: JSON payload from stdin or a temp file path
- output: JSON to stdout

The script should **not** save drafts directly.
It should only return structured generation output.

---

## Worker Input / Output Shape

### Input payload

The app passes the worker:

- `format`
- `ticker` when single-stock mode is explicit
- `roundupSize`
- `generationPrompt`
- minimal prepared context needed for generation

Prepared context should be assembled in the app from existing helpers like:

- `fetchMarketContext()`
- `fetchNewsletterContext()`
- `fetchTickerNews()`
- `fetchTodayQuote()`

This avoids duplicating data-access logic inside the worker unless we decide that is worth it later.

### Output payload

The worker should return normalized JSON like:

- `ticker`
- `format`
- `featuredTickers`
- `subjectLine`
- `introText`
- `editorialHook`
- `blocks[]`
  - `ticker`
  - `templateId`
  - `periodType`
  - `heading`
  - `body`
  - `caption`

The app then:

- validates template IDs
- resolves chart specs
- captures charts
- builds the draft document
- saves the draft

---

## Phase Plan

## Phase 1: Add a pluggable generation backend

Objective:
Create one clean switch so newsletter generation can use either the current API path or the future local worker path.

Files:

- `lib/newsletter/orchestrate.ts`
- `lib/newsletter/types.ts`

Changes:

- introduce a generation backend option, for example:
  - `openai_api`
  - `local_worker`
- move AI-specific execution behind a small interface
- keep the rest of `generateNewsletter()` intact

Reason:
We do not want draft creation routes branching all over the place.

---

## Phase 2: Create the CLI worker

Objective:
Add a local executable script that accepts prepared input and returns structured JSON.

New file:

- `scripts/generate-newsletter-local.ts`

Responsibilities:

- parse input
- call the generation backend implementation
- print JSON to stdout
- print errors to stderr
- exit non-zero on failure

Implementation note:

Use `tsx` so the worker can run TypeScript directly during local development.

Likely command shape:

```bash
npx tsx scripts/generate-newsletter-local.ts
```

---

## Phase 3: Add a server-side worker runner

Objective:
Make the Next.js backend launch the worker on demand.

Likely file:

- `lib/newsletter/local-worker.ts`

Responsibilities:

- run the script via `child_process.execFile` or `spawn`
- pass JSON input safely
- collect stdout
- enforce timeout
- parse JSON result
- surface clean errors

This layer is important because we do **not** want route handlers manually dealing with child-process details.

---

## Phase 4: Wire create flow to the worker

Objective:
Keep `Generate` one-click, but route the generation step through the local worker.

Files:

- `app/api/newsletter/drafts/route.ts`
- `lib/newsletter/drafts.ts`

Changes:

- draft create route still accepts the same request body
- `createNewsletterDraft()` uses the selected generation backend
- no new UI controls for local-vs-API on the screen

Result:

- user clicks `Generate`
- app runs worker behind the scenes
- user lands in the normal editor

---

## Phase 5: Wire regenerate flow to the worker

Objective:
Make the editor-side `Regenerate` button use the same backend.

Files:

- `app/api/newsletter/drafts/[id]/regenerate-newsletter/route.ts`
- `lib/newsletter/drafts.ts`

Changes:

- regenerate path reuses existing draft inputs
- local worker generates fresh structured output
- app rebuilds the draft as usual

This should happen **after** create flow is stable.

---

## Phase 6: Add validation and guardrails

Objective:
Prevent malformed worker output from breaking the editor.

Likely files:

- `lib/newsletter/orchestrate.ts`
- or a new helper like `lib/newsletter/worker-output.ts`

Validation rules:

- template IDs must be approved
- ticker values must be valid
- roundup must have 3-5 names
- block count must be valid for the selected format
- heading/body cannot be empty
- stock identity must appear in heading or body for roundup blocks

If validation fails:

- return a clean error
- do not save a partial draft

---

## File-by-File Implementation Map

### Files to create

1. `docs/NEWSLETTER_LOCAL_WORKER_CLI_PLAN.md`
   - this plan

2. `scripts/generate-newsletter-local.ts`
   - executable CLI worker

3. `lib/newsletter/local-worker.ts`
   - child-process wrapper used by the app

4. `lib/newsletter/generation-backend.ts`
   - optional small interface layer if `orchestrate.ts` gets too crowded

5. `lib/newsletter/__tests__/local-worker.test.ts`
   - worker-runner parsing / timeout / failure handling

### Files to modify

1. `lib/newsletter/orchestrate.ts`
   - add generation backend boundary

2. `lib/newsletter/types.ts`
   - add backend mode types if needed

3. `lib/newsletter/drafts.ts`
   - route create/regenerate through the selected backend

4. `app/api/newsletter/drafts/route.ts`
   - continue normal create flow, but use local backend behind the scenes

5. `app/api/newsletter/drafts/[id]/regenerate-newsletter/route.ts`
   - same as above for editor-side regeneration

6. `package.json`
   - add a dev command if we want a direct way to run the worker manually for debugging

---

## Environment / Configuration

Recommended new env variable:

```bash
NEWSLETTER_GENERATION_BACKEND=local_worker
```

Supported values:

- `openai_api`
- `local_worker`

Why:

- safe rollout
- easy fallback
- easy comparison while developing

Default recommendation during rollout:

- keep default as `openai_api`
- switch to `local_worker` only after the create path is stable

If the local path proves stable, then flip the default.

---

## Why CLI First

We are choosing CLI worker first instead of a persistent localhost service because:

- single-user workflow
- lower complexity
- no extra daemon lifecycle
- easier to debug
- app can launch it on demand

If we later need:

- lower latency
- queueing
- persistent warm state
- background jobs

then we can upgrade the worker into a local service.

---

## Error Handling Requirements

The worker runner must handle:

- timeout
- invalid JSON
- empty stdout
- stderr-only failures
- non-zero exit codes

UI behavior should remain simple:

- show a clean generation error
- keep the user on the create screen
- do not create a broken draft

---

## Testing Plan

### Unit tests

- worker output parsing
- timeout behavior
- invalid template rejection
- malformed JSON rejection

### Integration tests

- create single-stock draft through worker path
- create market-roundup draft through worker path
- regenerate existing draft through worker path

### Manual verification

1. single-stock generate
2. market-roundup generate
3. regenerate from editor
4. copy for Beehiiv still works
5. chart regeneration still works

---

## Recommended Rollout Order

1. add backend boundary
2. add CLI worker script
3. add worker runner
4. wire create flow
5. test single-stock
6. test market roundup
7. wire regenerate flow
8. switch default backend
9. swap the model backend from OpenAI to a local runtime

Do **not** start by changing the UI.
The whole point is to preserve the product behavior.

---

## Success Criteria

We are done when:

- `Generate` still looks like one click
- no prompt-paste UI exists
- draft creation works through the local worker
- chart generation still works
- regenerate works
- the app can fall back to API if needed

---

## Practical Caveat

This plan only solves the **execution boundary** cleanly.

It does **not** by itself solve where the worker gets AI output from.

That choice still has to be made:

- worker uses OpenAI API internally
- worker uses a local model/runtime
- worker uses another local AI backend

The architecture above works for any of those.

That is why this is the correct first step.

## What Actually Happened

The final implementation kept the CLI worker boundary and then moved the model layer inside `lib/newsletter/orchestrate.ts` to a separate helper:

- `lib/newsletter/model-client.ts`
- `lib/newsletter/codex-cli.ts`

That helper now supports:

- `NEWSLETTER_MODEL_BACKEND=openai_api`
- `NEWSLETTER_MODEL_BACKEND=ollama`
- `NEWSLETTER_MODEL_BACKEND=codex_cli`

The local worker still exists to preserve the execution boundary, but the worker now defaults to Codex CLI instead of the OpenAI API.
