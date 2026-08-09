# Fin Quote Launch Readiness

Last verified: August 9, 2026

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

The **newsletter reliability follow-up is now live**. Migrations
`20260806135000` through `20260806142000` were applied with the four newsletter
schedules paused and no active leases. The second linked dry run was empty,
the linked schema lint was clean, and application commit `83407ea` was promoted
as Vercel production deployment `dpl_CqFLdAqR2nr38zwdfj3Aca8QLJZL` before the
schedules were resumed. The release adds source/entity validation,
database-fenced automation leases, durable terminal-notification receipts,
immutable chart assets, stricter delivery validation, cron heartbeats, an
off-site watchdog workflow, and independent Beehiiv statistics health.

The next **durable workstation package is locally release-ready but not yet
deployed**. Its exact frozen tree passed 250 Vitest files / 1,644 tests,
TypeScript, ESLint with zero errors, a 49-unit production build, 114 server
trace checks, and 10 pgTAP files / 369 assertions. The linked ledger correctly
shows nine pending migrations from `20260807090000` through
`20260809100000`; those must be applied and verified before the matching
application is promoted.

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
| Fin dependency posture | Verified release | Next.js 15.5.22, React 19.2.1, zero full or production audit vulnerabilities |
| Original Fin launch-hardening package | Deployed | Full validation, promotion, protected-route smoke, and reconciliation checks passed |
| Supabase baseline convergence | Complete | All local and remote versions through `20260806142000` align; the second push dry run was empty |
| Newsletter reliability follow-up | Deployed and smoke-tested | Four migrations, production application deployment, protected cron probes, and live health checks passed |
| Durable workstation package | Local release gates passed; promotion pending | 250 files / 1,644 tests, 10 pgTAP files / 369 assertions, 49 build units, and 114 verified traces; nine linked migrations remain pending in migration-first order |
| Source/entity integrity | Verified in production | MTCH was rebuilt from Match Group's SEC filing; the active draft contains no Huya or “Triple Match 3D” text |
| Automation lease fencing | Deployed | Writes require the current token and an unexpired database lease; pgTAP expiry/takeover regressions pass 56/56 |
| Terminal notification receipts | Verified in production | Daily and mid-morning terminal notifications each have a durable applied receipt with no last error |
| Immutable images and delivery gates | Deployed | Content-addressed PNGs plus subject, preheader, link, image, alt-text, and HTML-size validation are active |
| Cron heartbeat health | Healthy in production | `/api/health/newsletter` returned `200`; all four cron routes recorded fresh `succeeded` rows |
| Off-site watchdog | Manual hosted path verified; automatic schedule proof still pending | Manual run [31125987699](https://github.com/cliffordtraff/Fin-Quote/actions/runs/31125987699) passed against merged `main`; GitHub now reports all systems operational, but no `event=schedule` run is visible, and Vercel 5xx alert rule `ar_019fd7b2-6c0f-73ff-966a-119be7286e6c` remains live |
| Beehiiv statistics health | Verified in production | Latest published canary stats reconciled without lifecycle or statistics errors |
| Optional webhook delivery | Intentionally not configured | Missing `NEWSLETTER_ALERT_WEBHOOK_URL` is a warning; durable in-app notifications and core health remain healthy |

## Verified Product Routes

| Surface | Route | Status | Notes |
|---|---|---|---|
| Market Overview | `/dashboard` | Existing production surface | Live data with explicit fallbacks |
| Pulse Today | `/dashboard/pulse-today` | Existing production surface | Primary market cockpit |
| Morning Brief | `/dashboard/morning-brief` | Existing production surface | Persisted pre-open baseline |
| Morning Report | `/newsletter/morning-review` | Production path exercised | Unattended 40/40 batch and canary source |
| Newsletter Operations | `/newsletter/operations` | Production `200` | Lifecycle, statistics health, terminal receipts, and outbox state are live |
| Newsletter Cron Health | `/api/health/newsletter` | Production healthy | Returned `200` with fresh successful daily, mid-morning, Beehiiv, and webhook-outbox heartbeats |
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

The four-migration reliability follow-up now extends that baseline, and the
remote ledger is aligned through `20260806142000`.

## Reliability Follow-up Deployed

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

The four schema migrations were applied in that order before the matching
application deployment. The schedules stayed paused until the ledger, schema,
application routes, repaired MTCH batch, and terminal notification receipts
were verified.

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

At the latest production verification, no external webhook URL was configured.
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

The off-site GitHub Actions watchdog is configured to call that endpoint every
ten minutes and fails on an unreachable deployment, non-200 response, or
unhealthy body. That solves the “the monitor died with the app” blind spot. It
does not, by itself, prove a person will be paged. A
[critical Actions incident](https://www.githubstatus.com/incidents/qcvjkzcs7j74)
prevented the first scheduled proof, while a later manual run on merged `main`,
[31125987699](https://github.com/cliffordtraff/Fin-Quote/actions/runs/31125987699),
received a hosted runner and passed the production health assertion. GitHub
reported all systems operational on August 9, but no `event=schedule` watchdog
run was visible yet. A manual `workflow_dispatch` remains path evidence, not
automatic scheduling evidence. Separately verify that an intentionally failing
check reaches the chosen on-call destination. The matching Vercel newsletter
5xx rule is live and its checked-in artifact matches alert
`ar_019fd7b2-6c0f-73ff-966a-119be7286e6c`.

## Security And Dependency Evidence

The stale automated Fin Quote security PR was closed because its proposed
baseline no longer described the repository. The reviewed versions are
Next.js 15.5.22 and React 19.2.1, and `npm audit --omit=dev` reports zero
production vulnerabilities. The original release's final branch test,
type-check, build, secret scan, Supabase Preview, Vercel Preview, and production
smoke gates all passed. The follow-up release's exact merged tree passed pinned
Gitleaks 8.30.1 with no leaks, 129 Vitest files with 682 tests, TypeScript,
ESLint with zero errors, the Next.js production build, full and production
dependency audits with zero vulnerabilities, local database replay, 56/56
pgTAP assertions, linked schema lint, Supabase Preview, Vercel Preview,
production deployment, and live smoke checks. The full hosted CI jobs did not
execute because the platform never assigned their runners during its outage;
they were cancelled from the queue without test output. The separate hosted
production-watchdog run succeeded.

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

Step 9 remains optional and was not completed at the latest verification.
Steps 1–8 describe the earlier baseline release.

## Completed Reliability Follow-up Release Sequence

1. Captured the migration-ledger and exact cron/job state, paused the four
   newsletter schedules, waited beyond the worker timeout, and proved all five
   lease pools were empty.
2. Ran a linked Supabase dry run and confirmed the only pending versions were
   `20260806135000`, `20260806140000`, `20260806141000`, and
   `20260806142000` in that order.
3. Applied the four migrations before application code and verified the cron-run table,
   service-role grants, fenced claim/renew/update RPCs, terminal notification
   receipt columns/RPCs, and Beehiiv statistics-health columns.
4. Required an empty second migration dry run and kept schedules paused while
   deployments `dpl_HbLeT95hjVUFNcv9dSauPTtF4gEn` and final
   `dpl_CqFLdAqR2nr38zwdfj3Aca8QLJZL` were built and promoted.
5. Smoked the public health and newsletter operations routes, then exercised
   all protected cron routes. Each recorded a successful terminal heartbeat;
   health returned `200` after the schedules resumed.
6. Verified the live Vercel 5xx rule and successful hosted GitHub watchdog run
   [31125987699](https://github.com/cliffordtraff/Fin-Quote/actions/runs/31125987699).
   GitHub's critical Actions incident still prevented a scheduled tick from
   appearing and cancelled the larger CI jobs before runner assignment; those
   were external queue cancellations, not failed checks.
7. Exercised stale-token/takeover paths in 56 pgTAP assertions and repaired the
   terminal 39-of-40 parent/child projection to 40-of-40 with a refreshed
   notification receipt.
8. Published and reconciled a controlled Beehiiv canary. Its subject/preheader limits,
   HTTPS links, non-clipped HTML, safe immutable chart URL, lifecycle state,
   statistics freshness, and no duplicate events or posts on reconciliation.
9. Resumed all four exact schedules, observed successful heartbeats for daily,
   mid-morning, Beehiiv reconciliation, and webhook outbox, and confirmed zero
   active leases.
10. Left the optional external webhook receiver unconfigured, recorded its
    expected warning, and confirmed core health remains green.

## Remaining Risks

- Inbox placement is still warming even though authentication and provider
  delivery passed.
- The watchdog's hosted healthy path passed, but a scheduled tick has not yet
  appeared even after GitHub returned to all-systems-operational status, and
  human notification from an intentionally failing run remains unproved. The
  live Vercel 5xx rule provides an independent application-error path in the
  meantime.
- External webhook alerts cannot leave the durable outbox until a real
  destination is configured, but that does not block in-app notifications or
  core cron health.
- Beehiiv statistics may become stale while lifecycle reconciliation remains
  healthy; operators must read the independent freshness and error fields.

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
