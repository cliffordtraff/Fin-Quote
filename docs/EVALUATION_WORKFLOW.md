# Evaluation System: Complete Workflow Guide

This guide shows you how to use all three evaluation features together to improve your AI's accuracy and answer quality.

---

## Overview: What You Have

Your evaluation system has three powerful features:

1. **Fast/Full Evaluation** - Test tool selection and answer generation
2. **LLM-as-Judge** - Automatic answer quality grading using GPT-4
3. **HTML Reports** - Beautiful visual reports you can share

---

## Quick Reference

```bash
# Fast mode (routing only) - 2-3 minutes
npx tsx scripts/evaluate.ts --mode fast

# Full mode (with answer generation) - 8-10 minutes
npx tsx scripts/evaluate.ts --mode full

# Full mode with LLM-as-judge - 15-20 minutes
npx tsx scripts/evaluate.ts --mode full --llm-judge

# Test with limited questions (faster for iteration)
npx tsx scripts/evaluate.ts --mode fast --limit 10

# Generate HTML report from results
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-*.json

# Demo LLM-as-judge
npx tsx scripts/test-llm-judge.ts
```

---

## Feature Comparison

| Feature | Fast Mode | Full Mode | Full + LLM-Judge |
|---------|-----------|-----------|------------------|
| **Tests tool selection** | ✅ | ✅ | ✅ |
| **Tests answer generation** | ❌ | ✅ | ✅ |
| **Evaluates answer quality** | ❌ | ❌ | ✅ |
| **Time (100 questions)** | 2-3 min | 8-10 min | 15-20 min |
| **Cost (approx)** | $0.02 | $0.10 | $0.60 |
| **Best for** | Daily iteration | Pre-deployment | Final validation |

---

## Complete Workflow Example

### Scenario: You Want to Improve Your Prompts

**WEEK 1: Establish Baseline**

#### Step 1: Run Fast Evaluation

```bash
npx tsx scripts/evaluate.ts --mode fast
```

**Output:**
```
📊 EVALUATION SUMMARY
Total Questions: 100
Correct Tool: 95 (95.0%)
Correct Args: 83 (83.0%)
Fully Correct: 83 (83.0%)
```

**What this tells you:**
- ✅ 95% tool selection accuracy (good!)
- ⚠️ 83% overall accuracy (room for improvement in args)

#### Step 2: Generate HTML Report

```bash
# Find the latest results file
ls -lt test-data/test-results/

# Generate HTML report
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-2025-11-07.json

# Open in browser
open test-data/test-results/eval-fast-2025-11-07.html
```

**What you'll see:**
- Visual charts showing accuracy by category
- Clickable list of failed questions
- Breakdown: "Prices category is only 75% accurate"

**Insight:** Price-related questions are failing most often!

#### Step 3: Analyze Failures

Looking at the HTML report, you see:

```
❌ Q12: "What's the price?"
   Expected: {"range": "30d"}
   Got:      {"range": "7d"}

❌ Q45: "Show me the price trend"
   Expected: {"range": "30d"}
   Got:      {"range": "7d"}
```

**Pattern identified:** When users say "price" without a timeframe, AI picks `7d` but should pick `30d`.

---

**WEEK 2: Improve Prompt**

#### Step 4: Update Prompt

Edit `scripts/evaluate.ts` (or your actual prompt file):

```typescript
// OLD
For 7d (use when):
- "price" (general, no time specified)

// NEW
For 30d (use when):
- "price" (general, no time specified)
- "recent" (general)
```

#### Step 5: Test Improvement (Fast Mode)

```bash
npx tsx scripts/evaluate.ts --mode fast
```

**New Output:**
```
📊 EVALUATION SUMMARY
Total Questions: 100
Correct Tool: 95 (95.0%)
Correct Args: 91 (91.0%)  ← Improved from 83%!
Fully Correct: 91 (91.0%)
```

**Result:** +8% improvement! 🎉

#### Step 6: Validate with Full Mode + LLM-Judge

Before deploying to production, run comprehensive validation:

```bash
npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 20
```

**Why limit to 20?** Full test with LLM-judge on 100 questions takes 20+ minutes. Start with a sample.

**Output:**
```
📊 EVALUATION SUMMARY
Mode: full (with LLM-as-judge)
Total Questions: 20
Correct Tool: 19 (95.0%)
Correct Args: 18 (90.0%)
Fully Correct: 18 (90.0%)
============================================================
📝 ANSWER QUALITY (GPT-4 Judge)
============================================================
Average Scores (out of 10):
  Accuracy:     9.2/10
  Relevance:    8.7/10
  Completeness: 8.1/10
  Insight:      7.9/10
  OVERALL:      8.5/10

Distribution:
  Excellent (9-10):  12 answers
  Good (7-8):        6 answers
  Poor (<5):         0 answers
```

**What this tells you:**
- ✅ Tool routing is accurate (90%)
- ✅ Answers are factually accurate (9.2/10)
- ⚠️ Answers could be more insightful (7.9/10)
- ✅ No poor-quality answers (0 scoring <5)

#### Step 7: Review Low-Scoring Answers

Generate HTML report to dig deeper:

```bash
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-full-*.json
open test-data/test-results/eval-full-*.html
```

Click on questions with quality scores < 8 to see:
- What was the question?
- What answer did AI generate?
- What did GPT-4 judge say was wrong?

**Example:**
```
Q: "What's AAPL's revenue trend over 5 years?"
Answer: "Apple's revenue in 2024 was $391.04 billion."
Quality Score: 4/10

GPT-4 Reasoning: "Answer only mentions 2024 despite having 5 years of data.
Doesn't describe trend pattern. Not helpful."
```

**Action:** Update answer generation prompt to emphasize using all data and describing trends.

#### Step 8: Deploy New Prompt

```bash
# Update your actual production prompt file
# (In your case: lib/tools.ts or app/actions/ask-question.ts)

# Run final validation
npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 50

# If results look good, deploy!
git add .
git commit -m "Improve prompt: better price range defaults and trend descriptions"
git push
```

---

## Daily Iteration Workflow

Use this workflow when actively developing prompts:

### Morning: Quick Check

```bash
# 2-3 minutes
npx tsx scripts/evaluate.ts --mode fast

# If accuracy drops, investigate
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-*.json
open test-data/test-results/eval-fast-*.html
```

### After Making Changes

```bash
# Test with subset for speed
npx tsx scripts/evaluate.ts --mode fast --limit 20

# If that looks good, run full test
npx tsx scripts/evaluate.ts --mode fast
```

### Before Deploying to Production

```bash
# Full validation with LLM-judge
npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 30

# Review HTML report
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-full-*.json
open test-data/test-results/eval-full-*.html

# If avg quality score >= 8.0, deploy!
```

---

## Understanding LLM-as-Judge Scores

### Accuracy (1-10)
- **10:** All numbers, dates, facts are perfect
- **8-9:** Minor formatting issues but facts correct
- **5-7:** Some numbers wrong or improperly formatted
- **1-4:** Major factual errors or hallucinations

### Relevance (1-10)
- **10:** Directly answers the exact question asked
- **8-9:** Answers the question but includes tangential info
- **5-7:** Partially addresses the question
- **1-4:** Doesn't answer what was asked

### Completeness (1-10)
- **10:** Uses all provided data comprehensively
- **8-9:** Uses most data, minor omissions
- **5-7:** Uses some data but misses key parts
- **1-4:** Barely uses the provided data

### Insight (1-10)
- **10:** Provides context, patterns, percentages, helpful analysis
- **8-9:** Some context provided
- **5-7:** Just states facts with minimal analysis
- **1-4:** Raw data dump, no interpretation

### Overall (1-10)
- **9-10:** Excellent answer, would fully satisfy user
- **7-8:** Good answer, covers the basics well
- **5-6:** Acceptable but missing key elements
- **3-4:** Poor answer with major gaps
- **1-2:** Very poor, barely usable

---

## Interpreting Results

### Tool Selection Accuracy

```
Correct Tool: 95 (95.0%)
```

**What it means:** Out of 100 questions, AI picked the right tool 95 times.

**Good threshold:** ≥90%
**Needs improvement:** <85%

**If too low:**
- Review failed questions in HTML report
- Look for patterns (which tools are confused?)
- Update tool selection prompt with clearer distinctions

### Args Accuracy

```
Correct Args: 83 (83.0%)
```

**What it means:** Out of 100 questions, AI picked the right arguments 83 times.

**Good threshold:** ≥85%
**Needs improvement:** <80%

**If too low:**
- Check if defaults are wrong
- Look for systematic mistakes (always picking wrong limit?)
- Add more examples to prompt

### Answer Quality

```
OVERALL: 8.5/10
```

**What it means:** On average, GPT-4 rates your answers 8.5 out of 10.

**Excellent:** ≥9.0
**Good:** 8.0-8.9
**Acceptable:** 7.0-7.9
**Needs work:** <7.0

**If too low:**
- Check which dimension is lowest (accuracy, relevance, completeness, insight)
- Review specific low-scoring answers
- Update answer generation prompt to address weak areas

---

## Cost & Time Management

### Cost Breakdown (100 questions)

| Mode | Input Tokens | Output Tokens | Cost |
|------|--------------|---------------|------|
| Fast | ~5,000 | ~1,500 | $0.02 |
| Full | ~15,000 | ~5,000 | $0.10 |
| Full + Judge | ~50,000 | ~15,000 | $0.60 |

**Budget tips:**
- Use `--limit 10` during active development
- Run full LLM-judge only before deployment
- Fast mode is cheap enough to run hourly

### Time Breakdown (100 questions)

| Mode | Time per Question | Total Time |
|------|-------------------|------------|
| Fast | 1-2 sec | 2-3 min |
| Full | 4-6 sec | 8-10 min |
| Full + Judge | 10-12 sec | 15-20 min |

**Time-saving tips:**
- Run with `--limit 20` for quick feedback (30 seconds in fast mode)
- Run full tests overnight or during lunch
- Use fast mode 95% of the time, full mode for final validation

---

## Comparing Multiple Prompt Versions

### Scenario: You have 3 different prompts to test

**Approach 1: Sequential Testing**

```bash
# Test prompt v1
npx tsx scripts/evaluate.ts --mode fast
mv test-data/test-results/eval-fast-*.json test-data/test-results/v1-results.json

# Update prompt to v2
# ... edit code ...

# Test prompt v2
npx tsx scripts/evaluate.ts --mode fast
mv test-data/test-results/eval-fast-*.json test-data/test-results/v2-results.json

# Update prompt to v3
# ... edit code ...

# Test prompt v3
npx tsx scripts/evaluate.ts --mode fast
mv test-data/test-results/eval-fast-*.json test-data/test-results/v3-results.json

# Generate HTML reports for all
npx tsx scripts/generate-html-report.ts test-data/test-results/v1-results.json
npx tsx scripts/generate-html-report.ts test-data/test-results/v2-results.json
npx tsx scripts/generate-html-report.ts test-data/test-results/v3-results.json

# Open all reports in browser
open test-data/test-results/v1-results.html
open test-data/test-results/v2-results.html
open test-data/test-results/v3-results.html
```

**Compare side-by-side:**
- v1: 83% accuracy
- v2: 91% accuracy ← Winner!
- v3: 87% accuracy

Deploy v2!

---

## Troubleshooting

### "LLM-as-judge can only be used with --mode full"

**Problem:** You ran: `npx tsx scripts/evaluate.ts --mode fast --llm-judge`

**Solution:** LLM-judge requires full mode because it needs answers to grade:
```bash
npx tsx scripts/evaluate.ts --mode full --llm-judge
```

### Evaluation is too slow

**Solutions:**
1. Use `--limit` flag:
   ```bash
   npx tsx scripts/evaluate.ts --mode fast --limit 10
   ```

2. Use fast mode instead of full mode
3. Only use LLM-judge before deployment, not during development

### LLM-judge scores seem wrong

**Common causes:**
1. **Mock data issue:** The evaluation currently uses mock data. In production, connect to real server actions.
2. **Prompt mismatch:** Make sure the answer generation prompt in `evaluate.ts` matches your production prompt.
3. **Temperature:** LLM-judge uses `temperature=0` for consistency. This is intentional.

**To investigate:**
- Open the results JSON file
- Find a question with surprising score
- Read the `quality_score.reasoning` field to see GPT-4's explanation
- Check if the `answer` field looks correct

### HTML report doesn't open

**Check file path:**
```bash
ls -lt test-data/test-results/
# Find the .html file

# Open with explicit path
open /Users/yourname/Desktop/Fin\ Quote/test-data/test-results/eval-fast-*.html
```

---

## Advanced Tips

### 1. Track Improvements Over Time

Create a simple log:

```bash
# After each evaluation
echo "2025-11-07,fast,83%" >> test-data/accuracy-log.csv
echo "2025-11-08,fast,91%" >> test-data/accuracy-log.csv

# View trend
cat test-data/accuracy-log.csv
```

### 2. Focus on Specific Categories

Edit `test-data/golden-test-set.json` to filter by category:

```bash
# Create a price-only test set
jq '.questions |= map(select(.category == "prices"))' \
  test-data/golden-test-set.json > test-data/prices-only.json

# Run evaluation on just prices
# (Update script to load prices-only.json)
```

### 3. Automated Regression Testing

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run evaluation
  run: npx tsx scripts/evaluate.ts --mode fast --limit 20

- name: Check threshold
  run: |
    ACCURACY=$(jq '.accuracy.overall' test-data/test-results/eval-fast-*.json)
    if (( $(echo "$ACCURACY < 85" | bc -l) )); then
      echo "Accuracy below threshold: $ACCURACY%"
      exit 1
    fi
```

---

## Next Steps

1. **Run your first evaluation:**
   ```bash
   npx tsx scripts/evaluate.ts --mode fast --limit 10
   ```

2. **Generate an HTML report:**
   ```bash
   npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-*.json
   open test-data/test-results/eval-fast-*.html
   ```

3. **Try LLM-as-judge:**
   ```bash
   npx tsx scripts/test-llm-judge.ts
   ```

4. **Run full evaluation:**
   ```bash
   npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 5
   ```

5. **Start improving your prompts** based on what the reports show!

---

## Questions?

Common questions:

**Q: How often should I run evaluations?**
A: Fast mode daily, full mode weekly, LLM-judge before deployment.

**Q: What's a good accuracy target?**
A: Tool selection: ≥90%, Overall: ≥85%, Answer quality: ≥8.0/10

**Q: Should I test all 100 questions every time?**
A: No! Use `--limit 10` during development, full 100 for final validation.

**Q: How do I know if my improvement is real vs random?**
A: Run the same test 2-3 times. If results are consistent, it's real.

**Q: Can I add more test questions?**
A: Yes! Edit `test-data/golden-test-set.json` and add new questions with expected outputs.
