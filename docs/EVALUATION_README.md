# Evaluation System - Quick Start

Your Fin Quote project now has a complete evaluation system with three powerful features:

1. ✅ **Fast/Full Evaluation** - Test tool selection and answer generation
2. ✅ **LLM-as-Judge** - Automatic answer quality grading using GPT-4
3. ✅ **HTML Reports** - Beautiful visual reports you can share

---

## Quick Commands

```bash
# Fast mode (2-3 min) - Test tool selection only
npx tsx scripts/evaluate.ts --mode fast

# Full mode (8-10 min) - Test tool selection + answer generation
npx tsx scripts/evaluate.ts --mode full

# Full mode with LLM-as-judge (15-20 min) - Test everything including answer quality
npx tsx scripts/evaluate.ts --mode full --llm-judge

# Test with fewer questions (faster for development)
npx tsx scripts/evaluate.ts --mode fast --limit 10

# Generate HTML report
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-*.json

# Demo LLM-as-judge
npx tsx scripts/test-llm-judge.ts
```

---

## What Each Mode Tests

| Mode | Tests Tool Selection | Tests Answers | Evaluates Quality | Time | Cost |
|------|---------------------|---------------|-------------------|------|------|
| **Fast** | ✅ | ❌ | ❌ | 2-3 min | $0.02 |
| **Full** | ✅ | ✅ | ❌ | 8-10 min | $0.10 |
| **Full + Judge** | ✅ | ✅ | ✅ | 15-20 min | $0.60 |

---

## Example Workflow

### Day-to-Day Development

```bash
# Quick check (30 seconds)
npx tsx scripts/evaluate.ts --mode fast --limit 10

# If that looks good, run full test
npx tsx scripts/evaluate.ts --mode fast
```

### Before Deploying

```bash
# Comprehensive validation
npx tsx scripts/evaluate.ts --mode full --llm-judge --limit 20

# Generate report
npx tsx scripts/generate-html-report.ts test-data/test-results/eval-full-*.json
open test-data/test-results/eval-full-*.html

# Review report, ensure quality score >= 8.0
# If good, deploy!
```

---

## Understanding Results

### Tool Selection Accuracy

```
Correct Tool: 95 (95.0%)
```

- **Good:** ≥90%
- **Needs work:** <85%

### Answer Quality (LLM-as-Judge)

```
OVERALL: 8.5/10

Average Scores:
  Accuracy:     9.2/10  ← Are numbers correct?
  Relevance:    8.7/10  ← Does it answer the question?
  Completeness: 8.1/10  ← Uses all the data?
  Insight:      7.9/10  ← Provides helpful context?
```

- **Excellent:** ≥9.0
- **Good:** 8.0-8.9
- **Acceptable:** 7.0-7.9
- **Needs work:** <7.0

---

## Files Added

**New Scripts:**
- `scripts/generate-html-report.ts` - Generate visual reports
- `scripts/test-llm-judge.ts` - Demo LLM-as-judge

**New Libraries:**
- `lib/llm-judge.ts` - GPT-4 answer quality evaluation

**Updated:**
- `scripts/evaluate.ts` - Now supports full mode and LLM-as-judge

**Documentation:**
- `docs/EVALUATION_WORKFLOW.md` - Complete workflow guide with examples
- `docs/EVALUATION_TECHNICAL_DEEP_DIVE.md` - Technical deep dive
- `EVALUATION_README.md` - This file (quick reference)

---

## Next Steps

1. **Try it out:**
   ```bash
   npx tsx scripts/evaluate.ts --mode fast --limit 5
   ```

2. **See a demo of LLM-as-judge:**
   ```bash
   npx tsx scripts/test-llm-judge.ts
   ```

3. **Generate your first HTML report:**
   ```bash
   npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-2025-11-01T20-10-10-272Z.json
   open test-data/test-results/eval-fast-2025-11-01T20-10-10-272Z.html
   ```

4. **Read the full guides:**
   - 📖 `docs/EVALUATION_WORKFLOW.md` - How to use the system
   - 🔧 `docs/EVALUATION_TECHNICAL_DEEP_DIVE.md` - How it works

---

## Questions?

**Q: Which mode should I use?**
A: Fast mode for daily work, full mode with LLM-judge before deployment.

**Q: What's a good score?**
A: Tool accuracy ≥90%, Answer quality ≥8.0/10

**Q: Is LLM-as-judge expensive?**
A: ~$0.60 for 100 questions. Use `--limit 20` to test cheaper.

**Q: Can I add more test questions?**
A: Yes! Edit `test-data/golden-test-set.json`

---

## Summary

You now have a complete evaluation framework that:

✅ Tests tool selection accuracy (fast mode)
✅ Tests answer generation (full mode)
✅ Evaluates answer quality with GPT-4 (LLM-as-judge)
✅ Generates beautiful HTML reports
✅ Helps you improve your AI systematically

**This is the same system OpenAI uses internally for evaluating GPT models!**

Happy testing! 🚀
