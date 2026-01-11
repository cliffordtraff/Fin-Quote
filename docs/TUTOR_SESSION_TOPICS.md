# 10 Chatbot Improvement Topics for Tutor Session

## 1. **Improve Tool Selection Accuracy** 🎯
**Current Issue**: AI sometimes picks the wrong tool or wrong arguments
- Example: User asks "revenue trend" → AI picks `limit: 4` when they want 10 years
- Example: User asks "P/E ratio" → AI picks wrong tool

**What to Focus On**:
- Review tool selection prompt (`lib/tools.ts`)
- Test with edge cases (vague questions, follow-ups)
- Add examples to prompt for common patterns
- Use evaluation dashboard to find failure patterns

**Files to Review**:
- `lib/tools.ts` (lines 67-424) - Tool selection prompt
- `app/admin/evaluations/page.tsx` - See which questions fail
- `scripts/evaluate.ts` - Run tests to measure accuracy

---

## 2. **Optimize JSON Data Structure Sent to LLM** 📊
**Current Issue**: JSON includes redundant fields, not formatted for LLM
- Sends: `{"year": 2024, "value": 383285000000, "revenue": 383285000000, "shareholders_equity": 73735000000}`
- Should send: `{"year": 2024, "revenue": "$383.3B"}`

**What to Focus On**:
- Create database function to format data for LLM
- Remove unnecessary fields
- Pre-format numbers (383285000000 → "$383.3B")
- Make JSON structure consistent across all tools

**Files to Review**:
- `app/actions/financials.ts` (lines 104-306) - How data is formatted
- `app/api/ask/route.ts` (line 217) - Where JSON is created
- `lib/tools.ts` (line 508) - Answer generation prompt

---

## 3. **Improve Answer Validation & Regeneration** ✅
**Current Issue**: Validation catches errors but regeneration doesn't always fix them
- Sometimes regenerates multiple times
- Error messages in regeneration prompt might be too complex

**What to Focus On**:
- Review validation logic (`lib/validators.ts`)
- Test regeneration prompts (`lib/regeneration.ts`)
- Add more specific error hints
- Test edge cases (missing data, wrong years, etc.)

**Files to Review**:
- `lib/validators.ts` - Validation logic
- `lib/regeneration.ts` - Regeneration prompts
- `app/api/ask/route.ts` (lines 700-850) - Validation flow

---

## 4. **Better Error Handling & User Messages** 💬
**Current Issue**: Errors are technical, not user-friendly
- Shows: "Failed to execute tool: Invalid limit"
- Should show: "I couldn't find that data. Try asking for a different time period."

**What to Focus On**:
- Create user-friendly error messages
- Handle edge cases gracefully (no data, API errors)
- Add helpful suggestions when queries fail
- Show progress indicators during long operations

**Files to Review**:
- `app/api/ask/route.ts` - Error handling
- `components/AssistantChat.tsx` - Error display
- `app/page.tsx` - User-facing error messages

---

## 5. **Optimize Database Queries for Chatbot** 🗄️
**Current Issue**: Some queries are slow or fetch too much data
- Fetches 20 years when user only needs 5
- No caching for repeated queries
- Missing indexes on common query patterns

**What to Focus On**:
- Add indexes for common queries
- Implement query result caching
- Optimize data fetching (only get what's needed)
- Create materialized views for common aggregations

**Files to Review**:
- `app/actions/financials.ts` - Database queries
- `app/actions/get-financial-metric.ts` - Query patterns
- `docs/DATABASE_STRUCTURE_AND_IMPROVEMENTS.md` - Improvement plan

---

## 6. **Improve Answer Quality & Formatting** ✍️
**Current Issue**: Answers sometimes lack context or are poorly formatted
- Doesn't explain trends clearly
- Numbers not consistently formatted
- Missing comparisons when relevant

**What to Focus On**:
- Review answer generation prompt (`lib/tools.ts` line 508)
- Add examples of good answers
- Improve formatting rules (percentages, ratios, dates)
- Add trend analysis instructions

**Files to Review**:
- `lib/tools.ts` (lines 508-710) - Answer generation prompt
- `lib/chart-helpers.ts` - Formatting functions
- Look at `query_logs` table for example answers

---

## 7. **Reduce Latency & Improve Performance** ⚡
**Current Issue**: Some queries take 5-10 seconds
- Tool selection: ~500ms
- Data fetching: ~1-2s
- Answer generation: ~3-5s
- Total: 5-8 seconds

**What to Focus On**:
- Parallelize operations where possible
- Cache frequent queries
- Optimize prompt size (reduce token count)
- Use faster models for simple tasks

**Files to Review**:
- `app/api/ask/route.ts` - Full flow timing
- `app/actions/ask-question.ts` - Latency tracking
- `query_logs` table - Performance metrics

---

## 8. **Better Context Handling in Conversations** 💭
**Current Issue**: Follow-up questions sometimes lose context
- User: "What's revenue?" → AI: "$383.3B"
- User: "What about net income?" → AI doesn't know they mean "for the same period"

**What to Focus On**:
- Improve conversation history handling
- Add context to tool selection prompt
- Better handling of pronouns ("it", "that", "same period")
- Test multi-turn conversations

**Files to Review**:
- `app/api/ask/route.ts` (lines 99-107) - Conversation history
- `lib/tools.ts` (line 304) - Context in tool selection
- `app/actions/ask-question.ts` (lines 292-300) - Previous tool results

---

## 9. **Improve Filing Search Quality** 📄
**Current Issue**: Semantic search sometimes returns irrelevant passages
- User asks about "risks" → Gets passages about "risk management" (different topic)
- Sometimes misses relevant information

**What to Focus On**:
- Review embedding search function (`supabase/migrations/20241101000003_create_search_function.sql`)
- Test different query formulations
- Improve chunking strategy (maybe chunks are too small/large)
- Add re-ranking of results

**Files to Review**:
- `app/actions/search-filings.ts` - Search implementation
- `supabase/migrations/20241027000001_create_filing_chunks_table.sql` - Chunk structure
- Test with various filing questions

---

## 10. **Add Cost Tracking & Optimization** 💰
**Current Issue**: No visibility into costs per query
- Don't know which queries are expensive
- Can't optimize high-cost operations
- No alerts for unusual spending

**What to Focus On**:
- Review cost tracking (`query_logs` table has cost columns)
- Identify expensive queries
- Optimize prompts to reduce tokens
- Add cost alerts/dashboard

**Files to Review**:
- `app/actions/ask-question.ts` (lines 120-200) - Cost tracking
- `query_logs` table - Cost data
- `supabase/migrations/20241102000003_add_cost_tracking.sql` - Cost schema

---

## How to Use This List

### Before Meeting:
1. Pick 2-3 topics that interest you most
2. Review the relevant files
3. Try to reproduce issues or find examples
4. Write down specific questions

### During Meeting:
1. Start with one topic (e.g., #1 Tool Selection)
2. Show your tutor the code
3. Walk through an example that's failing
4. Discuss solutions together
5. Implement one improvement

### After Meeting:
1. Test the improvement
2. Measure before/after (accuracy, latency, cost)
3. Document what you learned
4. Pick next topic for next session

---

## Quick Wins (Start Here)

If you're not sure where to start, these have the biggest impact:

1. **#2 - Optimize JSON Structure** (1-2 hours)
   - Immediate improvement in answer quality
   - Easy to test (before/after)

2. **#1 - Tool Selection** (2-3 hours)
   - Biggest source of errors
   - Can measure improvement with evaluation dashboard

3. **#6 - Answer Quality** (2-3 hours)
   - Users see improvement immediately
   - Easy to test with examples

---

## Testing Your Improvements

For each improvement, test with:

1. **Evaluation Script**: `npx tsx scripts/evaluate.ts --mode fast`
   - Measures tool selection accuracy
   - Shows before/after comparison

2. **Manual Testing**: Try these questions
   - "What's AAPL's revenue in 2024?"
   - "Show me revenue trend over 5 years"
   - "What's the P/E ratio?"
   - "What did the 10-K say about risks?"

3. **Check Logs**: Look at `query_logs` table
   - See latency improvements
   - Check for errors
   - Review answer quality

---

## Questions to Ask Your Tutor

1. "How do I know if my prompt changes are working?"
2. "What's the best way to test improvements?"
3. "How do I debug when the AI picks the wrong tool?"
4. "What's the difference between validation and regeneration?"
5. "How can I reduce token usage without losing quality?"
