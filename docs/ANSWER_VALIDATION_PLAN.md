# Answer Validation System - Implementation Plan

## Table of Contents
1. [What We're Building](#what-were-building)
2. [Why We Need This](#why-we-need-this)
3. [Understanding the Problem](#understanding-the-problem)
4. [How Answer Validation Works](#how-answer-validation-works)
5. [What Problems This Solves](#what-problems-this-solves)
6. [Implementation Plan](#implementation-plan)
7. [Success Metrics](#success-metrics)

---

## What We're Building

**Short Answer:** A system that checks if the LLM's answer actually matches the data we gave it, BEFORE showing the answer to users.

**Long Answer:** We're adding a new validation layer that runs after the LLM generates an answer but before the user sees it. This validator will check:
- Do numbers in the answer match the data?
- Do years/dates mentioned actually exist in the data?
- Are citations and quotes real?
- Does the answer make sense given the data?

**Think of it like:** A fact-checker that reviews the LLM's work before it gets published.

---

## Why We Need This

### The Current Problem

Right now, our app works like this:

```
1. User asks: "What was net income in 2020?"
2. System fetches data from database
3. LLM generates answer
4. Answer goes straight to user ← NO FACT-CHECKING HERE!
```

**What could go wrong?**

Even though we validated:
- ✓ The question wasn't empty
- ✓ The database query worked
- ✓ We got data back

We DON'T check:
- ✗ Is the answer actually correct?
- ✗ Did the LLM make up numbers?
- ✗ Did the LLM mention years that don't exist in the data?

### Real Examples of Things That Can Go Wrong

#### Example 1: The Missing Year

**What happens:**
- User: "What was revenue in 2020?"
- System fetches data but only gets 2024 data (due to wrong limit)
- LLM says: "I don't have 2020 data"
- User sees this answer

**The problem:**
- 2020 data DOES exist in the database!
- The tool just used wrong arguments
- But we don't catch this error
- User thinks we don't have the data (we do!)

**If we had answer validation:**
- LLM says: "I don't have 2020 data"
- Validator checks: "Wait, does 2020 exist in the database?"
- Validator finds: "Yes! 2020 exists but wasn't fetched!"
- System flags the error or automatically retries with correct arguments
- User gets the right answer

#### Example 2: Wrong Numbers

**What happens:**
- User: "What was net income in 2023?"
- System fetches: 2023 = $96,995,000,000
- LLM says: "Net income in 2023 was $94.7B"
- User sees this wrong answer

**The problem:**
- LLM made an error (maybe rounded wrong, used old value from memory, or hallucinated)
- Answer is factually incorrect
- We don't catch it
- User gets misinformation

**If we had answer validation:**
- LLM says: "$94.7B"
- Validator checks: "Does $94.7B match the data?"
- Validator finds: "No! Data says $96.995B"
- System flags the error and regenerates, or shows warning
- User doesn't get misinformation

#### Example 3: Hallucinated Filing

**What happens:**
- User: "What does the 10-K say about AI?"
- System searches filing chunks
- LLM says: "According to the June 2025 10-K filing..."
- User sees this answer

**The problem:**
- There IS NO June 2025 10-K filing!
- LLM invented it (hallucination)
- Answer includes fake citation
- User thinks this is real

**If we had answer validation:**
- LLM mentions: "June 2025 10-K"
- Validator checks: "Does this filing exist in our data?"
- Validator finds: "No such filing!"
- System flags hallucination
- User doesn't get fake information

---

## Understanding the Problem

### Why Does the LLM Make These Mistakes?

This is the most important concept to understand.

#### What You Might Think LLMs Do:

```
Step 1: Read the data carefully
Step 2: Parse it logically (like code)
Step 3: Check each fact
Step 4: Generate accurate answer
Step 5: Double-check the answer
```

#### What LLMs Actually Do:

```
Step 1: See text (question + data)
Step 2: Predict what words should come next
Step 3: Generate text that sounds plausible
Step 4: Done!
```

**No checking. No logic. Just pattern matching.**

### The Autocomplete Analogy

You know how your phone suggests the next word when you type?

**You type:** "I'm going to the..."
**Phone suggests:** "store" / "gym" / "park"

**How does it work?**
- Your phone learned patterns from millions of texts
- "going to the" is usually followed by a place
- It's GUESSING based on probability
- It's not THINKING or REASONING

**LLMs work the same way, just much more sophisticated:**
- They learned patterns from billions of texts
- They predict what words should come next
- They SOUND smart but aren't actually reasoning
- They can make confident-sounding mistakes

### Why Can't the LLM Just Self-Check?

**You might think:** "Just tell the LLM to verify its answer!"

**The problem:** The LLM doesn't actually verify. It generates text that SOUNDS like verification.

**Example:**

```
Prompt: "Answer the question. Then verify your answer is correct."

LLM Output:
"Net income in 2020 was $95.7B.

Verification: I have verified this number against the provided
data and it is accurate."
```

**What happened?**
- The LLM didn't actually check anything
- It just generated text that sounds like a verification
- The verification is itself a prediction/guess
- It's like asking someone who's not paying attention to check their work - they'll say "yep, looks good!" without looking

### Why Code Validation is Different

**Code does actual logic:**

```
Step 1: Parse the data (turn JSON into usable objects)
Step 2: Extract numbers from answer
Step 3: Compare: answer number vs data number
Step 4: Calculate: are they within acceptable range?
Step 5: Return: true or false
```

**This is deterministic:**
- Same input = same output, every time
- Actually checks facts
- Can't hallucinate
- Follows exact logic

**Code is like a calculator:** Always gives the same answer for 2+2.

**LLM is like asking someone to estimate:** Might say 4, might say 3.9, might say "around 4."

---

## How Answer Validation Works

### The Complete Flow (With Validation)

```
Step 1: User asks question
   ↓
Step 2: Validate input (already exists)
   - Is question empty?
   ↓
Step 3: LLM selects which tool to use
   ↓
Step 4: Validate tool parameters (already exists)
   - Are arguments valid?
   ↓
Step 5: Tool fetches data from database
   ↓
Step 6: Validate tool success (already exists)
   - Did we get data?
   ↓
Step 7: LLM generates answer
   ↓
Step 8: 🆕 VALIDATE ANSWER (new!)
   - Do numbers match?
   - Do years exist?
   - Are citations real?
   ↓
Step 9a: If validation passes → Show answer to user
Step 9b: If validation fails → Flag error, maybe regenerate
```

### What Each Validation Checks

#### 1. Number Validation

**Purpose:** Ensure numbers in the answer match the data

**How it works:**
1. Extract all numbers from the LLM's answer
   - "Revenue was $383.3B" → Extract: 383.3B
2. Extract corresponding numbers from data
   - Data: revenue = 383,285,000,000
3. Convert to same units (both to billions)
   - Answer: 383.3B
   - Data: 383.285B
4. Check if they're close enough (within tolerance)
   - Difference: 0.015B (very small)
   - Within acceptable range? YES ✓

**Catches:**
- Wrong numbers
- Wrong units ($383M instead of $383B)
- Hallucinated values

#### 2. Year/Date Validation

**Purpose:** Ensure years mentioned actually exist in the data

**How it works:**
1. Extract years from the LLM's answer
   - "Revenue in 2020 was..." → Extract: 2020
2. Check what years exist in the data
   - Data has: [2024, 2023, 2022, 2021]
3. Compare
   - Is 2020 in the list? NO ✗
4. Flag the discrepancy
   - Check database: Does 2020 exist but wasn't fetched?
   - Or: Does 2020 not exist at all?

**Catches:**
- Mentioning years not in data
- Wrong date ranges
- Future dates that don't exist

#### 3. Citation/Filing Validation

**Purpose:** Ensure filings and quotes mentioned are real

**How it works:**
1. Extract filing references from answer
   - "According to the June 2025 10-K..." → Extract: "June 2025 10-K"
2. Check what filings exist in the data
   - Data has: [Nov 2024 10-K, Aug 2025 10-Q, ...]
3. Compare
   - Is "June 2025 10-K" in the list? NO ✗
4. Flag hallucination

**Catches:**
- Fake filing references
- Wrong filing types (10-Q instead of 10-K)
- Wrong dates

#### 4. Data Consistency Check

**Purpose:** Ensure answer doesn't contradict itself or the data

**How it works:**
1. Check for logical contradictions
   - Does answer say "no data" when we have data?
   - Does answer mention metric that wasn't in the data?
2. Check completeness
   - If user asks for specific year, does answer address it?
   - If user asks for a trend, does answer show multiple years?

**Catches:**
- "I don't have data" when data exists
- Answering wrong question
- Incomplete responses

### What Happens When Validation Fails?

We have several options:

#### Option 1: Regenerate Answer (Automatic Fix)
```
Validation fails
   ↓
Try regenerating answer with stronger prompt:
"IMPORTANT: Only use these exact numbers from the data..."
   ↓
Validate again
   ↓
If passes: Show to user
If fails again: Use Option 2 or 3
```

#### Option 2: Flag and Show (With Warning)
```
Validation fails
   ↓
Add warning to answer:
"⚠️ This answer may contain inaccuracies"
   ↓
Show answer + warning to user
   ↓
Log the issue for review
```

#### Option 3: Block and Show Error
```
Validation fails critically
   ↓
Don't show LLM answer
   ↓
Show error message:
"Unable to generate accurate answer. Please try rephrasing."
   ↓
Log the issue for urgent review
```

### Validation Results Get Logged

**Every validation is logged:**
- Query ID
- Which checks passed
- Which checks failed
- Why they failed
- What was the discrepancy

**This creates a dataset for:**
- Identifying patterns in failures
- Measuring system accuracy
- Training better prompts
- Building regression tests

---

## What Problems This Solves

### Problem 1: Silent Failures

**Before:** Errors happen, users see wrong answers, you don't know
**After:** Every error is caught and logged, you know immediately

### Problem 2: Low Trust

**Before:** Users can't trust answers, they have to verify everything themselves
**After:** Answers are fact-checked, users gain confidence

### Problem 3: Slow Feedback Loop

**Before:**
- Bad answer shown Monday
- User reports it Wednesday (maybe)
- You review it Friday
- Fix deployed next Monday
- 1 week lag

**After:**
- Bad answer attempted Monday 10am
- Validation fails Monday 10:00:01
- Issue logged immediately
- Pattern analysis that evening
- Fix deployed Tuesday
- Less than 24 hour lag

### Problem 4: Unknown Error Rate

**Before:** No idea what % of answers are wrong
**After:** Exact metrics: "97% of answers pass validation, 3% flagged"

### Problem 5: Hard to Improve

**Before:** Don't know what's failing or why
**After:** Clear data on failure patterns guides improvements

---

## Implementation Plan

### Pre-Implementation: Establish Baseline (Do First!)

**Time:** 4-6 hours
**Owner:** You (the developer)
**Priority:** CRITICAL - Must complete before building validators

#### 1. Measure Current Accuracy (2-3 hours)

**Collect baseline metrics:**

```sql
-- Current thumbs up/down ratio
SELECT
  user_feedback,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM query_logs
WHERE user_feedback IS NOT NULL
GROUP BY user_feedback;

-- Average response time
SELECT
  AVG(tool_selection_latency_ms + tool_execution_latency_ms + answer_latency_ms) as avg_total_ms
FROM query_logs
WHERE created_at > NOW() - INTERVAL '7 days';

-- Error rate (queries with tool errors)
SELECT
  COUNT(CASE WHEN tool_error IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as error_rate_pct
FROM query_logs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Manual accuracy check:**
1. Pull 50 random queries from last week
2. For each query, check:
   - Is the answer factually correct?
   - Do numbers match the data?
   - Are years/dates correct?
   - Are citations real?
3. Calculate: `Accuracy = Correct Answers / Total * 100`

**Document baseline:**
```
Baseline Metrics (as of [DATE]):
- Thumbs up rate: ??%
- Thumbs down rate: ??%
- Manual accuracy check: ??% (50 queries)
- Average response time: ??ms
- Error rate: ??%
```

#### 2. Design Data Model (1 hour)

**Add validation columns to query_logs:**

```sql
-- Run in Supabase SQL Editor
ALTER TABLE query_logs
ADD COLUMN IF NOT EXISTS validation_results JSONB,
ADD COLUMN IF NOT EXISTS validation_passed BOOLEAN,
ADD COLUMN IF NOT EXISTS validation_run_at TIMESTAMPTZ;

-- Add index for querying validation failures
CREATE INDEX IF NOT EXISTS idx_query_logs_validation_passed
ON query_logs(validation_passed);

-- Add comments
COMMENT ON COLUMN query_logs.validation_results IS
'JSONB containing results of all validation checks:
{
  "number_validation": {"status": "pass"|"fail"|"skip", "details": {...}},
  "year_validation": {"status": "pass"|"fail"|"skip", "details": {...}},
  "filing_validation": {"status": "pass"|"fail"|"skip", "details": {...}},
  "overall_severity": "none"|"low"|"medium"|"high"|"critical"
}';
```

**Example validation_results payload:**
```json
{
  "number_validation": {
    "status": "pass",
    "checked": ["383.3B"],
    "matched": [383285000000],
    "tolerance": 0.1
  },
  "year_validation": {
    "status": "fail",
    "mentioned_years": [2020],
    "available_years": [2024, 2023, 2022, 2021],
    "missing_years": [2020],
    "severity": "medium"
  },
  "overall_severity": "medium"
}
```

#### 3. Define Failure-Handling Policy (1 hour)

**Decision Table:**

| Failure Type | Severity | Confidence | Action | User Message | Log Priority |
|--------------|----------|------------|--------|--------------|--------------|
| Number mismatch >10% | High | High | Block + Regenerate | "Unable to verify accuracy. Please try again." | Error |
| Number mismatch 5-10% | Medium | Medium | Regenerate once | Show regenerated answer | Warning |
| Number mismatch <5% | Low | High | Allow + Log | None | Info |
| Year missing (exists in DB) | High | High | Regenerate with all years | Show regenerated answer | Error |
| Year missing (not in DB) | Low | High | Allow + Log | None | Info |
| Future date mentioned | High | High | Block + Regenerate | "Date validation error" | Error |
| Fake filing reference | Critical | High | Block | "Citation error detected" | Critical |
| Real filing, wrong date | Medium | Medium | Regenerate once | Show regenerated answer | Warning |
| Quoted text not found | High | Medium | Flag + Allow with warning | None (logged for review) | Error |
| "No data" but data exists | Critical | High | Regenerate with correction | Show regenerated answer | Critical |

**Regeneration limits:**
- Max 1 retry per query
- If retry also fails validation: show error, don't show either answer
- All regenerations logged with reason

---

### Phase 0: Quick Wins with Prompt Improvements (Week 0)

**Time:** 2-3 hours
**Goal:** Improve accuracy with minimal code changes
**Why:** Might solve 20-30% of issues before building validators

#### What to Change:

**1. Update `buildFinalAnswerPrompt` in lib/tools.ts:**

Current prompt section:
```
Instructions:
- Be concise and clear.
- [existing instructions...]
```

Add these rules:
```
CRITICAL VALIDATION RULES:
1. Numbers: Use EXACT numbers from the data. Format large numbers with B (billions) or M (millions).
   Example: 383285000000 → "$383.3B" (not "$383B" or "around $380B")

2. Years: ONLY mention years that appear in the facts JSON.
   If asked about a year not in the data, say: "I don't have data for [year]."
   DO NOT extrapolate or estimate.

3. Dates: Check the filing_date in the data. Do not invent dates.

4. Citations: If mentioning a filing, use the EXACT date and type from the data.
   Example: "According to the 10-K filed November 1, 2024..."

5. If you're unsure about ANY fact, say so. It's better to admit uncertainty than provide wrong information.
```

#### Testing:

**Test with 10 queries that previously failed:**
1. Run queries through updated prompt
2. Manually check if answers improved
3. Document improvement rate
4. If <10% improvement: proceed with validators
5. If >30% improvement: still build validators, but expectations are higher

#### Success Criteria:
- Documented improvement in accuracy
- Identified which error types are reduced
- Baseline for validator effectiveness

---

### Phase 1: Build Basic Validators (Week 1)

**Time:** 8-12 hours
**Owner:** You (the developer)
**Goal:** Create validators that check numbers and years

#### What We'll Build:

**1. Number Validator** (3-4 hours)
- Extracts numbers from LLM answer
- Extracts numbers from data
- Compares them (with tolerance for rounding)
- Returns: pass/fail + details

**2. Year Validator** (2-3 hours)
- Extracts years from LLM answer
- Lists years in data
- Checks if all mentioned years exist
- If not, checks database to see if they exist but weren't fetched
- Returns: pass/fail + details

**3. Integration** (2-3 hours)
- Add validation step to ask-question.ts
- Run validators after LLM generates answer
- Log results to database
- For now: Just log failures, still show answers

**4. Validator Testing** (2-3 hours)
- Write unit tests for each validator
- Create golden examples (inputs with known correct outputs)
- Test edge cases

**Why start here:**
- Numbers and years are most common issues (based on baseline analysis)
- Relatively simple to implement
- High impact (catches many real errors)
- Fast feedback loop for testing

#### Validator Testing Plan:

**Number Validator Tests:**
```typescript
// Test cases
✓ Exact match: "$383.3B" matches 383285000000
✓ Within tolerance: "$383B" matches 383285000000 (0.1% diff)
✓ Out of tolerance: "$350B" fails for 383285000000 (8.7% diff)
✓ Wrong units: "$383M" fails for 383285000000
✓ Multiple numbers: "Revenue $383.3B, up from $274.5B" (check both)
✗ No numbers in answer: skip validation
✓ Numbers in text: "twenty billion" vs 20000000000
```

**Year Validator Tests:**
```typescript
// Test cases
✓ Year in data: "2023" when data has [2024, 2023, 2022]
✗ Year not in data: "2020" when data has [2024, 2023, 2022]
✓ Multiple years: "from 2020 to 2024" (check all mentioned)
✗ Year exists in DB: "2020" - check if it's in database but wasn't fetched
✓ Future year: "2026" should fail
✗ No years mentioned: skip validation
```

#### Success Criteria:
- Validators run on every query
- Results logged to database with proper JSONB structure
- Can see validation pass/fail rate in logs
- Unit tests achieve >90% coverage
- <50ms added latency per query

### Phase 2: Add Filing/Citation Validation (Week 2)

**Time:** 6-8 hours
**Owner:** You (the developer)
**Goal:** Detect hallucinated filing references

#### What We'll Build:

**1. Filing Reference Validator** (3-4 hours)
- Extracts filing mentions from answer
- Checks if they exist in returned data
- Validates filing dates and types
- Returns: pass/fail + details

**2. Quote Validator** (2-3 hours)
- Extracts quoted text from answer
- Checks if quote appears in returned passages
- Returns: pass/fail + details

**3. Testing** (1-2 hours)
- Unit tests for filing/quote extraction
- Test with real filing data
- Verify citation accuracy

#### Success Criteria:
- Catches fake filing references (>95% accuracy)
- Catches made-up quotes (>90% accuracy)
- All validation results logged with details
- False positive rate <10%

### Phase 3: Add Auto-Correction (Week 3)

**Time:** 6-8 hours
**Owner:** You (the developer)
**Goal:** Automatically fix simple failures

#### What We'll Build:

**1. Regeneration Logic** (3-4 hours)
- When validation fails, try once more with stronger prompt
- Include specific error in prompt: "The year 2020 was not found in your answer..."
- Validate again
- If passes: show new answer
- If fails: flag for manual review

**2. Smart Prompting** (2-3 hours)
- Based on failure type, customize regeneration prompt
- Number mismatch → "Use EXACT numbers from data"
- Missing year → "Data includes year X which you must mention"
- Hallucinated filing → "Only use filings with these exact dates: [list]"

**3. Testing & Monitoring** (1-2 hours)
- Test regeneration on known failures
- Monitor regeneration success rate
- Track latency impact (regeneration adds 1-2s)

#### Success Criteria:
- 50%+ of failures auto-corrected successfully
- Auto-corrected answers pass validation
- Regeneration adds <3s to response time
- Users don't notice (seamless experience)

### Phase 4: Add Validation Dashboard (Week 4)

**Time:** 4-6 hours
**Owner:** You (the developer)
**Goal:** Make validation results visible and actionable

#### What We'll Build:

**1. Validation Stats View** (2-3 hours)
- Show daily/weekly pass rate
- Show most common failure types
- Show examples of each failure type
- Charts and trends
- Response time impact metrics

**2. Integration with Review Dashboard** (2-3 hours)
- Link validation failures to manual review system (`/admin/review`)
- Show validation details when reviewing queries
- Allow marking: "validation was correct" or "false positive"
- Filter by validation status

#### Success Criteria:
- Can see validation performance at a glance
- Can drill down into specific failures
- Can track improvement over time
- False positive identification helps tune validators

### Phase 5: Advanced Validation (Week 5+)

**Time:** 8-12 hours (ongoing improvement)
**Owner:** You (the developer)
**Goal:** Catch more subtle issues

#### What We'll Build:

**1. Logic Consistency Validator** (3-4 hours)
- Check for contradictions
- Check if answer addresses the question
- Check completeness
- Verify units are consistent throughout answer

**2. LLM-Assisted Validation** (3-4 hours)
- Use small, cheap LLM (GPT-4o-mini) to double-check answer
- Prompt: "Given this data, is this answer accurate? Respond with yes/no and reason."
- Acts as second opinion
- Cost: ~$0.0001 per validation

**3. Pattern Learning** (2-4 hours)
- Learn from manual reviews which validations matter most
- Adjust validation strictness based on query type
- Prioritize high-impact validations
- Build from manual review data collected in Phase 1-4

#### Success Criteria:
- 98%+ validation accuracy
- Catches subtle errors that earlier validators miss
- False positive rate <3%
- System continuously improves from feedback

---

## Operational Visibility & Monitoring

### Real-Time Monitoring (Set up in Phase 1)

#### Metrics Dashboard

**Key Metrics to Track:**

1. **Validation Pass Rate** (most important)
   - Target: >95% pass rate
   - Alert if: <80% pass rate (something's broken)

2. **Validation Failure Rate by Type**
   - Track: number_validation, year_validation, filing_validation
   - Identify which validators need tuning

3. **Response Time Impact**
   - Target: <100ms added per validation
   - Alert if: >500ms (performance issue)

4. **Auto-Correction Success Rate**
   - Target: >50% of failures corrected
   - Track: how many regenerations succeed vs fail

5. **False Positive Rate**
   - Target: <5%
   - Measure: manual review of flagged queries

#### Alert Conditions

**Critical Alerts** (immediate action needed):
```
IF validation_pass_rate < 50% FOR 1 hour
  → Email/Slack: "Validation system failing - check logs"
  → Possible causes: validator bug, database down, API issue

IF validation_latency > 1000ms FOR 10 minutes
  → Email/Slack: "Validation slow - performance degradation"
  → Possible causes: database slow, network issue

IF regeneration_rate > 30% FOR 2 hours
  → Email/Slack: "High regeneration rate - LLM quality issue?"
  → Possible causes: bad prompt, model degradation
```

**Warning Alerts** (monitor closely):
```
IF false_positive_rate > 10%
  → Review: validators may be too strict

IF specific_validator_failure_rate > 40%
  → Review: that validator may have bugs
```

#### Dashboard SQL Queries

**Hourly validation metrics:**
```sql
SELECT
  date_trunc('hour', created_at) as hour,
  COUNT(*) as total_queries,
  COUNT(*) FILTER (WHERE validation_passed = true) as passed,
  COUNT(*) FILTER (WHERE validation_passed = false) as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE validation_passed = true) / COUNT(*), 2) as pass_rate_pct,
  AVG((validation_results->>'latency_ms')::numeric) as avg_validation_latency_ms
FROM query_logs
WHERE validation_run_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Failure breakdown by type:**
```sql
SELECT
  jsonb_object_keys(validation_results) as validator_name,
  COUNT(*) FILTER (
    WHERE (validation_results->jsonb_object_keys(validation_results))->>'status' = 'fail'
  ) as failure_count
FROM query_logs
WHERE validation_passed = false
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY validator_name
ORDER BY failure_count DESC;
```

### Logging Strategy

**What to Log:**

**Every validation:**
- Query ID
- Timestamp
- Pass/fail status
- Detailed results (JSONB)
- Latency
- Action taken (shown, regenerated, blocked)

**Example log entry:**
```json
{
  "query_id": "abc123",
  "validation_passed": false,
  "validation_results": {
    "number_validation": {"status": "pass"},
    "year_validation": {
      "status": "fail",
      "mentioned_years": [2020],
      "available_years": [2024, 2023],
      "missing_years": [2020],
      "severity": "high"
    },
    "overall_severity": "high"
  },
  "action_taken": "regenerated",
  "regeneration_succeeded": true,
  "latency_ms": 45
}
```

### Health Checks

**Add to monitoring system:**

```typescript
// GET /api/health/validation
export async function GET() {
  const recentQueries = await getQueriesLast10Minutes()

  return {
    status: recentQueries.passRate > 0.8 ? 'healthy' : 'degraded',
    metrics: {
      pass_rate: recentQueries.passRate,
      avg_latency_ms: recentQueries.avgLatency,
      total_queries: recentQueries.count
    }
  }
}
```

### Weekly Review Checklist

**Every Monday morning (15 minutes):**

- [ ] Check validation pass rate (should be >90%)
- [ ] Review top 3 failure types
- [ ] Check false positive rate
- [ ] Review any alerts from past week
- [ ] Identify any patterns needing fixes
- [ ] Update decision table if needed

---

## Success Metrics

### How We'll Measure Success

#### Metric 1: Validation Pass Rate
- **What:** % of answers that pass all validations
- **Target:** Start at ???, improve to 95%+
- **Measure:** Daily/weekly tracking

#### Metric 2: User Trust (Thumbs Up Rate)
- **What:** % of answers users rate positively
- **Baseline:** Current thumbs up rate
- **Target:** +10-15% improvement
- **Measure:** Compare before/after validation

#### Metric 3: Error Detection Rate
- **What:** % of actual errors caught by validation
- **Target:** 90%+ of real errors flagged
- **Measure:** Manual review of flagged vs unflagged queries

#### Metric 4: False Positive Rate
- **What:** % of validations that flag correct answers as wrong
- **Target:** <5% false positives
- **Measure:** Manual review of flagged queries

#### Metric 5: Auto-Correction Success
- **What:** % of validation failures fixed by regeneration
- **Target:** 50%+ auto-corrected successfully
- **Measure:** Validation pass rate on regenerated answers

#### Metric 6: Response Time Impact
- **What:** How much slower are responses with validation?
- **Target:** <200ms added latency
- **Measure:** Response time before/after

### Weekly Checkpoints

**Week 1:**
- Validation running on 100% of queries
- Can see pass/fail rates
- Identified top 3 failure types

**Week 2:**
- Filing validation working
- Pass rate improved by 5%+
- False positive rate measured

**Week 3:**
- Auto-correction live
- 30%+ of failures auto-fixed
- User thumbs-up rate starting to improve

**Week 4:**
- Dashboard live
- Team reviewing validation results weekly
- Pattern analysis identifying improvements

**Week 5+:**
- 95%+ pass rate
- 10%+ improvement in user satisfaction
- Clear ROI on validation system

---

## Technical Considerations for Beginners

### Where Does This Code Live?

**New File:** `app/actions/validators.ts`
- Contains all validation functions
- Separate from main query logic
- Easy to test independently

**Modified File:** `app/actions/ask-question.ts`
- Add one validation step after LLM generates answer
- Minimal changes to existing flow

**New Database Columns:** `query_logs` table
- Add validation results
- Add validation timestamp
- Add validation details (which checks passed/failed)

### How Much Slower Will It Be?

**Current:** ~2-4 seconds per query
**With Validation:** ~2.1-4.2 seconds per query

**Why so fast?**
- Most validations are simple string/number comparisons
- No external API calls needed
- Runs in parallel with other operations where possible

### What If Validation Is Wrong?

**False positives** (validation flags correct answer as wrong):
- We'll tune thresholds based on manual review
- Better to be slightly lenient at first
- We log everything, so we can adjust

**False negatives** (validation misses actual error):
- User feedback (thumbs down) still works
- Manual review system still catches these
- Over time, we improve validators to catch more

### Can Users Override Validation?

**For now:** No, it's invisible to users
- Validation happens in background
- Users don't see validation results
- Failures just get logged

**Future:** Maybe add transparency
- "✓ Answer verified" badge on validated answers
- Warning icon on questionable answers
- Users can click to see validation details

---

## Why This Is Worth Building

### Time Investment
- Week 1: 8-12 hours (basic validators)
- Week 2: 6-8 hours (filing validation)
- Week 3: 6-8 hours (auto-correction)
- Week 4: 4-6 hours (dashboard)
- **Total:** ~30 hours over 4 weeks

### Expected Impact
- **Fewer user complaints:** Catch errors before users see them
- **Higher accuracy:** 10-20% improvement in correct answers
- **Better trust:** Users rely on answers without verifying
- **Faster improvement:** Know what's wrong immediately, not weeks later
- **Better prompts:** Data-driven prompt improvements
- **Competitive advantage:** More reliable than competitors

### ROI Calculation
- If 10% of answers currently have errors
- And 1000 users per week
- That's 100 bad answers per week
- If validation catches 80% of these
- That's 80 fewer complaints/week
- That's your customer support time saved
- Plus: users happier, trust more, return more

---

## Next Steps

1. **Review this plan:** Make sure you understand each phase
2. **Ask questions:** Anything unclear?
3. **Prioritize:** Which phase is most important to you?
4. **Start building:** Begin with Phase 1 basic validators
5. **Test and iterate:** Measure results, adjust as needed

---

## Appendix: Common Questions

### Q: Will this catch ALL errors?
**A:** No. But it will catch 80-90% of common errors. The remaining 10-20% are edge cases that improve over time.

### Q: What if the validator has bugs?
**A:** That's why we log everything and start with just logging (not blocking). We can tune validators based on real data.

### Q: Can't we just use a better LLM?
**A:** Better LLMs make fewer errors but still make some. And validation is cheap/fast compared to using more expensive models. Validation + good LLM is best combination.

### Q: What if users complain about warnings?
**A:** We start by just logging, not showing warnings. Only after we're confident in validation accuracy do we consider showing warnings to users.

### Q: How is this different from the manual review dashboard?
**A:**
- Manual review: Humans review query results after users see them
- Validation: Code checks every query automatically before users see them
- They work together: Validation catches issues immediately, manual review handles edge cases

### Q: Do we need both manual review AND validation?
**A:** Yes!
- Validation = Automated safety net (fast, consistent, catches common issues)
- Manual review = Human judgment (catches subtle issues, trains validation)
- Together = Best results

---

**Ready to build this?** Let's start with the Pre-Implementation baseline, then Phase 0, then Phase 1!
