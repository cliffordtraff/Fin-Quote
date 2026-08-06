# Fin Quote Launch Readiness

Last verified: August 6, 2026

## Current Status

The existing application is live at `https://www.theintraday.com`. The August
6 audit proved the unattended morning-generation path and a one-recipient
Beehiiv delivery from end to end. The companion Charting Platform repair is
also merged and deployed, including the repaired `charts.theintraday.com`
custom domain.

The Fin Quote launch-hardening code and migration convergence package are now
live. The production ledger matches all 85 repository migrations, the second
push dry run is empty, the isolated Vercel build was promoted, protected cron
calls passed, and all five schedules were resumed.

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
| Fin launch-hardening package | Deployed | Full validation, promotion, protected-route smoke, and reconciliation checks passed |
| Supabase ledger convergence | Complete | All 85 versions align; second push dry run is empty |
| External alert delivery | Not configured | No production `NEWSLETTER_ALERT_WEBHOOK_URL` exists |

## Verified Product Routes

| Surface | Route | Status | Notes |
|---|---|---|---|
| Market Overview | `/dashboard` | Existing production surface | Live data with explicit fallbacks |
| Pulse Today | `/dashboard/pulse-today` | Existing production surface | Primary market cockpit |
| Morning Brief | `/dashboard/morning-brief` | Existing production surface | Persisted pre-open baseline |
| Morning Report | `/newsletter/morning-review` | Production path exercised | Unattended 40/40 batch and canary source |
| Newsletter Operations | `/newsletter/operations` | Deployed and exercised | Stats, manual reconcile, lifecycle health, notifications, and outbox health are live |
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

## Deployed Fin Quote Release Package

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

Production has no external webhook URL configured. That is a configuration
gap, not a newsletter-generation blocker: in-app notifications continue to
work and the outbox safely avoids network calls until both a real URL and a
dedicated signing secret exist.

## Security And Dependency Evidence

The stale automated Fin Quote security PR was closed because its proposed
baseline no longer described the repository. The reviewed versions are
Next.js 15.5.22 and React 19.2.1, and `npm audit --omit=dev` reports zero
production vulnerabilities. The final branch test, type-check, build, secret
scan, Supabase Preview, Vercel Preview, and production smoke gates all passed.

## Completed Release Sequence

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

## Remaining Risks

- Inbox placement is still warming even though authentication and provider
  delivery passed.
- External alerts cannot leave the durable outbox until a real destination is
  configured.

## Operating Sequence After Release

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
