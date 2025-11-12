# Baseline Metrics - Answer Validation System

**Date:** November 2, 2025
**Purpose:** Establish baseline before implementing answer validation
**Measurement Period:** Last 7 days (Oct 26 - Nov 2, 2025)

---

## Summary

| Metric | Value | Target After Validation |
|--------|-------|------------------------|
| Thumbs up rate | 66.7% | 75-80% |
| Thumbs down rate | 33.3% | <20% |
| Average response time | 4,350ms | <4,500ms (allow +150ms for validation) |
| Error rate | 0.00% | <1% |
| Query volume | 6.6 queries/day | - |
| Manual accuracy check | **Need to complete** | 95%+ |

---

## Detailed Findings

### 1. User Feedback

**Total queries with feedback:** 3 (out of 46 total)
- Thumbs up: 2 (66.7%)
- Thumbs down: 1 (33.3%)

**Note:** Very low feedback rate (6.5% of users provide feedback). Most queries have no feedback, making it hard to assess actual satisfaction.

**Recommendation:** Encourage more feedback or implement passive accuracy tracking.

---

### 2. Response Time Breakdown

**Average total:** 4,350ms (4.35 seconds)

Breakdown:
- Tool selection: 1,198ms (27.5%)
- Tool execution: 319ms (7.3%)
- Answer generation: 2,832ms (65.1%) ← Largest component

**Analysis:**
- Answer generation (LLM) takes the most time
- Adding validation (<100ms expected) will have minimal impact
- Total response time under 5s is acceptable for complex queries

---

### 3. Error Rate

**Queries with tool errors:** 0 out of 46 (0%)

**Analysis:**
- No technical failures (database queries work reliably)
- BUT: This doesn't measure answer accuracy
- System can return wrong answers without technical errors
- This is why we need validation!

---

### 4. Query Volume

**Total queries:** 46 over 7 days
- Nov 1: 32 queries
- Nov 2: 14 queries

**Average:** 6.6 queries/day

**Analysis:**
- Low volume (early testing phase)
- Enough data to establish patterns
- Volume likely to grow as system improves

---

### 5. Tool Usage Distribution

| Tool | Count | Percentage |
|------|-------|------------|
| getAaplFinancialsByMetric | 32 | 69.6% |
| getRecentFilings | 6 | 13.0% |
| getPrices | 5 | 10.9% |
| searchFilings | 3 | 6.5% |

**Analysis:**
- Financial metrics (revenue, net income, etc.) are most common
- This is where validation will have the highest impact
- Focus validation efforts on number/year accuracy

---

## Critical Finding: The 2020 Inconsistency Problem

### Evidence of Accuracy Issues

**Same question, different answers:**

**Query A (ID: f13c9d07):**
- Question: "What was AAPL's net income in 2020?"
- Answer: ✓ **"AAPL's net income in 2020 was $57.4 billion"**
- User feedback: Thumbs up
- **Result: CORRECT**

**Query B (ID: 2baf8e95):**
- Question: "What was AAPL's net income in 2020?"
- Answer: ✗ **"I do not have the net income for 2020"**
- User feedback: None
- **Result: INCORRECT (2020 data exists!)**

**Root Cause:**
- Tool selection sometimes uses limit: 1 (returns only 2024 data)
- Tool selection sometimes uses limit: 10 (returns 2015-2024 data)
- Inconsistent behavior for the same query type

**Impact:**
- Users get different answers for the same question
- Erodes trust in the system
- Some users see correct data, others don't

### Additional Problematic Queries

**Query C (ID: eefbc359):**
- Question: "what about net income"
- Answer: "I have data for net income from 2021 to 2024, but not for 2020"
- **Problem:** 2020 data exists but wasn't fetched

**Query D (ID: 4dcdc10b):**
- Question: "you don't have 2020?"
- Answer: "I do not have data for 2020"
- **Problem:** 2020 data exists, user is confused and frustrated

### What Validation Will Catch

With our year validator, we would detect:
1. LLM says "I don't have 2020 data"
2. Validator checks: Does 2020 exist in database?
3. Validator finds: YES! 2020 exists
4. Validator flags: **CRITICAL - Data exists but wasn't fetched**
5. System regenerates with correct limit
6. User gets correct answer

---

## Manual Accuracy Review (Needed)

**Sample queries provided:** 10 random queries from last 7 days

### Manual Review Checklist

For each query, check:
- [ ] Are numbers correct and match expected data?
- [ ] Do years/dates mentioned actually exist?
- [ ] Are citations and filing references real?
- [ ] Does answer address the actual question?
- [ ] Is formatting correct (units, decimals)?

### Preliminary Assessment (from sample review)

**Identified Issues:**
1. **2020 data inconsistency** - 3 out of 10 samples show this problem (30%)
2. **All financial numbers appear correct** when data is returned
3. **No hallucinated filings** in the samples
4. **Formatting is consistent** ($XXX.XB format)

**Estimated Accuracy:** ~70% (7 correct, 3 have the missing year issue)

---

## Implications for Validation System

### High-Priority Validators

Based on baseline findings, prioritize:

1. **Year Validator** (CRITICAL)
   - 30% of sample queries had year-related issues
   - Most impactful validator to build first
   - Will catch tool argument problems

2. **Number Validator** (HIGH)
   - Numbers appear correct when returned
   - But need to verify this systematically
   - Prevent future regressions

3. **Filing Validator** (MEDIUM)
   - No issues found in samples
   - But filing queries are only 6.5% of traffic
   - Build after year/number validators

### Expected Impact

**If we fix the year issue alone:**
- Accuracy: 70% → 95%+ (25 point improvement)
- User satisfaction: 67% → 80%+ (13 point improvement)
- Inconsistency: eliminated

**With full validation system:**
- Catch 95%+ of factual errors
- Reduce thumbs down from 33% to <10%
- Increase user trust and confidence

---

## Success Metrics Targets

### After Phase 0 (Prompt Improvements)

Expected improvements from stricter prompts:
- Thumbs up rate: 67% → 75% (+8 points)
- Year inconsistency: 30% → 15% (50% reduction)

### After Phase 1 (Basic Validators)

Expected improvements from year + number validation:
- Thumbs up rate: 75% → 80% (+5 points)
- Year inconsistency: 15% → <5% (66% reduction)
- Validation pass rate: >95%

### After Phase 3 (Auto-Correction)

Expected improvements from regeneration:
- Thumbs up rate: 80% → 85% (+5 points)
- Auto-correction success: 50%+ of failures fixed
- User-visible error rate: <2%

---

## Next Steps

1. ✓ Baseline metrics collected
2. ⏳ Run database migration (data/add-validation-columns.sql)
3. ⏳ Proceed to Phase 0: Prompt improvements
4. ⏳ Measure improvement from prompts alone
5. ⏳ Build Phase 1 validators

---

## Appendix: Sample Queries

### Correct Examples

**Query 1:**
- Q: "aapl revenue over last 5 years"
- A: Shows 2020-2024 revenue correctly
- Status: ✓ CORRECT

**Query 2:**
- Q: "What was AAPL's net income in 2020?"
- A: "$57.4 billion"
- Feedback: Thumbs up
- Status: ✓ CORRECT

### Incorrect Examples

**Query 3:**
- Q: "What was AAPL's net income in 2020?"
- A: "I do not have the net income for 2020"
- Problem: 2020 data exists but wasn't fetched
- Status: ✗ INCORRECT

**Query 4:**
- Q: "what about net income"
- A: "I have data from 2021 to 2024, but not for 2020"
- Problem: User asking follow-up, system lost context + wrong limit
- Status: ✗ INCORRECT

---

**Conclusion:** Clear baseline established. The 2020 year issue affects ~30% of queries and is the highest priority to fix. Validation system will have significant impact on user satisfaction and answer consistency.
