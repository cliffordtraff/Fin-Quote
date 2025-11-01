# Prompt Evaluation & Continuous Improvement System

## Overview

This document outlines the complete system for evaluating and continuously improving the AI prompts used in Fin Quote. The goal is to measure prompt performance objectively, identify failure patterns, and systematically improve answer quality over time.

---

## Problem Statement

**Current State:**
- Prompts are hardcoded in `lib/tools.ts`
- No systematic way to test prompt changes before deploying
- Can't measure if a prompt improvement actually helps or hurts
- No visibility into which types of questions fail most often
- Improvement is guesswork, not data-driven

**Desired State:**
- Test prompt changes against 100 representative questions in minutes
- Objectively compare prompt versions with automated scoring
- Deploy only improvements that show measurable gains
- Identify and fix the most common failure patterns systematically
- Data-driven improvement loop with <1 day iteration cycles

---

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│ 1. GOLDEN TEST SET                                          │
│    - 100 representative questions                           │
│    - Expected outputs (tool, args)                          │
│    - Stored in: test-data/golden-test-set.json             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PROMPT VERSIONS                                          │
│    - Database table storing prompt v1, v2, v3...            │
│    - Version history with change descriptions               │
│    - Stored in: Supabase prompt_versions table             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. EVALUATION ENGINE                                        │
│    - Runs test questions through both prompts               │
│    - Scores results automatically                           │
│    - Optional: LLM-as-judge for answer quality              │
│    - Script: scripts/run-evaluation.ts                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. RESULTS & ANALYSIS                                       │
│    - Detailed results saved to JSON                         │
│    - Scorecard generated (terminal + optional dashboard)    │
│    - Stored in: test-data/test-results/[date].json         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User → Run evaluation script
       ↓
Script loads:
  - Test questions from JSON file
  - Prompt v1 from database
  - Prompt v2 from database
       ↓
For each question:
  - Run with prompt v1 → Record result
  - Run with prompt v2 → Record result
  - Score both results
       ↓
Save all results to JSON file
       ↓
Generate scorecard
  - Print to terminal
  - Save summary
       ↓
User reviews results → Deploys winner
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Set up the basic infrastructure

**Deliverables:**

1. **Test Set JSON Structure**
   - File: `test-data/golden-test-set.json`
   - Contains 100 questions with expected outputs
   - Categorized by tool and difficulty

2. **Prompt Versioning Database**
   - Table: `prompt_versions`
   - Stores prompt text, version number, change description
   - Migration script to create table

3. **Initial Test Set**
   - Use ChatGPT to generate 70 questions
   - Manually curate 30 edge cases
   - Add expected tool/args for each

**Time Estimate:** 4-6 hours

**Success Criteria:**
- ✓ JSON file with 100 valid test questions
- ✓ Database table created and populated with v1 prompt
- ✓ All test questions have expected outputs defined

---

### Phase 2: Evaluation Engine (Week 1-2)

**Goal:** Build the script that runs tests and scores results

**Deliverables:**

1. **Test Runner Script**
   - File: `scripts/run-evaluation.ts`
   - Reads test set from JSON
   - Loads prompt versions from database
   - Runs each question through both prompts
   - Saves detailed results

2. **Scoring System**
   - Automatic tool selection accuracy check
   - Automatic args matching check
   - Calculate latency metrics

3. **Results Storage**
   - Save to: `test-data/test-results/[timestamp].json`
   - Include summary statistics
   - Include detailed per-question results

**Time Estimate:** 6-8 hours

**Success Criteria:**
- ✓ Can run `npm run evaluate-prompts` from terminal
- ✓ Completes 100 questions in ~10 minutes
- ✓ Results saved with detailed breakdown
- ✓ Can compare any two prompt versions

---

### Phase 3: Scorecard & Reporting (Week 2)

**Goal:** Make results easy to understand and act on

**Deliverables:**

1. **Terminal Scorecard**
   - File: `scripts/generate-scorecard.ts`
   - Reads results JSON
   - Prints formatted summary to terminal
   - Shows overall winner and key metrics

2. **Key Metrics Displayed:**
   - Tool selection accuracy (v1 vs v2)
   - Average answer quality (if LLM judge enabled)
   - Average latency
   - Win/loss/tie counts
   - Breakdown by category

3. **Recommendations:**
   - Clear "Deploy v2" or "Keep v1" recommendation
   - List questions where v2 improved
   - List questions where v2 regressed

**Time Estimate:** 3-4 hours

**Success Criteria:**
- ✓ Clear, readable scorecard in terminal
- ✓ Easy to see which prompt is better
- ✓ Can identify specific improvement areas

---

### Phase 4: LLM-as-Judge (Week 3 - Optional)

**Goal:** Automate answer quality evaluation

**Deliverables:**

1. **Judge Function**
   - Takes two answers + original question
   - Sends to GPT-4 for evaluation
   - Returns quality scores for both

2. **Evaluation Criteria:**
   - Relevance to question
   - Factual accuracy
   - Clarity and helpfulness
   - Grounding in provided data

3. **Integration:**
   - Optional flag: `--use-llm-judge`
   - Adds answer quality scores to results
   - Factored into final recommendation

**Time Estimate:** 4-5 hours

**Success Criteria:**
- ✓ Can enable/disable LLM judge
- ✓ Quality scores align with manual review
- ✓ Adds <2 seconds per question to runtime

---

### Phase 5: Admin Dashboard (Week 4 - Optional)

**Goal:** Web UI for running tests and viewing results

**Deliverables:**

1. **Evaluation Page** (`/admin/evaluate`)
   - Select two prompts to compare
   - Click button to run evaluation
   - View progress in real-time
   - See results when complete

2. **Results History Page**
   - List all past test runs
   - Compare results over time
   - Track improvement trends

**Time Estimate:** 6-8 hours

**Success Criteria:**
- ✓ Can run evaluations from browser
- ✓ View historical results
- ✓ No need to use terminal

---

## File Structure

```
fin-quote/
├── docs/
│   └── EVALUATION_SYSTEM_PLAN.md     ← This document
│
├── test-data/                         ← New folder
│   ├── golden-test-set.json          ← 100 test questions
│   └── test-results/                 ← Evaluation results
│       ├── 2024-11-01_v1-vs-v2.json
│       ├── 2024-11-05_v2-vs-v3.json
│       └── ...
│
├── scripts/                           ← Evaluation scripts
│   ├── run-evaluation.ts             ← Main test runner
│   ├── generate-scorecard.ts         ← Results analysis
│   └── seed-prompts.ts               ← Migrate prompts to DB
│
├── data/                              ← Database migrations
│   └── create-prompt-versions.sql    ← New table schema
│
└── app/
    └── admin/
        └── evaluate/                  ← Optional dashboard
            └── page.tsx
```

---

## Database Schema

### New Table: `prompt_versions`

```sql
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_type TEXT NOT NULL, -- 'tool_selection' or 'answer_generation'
  version_number INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  change_description TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,

  -- Ensure unique version numbers per prompt type
  UNIQUE(prompt_type, version_number)
);

-- Index for quick lookups
CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_type, is_active);
CREATE INDEX idx_prompt_versions_version ON prompt_versions(prompt_type, version_number);
```

### Updated Table: `query_logs`

```sql
-- Add columns to track which prompt version was used
ALTER TABLE query_logs
  ADD COLUMN tool_selection_prompt_version INTEGER,
  ADD COLUMN answer_generation_prompt_version INTEGER;
```

---

## Test Set JSON Schema

```json
{
  "version": "1.0",
  "created": "2024-11-01",
  "last_updated": "2024-11-01",
  "total_questions": 100,

  "metadata": {
    "source": "chatgpt_generated + manual_curation",
    "categories": {
      "financials": 25,
      "prices": 25,
      "search_filings": 25,
      "list_filings": 25
    },
    "difficulty_distribution": {
      "easy": 40,
      "medium": 40,
      "hard": 20
    }
  },

  "questions": [
    {
      "id": 1,
      "question": "What's AAPL's revenue over the last 5 years?",
      "category": "financials",
      "difficulty": "easy",

      "expected_output": {
        "tool": "getAaplFinancialsByMetric",
        "args": {
          "metric": "revenue",
          "limit": 5
        }
      },

      "ground_truth_answer": "AAPL's revenue grew from $274.5B in 2020 to $383.3B in 2024, showing consistent year-over-year growth.",

      "metadata": {
        "tags": ["revenue", "trend", "time-series"],
        "added_date": "2024-11-01",
        "source": "chatgpt_generated",
        "notes": "Basic happy path case"
      }
    }
    // ... 99 more questions
  ]
}
```

---

## Test Results JSON Schema

```json
{
  "test_run_id": "2024-11-01_15-30-00",
  "timestamp": "2024-11-01T15:30:00Z",
  "duration_seconds": 847,

  "config": {
    "test_set_file": "golden-test-set.json",
    "test_set_version": "1.0",
    "prompt_v1_id": "uuid-1",
    "prompt_v1_version": 1,
    "prompt_v2_id": "uuid-2",
    "prompt_v2_version": 2,
    "use_llm_judge": false
  },

  "summary": {
    "total_questions": 100,
    "v1_tool_accuracy": 0.67,
    "v2_tool_accuracy": 0.94,
    "v1_avg_latency_ms": 1200,
    "v2_avg_latency_ms": 1100,
    "v1_wins": 23,
    "v2_wins": 77,
    "ties": 0,
    "winner": "v2",
    "improvement_percentage": 27
  },

  "category_breakdown": {
    "financials": {
      "v1_accuracy": 0.92,
      "v2_accuracy": 0.96
    },
    "prices": {
      "v1_accuracy": 0.60,
      "v2_accuracy": 0.96
    },
    "search_filings": {
      "v1_accuracy": 0.80,
      "v2_accuracy": 0.84
    },
    "list_filings": {
      "v1_accuracy": 0.88,
      "v2_accuracy": 0.92
    }
  },

  "detailed_results": [
    {
      "question_id": 1,
      "question": "What's AAPL's revenue over the last 5 years?",
      "category": "financials",
      "expected_tool": "getAaplFinancialsByMetric",

      "v1_result": {
        "tool_selected": "getAaplFinancialsByMetric",
        "tool_args": {"metric": "revenue", "limit": 5},
        "answer": "AAPL's revenue grew from...",
        "latency_ms": 1200,
        "tool_correct": true,
        "args_correct": true,
        "answer_quality_score": 9
      },

      "v2_result": {
        "tool_selected": "getAaplFinancialsByMetric",
        "tool_args": {"metric": "revenue", "limit": 5},
        "answer": "AAPL's revenue grew from...",
        "latency_ms": 1100,
        "tool_correct": true,
        "args_correct": true,
        "answer_quality_score": 9
      },

      "winner": "tie",
      "notes": null
    }
    // ... 99 more results
  ]
}
```

---

## Usage Workflow

### Weekly Improvement Cycle

**Monday Morning (2 hours):**

1. **Review real user feedback**
   - Check query_logs for thumbs down
   - Identify most common failure pattern
   - Example: "15% of errors are price confusion"

2. **Create improved prompt (v2)**
   - Update prompt with better examples
   - Save to database as version 2
   - Document what changed

3. **Run evaluation**
   ```bash
   npm run evaluate-prompts -- --v1=1 --v2=2
   ```
   - Takes ~10 minutes
   - Runs all 100 test questions

4. **Review scorecard**
   - Check terminal output
   - v2 wins 77-23? Deploy it!
   - v2 wins 52-48? Keep iterating

5. **Deploy winner**
   - Update database: set v2 as active
   - Or: iterate to v3 if results unclear

**Next Monday: Repeat for next biggest problem**

---

## Metrics & Success Criteria

### Key Metrics to Track

1. **Tool Selection Accuracy**
   - % of questions where correct tool was chosen
   - Target: >90% for production prompts

2. **Answer Quality Score**
   - Average score from LLM judge (0-10 scale)
   - Target: >8.5 for production prompts

3. **Latency**
   - Average time to generate answer
   - Target: <2 seconds

4. **Category Performance**
   - Accuracy breakdown by question category
   - Identify weak spots

5. **Improvement Velocity**
   - How quickly accuracy improves week-over-week
   - Target: +5-10% accuracy per improvement cycle

### Evaluation Criteria

**When to deploy new prompt:**
- ✓ Tool accuracy improves by ≥5%
- ✓ Answer quality improves by ≥0.5 points
- ✓ No regressions in any category
- ✓ Latency doesn't increase significantly

**When to keep iterating:**
- ⚠️ Improvement is <5% (not significant enough)
- ⚠️ New prompt fixes one category but breaks another
- ⚠️ Results are mixed (need more testing)

---

## Future Enhancements

### Phase 6: A/B Testing Integration (Month 2)

- Integrate with online A/B testing
- Deploy winning prompt from offline tests to 10% of users
- Validate with real user feedback before full rollout

### Phase 7: Regression Testing (Month 3)

- Run evaluation suite on every prompt change
- Block deployments that regress performance
- Integrate with CI/CD pipeline

### Phase 8: Multi-dimensional Evaluation (Month 4)

- Test different aspects separately:
  - Tool selection prompts
  - Answer generation prompts
  - Conversation context handling
- Optimize each independently

### Phase 9: Automated Improvement (Month 6)

- Use GPT-4 to suggest prompt improvements
- Automatically generate variations
- Run evaluations on all variations
- Present top 3 to human for final review

---

## Risks & Mitigations

### Risk 1: Test Set Becomes Stale

**Problem:** Prompts optimized for test set, but fail on new question types

**Mitigation:**
- Add new real user questions every week
- Replace 10% of test set monthly
- Track performance on both test set and real users

### Risk 2: LLM Judge is Unreliable

**Problem:** GPT-4 judge gives inconsistent scores

**Mitigation:**
- Use deterministic automatic checks (tool, args) as primary metric
- LLM judge is supplementary only
- Manually spot-check judge decisions
- Can disable LLM judge if needed

### Risk 3: Evaluation Takes Too Long

**Problem:** 100 questions × 2 prompts = too slow

**Mitigation:**
- Start with 100 questions (fast enough)
- If grows to 500+, run subset for quick tests
- Full suite only for final validation
- Parallelize execution if needed

### Risk 4: Test Set Doesn't Match Reality

**Problem:** Test questions aren't representative of real users

**Mitigation:**
- Source questions from real query_logs
- Prioritize thumbs-down questions
- Continuous replacement with real data
- Compare test accuracy to real user satisfaction

---

## Dependencies

**Required:**
- Supabase database (already have)
- OpenAI API (already have)
- TypeScript/Node.js (already have)

**New Dependencies:**
- None! Uses existing infrastructure

**Optional:**
- Admin dashboard framework (if building Phase 5)

---

## Timeline

**Week 1:**
- Day 1-2: Create test set (ChatGPT + manual)
- Day 3-4: Database schema and migration
- Day 5: Seed initial prompt versions

**Week 2:**
- Day 1-3: Build evaluation engine
- Day 4-5: Test and refine

**Week 3:**
- Day 1-2: Scorecard and reporting
- Day 3-5: First real improvement cycle

**Ongoing:**
- Weekly: Run evaluation on new prompt versions
- Monthly: Refresh test set with real questions
- Quarterly: Review and optimize system

---

## Success Metrics

**After 1 Month:**
- ✓ Evaluation system running smoothly
- ✓ 2-3 successful prompt improvements deployed
- ✓ Tool accuracy improved from ~70% to ~85%

**After 3 Months:**
- ✓ Tool accuracy >90%
- ✓ Answer quality consistently >8.5/10
- ✓ <1 day iteration cycle for improvements
- ✓ Test set 50% real user questions

**After 6 Months:**
- ✓ Tool accuracy >95%
- ✓ Systematic process for continuous improvement
- ✓ Test set entirely from real users
- ✓ Automated regression testing in place

---

## Appendix A: Example Test Questions

### Financials (25 questions)

**Easy:**
1. What's AAPL's revenue?
2. Show me Apple's revenue over the last 5 years
3. How much did Apple make last year?
4. Revenue trend for AAPL
5. Tell me about their profit

**Medium:**
6. Compare revenue to net income
7. What about gross profit over the same period?
8. How's the profit margin trending?
9. Show me EPS trend
10. What's the operating cash flow?

**Hard:**
11. What about net income? (follow-up, needs context)
12. How profitable is Apple compared to 3 years ago?
13. Show me the top line (revenue synonym)
14. What's the bottom line trend? (net income synonym)
15. Earnings trend (could mean net income or EPS)

### Prices (25 questions)

**Easy:**
16. What's the stock price?
17. Show me AAPL price for the last month
18. How's the stock doing?
19. Stock price trend 30 days
20. What's the share price?

**Medium:**
21. Tell me about the market price
22. How much is AAPL trading at?
23. Price movement last quarter
24. Show me price for 90 days
25. What's the closing price trend?

**Hard:**
26. What's the price? (ambiguous - stock or revenue?)
27. How's the price looking? (vague)
28. Tell me about the price trend (which price?)
29. What about the price for a longer period? (needs context)
30. Is the price going up or down? (stock price implied)

### Search Filings (25 questions)

**Easy:**
31. What risks did Apple mention?
32. Tell me about supply chain risks
33. What did management say about competition?
34. Show me risk factors
35. What are the main business risks?

**Medium:**
36. How does Apple describe their competitive advantages?
37. What did they say about innovation?
38. Tell me about their strategy
39. What risks do they face in China?
40. Management discussion on revenue

**Hard:**
41. What did they say about risks? (vague)
42. Tell me about the business (too broad)
43. What's in the latest filing? (could mean list or search)
44. Risks mentioned in the 10-K (specific document type)
45. How do they describe their moat? (competitive advantage)

### List Filings (25 questions)

**Easy:**
46. Show me recent filings
47. What are the last 5 10-Ks?
48. List recent 10-Qs
49. Show me the latest filings
50. What filings are available?

**Medium:**
51. Show me the most recent annual report
52. List all quarterly reports
53. What's the latest 10-K?
54. Show me SEC filings from this year
55. List the last 3 earnings reports

**Hard:**
56. Show me the filings (vague - how many?)
57. What's the latest filing? (could mean one or several)
58. Documents from last quarter (could mean list or search)
59. Recent reports (ambiguous - list or search?)
60. What did they file recently? (conversational)

### Edge Cases (40 questions)

**Typos:**
61. revenu trend
62. stock pric
63. what's the reveue?

**Conversational:**
64. How's Apple doing?
65. Tell me about AAPL
66. What's going on with Apple?

**Follow-ups (need context):**
67. What about last year?
68. Show me the same for net income
69. What about 90 days instead?

**Ambiguous:**
70. What's the price?
71. Show me the trend
72. How's it performing?

**Multiple intents:**
73. Show me revenue and stock price
74. Compare revenue to profit
75. What's the revenue trend and current stock price?

**Out of scope:**
76. What's the CEO's salary?
77. How many employees does Apple have?
78. What's the market cap?

**Variations:**
79. Top line (revenue)
80. Bottom line (net income)
81. Earnings (could mean net income or EPS)
82. Sales (revenue)
83. Profit (could mean gross, operating, or net)

**Casual/informal:**
84. How much money did Apple make?
85. Is AAPL stock going up?
86. Did Apple do well last year?

**Negative/problem-focused:**
87. Why is revenue down?
88. What's wrong with Apple?
89. Show me declining metrics

**Time-related edge cases:**
90. Show me last quarter (Q4 2024? Or most recent?)
91. Revenue this year (2024 only or up to now?)
92. Long-term trend (how many years?)

**Comparison questions:**
93. Compare this year to last year
94. Revenue growth over time
95. How does this compare?

**Specific document requests:**
96. Show me the 10-K from 2023
97. Latest quarterly earnings
98. Most recent annual report

**Multi-step questions:**
99. What's the revenue trend, and is profit growing faster?
100. Show me revenue and tell me about risks

---

## Appendix B: Command Reference

```bash
# Run evaluation comparing two prompt versions
npm run evaluate-prompts -- --v1=1 --v2=2

# Run with LLM judge enabled
npm run evaluate-prompts -- --v1=1 --v2=2 --use-llm-judge

# Generate scorecard from existing results
npm run scorecard -- --results=test-results/2024-11-01.json

# Seed initial prompts to database
npm run seed-prompts

# Update test set version
npm run update-test-set -- --version=2.0
```

---

## Conclusion

This evaluation system enables rapid, data-driven prompt improvement. By testing changes offline before deployment, we can iterate quickly and deploy only changes that demonstrably improve quality.

**Key benefits:**
- 100x faster iteration (10 minutes vs 2 weeks)
- Objective measurements (not guesses)
- Safe to experiment (test offline first)
- Continuous improvement (weekly cycles)
- Maintains quality (regression testing)

**Next steps:**
1. Create feature branch: `feature/evaluation-system`
2. Implement Phase 1: Foundation
3. Run first evaluation
4. Begin weekly improvement cycles
