# Query Logging Implementation Plan

## Overview

Track every user question and AI response to measure accuracy, improve prompts, and understand user behavior. All data stored in Supabase (our existing database).

---

## Why Log Queries?

### 1. **Measure Accuracy**
- Did the LLM select the correct tool?
- Was the answer factually grounded in the data?
- Are users getting value from responses?

### 2. **Improve Over Time**
- Identify which questions fail
- Test new prompts and measure improvement
- Find patterns in user needs

### 3. **Debug Issues**
- When user reports "wrong answer," we have evidence
- Can reproduce bugs
- See exact data that was used

### 4. **Product Direction**
- Know which features users actually want
- Prioritize new tools based on demand
- Understand typical use cases

---

## Supabase vs Analytics Services

### What's the Difference?

**Supabase (Database Logging):**
- **What it is:** Storing raw data in a database table
- **Best for:** Detailed records, debugging, custom analysis, full data ownership
- **Data storage:** You own and control all data
- **Querying:** Write SQL to analyze anything
- **Cost:** Free (within Supabase limits), then ~$25/month for 8GB
- **Retention:** Keep data forever (or delete when you want)
- **Privacy:** Full control over what you store

**PostHog/Mixpanel (Analytics Services):**
- **What it is:** Pre-built analytics platform with dashboards
- **Best for:** User behavior tracking, funnels, cohort analysis, visualization
- **Data storage:** They host your data (you don't own the database)
- **Querying:** Use their UI/API, limited customization
- **Cost:** Free tier exists, but $200-500+/month at scale
- **Retention:** Usually 1 year max on free/cheap plans
- **Privacy:** They process your data (more compliance concerns)

### Analogy

**Supabase = Your own filing cabinet**
- You write down everything in notebooks
- You can look up anything anytime
- Totally customizable
- More work to analyze

**PostHog = Hiring an analyst**
- They track everything automatically
- Give you pretty charts and insights
- Easier to use
- Less control, costs more

### When to Use Each

| Need | Supabase | PostHog/Mixpanel |
|------|----------|------------------|
| Store exact Q&A pairs | ✅ Perfect | ❌ Not designed for this |
| Debug specific query | ✅ Full details | ⚠️ Limited |
| Measure tool accuracy | ✅ Write SQL | ⚠️ Workarounds |
| Track user funnels | ⚠️ Possible but manual | ✅ Built-in |
| A/B test features | ⚠️ Possible but manual | ✅ Built-in |
| Compliance/audit trail | ✅ Full control | ⚠️ Third-party |
| Cost at 100k queries/mo | ✅ ~$25/mo | ❌ ~$300/mo |

### Our Decision: Start with Supabase

**Why:**
1. **Already set up** - No new service to configure
2. **Full control** - Own the data, query however we want
3. **Cost-effective** - Free for MVP, cheap at scale
4. **Debugging** - Need exact Q&A pairs for accuracy eval
5. **Financial data** - Sensitive, prefer to control it ourselves

**Later (if needed):** Add PostHog for user behavior (page views, clicks, funnels) while keeping Supabase for Q&A logging.

---

## Database Schema

### Table: `query_logs`

```sql
create table query_logs (
  -- Primary key
  id uuid primary key default uuid_generate_v4(),

  -- Session tracking
  session_id text not null,  -- Links related questions in a conversation

  -- User input
  user_question text not null,  -- The question user asked

  -- LLM reasoning (Step 1: Tool selection)
  tool_selected text not null,  -- e.g., "getAaplFinancialsByMetric"
  tool_args jsonb not null,  -- e.g., {"metric": "revenue", "limit": 5}
  tool_selection_latency_ms integer,  -- How long tool selection took

  -- Tool execution (Step 2: Data fetch)
  data_returned jsonb,  -- Actual data from tool (or just metadata like row count)
  data_row_count integer,  -- How many rows returned
  tool_execution_latency_ms integer,  -- How long data fetch took
  tool_error text,  -- If tool call failed, store error message

  -- LLM response (Step 3: Answer generation)
  answer_generated text not null,  -- The final answer shown to user
  answer_latency_ms integer,  -- How long answer generation took

  -- Metadata
  created_at timestamp default now(),

  -- Optional: User feedback (add later)
  user_feedback text,  -- "thumbs_up", "thumbs_down", or null
  user_feedback_comment text  -- Optional text feedback
);

-- Indexes for fast queries
create index idx_query_logs_session on query_logs(session_id);
create index idx_query_logs_created_at on query_logs(created_at desc);
create index idx_query_logs_tool on query_logs(tool_selected);
```

### Why These Fields?

**session_id**: Track conversations over time
- Example: "User asked about revenue, then net income" → same session

**user_question**: The raw question
- Example: "What's AAPL's revenue trend?"

**tool_selected**: Which tool the LLM chose
- Example: "getAaplFinancialsByMetric"
- **Use case:** Measure tool selection accuracy

**tool_args**: Arguments passed to tool
- Example: `{"metric": "revenue", "limit": 5}`
- **Use case:** See if LLM chose correct parameters

**data_returned**: What the tool actually returned
- **Option A (full):** Store entire dataset `[{year: 2020, value: 274.5B}, ...]`
- **Option B (metadata):** Just row count and summary
- **Trade-off:** Full data = easier debugging, metadata = smaller storage

**answer_generated**: The final answer shown to user
- Example: "AAPL's revenue grew from $274.5B in 2020 to $391.0B in 2024..."
- **Use case:** Compare to ground truth, evaluate quality

**Latency fields**: How long each step took
- **Use case:** Find bottlenecks, optimize slow queries

**user_feedback**: Thumbs up/down (add later)
- **Use case:** Measure user satisfaction over time

---

## Implementation Plan

### Phase 1: Basic Logging (1-2 hours)

**Goal:** Log every question/answer to database

**Steps:**
1. Create `query_logs` table in Supabase
2. Update `app/actions/ask-question.ts`:
   - After tool selection → log
   - After answer generation → log
3. Generate session ID in browser (localStorage or UUID)
4. Pass session ID to server with each request

**What we'll track:**
- ✅ Question
- ✅ Tool + args
- ✅ Answer
- ✅ Timestamp
- ✅ Session ID

**What we won't track yet:**
- ⏸️ User feedback (add in Phase 2)
- ⏸️ Detailed latency (add in Phase 2)
- ⏸️ Full data returned (just row count for now)

### Phase 2: Analytics & Feedback (1 hour)

**Goal:** Measure accuracy and get user feedback

**Steps:**
1. Add thumbs up/down buttons to UI
2. Store feedback in `query_logs` table
3. Add latency tracking for each step
4. Create simple dashboard (SQL queries or Supabase UI)

### Phase 3: Evaluation (Ongoing)

**Goal:** Use data to improve system

**Weekly review:**
- Sample 20-30 questions
- Rate tool selection accuracy (correct/incorrect)
- Rate answer quality (accurate/inaccurate/hallucination)
- Identify patterns in failures

**Metrics to track:**
- Tool selection accuracy %
- Answer accuracy %
- User satisfaction (thumbs up %)
- Average latency per step
- Error rate %

---

## Privacy & Compliance

### What We Log

✅ **Safe to log:**
- User questions (no PII)
- Tool selections and arguments
- Answers generated
- Session ID (anonymous)

⚠️ **Be careful:**
- User might type personal info in question
- Financial data in answers (AAPL revenue is public, but principles matter)

❌ **Never log:**
- User email/name (unless explicitly consented)
- IP addresses (unless required for security)
- Anything that could identify a specific person

### Best Practices

1. **Anonymize sessions**: Use random UUIDs, not user IDs
2. **Data retention**: Delete logs after 90 days (or 1 year max)
3. **Opt-out**: Let users disable logging (checkbox in settings)
4. **Transparency**: Update privacy policy to mention logging
5. **Security**: Use RLS (Row Level Security) in Supabase

### Example Privacy Policy Text

```
"We log your questions and our AI responses to improve accuracy.
No personally identifiable information is stored. Logs are deleted
after 90 days. You can opt out in Settings."
```

---

## Example Queries for Analysis

### 1. Tool Selection Accuracy

```sql
-- Most common tools used
select
  tool_selected,
  count(*) as usage_count,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as percentage
from query_logs
where created_at > now() - interval '7 days'
group by tool_selected
order by usage_count desc;
```

**Output:**
```
tool_selected                | usage_count | percentage
-----------------------------|-------------|------------
getAaplFinancialsByMetric   | 450         | 45.0%
searchFilings                | 300         | 30.0%
getPrices                    | 150         | 15.0%
getRecentFilings             | 100         | 10.0%
```

### 2. Error Rate

```sql
-- Questions that failed
select
  count(*) as total_queries,
  count(*) filter (where tool_error is not null) as errors,
  round(100.0 * count(*) filter (where tool_error is not null) / count(*), 2) as error_rate_percent
from query_logs
where created_at > now() - interval '7 days';
```

### 3. User Satisfaction

```sql
-- Thumbs up/down ratio (after Phase 2)
select
  user_feedback,
  count(*) as count,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as percentage
from query_logs
where user_feedback is not null
and created_at > now() - interval '7 days'
group by user_feedback;
```

**Output:**
```
user_feedback | count | percentage
--------------|-------|------------
thumbs_up     | 850   | 85.0%
thumbs_down   | 150   | 15.0%
```

### 4. Latency Analysis

```sql
-- Average latency by step
select
  round(avg(tool_selection_latency_ms)) as avg_tool_selection_ms,
  round(avg(tool_execution_latency_ms)) as avg_tool_execution_ms,
  round(avg(answer_latency_ms)) as avg_answer_ms,
  round(avg(
    tool_selection_latency_ms +
    tool_execution_latency_ms +
    answer_latency_ms
  )) as avg_total_ms
from query_logs
where created_at > now() - interval '7 days'
and tool_error is null;
```

### 5. Most Common Questions

```sql
-- Find similar questions (use for FAQ)
select
  user_question,
  count(*) as times_asked
from query_logs
where created_at > now() - interval '30 days'
group by user_question
order by times_asked desc
limit 10;
```

---

## Cost Estimate

### Supabase Storage

**Assumptions:**
- 1,000 queries per day
- 30,000 queries per month
- Average row size: ~2KB (with full data) or ~500 bytes (metadata only)

**Storage:**
- With full data: 30,000 × 2KB = 60MB/month = 720MB/year
- With metadata: 30,000 × 500B = 15MB/month = 180MB/year

**Supabase Pricing:**
- Free tier: 500MB database
- Pro tier ($25/mo): 8GB database

**Conclusion:** Even storing full data, we'd stay in free tier for 8+ months. At scale (10k+ queries/day), Pro tier still only $25/month.

### Compare to PostHog

**PostHog pricing:**
- Free: 1 million events/month
- But "events" are different from our needs
- To store full Q&A context: ~$200-300/month at 30k queries

**Winner:** Supabase is 10x cheaper

---

## Implementation Code Structure

### Where to Add Logging

**File:** `app/actions/ask-question.ts`

**Add function:**
```typescript
// New function at top of file
async function logQuery(data: {
  sessionId: string
  userQuestion: string
  toolSelected: string
  toolArgs: any
  dataReturned?: any
  dataRowCount?: number
  answerGenerated: string
  toolError?: string
}) {
  // Insert into Supabase query_logs table
}
```

**Call in main function:**
```typescript
export async function askQuestion(question, history, sessionId) {
  // ... existing code ...

  // After tool selection
  const toolSelected = toolSelection.tool
  const toolArgs = toolSelection.args

  // After tool execution
  const dataReturned = toolResult.data
  const dataRowCount = toolResult.data?.length

  // After answer generation
  const answer = answerResponse.choices[0].message.content

  // LOG IT ALL
  await logQuery({
    sessionId,
    userQuestion: question,
    toolSelected,
    toolArgs,
    dataReturned: null, // or dataReturned for full logging
    dataRowCount,
    answerGenerated: answer,
    toolError: toolResult.error || null
  })

  return { answer, dataUsed, chartConfig, error: null }
}
```

**Frontend changes:**
```typescript
// app/ask/page.tsx
// Generate session ID once on mount
const [sessionId] = useState(() =>
  localStorage.getItem('session_id') || crypto.randomUUID()
)

useEffect(() => {
  localStorage.setItem('session_id', sessionId)
}, [sessionId])

// Pass to server
const result = await askQuestion(question, conversationHistory, sessionId)
```

---

## Next Steps

### Phase 1 Implementation (This Week)

1. ✅ Create this plan document
2. ⏸️ Create `query_logs` table in Supabase
3. ⏸️ Add session ID generation in frontend
4. ⏸️ Add logging function in `ask-question.ts`
5. ⏸️ Test with 10 questions
6. ⏸️ Verify data appears in Supabase

### Phase 2 (Next Week)

1. ⏸️ Add thumbs up/down buttons
2. ⏸️ Add feedback storage
3. ⏸️ Create basic dashboard (SQL queries)

### Phase 3 (Ongoing)

1. ⏸️ Weekly review of 20-30 questions
2. ⏸️ Calculate accuracy metrics
3. ⏸️ Test prompt improvements
4. ⏸️ Iterate based on findings

---

## Summary

**What:** Store every Q&A pair in Supabase database
**Why:** Measure accuracy, improve over time, debug issues
**How:** New `query_logs` table + logging in `ask-question.ts`
**Cost:** Free (or $25/mo at scale)
**Privacy:** Anonymous session IDs, 90-day retention
**Alternative:** PostHog/Mixpanel costs 10x more, less control

**Bottom line:** Supabase logging gives us full control, costs less, and provides exactly the data we need for accuracy evaluation. Analytics services are better for user behavior tracking (clicks, funnels), which we don't need yet.
