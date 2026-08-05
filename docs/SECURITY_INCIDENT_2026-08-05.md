# Shares-Outstanding Verification Incident — August 5, 2026

## Status

Contained. No related FMP or Supabase maintenance process remains active. No
rollback was attempted because no reliable before-state snapshot exists.

## What happened

While verifying that FMP scripts fail when `FMP_API_KEY` is absent, a child
process launched `scripts/backfill-shares-outstanding.ts` with a whitespace-only
key. The script's custom `.env.local` loader unconditionally overwrote values
already supplied by the caller. That restored the locally configured FMP and
Supabase credentials, allowing the supposed negative test to begin a real
backfill. The subprocess timeout terminated it after approximately ten seconds.

## Data impact

The script only updates `financials_std.shares_outstanding` when a row's
`period_end_date` matches an FMP income-statement record and the current value
differs. It does not delete or insert rows.

The captured output confirms completed processing for these symbols:

| Symbol | Reported rows updated |
| --- | ---: |
| A | 8 |
| AA | 9 |
| AAC | 2 |
| AACB | 0 |
| AACBR | 0 |
| AACG | 7 |
| AACI | 1 |
| AACT | 3 |
| AADI | 9 |
| AAIC | 7 |
| AAIC-PB | 7 |
| AAIC-PC | 7 |
| AAIN | 10 |
| AAL | 8 |
| AAM | 7 |

That is 85 confirmed updates using current FMP values. Processing of `AAM-PA`
had begun and fetched 57 provider records when the timeout occurred; whether it
completed any row updates before termination is unknown from the captured
output.

## Containment

- Verified through the process table that no affected script child remained.
- Did not run another FMP/Supabase command to investigate or reverse the writes.
- Changed the custom loader so `.env.local` only fills undefined variables and
  never overrides a value supplied by the caller.
- Moved subprocess checks to a newly created empty temporary working directory.
- Removed FMP, Supabase, and dotenv configuration from the child environment;
  the test supplies only a deliberately invalid whitespace FMP value.
- Re-ran the seven isolated missing-key checks successfully in under one second
  of test time, with no data-contacting child left behind.

## Follow-up

If a historical database snapshot later becomes available, compare the affected
rows before deciding whether any correction is necessary. Do not infer old
values or attempt a blind rollback: the backfill wrote provider-derived current
values, and guessing would create a second data-integrity risk.

The broader lesson is that negative-path command tests must remove inherited
authority, isolate their working directory, and make accidental network or
database access impossible before launching the child process.
