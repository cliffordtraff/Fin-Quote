# Fin Quote Launch Readiness

Last verified: August 6, 2026

## Current Status

The existing application is live at `https://www.theintraday.com`. The August
6 audit proved the unattended morning-generation path and a one-recipient
Beehiiv delivery from end to end. The companion Charting Platform repair is
also merged and deployed, including the repaired `charts.theintraday.com`
custom domain.

The first Fin Quote launch-hardening package is also live. Its production
ledger was verified against the 85-migration baseline, the second push dry run
was empty, the isolated Vercel build was promoted, protected cron calls passed,
and all five schedules were resumed.

There is now a **separate newsletter reliability follow-up** in the working
branch. It adds source/entity validation, database-fenced automation leases,
durable terminal-notification receipts, immutable chart assets, stricter
delivery validation, cron heartbeats and an off-site watchdog, and independent
Beehiiv statistics health. Its focused failure-injection coverage has passed,
but this document does **not** claim that the four new migrations or matching
application code are deployed to production. Migrations `20260806135000`
through `20260806142000` must be applied before that code is promoted.

## Readiness At A Glance

| Capability | State | Evidence / limitation |
|---|---|---|
| Unattended morning generation | Verified in production | 40 ready issues out of 40 |
| Public newsletter charts | Verified in production | Distinct public PNGs were reachable and nonblank |
| Beehiiv draft synchronization | Verified canary | Repeating an unchanged sync reused the same remote post |
| Beehiiv publish and provider delivery | Verified canary | One message published and Beehiiv reported one sent and delivered |
| Email authentication | Verified canary | Gmail reported SPF, DKIM, and DMARC pass |
| Inbox placement | Warming, not certified | The first canary initially landed in Spam |
| Google Postmaster | Verified | `theintraday.com` is enrolled for reputation monitoring |
| Chart custom domain | Verified | `https://charts.theintraday.com/health` returns `200` |
| Chart mobile/a11y repair | Deployed | Charting Platform PR #2 is merged and deployed |
| Fin dependency posture | Verified locally | Next.js 15.5.22, React 19.2.1, zero production audit vulnerabilities |
| Original Fin launch-hardening package | Deployed | Full validation, promotion, protected-route smoke, and reconciliation checks passed |
| Supabase baseline convergence | Complete | The previously released 85 versions aligned; the second push dry run was empty |
| Newsletter reliability follow-up | Awaiting production promotion | Branch implementation and focused regressions exist; four new migrations and matching code still require the release sequence below |
| Source/entity integrity | Awaiting production promotion | The MTCH/“Triple Match 3D” collision is rejected by fail-closed validation in generation, ranking, and daily selection |
| Automation lease fencing | Awaiting production migration | Writes require the current token and an unexpired database lease; expiry/takeover regressions pass |
| Terminal notification receipts | Awaiting production migration | Terminal runs remain retryable until their deduplicated notifications are durably recorded |
| Immutable images and delivery gates | Awaiting production promotion | Content-addressed PNGs plus subject, preheader, link, image, alt-text, and HTML-size validation are implemented |
| Cron heartbeat health | Awaiting production promotion | Durable run rows and `/api/health/newsletter` are implemented but need live cron evidence |
| Off-site watchdog | Code ready; alert path unverified | GitHub Actions polls the health endpoint every ten minutes; repository/on-call notification delivery must be confirmed after deployment |
| Beehiiv statistics health | Awaiting production migration | Statistics freshness/errors are separated from lifecycle health and preserve the last known metrics |
| Optional webhook delivery | Not configured at last verification | Missing or invalid `NEWSLETTER_ALERT_WEBHOOK_URL` is a warning; durable in-app notifications remain healthy |

## Verified Product Routes

| Surface | Route | Status | Notes |
|---|---|---|---|
| Market Overview | `/dashboard` | Existing production surface | Live data with explicit fallbacks |
| Pulse Today | `/dashboard/pulse-today` | Existing production surface | Primary market cockpit |
| Morning Brief | `/dashboard/morning-brief` | Existing production surface | Persisted pre-open baseline |
| Morning Report | `/newsletter/morning-review` | Production path exercised | Unattended 40/40 batch and canary source |
| Newsletter Operations | `/newsletter/operations` | Baseline deployed; follow-up pending | Existing stats and reconciliation are live; independent stats-health fields and new terminal receipts require the follow-up release |
| Newsletter Cron Health | `/api/health/newsletter` | Awaiting production promotion | Returns no-store `200` for healthy and `503` for missing, failed, stale, or unavailable cron observability |
| Mid-Morning Brief | `/dashboard/mid-morning-brief` | Existing production surface | Opening-session delta |
| Stock detail | `/stock/AAPL` | Existing production surface | Embedded chart path available |
| Chart workspace | `/workspace/chart` | Owning app repair deployed | Public chart health and workspace routing verified |
| Fundamentals workspace | `/workspace/fundamentals` | Owning app repair deployed | Mobile layout and accessible-name fixes shipped in chart PR #2 |
| Overview workspace | `/workspace/overview` | Owning app repair deployed | Custom chart domain is healthy |

## Newsletter Production Evidence

The August 6 morning run completed without an operator driving its stages and
produced 40 ready issues out of 40. The one-subscriber canary then exercised:

1. Beehiiv OAuth publication selection.
2. Remote draft creation.
3. An unchanged resync without a duplicate post.
4. Preview on desktop and mobile.
5. Schedule and publish.
6. Provider send and delivery.
7. Gmail receipt with SPF, DKIM, and DMARC passing.
8. Lifecycle reconciliation back into Fin Quote without duplicate events.

This proves generation, synchronization, publication, transport, and
authentication. It does not prove general inbox placement: the canary first
appeared in Spam. Google Postmaster is now verified so the warm-up can be
measured, and volume should grow gradually with engaged recipients.

## Charting Platform Evidence

Charting Platform PR #2 fixed the narrow-workspace toolbar collision,
viewport-unsafe menus, mobile Fundamentals overlap, missing accessible names,
and stale Tesla media request. The change is merged and deployed. DNS and the
Vercel custom-domain attachment for `charts.theintraday.com` were repaired, and
the public health route returns `200`.

## Production Baseline Already Verified

Production now runs these additions:

- atomic Beehiiv sync claims and leases;
- durable create/update/recovery states and an ambiguous-create fail-safe;
- lease-fenced lifecycle side effects and idempotent event recording;
- Beehiiv post statistics that do not block lifecycle reconciliation when
  analytics are unavailable;
- a signed-in **Reconcile now** operator control;
- date-scoped delivery counts, lifetime totals, latency/freshness indicators,
  and webhook-outbox health;
- a signed transactional webhook outbox with bounded retry; and
- the converged Supabase migration history plus the genuinely missing schema
  and cache-policy changes.

The convergence package replayed successfully from an empty local database and
was then applied with newsletter and dashboard jobs paused. The live tables,
policies, grants, RPCs, cron schedules, and migration ledger were verified; a
second push dry run reports the remote database is up to date.

Those statements describe the original 85-migration baseline. They must not be
used as evidence that the four-migration reliability follow-up is already live.

## Reliability Follow-up Awaiting Production Promotion

The working branch adds the following defenses:

- source/entity validation at the Why It Is Moving generation, ranking, and
  newsletter-selection boundaries, including a regression for MTCH being
  confused with the unrelated game *Triple Match 3D*;
- daily and mid-morning lease claims, renewals, and progress patches fenced by
  both the current lease token and the database's unexpired lease time;
- explicit attempt, error, and completion receipts for terminal automation
  notifications so a crash between run completion and notification persistence
  remains recoverable;
- content-addressed, immutable newsletter images whose storage path is derived
  from a SHA-256 digest of validated PNG bytes;
- delivery gates for a complete subject, normalized preheader, HTTPS
  links, useful alt text, safe remote images, and HTML below the 90 KB ceiling;
- append-only cron heartbeats, a sanitized public health endpoint, and a
  GitHub-hosted watchdog that checks production every ten minutes; and
- separate Beehiiv statistics freshness/errors so an analytics outage cannot
  hide a successful lifecycle reconciliation or make stale metrics look fresh.

The four schema migrations are intentionally ordered before the application
deployment. The code calls their new table, columns, and RPCs; promoting it
first would turn a reliability release into an avoidable outage.

## Notification And Webhook Contract

In-app notifications are the durable source of truth. A repeated dedupe key can
refresh the operator-facing severity, copy, and metadata while preserving its
read and delivery timestamps. The corresponding outbox event is different: its
event ID is the receiver idempotency key, so the serialized payload is frozen
when first enqueued and remains byte-stable across retries.

Authenticated browser users may mark their own notification read, once; they
cannot rewrite ownership, content, dedupe, or delivery fields, and a read item
cannot be made unread. The delivery worker leases a small due batch, signs the
exact raw payload, and records success or retry state independently from the
morning pipeline.

At the last production verification, no external webhook URL was configured.
That is optional coverage, not a newsletter-generation blocker: in-app
notifications remain the durable source, and the outbox safely avoids network
calls until both a real URL and a dedicated signing secret exist. The follow-up
health snapshot reports missing or invalid webhook configuration as a warning,
not as a failed core cron.

The new notification receipt closes a different gap. A daily or mid-morning
run is not considered fully notified merely because its terminal state was
committed. It keeps retrying the deduplicated notification/outbox boundary until
`notification_applied_at` proves that operator notification is durable.

## Cron Heartbeat, Watchdog, And Alert Coverage

Each authorized daily, mid-morning, Beehiiv-reconciliation, and webhook-outbox
invocation gets its own durable row in `newsletter_cron_runs`, from `running`
through `succeeded` or `failed`. The public health route summarizes only fixed
job names, normalized states, and timestamps; it returns `503` when required
runs are missing, stale, failed, or observability itself is unavailable.

The off-site GitHub Actions watchdog calls that endpoint every ten minutes and
fails on an unreachable deployment, non-200 response, or unhealthy body. That
solves the “the monitor died with the app” blind spot. It does not, by itself,
prove a person will be paged. After production promotion, verify that GitHub
workflow-failure notifications reach the chosen on-call destination. Vercel
deployment/function alerts are a complementary optional layer and likewise
need their production receiver and policy verified; no Vercel alert should be
described as live merely because the health endpoint exists.

## Security And Dependency Evidence

The stale automated Fin Quote security PR was closed because its proposed
baseline no longer described the repository. The reviewed versions are
Next.js 15.5.22 and React 19.2.1, and `npm audit --omit=dev` reports zero
production vulnerabilities. The original release's final branch test,
type-check, build, secret scan, Supabase Preview, Vercel Preview, and production
smoke gates all passed. The follow-up package has focused failure-injection
coverage, but still requires its own production migration, deployment, and
smoke evidence.

## Previously Completed Baseline Release Sequence

1. Confirmed the production backup and captured a schema checksum.
2. Paused all related cron jobs and confirmed no relevant run was active.
3. Applied the two verified missing historical effects and repaired/adopted the
   ledger.
4. Required an exact three-migration dry run, applied it, and re-paused the
   recreated jobs.
5. Resolved the final reviewed schema drift with a forward migration and
   confirmed all 85 local and remote versions align.
6. Passed application, database, dependency, secret-scan, preview, and build
   gates.
7. Promoted the isolated production deployment and exercised public and
   protected routes.
8. Proved Beehiiv reconciliation idempotency, then resumed all five schedules.
9. After choosing an alert receiver, configure the URL and signing secret and
   send the admin webhook canary.

Step 9 remains optional and was not completed at the last verification. Steps
1–8 describe the earlier baseline release, not the pending reliability
follow-up.

## Required Reliability Follow-up Release Sequence

1. Capture a fresh production backup, migration-ledger snapshot, and current
   cron/job state. Pause the newsletter schedules and confirm no relevant worker
   is active.
2. Run a linked Supabase dry run and require that the only pending versions are
   `20260806135000`, `20260806140000`, `20260806141000`, and
   `20260806142000` in that order.
3. Apply the four migrations before application code. Verify the cron-run table,
   service-role grants, fenced claim/renew/update RPCs, terminal notification
   receipt columns/RPCs, and Beehiiv statistics-health columns.
4. Require an empty second migration dry run. Keep schedules paused while the
   matching application deployment is built and promoted.
5. Smoke the public newsletter health route and every protected cron route.
   Confirm a real invocation creates a heartbeat that progresses to the correct
   terminal state, and that missing/stale/failure fixtures produce `503` without
   exposing internal errors.
6. Confirm the off-site GitHub watchdog passes against production, then test a
   controlled unhealthy response or equivalent fixture and verify that the
   selected repository/on-call notification path actually alerts a human.
   Verify any configured Vercel alert separately.
7. Exercise the daily and mid-morning automation takeover path, including a
   stale write rejection and terminal-notification retry, before resuming their
   schedules.
8. Publish a controlled Beehiiv canary. Confirm its subject/preheader limits,
   HTTPS links, non-clipped HTML, safe immutable chart URL, lifecycle state,
   statistics freshness, and no duplicate events or posts on reconciliation.
9. Resume schedules one at a time, observe their first durable heartbeats, and
   document the production deployment, migration ledger, watchdog run, and
   canary evidence here.
10. If an external webhook receiver is chosen, configure its HTTPS URL and
    dedicated signing secret and run the admin canary. If it remains absent,
    record the expected warning and confirm core health stays green.

## Remaining Risks

- Inbox placement is still warming even though authentication and provider
  delivery passed.
- The reliability follow-up is not yet production-deployed; branch tests are
  not substitutes for live migration, cron, watchdog, asset, and Beehiiv
  evidence.
- A GitHub watchdog failure reaches a human only if repository/on-call
  notifications are configured and tested. Vercel alert coverage is likewise
  optional until a receiver and policy are verified.
- External webhook alerts cannot leave the durable outbox until a real
  destination is configured, but that does not block in-app notifications or
  core cron health.
- Beehiiv statistics may be stale while lifecycle reconciliation is healthy;
  operators must read the independent freshness and error fields after the
  follow-up is deployed.

## Operating Sequence After Follow-up Promotion

1. Let the morning cron build the report before the configured ready-by time.
2. Review the recommended issues in `/newsletter/morning-review`.
3. Create or synchronize selected Beehiiv drafts.
4. Schedule and publish in Beehiiv; use **Reconcile now** when an immediate
   lifecycle refresh is needed.
5. Review delivery statistics and outbox health in
   `/newsletter/operations`.
6. Review `/dashboard/mid-morning-brief` after 10:15 AM for the opening delta.
7. Use Google Postmaster and Beehiiv metrics to grow sending volume only as
   reputation supports it.
