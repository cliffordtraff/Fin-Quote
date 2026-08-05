# Fin Quote Launch Readiness

Last verified: July 30, 2026

## Current Status

The integrated application is deployed at `https://www.theintraday.com`.
Production verification covers the Morning Report and Mid-Morning Brief at
desktop and mobile widths, live Supabase persistence, and protected cron
boundaries.

Do not run `supabase db push` against the linked project in its current state.
The live schema contains the new feature objects, but the remote migration
ledger does not match the local migration directory.

## Verified Product Routes

| Surface | Route | Desktop | Mobile | Notes |
|---|---|---|---|---|
| Market Overview | `/dashboard` | Verified | Verified | Live index and futures data, charts, refresh, and explicit fallbacks |
| Pulse Today | `/dashboard/pulse-today` | Verified | Verified | Responsive market cockpit |
| Morning Brief | `/dashboard/morning-brief` | Verified | Verified | Persisted pre-open market baseline |
| Morning Report | `/newsletter/morning-review` | Verified | Verified | Shortlist, issue lifecycle, and Beehiiv controls |
| Newsletter Operations | `/newsletter/operations` | Verified | Verified | Signed-in health, retries, alerts, and delivery lifecycle |
| Mid-Morning Brief | `/dashboard/mid-morning-brief` | Verified | Verified | Automated opening-session delta and fresh summaries |
| Pre-Market | `/dashboard/premarket` | Verified | Verified | Wide data tables scroll within their section |
| Market Internals | `/concept` | Verified | Verified | Compact closed-session state |
| Stock detail | `/stock/AAPL` | Verified | Verified | Embedded chart loads |
| Chart workspace | `/workspace/chart` | Verified | Partial | Owning chart app has mobile toolbar collisions |
| Fundamentals workspace | `/workspace/fundamentals` | Verified | Partial | Embedded chart form fields need accessible names |
| Overview workspace | `/workspace/overview` | Verified | Partial | Same chart-app accessibility issue |
| Calendar | `/calendar` | Verified | Verified | Shared shell and responsive layout |
| Insiders | `/insiders` | Verified | Verified | Filters, tabs, and pagination are labeled |

## Data And Persistence

- The configured market providers return all five headline indices and seven
  futures rows through the fallback chain.
- The linked Supabase project exposes `newsletter_chart_library`,
  `stock_why_moving_reviews`, `newsletter_drafts`, and
  `newsletter_draft_events`.
- It also exposes durable daily and mid-morning automation runs, newsletter
  notifications, and Beehiiv delivery lifecycle state.
- Approved catalyst reviews create one idempotent newsletter draft, attach
  saved charts automatically, and persist Beehiiv publication metadata.
- The morning scheduler is trading-day aware, starts up to three hours before
  the configured ready-by time, and retries bounded stages until noon ET.
- The mid-morning scheduler runs from 10:15 AM to noon ET and persists a fresh
  20-candidate WIIM comparison plus original top-five summaries.
- Beehiiv reconciliation maps draft, scheduled, published, and archived states
  back into Fin Quote every 15 minutes.
- Newsletter Operations resumes the recorded failed stage instead of resetting
  a run, and its mutations are restricted to the configured automation owner.
- The `newsletter-charts` storage bucket exists.
- Migration `20260730143000` is applied in production, and the daily,
  mid-morning, and Beehiiv cron jobs are active.
- Remote migration history is divergent and must be repaired or baselined
  deliberately; do not infer missing schema from ledger entries alone.

## Production Verification

- Vercel production deployment completed successfully on July 30, 2026 and is
  aliased to `www.theintraday.com`.
- `/newsletter/morning-review` returns `200`, renders the five recommendations
  and issue lifecycles, and has no desktop or mobile overflow.
- `/dashboard/mid-morning-brief` returns `200` and renders the completed live
  run, including the change from LII to EME.
- The July 30 mid-morning run completed 20/20 Finviz refreshes and 5/5 fresh
  summaries.
- Daily, mid-morning, and Beehiiv cron endpoints all return `401` without the
  configured bearer secret.
- TypeScript, 359 Vitest tests, and the local and remote production builds pass.

## Pending Local Dashboard Improvements

The August 3 working tree replaces the Market Overview's Chart of the Day iframe
with a native, theme-aware SVG presentation. It also compacts the market tape,
unifies catalysts, makes cross-asset data notable-first, adds an editable local
watchlist, remembers dashboard disclosure choices, and collapses secondary
lower-page detail. These changes are locally verified but are not yet part of
the production baseline above.

- TypeScript and all 387 Vitest tests pass.
- An isolated Next.js production build passes. Isolation was necessary because
  another local dev process was using the repository's `.next` directory.
- `/dashboard` was verified at 1280-pixel desktop width and 390-pixel mobile
  width, with no error overlay, runtime errors, or horizontal overflow.
- Browser reload checks confirm the mover session and section expansion choices
  persist through the versioned local preference store.
- The native chart produces no requests to the external chart workspace, and
  the full workspace remains available through the “Open chart” link.
- A local browser reload reached the load event in 736 ms; provider and network
  conditions will still affect total dashboard response time.

## Remaining Release Hygiene

1. Review and commit the integrated worktree.
2. Verify signed-in mutation controls against the production auth session.
3. Observe the next fully unattended trading-day scheduler cycle.
4. Baseline the older divergent Supabase migration history before another
   schema change.

## Known Cross-Repository Issues

The external charting application at `charts.theintraday.com` owns these issues:

- toolbar controls collide or clip around a 500-pixel viewport;
- eight embedded form controls do not have accessible names;
- an interactive Tesla workspace surface still requests a missing media file
  (the native dashboard chart no longer loads that surface); and
- the stock chart's mobile lookback control clips.

These defects do not create document-level overflow in Fin Quote, but they are
the next user-facing quality priority after release access is restored.

## Operating Sequence

1. Let the morning cron build the report before the configured ready-by time.
2. Review the five recommended issues in `/newsletter/morning-review`.
3. Create or synchronize Beehiiv drafts from each selected report card.
4. Schedule and publish inside Beehiiv; Fin Quote reconciles the lifecycle.
5. Review `/dashboard/mid-morning-brief` after 10:15 AM for the opening delta.
6. Investigate any durable notification or external alert before noon recovery
   ends.

## Next Work Decision

After the first unattended scheduler cycle is observed, add operational run
telemetry and Beehiiv delivery analytics. The charting application toolbar and
accessibility defects remain the next cross-repository UI priority.
