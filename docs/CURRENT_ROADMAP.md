# Fin Quote Current Roadmap

Last audited: August 3, 2026

This is the canonical product and engineering roadmap for Fin Quote. Older plan
files remain useful as implementation history, but they do not override this
document.

## Product Direction

Fin Quote is a daily market-research and publishing workstation. The core loop
is:

1. Open the Morning Report and review the recommended editorial shortlist.
2. Verify the catalysts behind the strongest issues and refine their charts.
3. Create or synchronize Beehiiv drafts directly from the report.
4. Use Pulse Today and the Mid-Morning Brief to track what changed after open.
5. Schedule and publish in Beehiiv while Fin Quote records the lifecycle.

## Canonical Product Surfaces

| Priority | Surface | Route | Role |
|---|---|---|---|
| 1 | Morning Report | `/newsletter/morning-review` | Daily issue review, shortlist, and Beehiiv delivery |
| 2 | Newsletter Operations | `/newsletter/operations` | Pipeline health, retries, alerts, and delivery state |
| 3 | Pulse Today | `/dashboard/pulse-today` | Primary live market cockpit |
| 4 | Mid-Morning Brief | `/dashboard/mid-morning-brief` | Opening-session delta from the morning baseline |
| 5 | Catalyst review | `/admin/why-moved` | Editorial QA for top-mover explanations |
| 6 | Newsletter editor | `/newsletter/editor` | Draft, review, export, and publish workflow |
| 7 | Stock and workspace views | `/stock/[symbol]`, `/workspace/*` | Research and chart drilldown |
| 8 | Newsletter chart library | `/newsletter/charts` | Reusable captured charts and editable specs |
| 9 | Market Overview | `/dashboard` | Broader market context and supporting data |

## Current Delivery

The active `Newsletter-Chart-Edits` work includes:

- a reusable newsletter chart library with local-session and Supabase storage;
- chart search, rename, deletion, insertion, and editable-spec retention;
- a four-stage editorial workflow: Draft, Review, Ready, Published;
- readiness checks that block Ready and Published until copy and charts are final;
- an automated Morning Report with Finviz refreshes, persisted WIIM rankings,
  original summaries, chart generation, bounded retries, and market-holiday
  awareness;
- durable in-app notifications for late, completed, and failed morning and
  mid-morning runs, with an optional external webhook;
- a five-issue editorial shortlist ranked from the complete daily batch;
- per-card Beehiiv Create, Open, and Sync controls;
- a signed-in operations console with morning and mid-morning stage progress,
  provider health, issue exceptions, alert history, delivery lifecycle, and
  recent run timing;
- protected Run now and failed-stage retry controls that preserve completed
  pipeline work;
- a delivery lifecycle of Generated, Ready, Beehiiv Draft, Scheduled, and
  Published, reconciled from Beehiiv every 15 minutes;
- an automated 10:15 AM ET Mid-Morning Brief that refreshes 20 candidates,
  creates fresh summaries for the top five, and persists the delta from the
  pre-open baseline;
- Pulse Today as an always-visible primary navigation destination;
- a session summary, leader shortcuts, active-symbol catalyst, and responsive layout;
- a persistent Why This Stock Moved admin queue with notes and review states;
- idempotent catalyst-to-newsletter automation that creates a draft on
  approval, attaches matching saved charts, and captures a default chart when
  no saved match exists;
- newsletter provenance, workflow history, Beehiiv publication URLs, and
  publication timestamps across the editor and issue history;
- migrations for the chart library, newsletter workflow states, and catalyst reviews;
- a shared responsive application shell for the primary product routes;
- a rebuilt Market Overview with explicit loading, empty, and provider-failure states;
- a native, theme-aligned Chart of the Day that avoids loading the full external
  charting workspace on the dashboard;
- a compact Market Tape, notable-first Cross-Asset view, and unified catalyst
  timeline that reduce the overview's default visual weight;
- a browser-persistent editable watchlist with reorder controls and unusual-move
  markers, plus remembered mover-session and section disclosure preferences;
- section-level freshness labels and compact previews for insider, global-session,
  and S&P mover detail;
- provider fallbacks for index and futures data;
- route-level dashboard loading and error boundaries; and
- safe server logging that avoids leaking provider URLs or credentials.

## Launch State

`origin/main` is the only deployment baseline. At this audit it is at `2c521d0`.
The local working tree contains the native Chart of the Day and Market Overview
information-architecture improvements and has not yet been committed or deployed.

The Morning Report and Mid-Morning Brief were verified in production at desktop
and mobile widths on July 30, 2026. The August 3 local dashboard changes pass
TypeScript, all 387 Vitest tests, an isolated production build, and browser
verification at desktop and 390-pixel mobile widths.

The linked Supabase project contains the complete newsletter operating schema,
including notifications, mid-morning runs, Beehiiv lifecycle fields, and the
three active cron jobs. Migration `20260730143000` was applied and recorded
directly after verifying the live schema.

The older Supabase migration ledger remains divergent from this repository, so
old local migrations must not be blindly replayed. Reconcile the historical
ledger against the live schema before the next schema change.

## Next Priorities

### P0: Finish Release Hygiene

- Reconcile the Supabase migration ledger with the verified live schema.
- Commit the integrated feature set and merge it through a reviewed pull request.
- Verify signed-in admin writes in production.
- Confirm the first fully unattended trading-day morning and mid-morning runs.
- Route `NEWSLETTER_ALERT_WEBHOOK_URL` to the preferred operational channel.

### P1: Newsletter Reliability And Measurement

- Add publication analytics and Beehiiv delivery metrics.
- Add latency thresholds and trend charts to the operations history.
- Add shortlist overrides so editorial preferences can influence future ranking.

### P2: Chart Workspace Quality

- Fix the charting application's mobile toolbar collisions and clipped controls.
- Add accessible names to the embedded chart form fields.
- Remove the stale Tesla media request from any remaining interactive workspace
  surface that still loads it.
- Reverify `/workspace/*`, stock charts, and dashboard embeds at mobile and
  desktop widths.

### P3: Editorial Throughput

- Add queue aging and stale-catalyst indicators.
- Add bulk review actions for high-volume catalyst sessions.
### P4: Research Depth

- Decide whether the browser-local Market Overview watchlist should sync into
  Pulse Today for signed-in users without creating a second watchlist model.
- Add earnings/calendar context beside reviewed catalysts.
- Consolidate experimental chart routes after their useful behavior is absorbed.

## Deferred Or Retired

- Old dashboard layout experiments are reference material, not parallel products.
- Hidden feature-flag navigation for Pulse Today is retired.
- Duplicate local repository folders are not an archive strategy.
- New plan documents should update this roadmap or link back to it.

## Definition Of Done

A feature is done only when its primary route works on desktop and mobile, its
server/data boundary has failure handling, persistence is covered by a migration
or explicit local fallback, relevant tests pass, the production build succeeds,
and this roadmap still describes the product accurately.
