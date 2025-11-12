# Evaluation System: Technical Deep Dive

This document provides detailed technical explanations of how the evaluation system works under the hood.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How LLM-as-Judge Works](#how-llm-as-judge-works)
3. [Why We Test Answer Quality](#why-we-test-answer-quality)
4. [HTML Report Generation](#html-report-generation)
5. [Performance Optimization](#performance-optimization)
6. [Extending the System](#extending-the-system)

---

## Architecture Overview

### The Two-Step LLM Flow

Your Fin Quote system uses a two-step architecture:

```
User Question
    ↓
[STEP 1: Tool Selection] ← Test this with Fast Mode
    ↓
Execute Tool (fetch data)
    ↓
[STEP 2: Answer Generation] ← Test this with Full Mode
    ↓
Final Answer
    ↓
[STEP 3: Quality Evaluation] ← Test this with LLM-as-Judge
```

### Evaluation Modes

**Fast Mode:**
- Tests only Step 1 (tool selection)
- Doesn't generate answers
- Fast: 2-3 minutes for 100 questions
- Cheap: ~$0.02 per run

**Full Mode:**
- Tests Steps 1 AND 2 (tool selection + answer generation)
- Generates complete answers
- Medium speed: 8-10 minutes for 100 questions
- Medium cost: ~$0.10 per run

**Full Mode + LLM-Judge:**
- Tests Steps 1, 2, AND 3 (tool selection + answer + quality)
- Evaluates answer quality with GPT-4
- Slow: 15-20 minutes for 100 questions
- Expensive: ~$0.60 per run

---

## How LLM-as-Judge Works

### The Problem

Traditional testing can only check if the **format** is correct:

```typescript
// Traditional test
assert(response.tool === "getPrices") // ✅ Can test this
assert(response.args.range === "30d") // ✅ Can test this
```

But it CAN'T check if the **content** is good:

```typescript
// Can't test these automatically:
assert(answer.isHelpful) // ❌ No way to check
assert(answer.usesAllData) // ❌ No way to check
assert(answer.providesInsight) // ❌ No way to check
```

### The Solution: Use AI to Judge AI

Instead of writing complex rules, we use GPT-4 to grade answers:

```
┌─────────────────────────────────────────────┐
│ Question: "What's the revenue trend?"       │
├─────────────────────────────────────────────┤
│ Data Provided:                              │
│ - 2020: $274.5B                            │
│ - 2021: $365.8B                            │
│ - 2022: $394.3B                            │
│ - 2023: $383.3B                            │
│ - 2024: $391.0B                            │
├─────────────────────────────────────────────┤
│ AI Answer:                                  │
│ "Revenue in 2024 was $391B."               │
└─────────────────────────────────────────────┘
                    ↓
         Send to GPT-4 Judge
                    ↓
┌─────────────────────────────────────────────┐
│ GPT-4 Evaluation:                           │
├─────────────────────────────────────────────┤
│ Accuracy: 9/10 (number is correct)          │
│ Relevance: 3/10 (asked for trend, got 1 yr)│
│ Completeness: 2/10 (only used 1/5 years)   │
│ Insight: 1/10 (no analysis or context)      │
│ OVERALL: 4/10 (Poor)                        │
│                                             │
│ Reasoning: "Factually accurate but fails   │
│ to answer the question. User asked for a   │
│ trend over multiple years but only got one │
│ year. Not helpful."                         │
└─────────────────────────────────────────────┘
```

### The Grading Prompt

Here's what we send to GPT-4 (from `lib/llm-judge.ts`):

```
You are grading an AI's answer to a financial question.

QUESTION ASKED BY USER:
"What's AAPL's revenue trend over 5 years?"

DATA PROVIDED TO THE AI:
{
  "metric": "revenue",
  "data": [
    {"year": 2020, "value": 274515000000},
    {"year": 2021, "value": 365817000000},
    ...
  ]
}

AI'S ANSWER:
"Apple's revenue in 2024 was $391.04 billion."

Grade this answer on these criteria (1-10 scale):

1. ACCURACY: Are all numbers correct?
2. RELEVANCE: Does it answer what was asked?
3. COMPLETENESS: Does it use all the data?
4. INSIGHT: Does it provide helpful context?

Return JSON with scores and reasoning.
```

### Why This Works

**Advantages:**
- ✅ GPT-4 can understand nuance (is this answer helpful?)
- ✅ Adapts to new question types automatically
- ✅ Provides explanations (why did this score 4/10?)
- ✅ Consistent grading (temperature=0)

**Limitations:**
- ❌ Costs money (~$0.005 per answer graded)
- ❌ Slower (adds 3-5 seconds per question)
- ❌ Not 100% deterministic (slight variation possible)
- ❌ Can be wrong occasionally (need spot-checking)

### Best Practices

**1. Use temperature=0 for consistency:**

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{role: 'user', content: prompt}],
  temperature: 0, // ← Makes grading more consistent
})
```

**2. Provide clear grading rubrics:**

```
GRADING GUIDELINES:
- 9-10: Excellent, comprehensive
- 7-8: Good, covers basics
- 5-6: Acceptable but missing details
- 3-4: Poor, major gaps
- 1-2: Very poor
```

**3. Spot-check GPT-4's grading:**

Occasionally, manually review some graded answers to ensure GPT-4 is being reasonable.

---

## Why We Test Answer Quality

### The Hidden Problem

You can have perfect tool routing but terrible answers!

**Example 1: Correct Tool, Useless Answer**

```typescript
// Your test passes ✅
assert(tool === "getAaplFinancialsByMetric")
assert(args.metric === "revenue")
assert(args.limit === 5)

// But the answer is useless:
answer = "Apple makes money from selling products."
```

**Example 2: Correct Tool, Incomplete Answer**

```typescript
// Your test passes ✅
assert(tool === "getAaplFinancialsByMetric")
assert(args === {metric: "revenue", limit: 5})

// But answer only uses 1 of 5 years:
answer = "Revenue in 2024 was $391B."
// Missing: 2020-2023 data!
```

**Example 3: Correct Tool, Hallucinated Answer**

```typescript
// Your test passes ✅
assert(tool === "getAaplFinancialsByMetric")

// But answer contains wrong numbers:
answer = "Revenue grew from $280B to $450B."
// Real data: $274.5B to $391.0B
```

### What Traditional Tests Miss

Traditional tests check:
- ✅ Did we pick the right tool?
- ✅ Did we use the right arguments?

Traditional tests DON'T check:
- ❌ Does the answer actually help the user?
- ❌ Did we use all the provided data?
- ❌ Is the answer factually accurate?
- ❌ Does it provide useful context/insight?

### Real-World Impact

Without answer quality testing:

**Scenario:** You improve tool routing from 70% → 95% ✅

**Result:** Users still give thumbs down ❌

**Why?** Answers are technically correct but unhelpful:
- "Revenue is $391B." (user wanted 5-year trend)
- "Price is $150." (user wanted to know if it's going up or down)
- "Yes." (user wanted detailed explanation)

### The Solution

LLM-as-judge catches these issues:

```
Tool Routing: 95% ✅
Answer Quality: 4.2/10 ❌ ← This is the real problem!

Low Completeness Score:
- Most answers only use 1 year when 5 are provided
```

**Action:** Update answer prompt to emphasize using all data.

**New Results:**
```
Tool Routing: 95% ✅
Answer Quality: 8.7/10 ✅ ← Much better!

Users happy ✅
```

---

## HTML Report Generation

### Why HTML Instead of Terminal?

**Terminal Output:**
```
[1/100] Testing question 1... ✅
[2/100] Testing question 2... ❌
...
Accuracy: 83%
```

**Problems:**
- ❌ Disappears when you close terminal
- ❌ Hard to share with team
- ❌ Can't see patterns visually
- ❌ No interactivity

**HTML Output:**
- ✅ Permanent file you can save
- ✅ Share link with teammates
- ✅ Visual charts show patterns instantly
- ✅ Click to expand failed questions

### How It Works

The HTML report generator (`scripts/generate-html-report.ts`) does this:

**Step 1: Load Results**

```typescript
const results = JSON.parse(fs.readFileSync('eval-fast-2025-11-07.json'))
```

**Step 2: Calculate Stats**

```typescript
// Group by category
const byCategory = {
  'Financials': results.filter(r => r.question.includes('revenue')),
  'Prices': results.filter(r => r.question.includes('price')),
  ...
}

// Calculate accuracy per category
const categoryStats = Object.entries(byCategory).map(([name, questions]) => ({
  name,
  accuracy: (questions.filter(q => q.overall_correct).length / questions.length) * 100
}))
```

**Step 3: Generate HTML**

```typescript
const html = `
<div class="metric-card">
  <div class="metric-label">Overall Accuracy</div>
  <div class="metric-value">${results.accuracy.overall}%</div>
</div>

<table>
  ${categoryStats.map(cat => `
    <tr>
      <td>${cat.name}</td>
      <td>${cat.accuracy}%</td>
    </tr>
  `).join('')}
</table>
`
```

**Step 4: Add Interactivity**

```javascript
function toggleDetails(questionId) {
  const row = document.getElementById('details-' + questionId)
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none'
}
```

**Step 5: Save File**

```typescript
fs.writeFileSync('eval-fast-2025-11-07.html', html)
```

### Key Features

**1. Progress Bars**

Visual representation of accuracy:

```html
<div class="progress-bar">
  <div class="progress-fill" style="width: 83%"></div>
</div>
```

**2. Color Coding**

```css
.error-tool { background: #fed7d7; color: #c53030; }
.error-args { background: #feebc8; color: #c05621; }
```

**3. Expandable Details**

Click a failed question to see:
- Expected tool and args
- Actual tool and args
- Error message (if any)

**4. Responsive Design**

Works on desktop and mobile:

```css
@media (max-width: 768px) {
  .metrics { grid-template-columns: 1fr; }
}
```

---

## Performance Optimization

### Why Fast Mode is Fast

**Fast Mode (2-3 minutes):**
```typescript
for (question of questions) {
  // Only test tool selection
  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano', // Fast, cheap model
    messages: [{role: 'user', content: toolSelectionPrompt}],
    max_completion_tokens: 150, // Short response
  })

  // Just parse JSON and compare
  const parsed = JSON.parse(response.content)
  const correct = parsed.tool === expected.tool

  // No answer generation = fast!
}
```

**Full Mode (8-10 minutes):**
```typescript
for (question of questions) {
  // Step 1: Tool selection
  const toolResponse = await openai.chat.completions.create(...)

  // Step 2: Fetch data
  const data = await fetchData(tool, args)

  // Step 3: Generate answer
  const answerResponse = await openai.chat.completions.create({
    messages: [{role: 'user', content: answerPrompt}],
    max_completion_tokens: 300, // Longer response
  })

  // More API calls = slower
}
```

**Full Mode + Judge (15-20 minutes):**
```typescript
for (question of questions) {
  // Steps 1-3 from Full Mode
  // ...

  // Step 4: Judge answer quality
  const judgeResponse = await openai.chat.completions.create({
    model: 'gpt-4o', // Slower, smarter model
    messages: [{role: 'user', content: judgePrompt}],
  })

  // Even more API calls = even slower
}
```

### Optimization Techniques

**1. Batch Processing**

Instead of waiting for each question sequentially, could parallelize:

```typescript
// Sequential (current)
for (q of questions) {
  await test(q) // Wait for each one
}

// Parallel (faster but risks rate limits)
await Promise.all(questions.map(q => test(q)))
```

**2. Caching**

Cache tool selection results:

```typescript
const cache = new Map()

function testQuestion(q) {
  const cacheKey = q.question
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const result = await openai.chat.completions.create(...)
  cache.set(cacheKey, result)
  return result
}
```

**3. Model Selection**

```typescript
// Fast but less accurate
model: 'gpt-5-nano'

// Slower but more accurate
model: 'gpt-4o'

// Choose based on use case:
// - Daily iteration: gpt-5-nano
// - Final validation: gpt-4o
```

**4. Limit Testing**

Don't test all 100 questions during development:

```bash
# Test 10 random questions (30 seconds)
npx tsx scripts/evaluate.ts --mode fast --limit 10

# Test all 100 questions (2-3 minutes)
npx tsx scripts/evaluate.ts --mode fast
```

### Cost Optimization

**Current Costs (100 questions):**

```
Fast Mode:
- 100 questions × gpt-5-nano
- ~5,000 input tokens × $0.05/1M = $0.0003
- ~1,500 output tokens × $0.40/1M = $0.0006
- Total: ~$0.001 per run (negligible)

Full Mode:
- 200 LLM calls (tool + answer)
- ~15,000 input tokens × $0.05/1M = $0.0008
- ~5,000 output tokens × $0.40/1M = $0.0020
- Total: ~$0.003 per run

Full + Judge:
- 300 LLM calls (tool + answer + judge)
- GPT-4o for judging (more expensive)
- ~50,000 input tokens × $2.50/1M = $0.125
- ~15,000 output tokens × $10.00/1M = $0.150
- Total: ~$0.275 per run
```

**Budget-Friendly Strategies:**

1. **Use limits during development:**
   ```bash
   npx tsx scripts/evaluate.ts --mode fast --limit 5
   # Cost: $0.00005 (practically free)
   ```

2. **Run full tests only before deployment:**
   ```bash
   # Daily: Fast mode
   # Weekly: Full mode
   # Before deploy: Full + Judge
   ```

3. **Sample questions for LLM-judge:**
   ```bash
   # Instead of judging all 100, judge 20 random
   npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 20
   ```

---

## Extending the System

### Adding New Eval Types

Want to test something else? Here's how:

**Example: Add "Factual Accuracy" Test**

**Step 1: Create validator function**

```typescript
// lib/validators.ts
export function validateFactualAccuracy(
  answer: string,
  sourceData: any
): { score: number; errors: string[] } {
  const errors: string[] = []

  // Extract numbers from answer
  const numbersInAnswer = extractNumbers(answer)

  // Check each number exists in source data
  for (const num of numbersInAnswer) {
    if (!sourceData.includes(num)) {
      errors.push(`Number ${num} not found in source data`)
    }
  }

  const score = (1 - errors.length / numbersInAnswer.length) * 100
  return { score, errors }
}
```

**Step 2: Add to evaluation**

```typescript
// scripts/evaluate.ts
const result = await testRouting(question, mode, useLLMJudge)

// Add factual accuracy check
if (mode === 'full' && result.answer) {
  const factCheck = validateFactualAccuracy(
    result.answer,
    result.source_data
  )
  result.factual_accuracy = factCheck.score
  result.factual_errors = factCheck.errors
}
```

**Step 3: Update HTML report**

```typescript
// scripts/generate-html-report.ts
${result.factual_accuracy && `
  <div class="metric-card">
    <div class="metric-label">Factual Accuracy</div>
    <div class="metric-value">${result.factual_accuracy}%</div>
  </div>
`}
```

### Adding New Test Questions

**Step 1: Edit test set**

```json
// test-data/golden-test-set.json
{
  "questions": [
    {
      "id": 101,
      "question": "What's the P/E ratio for AAPL?",
      "category": "financials",
      "difficulty": "medium",
      "expected_output": {
        "tool": "getAaplFinancialsByMetric",
        "args": {"metric": "eps", "limit": 1}
      },
      "metadata": {
        "tags": ["ratios", "valuation"],
        "notes": "Tests if AI knows P/E requires EPS"
      }
    }
  ]
}
```

**Step 2: Run evaluation**

```bash
npx tsx scripts/evaluate.ts --mode fast
```

New question is automatically included!

### Creating Custom Reports

Want a different report format?

```typescript
// scripts/generate-markdown-report.ts
import fs from 'fs'

function generateMarkdownReport(results) {
  const markdown = `
# Evaluation Report

**Date:** ${new Date(results.timestamp).toLocaleDateString()}

## Summary

- **Accuracy:** ${results.accuracy.overall}%
- **Total Questions:** ${results.total_questions}
- **Correct:** ${results.fully_correct}

## Failed Questions

${results.results
  .filter(r => !r.overall_correct)
  .map(r => `- **Q${r.question_id}:** ${r.question}`)
  .join('\n')}
  `

  return markdown
}

// Use it
const results = JSON.parse(fs.readFileSync('results.json'))
const md = generateMarkdownReport(results)
fs.writeFileSync('report.md', md)
```

---

## Conclusion

You now have a complete understanding of:

1. ✅ How LLM-as-judge works and why it's useful
2. ✅ Why testing answer quality matters
3. ✅ How HTML reports are generated
4. ✅ Performance and cost optimization strategies
5. ✅ How to extend the system with new features

**Next:** Start using the system! See `EVALUATION_WORKFLOW.md` for practical examples.
