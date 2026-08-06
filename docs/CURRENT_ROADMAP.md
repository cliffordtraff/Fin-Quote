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
Supabase replay, database lint, and an empty local schema diff. The subsequent
reliability release brought the production ledger through all 89 migrations
ending at `20260806142000`; its second push dry run was empty, the app was
promoted, protected cron calls were exercised through the Vault-signed path,
and all five schedules were active. The new authorization migration described
below is migration 90 and is not included in that production claim.

No `NEWSLETTER_ALERT_WEBHOOK_URL` is configured in production. In-app
notifications remain useful without it; the outbox intentionally performs no
network delivery until a real receiver and dedicated signing secret are set.

## August 6 P0 Authorization And Trust Hardening

The next release candidate closes a set of historical trust gaps that mattered
more than adding another feature:

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
service-role-only scripts, and the retired placeholder surface. This section
describes the release candidate in the repository; it does **not** claim that
the authorization migration or application changes have been promoted to
production yet. Promotion, a second migration dry run, and live denial/read
checks remain the release gate.

## Next Priorities

### P0: Establish Sending Reputation

- Send to a small, engaged audience and increase volume gradually.
- Monitor Google Postmaster reputation, spam rate, and authentication instead
  of treating one mailbox placement as a universal result.
- Watch Beehiiv delivered, open, click, bounce, unsubscribe, and spam metrics
  through the operations surface.
- Keep subject lines, cadence, and audience quality consistent while the domain
  warms.

### P1: Finish External Alerting

- Choose the actual operational receiver.
- Configure `NEWSLETTER_ALERT_WEBHOOK_URL` and a dedicated
  `NEWSLETTER_ALERT_WEBHOOK_SECRET`.
- Send the admin canary, verify its signature at the receiver, and confirm the
  outbox records delivery.
- Define who responds to late, failed, and stuck-delivery alerts.

### P2: Editorial Throughput

- Add queue aging and stale-catalyst indicators.
- Add shortlist overrides so editorial decisions can improve future ranking.
- Add safe bulk review actions for high-volume catalyst sessions.

### P3: Research Depth

- Decide whether the browser-local Market Overview watchlist should sync into
  Pulse Today for signed-in users without creating a second watchlist model.
- Add earnings and calendar context beside reviewed catalysts.
- Consolidate experimental chart routes after their useful behavior is
  absorbed into the primary surfaces.

### P4: Restore Market Internals With Real Data

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
