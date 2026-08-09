# The Intraday Current Roadmap

Last audited: August 9, 2026

This is the canonical product and engineering roadmap for The Intraday (the
repository still carries its original Fin Quote name). Older plan files remain
useful as implementation history, but they do not override this document.

## Product Direction

The Intraday is a daily market-research and publishing workstation. Its core loop
is:

1. Let the weekday automation build and verify the Morning Report.
2. Review the strongest stories, sources, copy, and charts.
3. Create or synchronize the selected issues with Beehiiv.
4. Schedule and publish in Beehiiv while Fin Quote records the lifecycle and
   delivery evidence.
5. Use Pulse Today and the Mid-Morning Brief to track what changed after the
   open.

## Canonical Product Surfaces

| Priority | Surface | Route | Role |
|---|---|---|---|
| 1 | Morning Report | `/newsletter/morning-review` | Daily issue review, shortlist, and Beehiiv delivery |
| 2 | Newsletter Operations | `/newsletter/operations` | Pipeline health, reconciliation, alerts, and delivery evidence |
| 3 | Pulse Today | `/dashboard/pulse-today` | Primary live market cockpit |
| 4 | Mid-Morning Brief | `/dashboard/mid-morning-brief` | Opening-session delta from the morning baseline |
| 5 | Catalyst review | `/admin/why-moved` | Editorial QA for top-mover explanations |
| 6 | Newsletter editor | `/newsletter/editor` | Draft, review, export, and publish workflow |
| 7 | Stock and workspace views | `/stock/[symbol]`, `/workspace/*` | Research, catalyst history, and chart drilldown |
| 8 | Catalyst Calendar | `/calendar` | Weekly earnings and economic planning with global sessions |
| 9 | Newsletter chart library | `/newsletter/charts` | Reusable captured charts and editable specs |
| 10 | Market Overview | `/dashboard` | Broader market context and supporting data |

## August 6 Production Evidence

The first complete unattended morning batch is no longer hypothetical:

- the weekday automation produced **40 ready issues out of 40**, with their
  distinct public charts intact;
- a one-subscriber Beehiiv canary was created, synchronized without producing
  a duplicate, scheduled, published, and delivered;
- Gmail reported SPF, DKIM, and DMARC as passing for the delivered message;
- that first message initially landed in Spam, so provider delivery is proven
  but broad inbox placement is not. The sending identity is still warming;
- `theintraday.com` is verified in Google Postmaster Tools so reputation can be
  monitored instead of guessed at;
- the Charting Platform mobile and accessibility repair in PR #2 is merged and
  deployed, `charts.theintraday.com` has repaired DNS/custom-domain routing,
  and its health endpoint returns `200`; and
- the stale automated Fin Quote security PR was closed after confirming the
  actual baseline is Next.js 15.5.22 and React 19.2.1 with no production
  dependency vulnerabilities reported by `npm audit --omit=dev`.

These checks establish the complete path from unattended generation through
one real mailbox. They do not establish inbox placement at scale; that needs a
gradual sending history and Postmaster evidence.

## August 6 Release Completed

The August 6 production release added the next reliability layer:

- atomic, leased Beehiiv sync claims so two requests cannot create the same
  post concurrently;
- durable create/update states and recovery markers, including a fail-safe for
  an ambiguous remote create result;
- lease-fenced lifecycle reconciliation, side-effect idempotency, recently
  published post statistics, and a signed-in **Reconcile now** action;
- date-scoped operations metrics, lifetime totals, latency/freshness signals,
  and webhook-outbox health;
- a transactional webhook outbox with small leases, stable event IDs,
  HMAC-SHA256 signatures, bounded exponential retries, and an admin canary;
  and
- a migration-ledger convergence package that restores remote history, adopts
  existing live tables, and applies the genuinely missing review/cache
  security changes.

The package passed the full Vitest suite, TypeScript, ESLint with no errors, a
production Next.js build, the production dependency audit, a clean local
Supabase replay, database lint, and an empty local schema diff. The reliability
release first brought the production ledger through 89 migrations ending at
`20260806142000`; the authorization release below subsequently brought it
through migration 90, `20260806143000`. Both follow-up push dry runs were empty.
The application was promoted and its matching authorization boundary was then
independently verified, protected cron calls were exercised through the
Vault-signed path, and all five schedules were active.

No `NEWSLETTER_ALERT_WEBHOOK_URL` is configured in production. In-app
notifications remain useful without it; the outbox intentionally performs no
network delivery until a real receiver and dedicated signing secret are set.

## August 6 P0 Authorization And Trust Hardening — Released

The production release closes a set of historical trust gaps that mattered more
than adding another feature:

- the Supabase Data API now has an explicit role matrix: public market data is
  read-only, signed-in user data is owner-scoped, operational and evaluation
  data is service-only, and new database objects start private;
- anonymous access to query history and internal WIIM, ranking, ingestion, and
  newsletter-selection records is removed;
- query telemetry is written only by trusted server code; signed-in users can
  read/delete their own history and update only its feedback fields, while raw
  filing chunks and embeddings are no longer directly public;
- owner-facing policies explicitly target `authenticated`, while ingestion and
  cache mutation explicitly target `service_role`;
- database functions no longer inherit broad execution rights. Conversation
  title generation is an invoker-rights helper with an ownership check, and
  mutating/search RPCs are restricted to the server role;
- supported ingestion commands now require
  `SUPABASE_SERVICE_ROLE_KEY` and fail closed instead of quietly writing with
  the public anonymous key;
- admin review, annotation, validation, and cost actions authenticate an
  administrator before constructing their service-role database client;
- browser writes to the `filings` and `newsletter-charts` Storage buckets are
  denied by the Storage RLS policy set; and
- the public schema-debug page and its mutation helpers are gone. The Market
  Internals experiment no longer displays randomly generated financial history,
  is removed from navigation, and now explains that verified breadth data is
  required before the feature returns.

The contract is backed by pgTAP role, policy, function, ownership, and effective
Storage-DML checks, plus focused tests for admin authorization order,
service-role-only scripts, and the retired placeholder surface. The release
passed 696 Vitest checks and 120 database assertions, TypeScript, ESLint with no
errors, a production build, a clean local migration replay, database lint, and
an empty schema diff.

Production promotion is also verified rather than inferred. Vercel deployment
`dpl_7Xp2amJdaRFr2p6166J7oaYNdd5j` serves merge commit `cc36eab`; the canonical
Market Internals route presents the honest unavailable state, the retired
`/test-schema` route returns `404`, and the dashboard no longer links to that
experiment. The linked Supabase ledger contains migration 90 and a second dry
run reports no pending work. Live anonymous-client probes proved that the
intentional public company read still returns `200`, while query history, raw
filing chunks, query-log insertion, and the privileged cash-update RPC are
rejected with PostgreSQL permission errors. A valid PNG upload to the
`newsletter-charts` bucket is rejected by Storage with `AccessDenied`.

The post-release newsletter health check remained green: daily and mid-morning
generation last succeeded, Beehiiv reconciliation was current and successful,
and the only warning was the intentionally disabled optional webhook receiver.
No runtime errors were present in the promoted deployment's release-window
error log. These checks prove the intended live boundary; they do not prove
that the historically broader boundary was ever exploited, and no such claim
is being made.

## August 6 Whole-Product UI Audit — Completed

All thirteen primary navigation destinations were reviewed at desktop and
narrow-phone widths. The resulting remediation addressed the highest-impact
shared problem and the weakest individual surface:

- the global header now groups destinations into Briefings, Markets, Company,
  and Newsletter, keeps Pulse prominent, preserves ticker context, and uses a
  purpose-built mobile Browse panel;
- navigation, timezone, and account menus now expose state, close predictably,
  return focus, and use one shared utilities island;
- Pulse Today has a clearer live hierarchy, honest stale/loading/error states,
  a mobile-safe live-detail chart, two purposeful replay views, responsive
  canvases, stable accessible controls, and reduced-motion behavior;
- replay now uses the actual historical previous close, defaults to the latest
  completed session and selected mover, uses an available Massive key for
  second-level candles without changing the app-wide data provider, avoids
  permanently caching empty history, supports correlation-
  aware retry (with incomplete responses left uncached), batches
  playback through 100x, and suspends live resources
  while replay owns the screen;
- Insiders uses mobile cards without sacrificing the semantic desktop table,
  and its tabs, request races, loading, failure, and retry states are explicit;
- Financial Statements has responsive controls, contained table scrolling,
  complete year discovery, real tabs/tab panels, keyboard navigation, captions,
  and row/column headers;
- the stock price header remains visible below the two-row responsive nav; and
- Profile no longer presents sign-out as fake account deletion.

“Completed” here describes this audit and its remediation scope. It does not
mean every product surface is permanently perfect, that FMP can provide true
second-level replay, that a full account-erasure workflow exists, or that one
delivered email proves inbox placement at scale.

## August 7 Newsletter Archive And Editor Scale — Locally Complete, Release Pending

The archive and editor scalability package is implemented and verified in the
local repository:

- the archive now reads denormalized summary columns instead of transferring
  every issue's full `draft_json`, serves 25-item cursor pages ordered by the
  stable `(generated_at, id)` pair without truncating PostgreSQL microseconds,
  and exposes URL-backed search,
  status/ticker/date/archive filters, matching facet counts, useful empty and
  failure states, stale-request cancellation, UTC-labelled issue dates, and
  bounded rendering work;
- downstream consumers that need only draft identity or status use scoped,
  100-key summary lookups rather than loading the whole archive;
- archive and restore are reversible operations, never disguised deletion.
  The bulk boundary accepts at most 100 drafts, checks every selected
  `updated_at` version, changes the set transactionally, records one durable
  event receipt per draft, and makes an exact retry idempotent. A stale,
  out-of-scope, duplicate, or partially receipted set fails as a whole;
- editor state is explicit: Saved, Unsaved, Saving, Conflict, or Published.
  Freshness checks run on focus, visibility return, and a 60-second interval;
  unsaved navigation is guarded; stale saves return the latest server version;
  local work can be reloaded or forked; and published content is read-only;
- every usable chart now carries the immutable image identity and the exact
  materialized scene, capture time, renderer contract, interactive URL, and
  scene hash. Missing, legacy, or tampered provenance blocks readiness instead
  of silently rebuilding a different chart from today's defaults;
- slow or broken chart iframes and thumbnails now have visible timeout,
  failure, retry, and exact-chart escape paths; and
- the Beehiiv panel presents draft, scheduled, published, and archived state
  with lifecycle dates, reconciliation freshness, errors, and manual refresh.
  Scheduled, published, and archived issues cannot be synchronized again, and
  publication recording uses the same draft-version check as editing. Each
  sync receipt records the exact draft version whose bytes crossed the remote
  boundary; a concurrent save leaves the older receipt visibly stale, while
  legacy receipts without that evidence require one safe resync. Remote
  timeouts stay ambiguity-fenced, receipt persistence is lease-atomic, and
  manual publication cannot race an in-flight or recoverable sync.

The migration keeps deployment overlap safe. Database triggers derive every
archive summary field from `draft_json` for both old and new writers, and
pre-provenance chart writes remain valid while being labelled legacy and
therefore requiring recapture. Drafts, chart evidence, and the event receipt
ledger remain browser-readable through owner RLS but are writable only through
the server/service-role paths.

Local database evidence includes a clean migration replay, 35 focused archive
pgTAP assertions, 36 focused Beehiiv source-version assertions, all 191 database
assertions, database lint at error level, an empty schema diff, and a
two-session idempotency race drill. Focused
application regressions exercise a 257-issue archive, the 100-item bulk cap,
slow-save edits, structured conflicts and forks, published read-only behavior,
broken chart assets, exact provenance, and Beehiiv lifecycle state.
The final application gate passes all 159 test files and 882 tests, TypeScript,
zero-warning ESLint across every changed code file, and a production build that
generates all 47 static pages. A clean desktop/mobile browser pass created and
saved a real local issue, exercised URL search, the chart-library focus trap,
archive, and restore, reported no console warnings or errors, and removed its
test artifact afterward.

This is not a production-release claim. Migrations
`20260807090000_scale_newsletter_archive.sql` and
`20260807100000_track_beehiiv_sync_source_version.sql` have not been applied to
the linked Supabase project, and the matching application code has not been
promoted. The required order is explicit: apply `20260807090000`, then
`20260807100000`; verify the production ledger, schema, privileges, and RPCs;
then promote the application and run the smoke tests. Compatibility triggers
and the versioned Beehiiv claim RPC keep the old application valid during that
overlap; the new application must not be promoted first.

## August 8–9 Durable Workstation And Bounded Data Pass — Locally Complete, Release Pending

The follow-on audit addressed the largest holes beyond a single newsletter
editor session:

- Why Moved now has a durable editorial inbox. Morning automation persists
  immutable discovery-time candidate and catalyst evidence; pending work no
  longer disappears when a symbol falls off the current mover list. The inbox
  has stable cursor paging, filters, global status facets, first/last-seen
  timestamps, freshness context, explicit capture, and max-100 transactional
  CAS bulk transitions with durable idempotency receipts. Approval remains an
  individual evidence decision;
- Live Dashboard polling now calls a gainers/losers-only snapshot. The measured
  request path fell from 13 loaders to 2 and the representative payload from
  5,100 bytes to 394 bytes. Its movers, OHLC, and quote loops are serialized,
  abortable, visibility-aware leases rather than overlapping intervals: symbol,
  timeframe, focus, replay, and streaming transitions fence late responses,
  clear mislabeled old prices, and preserve an explicitly selected loser;
- the public intraday and quote paths now have bounded live-data semantics.
  Intraday candles use a 100-entry LRU, a 100-key pending cap, same-key
  coalescing, a 12-second shared deadline, completion-time TTLs, strict interval
  and payload validation, and no browser/CDN reuse. Live quotes opt out of the
  providers' historical caches, propagate cancellation through Massive/FMP
  index and futures fallbacks, distinguish an authoritative missing quote from
  a transient failure, and use a four-second bounded single-flight cache and
  CDN window. Raw provider symbols and front-month contract families are
  validated before aliases are applied or the one-hour resolver cache is
  written; missing zero-price payloads fail closed while legitimate negative
  commodity prices remain valid;
- Market Overview now preserves the provenance of each refresh instead of
  stamping one receipt time across the page. Fast, slow, and initial global
  data have separate capture clocks; failed fields are omitted, successful
  empties remain authoritative, last-known-good slow sections retain their
  original timestamp, and older responses cannot overwrite newer state or
  clear a warning. The old combined snapshot endpoint is retired in favor of
  the bounded `/fast`, `/slow`, and `/live-movers` contracts;
- stock pages distinguish an authoritative missing symbol from registry
  unavailability. Validation and outage-confirmation leases cap physical work,
  provider fan-out waits for admission, derivatives cannot enter the stock
  surface, and class-share aliases such as `BRK.B`/`BRK-B` are verified at the
  database and provider boundaries. Stock search now has alias-aware strict
  result validation, explicit degraded fallback semantics, a bounded shared
  admission layer, and a real browser deadline; `/api/search-tickers` is
  retired in favor of `/api/search-stocks`;
- Pulse opens live SSE before history, validates exact-symbol coherent candles,
  and merges late backfill below newer stream data. Hidden, focus, symbol, and
  unmount transitions fence whole sessions. Backfill uses exact epoch windows,
  client/server deadlines, same-key coalescing, a 16-job physical cap, and
  retains timed-out abort-ignoring work until actual settlement;
- stock research now exposes a nonblocking Catalyst History built from the
  summaries the daily workflow already stores. The reader is capped at 48
  source rows and ten market dates, validates current-config evidence and safe
  sources, and keeps `ready`, `empty`, and `unavailable` distinct. Morning
  Review ticker links land on the history timeline;
- `/calendar` is now a true New York-week Catalyst Calendar above the preserved
  global sessions view. Both feeds share one reference instant, convert
  BMO/market-hours/AMC times across EST and EDT, reject malformed/nonexistent
  wall times, bound provider bytes/rows/time, disclose 100-item truncation, and
  preserve the healthy feed when its sibling fails;
- Newsletter Operations no longer scans as many as 10,000 Beehiiv deliveries
  and full draft documents every 15 seconds. It queries indexed current-date
  draft IDs, filters delivery hydration to those IDs, computes lifetime facets
  with count-only queries, aborts stale polls, and fails closed rather than
  displaying partial current-day totals. Its read-only server function is now
  isolated from automation and chart-generation code: the production trace
  fell from 1,001 files / about 25.7 MiB to 57 files / 1.294 MiB, while the
  heavy mutation path lives behind a separate authenticated action route;
- a trigger-owned `source_market_date` separates the issue's editorial business
  date from its generation timestamp, so a next-day retry remains attached to
  the session it describes;
- the interactive chart library uses a summary-only, search-capable keyset API
  and bounded rendering, while automation retains its existing complete
  chart-spec contract;
- Massive aggregate pagination is bounded, authenticated, same-origin, and
  complete-or-error. Second-level stream backfill now requires a capable
  provider instead of returning a plausible empty success through FMP;
- SSE subscription setup reserves capacity before the response, cleans up
  exactly once across abort/cancel/error paths, caps ticker/listener state, and
  evicts idle broker entries;
- Chart of the Day renders are globally fenced in PostgreSQL, uploaded once as
  immutable content-addressed assets, and served by redirect. Renderer targets
  no longer depend on caller Host, responses have timeout/type/streaming-byte/
  pixel bounds, and public requests cannot multiply cache keys or render work;
- evaluation artifacts and annotations require admin access. Annotation writes
  use durable per-question CAS and a serialized client queue instead of a
  deployment-local whole-file overwrite; and
- dashboard commentary now fails its cron request when incomplete and has an
  independent production watchdog. CI runs a production build and rejects
  server traces containing local credentials or newsletter artifacts;
- the public Morning Report fallback now crosses an explicit allowlist. It
  exposes editorial display fields and a published-only safe Beehiiv URL, but
  never owner/run/draft/chart/provider IDs, editor or preview URLs, raw errors,
  retry state, private metadata, or internal timestamps. An unsigned session
  cookie is never treated as ownership in production, and anonymous failures
  return a generic no-store response; and
- the public home page no longer imports the newsletter command engine to read
  one completion flag. Its production trace fell from 1,009 files / 25.81 MiB
  to 72 files / 1.997 MiB, with TypeScript, Puppeteer, local datasets, scripts,
  tests, and newsletter-generation modules excluded by a fail-closed CI budget.
- Morning Review polling now has the same physical read/command boundary. Its
  GET function fell from 998 files / 26.45 MiB to 56 files / 1.27 MiB, while
  generation remains behind the authenticated action route. The client runs
  one abortable, visibility-aware polling cycle at a time, discovers a run that
  did not exist at page load, and prevents a late passive response from
  replacing a manual action or newer notification state; and
- the recommended Morning Report shortlist is now durable editorial decision
  memory rather than a recomputed five-row view. Every accepted or overridden
  shortlist is an append-only revision tied to the exact algorithm version,
  presented catalog, selected evidence, human intent, structured reason, and
  immutable item snapshot. Transactional CAS, command hashing, idempotency
  receipts, exact scope checks, and locked run/item/draft/delivery evidence make
  retries safe without freezing automation. The editor records only the item a
  human actually moved—not every row mechanically displaced around it—and
  renders the exact run snapshot whose evidence token it will save.
- the Why Moved admin surface now has physical read/command boundaries instead
  of importing newsletter capture into the page function. Its production trace
  fell from 1,004 files / 28,642,682 bytes to 61 files / 1,543,548 bytes; routine
  save, bulk, preview, and capture endpoints remain similarly small, while the
  994-file chart/newsletter graph is confined to explicit approval. Independent
  provider, global-facet, inbox, and draft-link reads begin as soon as their
  inputs exist, and CI fails closed if the page regains an action, generation,
  Puppeteer, TypeScript, dataset, script, or local-artifact dependency.
- Newsletter History and the issue editor now scale without sacrificing
  recovery. Summary-only keyset pages, explicit loading failures, atomic
  max-100 archive/restore, structured stale-write conflicts, and durable
  exactly-once fork receipts replace full-document scans and ambiguous retry
  behavior. Fork input is streamed and bounded before validation; exact
  replays resolve before mutable source state, while changed-key reuse and a
  deleted replay target fail closed. Publication URL edits, chart-picker
  conflicts, cross-tab refreshes, and morning-shortlist rollover all preserve
  the user's exact unsaved attempt;
- newsletter chart POSTs now have a strict idempotency contract, bounded JSON,
  coalesced in-flight work, bounded diagnostics, and caller-independent
  cancellation. Production admission is PostgreSQL-authoritative across
  isolates: service-role-only fenced RPCs enforce two active jobs per owner,
  four globally, and twelve new keys per ten minutes. An eight-second acquire
  deadline precedes a 55-second logical render budget; fresh eight-second
  completion/failure signals, Next `after()`, a 120-second route maximum, and a
  fixed 180-second lease let a disconnected caller stop waiting without losing
  a real late success. Deterministic owner/key chart IDs and a unique hashed
  request link recover committed-but-lost inserts without a duplicate. A new
  anonymous development session receives a cookie-bearing `428` before any side
  effect, replay receipts are bounded and validated, and admission state is
  cleaned under an explicit 24-hour policy; and
- the final React/accessibility review made asynchronous state observable and
  destructive flows keyboard-complete: labelled controls, alerts and polite
  status regions, mutually exclusive overlays, focus containment, inert
  backgrounds, failure messages inside active dialogs, and stable fallback
  focus after a successful archive or deletion.

This package is now deployed. PR #16 merged as `fc27eca`, and its nine linked
migrations from `20260807090000` through `20260809100000` were applied in
chronological order before application promotion. PR #17 (`b2cd84b`) then
added and applied `20260809120000` so historical deliveries belonging to an
explicitly disconnected Beehiiv integration no longer poison reconciliation
health. The rows were preserved; reconnecting Beehiiv makes them eligible
again. PRs #18 (`2a53efc`) and #19 (`7faff05`) closed the two blocking
catalyst-feed production errors discovered by log verification.

Final production verification is green on the settled head:

- local and linked migration ledgers align through `20260809120000`, the
  second push dry run is empty, and the final hosted database gate passed 11
  pgTAP files / 372 assertions;
- the final hosted application gate passed 250 Vitest files / 1,646 tests,
  TypeScript, repository lint with 0 errors (166 non-blocking warnings), and
  the pinned staged-tree secret scan;
- the production Next.js build generated all 49 static-page units and the
  deployment guard accepted all 114 server traces;
- Vercel deployment `dpl_ATwcqNHpYRUQRSjz5vQ1RGrZJrXH` reached READY; the
  public root and newsletter health route returned `200`, health was
  `healthy`, and its settled window contained no error-level or 5xx logs; and
- real `event=schedule` watchdog run 31319998523 succeeded on exact deployed
  head `7faff05`. No manual `workflow_dispatch` run was counted as that proof,
  and no additional newsletter canary was sent.

## Next Priorities

### P0: Establish Sending Reputation

- Send to a small, engaged audience and increase volume gradually.
- Monitor Google Postmaster reputation, spam rate, and authentication instead
  of treating one mailbox placement as a universal result.
- Watch Beehiiv delivered, open, click, bounce, unsubscribe, and spam metrics
  through the operations surface.
- Keep subject lines, cadence, and audience quality consistent while the domain
  warms.

### P1: Observe The Deployed Durable Workstation Package

- Watch archive-query latency, facet latency, conflict frequency, bulk-RPC
  replay failures, chart lease expiry, duplicate-recovery conflicts, and
  admission saturation as real usage grows. Change indexes or limits only from
  measured evidence.
- Keep the public newsletter health route and real scheduled watchdog green.
  Prove human notification and operator response with a controlled failing run
  only when an on-call destination is ready.
- Beehiiv remains explicitly disconnected. A human OAuth reconnect is required
  before remote synchronization, scheduling, publication, or delivery. After
  reconnect, verify the preserved historical rows reconcile normally without
  sending a new canary.
- Configure the optional external webhook only when a real receiver and signing
  secret exist. Its current absence is an intentional warning, not unhealthy
  core automation.

### P2: Sync The Watchlist Without Splitting Its Identity

- Keep anonymous users on the existing browser-local ordered list. For signed-in
  users, make the existing one-row `watchlists` record the canonical account
  list with `NULL` meaning product defaults and an empty array meaning an
  intentional empty list. Do not dual-write the unused normalized tab/item
  model.
- Add migration-first, auth-derived CAS and idempotency RPCs with an exact
  20-equity-symbol invariant, durable replay receipts, one-time bounded legacy
  import, and conflict results. Ship behind a feature flag until live legacy
  row shapes and external writers have been inventoried.
- Treat browser state as a bounded offline cache, not a second authority:
  preserve anonymous state across sign-in/out, fence account switches and stale
  responses, serialize writes, retry lost receipts, and require an explicit
  choice when two devices reorder the same shared symbols.
- Replace per-symbol custom quote fan-out with one bounded batch endpoint. Pulse
  should stream only the selected symbol; Catalyst Calendar should filter its
  already-loaded events client-side, adding no provider calls.

### P3: Finish External Alerting

- Choose the actual operational receiver.
- Configure `NEWSLETTER_ALERT_WEBHOOK_URL` and a dedicated
  `NEWSLETTER_ALERT_WEBHOOK_SECRET`.
- Send the admin canary, verify its signature at the receiver, and confirm the
  outbox records delivery.
- Define who responds to late, failed, and stuck-delivery alerts.

### P4: Learn From Editorial Decisions

- Analyze the new versioned shortlist ledger before changing ranking: compare
  algorithm recommendations with accepted, removed, added, and intentionally
  moved issues by reason code and later publication outcome.
- Require enough decisions across distinct market sessions before proposing a
  ranking-weight change, and roll that change out under a new algorithm version
  so historical judgment is never reinterpreted.
- Measure backlog age, needs-work recurrence, dismissal reasons, and which
  discovery signals lead to approved/published issues before changing ranking.
- Use the new calendar and catalyst-history foundations to show relevant context
  beside reviewed catalysts without overwriting immutable discovery evidence.

### P5: Research Depth And Surface Consolidation

- Consolidate experimental chart routes after their useful behavior is
  absorbed into the primary surfaces.
- Continue the same desktop/mobile audit on secondary admin and experimental
  routes before promoting any of them into primary navigation.
- Decide whether replay should remain an explicitly Massive-only capability or
  gain a clearly labeled lower-resolution fallback for FMP.

### P6: Complete The Account Lifecycle If The Product Needs It

- If users need self-service deletion, build a server-owned erasure workflow
  with recent authentication, explicit scope, retention rules, confirmation,
  idempotency, and a durable receipt.
- Until that contract exists, keep the honest sign-out language and do not
  imply that authentication data or saved research was deleted.

### P7: Restore Market Internals With Real Data

- Choose a licensed, reproducible source for advance/decline and breadth
  history.
- Persist source timestamps and provenance so a chart can explain where every
  point came from.
- Add freshness, missing-session, and reconciliation checks before restoring
  the navigation entry or search indexing.
- Never substitute generated placeholder values on a financial-data surface.

## Deferred Or Retired

- The former chart toolbar, clipped mobile control, unnamed-form-field, and
  stale Tesla media defects were addressed in the deployed Charting Platform
  PR #2; they are no longer roadmap work.
- Old dashboard layout experiments are reference material, not parallel
  products.
- Hidden feature-flag navigation for Pulse Today is retired.
- The combined `/api/market-snapshot` endpoint returns `410`; callers use
  `/api/market-snapshot/fast`, `/slow`, or `/live-movers` according to the
  actual data they consume.
- `/api/search-tickers` returns `410`; `/api/search-stocks` is the one bounded,
  alias-aware stock-search contract.
- Public schema mutation/debug tooling is retired; schema changes belong in
  reviewed migrations and operator-only workflows.
- The random-data Market Internals prototype is retired. Its route is a
  non-indexed unavailable state until a verified data pipeline replaces it.
- Duplicate local repository folders are not an archive strategy.
- New plan documents should update this roadmap or link back to it.

## Definition Of Done

A feature is done only when its primary route works on desktop and mobile, its
server/data boundary has failure handling, persistence is covered by a reviewed
migration or explicit local fallback, relevant validation passes, the
production build and deployment succeed, and this roadmap still describes what
is actually live. For email, “done” distinguishes generation, provider
delivery, authentication, and inbox placement rather than collapsing them into
one green check.
