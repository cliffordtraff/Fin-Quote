# Phase 0 Test Plan - Answer Validation Prompt Improvements

**Date:** November 2, 2025
**Purpose:** Test prompt improvements before building full validators
**Baseline:** 67% thumbs up rate, 30% year-related issues
**Target:** 75% thumbs up rate, 15% year-related issues

---

## What Changed in Phase 0

Updated `buildFinalAnswerPrompt` in lib/tools.ts with **CRITICAL VALIDATION RULES**:

1. **NUMBERS** - Use exact numbers from data (not rounded)
2. **YEARS** - Only mention years that exist in facts JSON
3. **DATES** - Use exact dates from data
4. **CITATIONS** - Use exact filing information
5. **UNCERTAINTY** - Admit when unsure rather than guess

**Goal:** Improve answer accuracy by explicitly instructing the LLM to:
- Verify years exist before mentioning them
- Use exact numbers instead of rounding
- Admit missing data instead of claiming it doesn't exist

---

## Critical Test Cases (From Baseline Metrics)

These queries previously failed due to the "2020 inconsistency problem":

### Test 1: Net Income 2020 (HIGH PRIORITY)
**Question:** "What was AAPL's net income in 2020?"
**Expected:** "$57.4 billion" (2020 data exists!)
**Previously Failed With:** "I do not have the net income for 2020"
**Why it failed:** Tool selection used limit:1, only returned 2024 data

### Test 2: Net Income Context Question
**Question:** "what about net income" (follow-up to previous question)
**Expected:** Should return data including 2020
**Previously Failed With:** "I have data from 2021 to 2024, but not for 2020"
**Why it failed:** Lost context + wrong limit

### Test 3: User Confusion Follow-up
**Question:** "you don't have 2020?"
**Expected:** "I have 2020 data, AAPL's net income was $57.4 billion"
**Previously Failed With:** "I do not have data for 2020"
**Why it failed:** Compounding error from previous wrong answer

### Test 4: Revenue 5 Years
**Question:** "aapl revenue over last 5 years"
**Expected:** Shows 2020-2024 revenue correctly (5 years)
**Previous Status:** ✓ CORRECT
**Purpose:** Verify we don't break working queries

### Test 5: Number Precision
**Question:** "What was Apple's revenue in 2024?"
**Expected:** "$383.3B" (exact: 383,285,000,000)
**Should NOT say:** "$383B" or "around $380B"
**Purpose:** Test number precision rule

---

## Testing Methodology

### Option A: Manual Testing in Production App

1. Navigate to http://localhost:3000/ask
2. Enter each test question
3. Verify answer matches expectations
4. Record results in table below

### Option B: Direct API Testing

Create a test script that:
1. Calls the ask-question action directly
2. Checks if answer contains expected values
3. Flags failures

---

## Test Results Template

| Test | Question | Expected | Result | Pass/Fail | Notes |
|------|----------|----------|--------|-----------|-------|
| 1 | Net income 2020? | $57.4B | ___ | ___ | ___ |
| 2 | What about net income | Includes 2020 | ___ | ___ | ___ |
| 3 | You don't have 2020? | Yes, $57.4B | ___ | ___ | ___ |
| 4 | Revenue last 5 years | 2020-2024 | ___ | ___ | ___ |
| 5 | Revenue 2024? | $383.3B (precise) | ___ | ___ | ___ |

**Success Criteria:** 4 out of 5 tests pass (80%)

---

## Expected Impact

**If prompt improvements work:**
- Tests 1-3 should now pass (previously failed)
- Year-related issues: 30% → 15% (50% reduction)
- Thumbs up rate: 67% → 75% (+8 points)

**If prompt improvements don't work:**
- Tests 1-3 still fail
- Need to proceed directly to Phase 1 (build validators)
- Validators will catch and regenerate bad answers

---

## Root Cause: Tool Selection vs Answer Generation

**Important Note:** The prompt improvements in Phase 0 help with answer **presentation**, but can't fix the root cause of the 2020 issue, which is **tool selection using wrong limit**.

**The real problem:**
```
User: "Net income in 2020?"
Tool router: limit: 1 ← WRONG (should be limit: 10 for specific year)
Database: Returns only 2024 data
LLM: "I don't have 2020 data" ← Technically correct given what it received!
```

**What Phase 0 can improve:**
- Better number formatting
- Clearer uncertainty statements
- More accurate date citations
- Explicit year verification (but only if data is present)

**What Phase 0 CANNOT fix:**
- Tool router selecting wrong limit
- Missing data due to wrong tool arguments

**Why Phase 0 is still valuable:**
- Improves answer quality for queries where data IS present
- Reduces hallucination and rounding errors
- Sets foundation for Phase 1 validators
- Expected 8-10 point improvement in thumbs up rate

**Next Step After Testing:**
- If Phase 0 shows <10% improvement → proceed to Phase 1 validators
- If Phase 0 shows >30% improvement → still build validators, but expectations are higher
- Validators will catch the tool selection issue by checking if mentioned years exist in database

---

## How to Run Tests

### Step 1: Start the dev server (if not running)
```bash
npm run dev
```

### Step 2: Test queries manually
Navigate to http://localhost:3000/ask and enter each test question.

### Step 3: Document results
Fill in the Test Results Template above with actual responses.

### Step 4: Calculate improvement
Compare results to baseline metrics:
- Count how many tests pass
- Document specific improvements
- Note any regressions

### Step 5: Decide next step
- If 4+ tests pass: Phase 0 success! Proceed to Phase 1 validators.
- If <2 tests pass: Phase 0 minimal impact. Urgently need Phase 1 validators.
- If 2-3 tests pass: Partial success. Build Phase 1 validators to catch remaining issues.

---

## Notes

- Phase 0 is a "quick win" approach (2-3 hours)
- Minimal code changes (prompt only)
- No latency increase (same LLM call)
- Sets foundation for Phase 1 validators
- Even if Phase 0 shows minimal improvement, it's still valuable for future validation

**Remember:** The goal is to establish whether prompt engineering alone can improve accuracy, or if we need programmatic validators (Phase 1) to catch errors systematically.
