# Meta-Prompting Strategy for Fin Quote

## Overview

This document outlines how to implement meta-prompting to improve our tool routing prompt. Meta-prompting uses AI to generate and optimize the prompts that our system uses, reducing manual prompt engineering and improving accuracy over time.

---

## What Problem Does This Solve?

### Current Challenges

1. **Manual prompt maintenance** - Every time we add a tool, we manually update the routing prompt
2. **Tool disambiguation** - Users get confused between `searchFilings` (content search) vs `getRecentFilings` (list filings)
3. **Limited examples** - We only have 4 example outputs, may not cover edge cases
4. **Static prompts** - Prompts don't improve based on real user errors

### What Meta-Prompting Offers

- **Automatic prompt generation** when tools change
- **Better examples** generated from tool definitions
- **Error-driven improvement** using logged mistakes
- **Optimized routing logic** without manual trial-and-error

---

## Current System Architecture

```
User Question
    ↓
[Prompt 1: Tool Selection] ← Manually written in lib/tools.ts
    ↓
GPT-4 picks tool + args
    ↓
Execute tool (fetch data)
    ↓
[Prompt 2: Answer Generation] ← Manually written in lib/tools.ts
    ↓
GPT-4 generates answer
    ↓
Return to user
```

---

## Meta-Prompting Architecture (Proposed)

### Option A: One-Time Generation (Simplest)

Use meta-prompting as a **development tool** to generate better prompts once.

```
Developer runs script
    ↓
Meta-prompt: "Generate optimal routing prompt for these tools: [definitions]"
    ↓
AI generates improved prompt
    ↓
Developer reviews and approves
    ↓
Manually update lib/tools.ts
    ↓
Deploy
```

**Pros:**
- No code changes to production app
- No added latency or cost
- Simple to implement
- Still use meta-prompting benefits

**Cons:**
- Manual update step
- Doesn't auto-improve from errors

---

### Option B: Dynamic Generation (Advanced)

Generate prompts at **runtime** based on context.

```
User Question
    ↓
Analyze question complexity
    ↓
Meta-prompt: "Generate routing prompt for: [question type]"
    ↓
Cache generated prompt (Redis/memory)
    ↓
Use cached prompt → GPT picks tool
    ↓
Execute tool → Generate answer
    ↓
Return to user
```

**Pros:**
- Adapts to question complexity
- Can optimize per user patterns
- True dynamic behavior

**Cons:**
- Adds latency (extra LLM call)
- More complex caching logic
- Higher costs
- Harder to debug

---

### Option C: Scheduled Improvement (Recommended)

Use meta-prompting to **learn from errors** on a schedule.

```
Production app runs with current prompt
    ↓
Log all tool selections + user feedback/errors
    ↓
Weekly/monthly: analyze logs
    ↓
Meta-prompt: "Given these errors, improve routing prompt"
    ↓
Generate candidate improved prompt
    ↓
A/B test old vs new prompt (10% traffic)
    ↓
If new prompt is better → deploy to 100%
```

**Pros:**
- Continuous improvement
- No runtime latency impact
- Data-driven optimization
- Safe (A/B testing)

**Cons:**
- Requires logging infrastructure
- Needs A/B testing logic
- Takes time to see improvements

---

## Implementation Plan

### Phase 1: Generate Better Examples (Quick Win)

**Goal:** Use meta-prompting to create 20+ diverse examples for routing.

**Meta-Prompt Template:**
```
You are a prompt engineering expert. Given these 4 tools for a financial Q&A system, generate 20 diverse, realistic user questions with their correct tool selections.

Tools:
1. getAaplFinancialsByMetric - Financial statement numbers (revenue, profit, assets, etc.)
2. getPrices - Stock price history and trends
3. getRecentFilings - List SEC filing metadata (dates, types, links)
4. searchFilings - Search INSIDE filings for qualitative content (risks, strategy, commentary)

Requirements:
- Cover common questions for each tool
- Include ambiguous cases (e.g., "show risks" could mean list filings OR search content)
- Include edge cases (e.g., "price of revenue growth" - confusing wording)
- For each question, explain WHY that tool is correct

Output format:
Question | Correct Tool | Reasoning
```

**Steps:**
1. Run this meta-prompt using GPT-4 or Claude
2. Review the 20 generated examples
3. Select the 5-10 best examples
4. Add them to `buildToolSelectionPrompt()` in `lib/tools.ts`
5. Test routing accuracy with real user questions

**Expected Outcome:**
- Better routing accuracy from improved examples
- Covers edge cases we didn't think of manually
- 1-2 hour effort, immediate improvement

---

### Phase 2: Generate Improved Routing Prompt

**Goal:** Use meta-prompting to rewrite the entire routing prompt.

**Meta-Prompt Template:**
```
You are an expert at creating routing prompts for LLM-based systems. Create an optimal tool selection prompt for this financial Q&A system.

Context:
- System uses 2-step LLM flow: (1) route to tool, (2) generate answer
- Users ask questions about Apple (AAPL) stock
- Common confusion: searching filing content vs listing filing metadata
- Must return valid JSON: {"tool": string, "args": object}

Available Tools:
[Paste full tool definitions from lib/tools.ts]

Current Routing Errors (examples):
- User: "show me risks" → System picked getRecentFilings (wrong) → Should be searchFilings
- User: "what's the latest filing" → System picked searchFilings (wrong) → Should be getRecentFilings
- User: "revenue price" → System picked getPrices (wrong) → Should be getAaplFinancialsByMetric

Requirements for new prompt:
1. Clear disambiguation between searchFilings vs getRecentFilings
2. Handle questions about "content/what/how/why" → searchFilings
3. Handle questions about "list/show metadata/dates" → getRecentFilings
4. Force valid JSON output with no prose
5. Include 3-4 example outputs per tool
6. Keep prompt under 500 tokens for efficiency

Generate the complete routing prompt now.
```

**Steps:**
1. Run meta-prompt with current tool definitions
2. Review generated prompt
3. Test side-by-side with current prompt (sample 50 questions)
4. Measure accuracy: which prompt routes correctly more often?
5. If new prompt is better by >5%, replace old prompt
6. Deploy and monitor

**Expected Outcome:**
- Improved routing accuracy, especially for ambiguous questions
- Better handling of edge cases
- Clearer distinction between similar tools

---

### Phase 3: Automated Improvement Loop

**Goal:** Continuously improve prompts based on real user behavior.

**System Architecture:**

```
┌─────────────────────────────────────────────────┐
│  Production App (lib/tools.ts)                  │
│  - Uses current routing prompt                  │
│  - Logs every tool selection                    │
└─────────────────────────────────────────────────┘
                    ↓ logs
┌─────────────────────────────────────────────────┐
│  Database Table: tool_selection_logs            │
│  - question                                     │
│  - selected_tool                                │
│  - selected_args                                │
│  - timestamp                                    │
│  - was_error (optional: user reported wrong)    │
└─────────────────────────────────────────────────┘
                    ↓ weekly analysis
┌─────────────────────────────────────────────────┐
│  Meta-Prompting Script (new)                    │
│  1. Fetch last week's logs                      │
│  2. Identify errors/patterns                    │
│  3. Generate improved prompt                    │
│  4. Save as candidate prompt                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  A/B Testing Logic                              │
│  - 90% traffic: current prompt                  │
│  - 10% traffic: candidate prompt                │
│  - Measure accuracy over 1 week                 │
│  - Promote winner to 100%                       │
└─────────────────────────────────────────────────┘
```

**Implementation Steps:**

1. **Add Logging (Week 1)**
   - Create `tool_selection_logs` table in Supabase
   - Log every tool selection in `app/actions/ask-question.ts`
   - Store: question, selected_tool, args, timestamp
   - Optional: allow users to report wrong answers

2. **Create Analysis Script (Week 2)**
   - Script: `scripts/analyze-routing-errors.ts`
   - Queries logs for common patterns
   - Identifies questions where same tool was selected but different tool would be better
   - Outputs error report

3. **Create Meta-Prompting Script (Week 3)**
   - Script: `scripts/generate-improved-prompt.ts`
   - Inputs: current prompt + error report
   - Meta-prompt: "Given these routing errors, improve the prompt"
   - Outputs: candidate improved prompt (save to `prompts/candidate.txt`)

4. **Implement A/B Testing (Week 4)**
   - Modify `buildToolSelectionPrompt()` to support multiple prompt versions
   - Use random selection (90/10 split) to choose prompt version
   - Track which version was used in logs
   - After 1 week, compare accuracy

5. **Automate (Week 5+)**
   - Schedule weekly cron job to run analysis + generation
   - Auto-deploy improved prompt if it wins A/B test by >5%
   - Send notification to developers when prompt changes

**Expected Outcome:**
- Continuous improvement from real user data
- Automated optimization without manual work
- Data-driven prompt evolution

---

## Meta-Prompt Templates

### Template 1: Generate Examples

```
Generate 20 diverse user questions for a financial Q&A system with these tools:

Tools:
[Paste tool definitions]

For each question provide:
1. The question text
2. Correct tool name
3. Brief reasoning
4. JSON args

Format:
Q: [question]
Tool: [tool_name]
Args: [json]
Why: [reasoning]
```

---

### Template 2: Improve Routing Prompt

```
You are an expert prompt engineer. Improve this tool routing prompt based on observed errors.

Current Prompt:
[Paste current prompt from lib/tools.ts]

Observed Errors:
[List of questions where wrong tool was selected]

Requirements:
- Fix ambiguous cases between searchFilings and getRecentFilings
- Keep JSON-only output requirement
- Add 2-3 examples per tool
- Under 500 tokens
- Clear rules for disambiguation

Generate improved prompt:
```

---

### Template 3: Generate Answer Prompt

```
Create an optimal answering prompt for a financial Q&A system.

Context:
- System fetches data via tools, then asks LLM to answer
- Must use ONLY provided data (no hallucination)
- Should handle missing data gracefully
- Should identify trends when relevant

Requirements:
1. Force grounded answers (only use provided facts)
2. Start by acknowledging data availability (if limited)
3. Describe trends (increasing/decreasing/stable)
4. Say "I don't know" only if ZERO relevant data
5. Be concise (2-3 sentences ideal)

Generate the answering prompt:
```

---

## Success Metrics

### How to Measure Improvement

**Metric 1: Routing Accuracy**
- Before: X% of questions routed to correct tool
- After: Y% of questions routed to correct tool
- Target: >5% improvement

**Metric 2: User Satisfaction**
- Add "Was this helpful?" button
- Track % of positive responses
- Target: >10% improvement

**Metric 3: Error Rate**
- Count questions where tool returned no data
- Count questions where user asks clarifying question immediately after
- Target: <5% error rate

**Metric 4: Ambiguous Question Handling**
- Manually test 20 ambiguous questions
- Measure which prompt handles them better
- Example: "show risks", "list competition", "get strategy"

---

## Rollout Strategy

### Week 1-2: Quick Wins (Phase 1)
- Use meta-prompting to generate 20 examples
- Update routing prompt with best examples
- Measure improvement
- **Effort:** 2-3 hours
- **Risk:** Low (just better examples)

### Week 3-4: Prompt Regeneration (Phase 2)
- Use meta-prompting to rewrite routing prompt
- A/B test with 10% traffic for 1 week
- Deploy if >5% better
- **Effort:** 1 day
- **Risk:** Low (A/B tested)

### Month 2+: Automated Loop (Phase 3)
- Implement logging infrastructure
- Build analysis and generation scripts
- Set up A/B testing framework
- Schedule weekly improvements
- **Effort:** 1-2 weeks
- **Risk:** Medium (more complex system)

---

## Cost Analysis

### One-Time Generation (Phase 1-2)
- Meta-prompting calls: ~5 calls × $0.01 = **$0.05**
- Developer time: 4-6 hours
- Ongoing cost: **$0** (prompts stay static)

### Dynamic Runtime (Option B - NOT recommended)
- Meta-prompt per question: $0.01
- 1,000 questions/day = **$10/day = $300/month**
- Too expensive for marginal benefit

### Scheduled Improvement (Phase 3)
- Weekly meta-prompt: 1 call × $0.01 = **$0.01/week**
- Logging storage: ~$1/month (minimal)
- Total: **~$1.50/month**
- Developer time: 1-2 weeks initial setup, then automated

---

## Risks and Mitigation

### Risk 1: Generated Prompts Perform Worse
**Mitigation:** Always A/B test before full deployment. Only promote if >5% better.

### Risk 2: Meta-Prompts Are Expensive
**Mitigation:** Use meta-prompting for generation only, not at runtime. Cache results.

### Risk 3: Prompts Become Too Complex
**Mitigation:** Set token limits (e.g., <500 tokens). Require human review before deployment.

### Risk 4: System Becomes Harder to Debug
**Mitigation:** Always save prompt versions with timestamps. Can roll back to any previous prompt.

### Risk 5: Over-Optimization for Current Users
**Mitigation:** Include diverse test cases. Don't only optimize for logged errors.

---

## Next Steps

### Immediate (This Week)
1. ✅ Document meta-prompting strategy (this file)
2. Run Phase 1: Generate 20 example questions
3. Update `lib/tools.ts` with new examples
4. Test with 20-30 sample questions
5. Measure improvement

### Short-Term (Next Month)
1. Run Phase 2: Generate improved routing prompt
2. A/B test for 1 week
3. Deploy if better
4. Document results

### Long-Term (Quarter 2)
1. Implement logging infrastructure
2. Build analysis scripts
3. Set up automated improvement loop
4. Monitor and iterate

---

## Conclusion

Meta-prompting offers a powerful way to improve our routing accuracy without manual prompt engineering. The **recommended approach** is:

1. **Start simple** - Use meta-prompting to generate better examples (Phase 1)
2. **Test thoroughly** - A/B test any changes before full deployment
3. **Automate gradually** - Build toward automated improvement loop (Phase 3)

By implementing this strategy, we can:
- Reduce manual prompt maintenance
- Improve routing accuracy by 5-10%
- Continuously learn from real user behavior
- Scale to more tools and companies easily

The key insight: **Let AI help us write better AI prompts**, while keeping humans in the loop for safety and oversight.
