# GPT-5-Nano Migration Troubleshooting

> Note: Fin Quote uses the OpenAI Responses API exclusively in production/runtime paths. Any Chat Completions references in this document are historical or for comparison during migration notes.

## Timeline of Issues and Fixes

### Initial Goal
Migrate from `gpt-4o-mini` to `gpt-5-nano-2025-08-07` for 60% cost savings ($3/mo → $1.20/mo).

---

## Issue #1: Invalid Parameter - `max_tokens`

### Error
```
400 Unsupported parameter: 'max_tokens' is not supported with this model.
Use 'max_completion_tokens' instead.
```

### Root Cause
GPT-5 models require `max_completion_tokens` parameter instead of the older `max_tokens` parameter.

### Fix Applied
Updated all 3 API calls in `app/actions/ask-question.ts`:
- Tool selection (line ~245)
- Answer generation (line ~475)
- Regeneration (line ~590)

Changed from:
```typescript
max_tokens: 150
```

To:
```typescript
max_completion_tokens: 150
```

### Files Modified
- `app/actions/ask-question.ts`
- `scripts/evaluate.ts`
- `scripts/test-phase-0.mjs`
- `scripts/test-tool-selection.mjs`
- `docs/EVALUATION_SYSTEM_PLAN.md`

### Status
✅ **RESOLVED**

---

## Issue #2: Unsupported Temperature Value

### Error
```
400 Unsupported value: 'temperature' does not support 0 with this model.
Only the default (1) value is supported.
```

### Root Cause
GPT-5-nano only supports the default temperature value (1). Cannot use `temperature: 0` for deterministic output.

### Fix Applied
Made temperature conditional based on model name:

```typescript
...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 })
```

This pattern:
- **Omits** temperature for GPT-5 models (uses default of 1)
- **Includes** `temperature: 0` for gpt-4o-mini and other models

### Impact
⚠️ **Loss of Determinism**: GPT-5-nano responses will vary slightly between runs due to inability to use `temperature: 0`.

### Files Modified
- `app/actions/ask-question.ts` (3 locations)
- All test scripts

### Status
✅ **RESOLVED** (but with trade-off)

---

## Issue #3: Failed to Select Tool (Empty Response)

### Error
```
Error: Failed to select tool
```

### Server Logs
```
Tool selection returned empty response: {
  finish_reason: 'length',
  completion_tokens: 150,
  reasoning_tokens: 150,  // ← ALL tokens used for reasoning!
  message: { content: null }
}
```

### Root Cause Discovery
**GPT-5 models use "reasoning tokens"** (invisible internal thinking) that count against the `max_completion_tokens` limit.

The model was:
1. Using **all 150 tokens for internal reasoning**
2. Hitting the token limit before generating any output
3. Returning `finish_reason: 'length'` with empty content

### Fix Applied
Increased token limits for GPT-5 models to account for reasoning tokens:

```typescript
// Tool selection
max_completion_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 500 : 150

// Answer generation
max_completion_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 1000 : 500

// Regeneration
max_completion_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 1000 : 500
```

### Reasoning
- GPT-5 models need headroom for both reasoning AND output tokens
- Original limits (150/500) were too small
- New limits (500/1000) provide ~350-850 tokens for actual output

### Status
✅ **RESOLVED** - Tool selection now works successfully

#### Additional Hardening (Feb 14, 2025)
- Added an explicit router system message so GPT-5 models are instructed to reply with JSON only.
- Enabled `response_format: { type: 'json_object' }` on tool selection requests to force structured output even when the model uses reasoning tokens.
- Updated parsing logic to handle GPT-5 responses that arrive as arrays of content fragments or via the `parsed` payload before falling back to raw JSON parsing.
- Emitted detailed debug logs for both raw `content` and any `parsed` payload to speed up investigating future failures.
- Changes implemented in `app/actions/ask-question.ts`.

### Status
🟢 **Monitoring** – No router failures after the latest hardening, but keeping the extra logging in place.

---

## Issue #4: Failed to Generate Answer (CURRENT ISSUE)

### Error
```
Error: Failed to generate answer
```

### Symptoms
1. ✅ Tool selection **WORKS** - successfully returns JSON tool/args
2. ✅ Data fetching **WORKS** - successfully retrieves financial data
3. ❌ Answer generation **FAILS** - returns "Failed to generate answer"
4. ⏱️ Request takes **13+ seconds** (very slow)
5. 📝 No error logs visible (silent failure)

### What We Know Works
From debug logs:
```
🔍 DEBUG - Tool selection content: {"tool":"getAaplFinancialsByMetric","args":{"metric":"gross_profit","limit":4}}
🔍 DEBUG - Facts JSON: [... data successfully fetched ...]
```

### What We Don't Know
- Is answer response hitting token limit again?
- Is the response empty or does it contain reasoning tokens?
- Is there a timeout issue (13 seconds is concerning)?
- Is the response format wrong?

### Debug Logging Added
Added to `app/actions/ask-question.ts` (line ~483):
```typescript
console.log('🔍 DEBUG - Answer response:', JSON.stringify(answerResponse, null, 2))

const answer = answerResponse.choices[0]?.message?.content
if (!answer) {
  console.error('❌ Answer generation returned empty content. Full response:', answerResponse)
  return { answer: '', dataUsed: null, chartConfig: null, error: 'Failed to generate answer', queryLogId: null }
}
```

**Note**: This logging may not have hot-reloaded yet. Need to test again to see full response object.

### Status
🔴 **ACTIVE ISSUE** - Currently blocking

#### Recent Analysis (Feb 14, 2025)
- Latest logging now records both the raw `content` and any `parsed` payload coming back from GPT-5 so we can inspect reasoning-token usage directly.
- The repeated empty answers remain most consistent with the model spending almost the entire `max_completion_tokens` budget on reasoning tokens (`finish_reason: "length"` with no emitted text). Confirm this by reviewing the new debug logs, especially `usage.reasoning_tokens`.
- If reasoning tokens are the culprit, the practical mitigations are:
  1. Increase `max_completion_tokens` substantially (e.g. 2,000–4,000) *and/or* trim the answer prompt (reduce validation + conversation history sent to GPT-5).
  2. If widening the budget still fails—or becomes too slow/expensive—fall back to a more stable model (`gpt-4o-mini`) or upgrade to `gpt-5-mini`.
- Other theories (response format, system prompt conflicts, API throttling) currently appear less likely given the router now succeeds and OpenAI accepts the same model ID for tool selection.
- **Mitigation in progress (Feb 14, 2025):** Bumped GPT-5 answer `max_completion_tokens` first to 2000 and, after continued failures, to **4000** while continuing to limit the assistant to only send the last four conversation turns when GPT-5 is active. Goal is to leave more headroom for generated text while shrinking the prompt footprint.

---

## Environment Configuration

### Current .env.local
```bash
OPENAI_MODEL=gpt-5-nano-2025-08-07
```

### API Call Parameters (GPT-5)
```typescript
{
  model: 'gpt-5-nano-2025-08-07',
  messages: [...],
  // NO temperature (defaults to 1)
  max_completion_tokens: 500-1000,  // Varies by call type
  response_format: { type: 'json_object' }  // Only for tool selection
}
```

---

## Hypothesis: What's Causing "Failed to Generate Answer"

### Theory 1: Reasoning Tokens Eating All Output (Again)
**Likelihood**: 🔴 **HIGH**

Even with 1000 max_completion_tokens, GPT-5-nano might be using:
- 900+ tokens for reasoning
- 0-100 tokens for actual answer
- Hitting limit before completing response

**Evidence**:
- Same symptom as Issue #3 (empty content, finish_reason: 'length')
- 13 second timeout suggests model is "thinking" heavily

**Test**: Check if `answerResponse.usage.reasoning_tokens` is close to `max_completion_tokens`

**Potential Fix**: Increase to 2000+ tokens OR disable reasoning somehow

---

### Theory 2: Response Format Issue
**Likelihood**: 🟡 **MEDIUM**

Answer generation doesn't use `response_format: { type: 'json_object' }`, but maybe GPT-5-nano requires it?

**Evidence**:
- Tool selection works (uses json_object format)
- Answer generation fails (no format specified)

**Test**: Add `response_format: { type: 'text' }` to answer generation

**Potential Fix** (legacy example using Chat Completions; prefer Responses API in Fin Quote):
```typescript
const answerResponse = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  messages: answerMessages,
  max_completion_tokens: 1000,
  response_format: { type: 'text' },  // Explicitly specify text format
})
```

---

### Theory 3: System Message Conflict
**Likelihood**: 🟡 **MEDIUM**

Tool selection has a system message:
```typescript
{
  role: 'system',
  content: 'You are Fin Quote routing assistant. Your ONLY job is to pick exactly one tool...'
}
```

But answer generation uses:
```typescript
{
  role: 'system',
  content: 'You are Fin Quote analyst assistant. Use only the provided facts...'
}
```

**Evidence**: None yet, but GPT-5 might handle system messages differently

**Test**: Check if removing/simplifying system message helps

---

### Theory 4: Prompt Too Long
**Likelihood**: 🟢 **LOW**

The answer prompt includes:
- Full tool selection prompt (buildFinalAnswerPrompt)
- Conversation history (last 10 messages)
- System message
- Lengthy validation rules

**Evidence**:
- Tool selection prompt is even longer and works
- But answer generation might hit input token limit

**Test**: Check `answerResponse.usage.prompt_tokens` - if > 100k, this is the issue

---

### Theory 5: Model Name Typo/Doesn't Exist
**Likelihood**: 🟢 **LOW**

Maybe `gpt-5-nano-2025-08-07` isn't the right model name?

**Evidence**:
- Tool selection works with same model name
- API accepted the model name (no 404 error)

**Test**: Try simpler model name `gpt-5-nano` without date suffix

**Potential Fix**:
```bash
OPENAI_MODEL=gpt-5-nano
```

---

### Theory 6: API Rate Limiting / Throttling
**Likelihood**: 🟢 **LOW**

OpenAI might be throttling GPT-5-nano requests, causing 13 second delays.

**Evidence**:
- 13 second response time is unusually slow
- No error message (rate limits usually return 429)

**Test**: Check response headers for rate limit info

---

## Recommended Next Steps

### Immediate Actions (Do First)

1. **Verify Enhanced Logging is Working**
   - Restart dev server to ensure code hot-reloaded
   - Try query again and check for new debug output
   - Look for: `🔍 DEBUG - Answer response:` in logs

2. **Check Reasoning Token Usage**
   - If logs show `reasoning_tokens: 900+` → increase max_completion_tokens to 2000
   - If `finish_reason: 'length'` → definitely a token limit issue

3. **Test with Simpler Model Name**
   ```bash
   OPENAI_MODEL=gpt-5-nano
   ```

### Secondary Actions (If Above Fails)

4. **Try Different max_completion_tokens Values**
   - 2000 tokens
   - 4000 tokens
   - 8000 tokens (max for GPT-5)

5. **Add Explicit Response Format**
   ```typescript
   response_format: { type: 'text' }
   ```

6. **Create Standalone Test Script**
   - Test GPT-5-nano directly with minimal prompt
   - Isolate whether issue is model-specific or code-specific

7. **Fallback Plan: Switch Back to gpt-4o-mini**
   - If GPT-5-nano proves unreliable, revert to stable model
   - Cost savings not worth broken functionality

---

## Success Criteria

✅ Tool selection working (JSON format)
✅ Data fetching working
❌ Answer generation working (plain text)
❌ Validation passing
❌ Chart generation working
❌ End-to-end query completing successfully

---

## Performance Comparison

| Metric | gpt-4o-mini | gpt-5-nano (current) |
|--------|-------------|---------------------|
| Tool selection latency | ~500ms | ~2000ms+ |
| Answer generation latency | ~1000ms | **13000ms+** ⚠️ |
| Cost per 1M tokens | $0.15/$0.60 | $0.05/$0.40 |
| Temperature control | ✅ Yes | ❌ No (fixed at 1) |
| Deterministic output | ✅ Yes | ❌ No |
| Reasoning tokens | ❌ No | ✅ Yes (counts against limit) |
| **Overall Status** | ✅ **Working** | 🔴 **Broken** |

---

## Conclusion & Recommendation

### Current Assessment
GPT-5-nano is **not production-ready** for this use case due to:
1. Reasoning tokens consuming all output capacity
2. 10x slower response times (13s vs 1s)
3. Loss of determinism (no temperature: 0)
4. Silent failures with unclear error messages

### Recommended Action
**Revert to gpt-4o-mini** until GPT-5-nano issues are resolved.

Change `.env.local`:
```bash
OPENAI_MODEL=gpt-4o-mini
```

### Future Considerations
- Monitor GPT-5-nano updates from OpenAI
- Test again in 3-6 months when model matures
- Consider gpt-5-mini as middle ground (more expensive but more reliable)

### Cost-Benefit Analysis
- **Savings**: $1.80/month (60% reduction)
- **Cost**: Broken functionality, 10x slower, unpredictable outputs
- **Verdict**: ❌ **Not worth it at current scale**

When monthly costs reach $50+ (15k+ queries), revisit GPT-5-nano migration.
