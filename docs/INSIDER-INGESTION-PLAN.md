# Insider Trading Data Ingestion - Implementation Plan

## Overview

This document outlines the complete strategy for keeping insider trading data current in the database, including:
1. Filling gaps between SEC quarterly releases
2. Daily automated updates
3. Quarterly bulk ingestion

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐     ┌─────────────────────────────────┐   │
│  │   SEC EDGAR Bulk Files       │     │   Financial Modeling Prep API   │   │
│  │   (Quarterly ZIP archives)   │     │   (Real-time feed)              │   │
│  │                              │     │                                 │   │
│  │   - Released ~45 days after  │     │   - Latest 500-1000 trades     │   │
│  │     quarter ends             │     │   - ~15 min delay from SEC     │   │
│  │   - 50-60K transactions/qtr  │     │   - Free tier: limited calls   │   │
│  │   - Pre-structured TSV       │     │   - Provides accession links   │   │
│  │   - FREE, authoritative      │     │                                 │   │
│  └──────────────┬───────────────┘     └────────────────┬────────────────┘   │
│                 │                                      │                    │
│                 │ Quarterly (manual)                   │ Daily (automated)  │
│                 │                                      │                    │
│                 ▼                                      ▼                    │
│  ┌──────────────────────────────┐     ┌────────────────────────────────┐   │
│  │ ingest-sec-local-fast.ts     │     │ ingest-fmp-insiders.ts         │   │
│  │ (~17 seconds for 60K rows)   │     │ (~2-3 min for 500 rows)        │   │
│  └──────────────┬───────────────┘     └────────────────┬────────────────┘   │
│                 │                                      │                    │
│                 └──────────────────┬───────────────────┘                    │
│                                    │                                        │
│                                    ▼                                        │
│                    ┌───────────────────────────────┐                        │
│                    │      SUPABASE DATABASE        │                        │
│                    │                               │                        │
│                    │  insider_transactions table   │                        │
│                    │  - source: 'sec' or 'fmp'     │                        │
│                    │  - Unique constraint dedupe   │                        │
│                    │                               │                        │
│                    │  Current: 57,622 rows         │                        │
│                    │  Storage: ~32 MB              │                        │
│                    └───────────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Current State

| Component | Status | Details |
|-----------|--------|---------|
| SEC Q4 2025 Data | ✅ Loaded | 57,622 transactions (Oct 1 - Dec 31, 2025) |
| FMP Script | ✅ Ready | `scripts/ingest-fmp-insiders.ts` exists |
| GitHub Actions | ✅ Configured | Runs daily at 2am UTC |
| GitHub Secrets | ✅ Set up | `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY` |
| January 2026 Gap | ❌ Missing | ~3.5 weeks of trades not in DB |

---

## Phase 1: Fill the January Gap (One-Time)

### Problem
The SEC Q4 2025 file covers through December 31, 2025. Trades from January 1-24, 2026 are not in the database.

### Solution
Run the FMP ingestion script manually to fetch recent trades.

### Steps

1. **Run FMP ingestion locally:**
   ```bash
   cd /Users/cliffordtraff/Desktop/Coding/Fin\ Quote
   npx tsx scripts/ingest-fmp-insiders.ts --limit 1000
   ```

2. **Expected output:**
   ```
   FMP Insider Trades Ingestion
   ============================
   Limit: 1000

   Fetching 1000 trades from FMP API...
   Fetched 1000 trades
   Valid trades: ~950
   Progress: 50/950 (45 inserted, 5 duplicates)
   ...
   Progress: 950/950 (870 inserted, 80 duplicates)

   ============================
   COMPLETE
     Fetched: 1000
     Inserted: ~870
     Skipped: ~130
     Duration: ~2-3 minutes
   ```

3. **Verify in database:**
   ```bash
   npx tsx -e '
   import { createClient } from "@supabase/supabase-js"
   import dotenv from "dotenv"
   dotenv.config({ path: ".env.local" })
   const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

   async function check() {
     const { count } = await supabase.from("insider_transactions").select("*", { count: "exact", head: true })
     console.log("Total transactions:", count)

     const { count: fmpCount } = await supabase.from("insider_transactions").select("*", { count: "exact", head: true }).eq("source", "fmp")
     console.log("FMP transactions:", fmpCount)
   }
   check()
   '
   ```

### Acceptance Criteria
- [ ] FMP script runs without errors
- [ ] ~800-1000 new transactions inserted
- [ ] Recent trades (January 2026) visible in `/insiders` page

---

## Phase 2: Verify Automated Pipeline

### Problem
Need to confirm GitHub Actions cron job works correctly for ongoing updates.

### Steps

1. **Trigger workflow manually:**
   - Go to: https://github.com/cliffordtraff/Fin-Quote/actions
   - Click "Daily Data Update" workflow
   - Click "Run workflow" → "Run workflow"

2. **Monitor execution:**
   - Watch the job logs
   - Check for "Ingest insider trades" step
   - Verify it completes successfully

3. **Verify data in database:**
   - Run same verification query as Phase 1
   - Confirm row count increased

### Acceptance Criteria
- [ ] GitHub Actions workflow runs successfully
- [ ] "Ingest insider trades" step completes without error
- [ ] Ingestion log created in `ingestion_logs` table

---

## Phase 3: Ongoing Operations

### Daily Updates (Automated)

| What | When | How |
|------|------|-----|
| FMP ingestion | Daily at 2am UTC | GitHub Actions cron |
| Fetches | 500 latest trades | FMP API |
| Dedupe | Via unique constraint | Duplicates silently skipped |

**Monitoring:**
- Check GitHub Actions → "Daily Data Update" for failures
- Query `ingestion_logs` table for stats:
  ```sql
  SELECT * FROM ingestion_logs ORDER BY created_at DESC LIMIT 10;
  ```

### Quarterly Updates (Manual)

| What | When | How |
|------|------|-----|
| SEC bulk file | ~45 days after quarter end | Download ZIP manually |
| Process | Extract to `data/sec-insiders/` | Unzip |
| Ingest | Run fast script | `npx tsx scripts/ingest-sec-local-fast.ts` |

**Timeline:**
- Q1 2026 file (Jan-Mar) → Available ~mid-May 2026
- Q2 2026 file (Apr-Jun) → Available ~mid-August 2026

---

## File Reference

| File | Purpose | Run Frequency |
|------|---------|---------------|
| `scripts/ingest-fmp-insiders.ts` | Fetch recent trades from FMP | Daily (automated) |
| `scripts/ingest-sec-local-fast.ts` | Bulk load SEC quarterly data | Quarterly (manual) |
| `scripts/ingest-sec-local.ts` | Original slow script (deprecated) | Never |
| `.github/workflows/daily-data-update.yml` | Cron configuration | N/A |

---

## Deduplication Strategy

### How it works

**SEC data** has `accession_number` (unique filing ID):
```sql
UNIQUE INDEX idx_insider_tx_accession_dedupe ON insider_transactions
  (accession_number, reporting_name, transaction_date, transaction_code, shares)
  WHERE accession_number IS NOT NULL;
```

**FMP data** has no accession_number, uses different constraint:
```sql
UNIQUE INDEX idx_insider_tx_fmp_dedupe ON insider_transactions
  (symbol, reporting_name, transaction_date, transaction_code, shares, price, filing_date)
  WHERE accession_number IS NULL;
```

### What this means
- SEC records dedupe against each other via accession_number
- FMP records dedupe against each other via the multi-column constraint
- A trade could exist as both SEC and FMP record (rare, but possible)
- This is acceptable - when SEC quarterly file is loaded, it becomes the authoritative source

---

## Cost Considerations

| Resource | Usage | Limit | Status |
|----------|-------|-------|--------|
| Supabase storage | ~32 MB | 500 MB (free) | ✅ 6.4% used |
| FMP API | 500 calls/day | Varies by plan | ✅ Within limits |
| GitHub Actions | ~1 min/day | 2000 min/month | ✅ ~30 min/month |

---

## Future Improvements (Optional)

1. **Batch FMP script** - Apply same optimization as SEC script (not critical for 500 rows)

2. **SEC EDGAR RSS polling** - Real-time Form 4 ingestion instead of waiting for FMP
   - Polls SEC RSS feed every 15 minutes
   - Parses XML filings directly
   - Eliminates FMP dependency

3. **Alerting** - Slack/email notifications when:
   - Daily ingestion fails
   - Unusual volume detected (cluster buying/selling)

---

## Execution Checklist

### Immediate (Today)
- [ ] Run `npx tsx scripts/ingest-fmp-insiders.ts --limit 1000`
- [ ] Verify January trades appear in database
- [ ] Trigger GitHub Actions workflow manually
- [ ] Verify workflow completes successfully

### This Week
- [ ] Monitor that automated daily runs succeed
- [ ] Check `/insiders` page shows recent trades

### Quarterly (Next: ~May 2026)
- [ ] Download Q1 2026 SEC file when available
- [ ] Run `npx tsx scripts/ingest-sec-local-fast.ts`
- [ ] Verify ~60K new transactions loaded
