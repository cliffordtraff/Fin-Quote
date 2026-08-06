# Fin Quote Current Roadmap

Last audited: August 6, 2026

This is the canonical product and engineering roadmap for Fin Quote. Older plan
files remain useful as implementation history, but they do not override this
document.

## Product Direction

Fin Quote is a daily market-research and publishing workstation. Its core loop
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
| 7 | Stock and workspace views | `/stock/[symbol]`, `/workspace/*` | Research and chart drilldown |
| 8 | Newsletter chart library | `/newsletter/charts` | Reusable captured charts and editable specs |
| 9 | Market Overview | `/dashboard` | Broader market context and supporting data |

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

## Next Priorities

### P0: Establish Sending Reputation

- Send to a small, engaged audience and increase volume gradually.
- Monitor Google Postmaster reputation, spam rate, and authentication instead
  of treating one mailbox placement as a universal result.
- Watch Beehiiv delivered, open, click, bounce, unsubscribe, and spam metrics
  through the operations surface.
- Keep subject lines, cadence, and audience quality consistent while the domain
  warms.

### P1: Scale The Newsletter Archive And Editor

- Add search, status/date/ticker filters, pagination or virtualization, and
  useful empty states before the growing issue archive becomes a long wall of
  cards.
- Make draft freshness, unsaved changes, save conflicts, and publication state
  visible in the editor without relying on operator memory.
- Add archive-safe bulk actions only where each selected issue's side effects
  remain explicit and recoverable.
- Keep image-plus-scene provenance intact so an old issue can reopen the exact
  chart it published instead of reconstructing one from mutable defaults.
- Test the workflow with hundreds of issues and slow/failing chart assets; the
  current successful daily batch and canary prove the pipeline, not long-term
  editorial ergonomics.

### P2: Finish External Alerting

- Choose the actual operational receiver.
- Configure `NEWSLETTER_ALERT_WEBHOOK_URL` and a dedicated
  `NEWSLETTER_ALERT_WEBHOOK_SECRET`.
- Send the admin canary, verify its signature at the receiver, and confirm the
  outbox records delivery.
- Define who responds to late, failed, and stuck-delivery alerts.

### P3: Editorial Throughput

- Add queue aging and stale-catalyst indicators.
- Add shortlist overrides so editorial decisions can improve future ranking.
- Add safe bulk review actions for high-volume catalyst sessions.

### P4: Research Depth And Surface Consolidation

- Decide whether the browser-local Market Overview watchlist should sync into
  Pulse Today for signed-in users without creating a second watchlist model.
- Add earnings and calendar context beside reviewed catalysts.
- Consolidate experimental chart routes after their useful behavior is
  absorbed into the primary surfaces.
- Continue the same desktop/mobile audit on secondary admin and experimental
  routes before promoting any of them into primary navigation.
- Decide whether replay should remain an explicitly Massive-only capability or
  gain a clearly labeled lower-resolution fallback for FMP.

### P5: Complete The Account Lifecycle If The Product Needs It

- If users need self-service deletion, build a server-owned erasure workflow
  with recent authentication, explicit scope, retention rules, confirmation,
  idempotency, and a durable receipt.
- Until that contract exists, keep the honest sign-out language and do not
  imply that authentication data or saved research was deleted.

### P6: Restore Market Internals With Real Data

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
