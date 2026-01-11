# Chatbot Technical Overview & Improvement Ideas

## Technical Architecture

### High-Level Flow

The chatbot uses a **three-step LLM orchestration pattern**:

1. **Tool Selection** → LLM picks which data tool to use
2. **Tool Execution** → Fetch data from Supabase
3. **Answer Generation** → LLM generates final answer from facts

### Core Components

#### 1. **Frontend Entry Points**
- **`app/page.tsx`** - Home page with streaming chatbot (uses `/api/ask` route)
- **`app/chatbot/page.tsx`** - Dedicated chatbot page (uses `askQuestion` server action)

#### 2. **API Layer**
- **`app/api/ask/route.ts`** - Streaming API endpoint (Server-Sent Events)
  - Streams: `flow`, `data`, `answer`, `validation`, `followup`, `complete` events
  - Real-time progress updates via Flow Visualization
  - Edge runtime for low latency

#### 3. **Server Actions**
- **`app/actions/ask-question.ts`** - Main orchestration function
  - Non-streaming version (used by chatbot page)
  - Handles tool selection, execution, answer generation
  - Includes validation and regeneration logic

#### 4. **Tool System** (`lib/tools.ts`)
Available tools:
- `getAaplFinancialsByMetric` - Basic financial metrics (revenue, profit, assets, etc.)
- `getPrices` - Stock price history with custom date ranges
- `getRecentFilings` - SEC filing metadata (dates, types, URLs)
- `searchFilings` - Semantic search through filing content
- `listMetrics` - Browse available metrics catalog
- `getFinancialMetric` - Advanced metrics (P/E, ROE, debt ratios, 139+ metrics)

#### 5. **Data Layer**
- **Supabase** - PostgreSQL database with:
  - `financials_std` - Standardized financial statements
  - `prices` - Historical stock prices
  - `filings` - SEC filing metadata
  - `filing_chunks` - Vector embeddings for semantic search
  - `query_logs` - Analytics and feedback tracking
  - `conversations` / `messages` - Persistent chat history

#### 6. **LLM Integration**
- **OpenAI Responses API** (gpt-4o-mini or gpt-5-nano)
- **Two-stage prompting**:
  - Tool selection: JSON-structured output (`{"tool": string, "args": object}`)
  - Answer generation: Plain text with strict formatting rules
- **Conversation history**: Last 4-10 messages included for context

#### 7. **Validation System** (`lib/validators.ts`)
Validates answers against source data:
- **Number validation**: Checks if numbers match data (with tolerance for rounding)
- **Year validation**: Ensures mentioned years exist in data
- **Filing validation**: Verifies citations reference real filings
- **Severity levels**: none, low, medium, high, critical

#### 8. **Regeneration System** (`lib/regeneration.ts`)
Auto-corrects failed validations:
- Triggers on medium/high/critical validation failures
- Refetches data if needed (e.g., missing year)
- Regenerates answer with error-specific correction hints
- Validates regenerated answer before returning

#### 9. **Flow Visualization** (`lib/flow/events.ts`)
Real-time pipeline visibility:
- Tracks: tool selection, tool execution, chart generation, answer generation, validation, follow-up generation
- Groups: planning, data, answering
- Status: pending, active, success, warning, error
- Streamed to frontend via SSE

#### 10. **Conversation Management**
- **LocalStorage** - For unauthenticated users
- **Supabase** - For authenticated users (cross-device sync)
- **Conversation history** - Maintains context for follow-up questions
- **Auto-generated titles** - Based on first question

### Data Flow Example

```
User: "What's Apple's revenue trend?"
  ↓
1. Tool Selection (LLM)
   → Analyzes question + conversation history
   → Returns: {"tool": "getAaplFinancialsByMetric", "args": {"metric": "revenue", "limit": 4}}
  ↓
2. Tool Execution
   → Query Supabase: SELECT * FROM financials_std WHERE metric='revenue' LIMIT 4
   → Returns: [{year: 2024, value: 383.3B}, {year: 2023, value: 383.3B}, ...]
  ↓
3. Chart Generation (optional)
   → generateFinancialChart() creates ChartConfig
  ↓
4. Answer Generation (LLM)
   → Prompt: "Answer using ONLY these facts: [JSON data]"
   → Returns: "Revenue increased from $274.5B in 2020 to $383.3B in 2024..."
  ↓
5. Validation
   → Check numbers, years, citations match data
   → If fails → Regenerate with correction hints
  ↓
6. Follow-up Questions (LLM)
   → Generate 3 relevant follow-up suggestions
  ↓
7. Response to User
   → Answer text + chart + data table + follow-up questions
```

### Key Design Decisions

1. **Two-step LLM approach**: Separates routing (tool selection) from answer generation for better accuracy
2. **Strict validation**: Catches hallucinations before showing to users
3. **Auto-regeneration**: Fixes errors automatically without user intervention
4. **Streaming responses**: Better UX with real-time progress
5. **Conversation history**: Enables follow-up questions and context awareness
6. **Tool-based architecture**: Extensible - easy to add new data sources

---

## Improvement Ideas

### 1. **Multi-Tool Queries** (High Impact)
**Problem**: Currently only one tool per query. Users can't ask "Compare revenue and P/E ratio" in one question.

**Solution**:
- Allow tool selection to return multiple tools: `{"tools": [{"tool": "...", "args": {...}}, ...]}`
- Execute tools in parallel
- Merge results before answer generation
- Update prompt to handle multiple data sources

**Complexity**: Medium
**Impact**: High - Enables comparison queries

---

### 2. **Smart Caching** (Performance)
**Problem**: Same questions fetch same data repeatedly.

**Solution**:
- Cache tool results by `(tool, args)` hash
- Cache LLM responses for identical questions
- Use Redis or Supabase edge functions for caching
- TTL: 1 hour for financial data, 5 minutes for prices

**Complexity**: Medium
**Impact**: High - Reduces latency and costs

---

### 3. **Better Error Recovery** (Reliability)
**Problem**: If tool execution fails, user sees generic error.

**Solution**:
- **Fallback tools**: If `getFinancialMetric` fails, try `getAaplFinancialsByMetric`
- **Partial results**: If some metrics fail, return what succeeded
- **Retry logic**: Exponential backoff for transient DB errors
- **User-friendly messages**: "I couldn't fetch P/E ratio, but here's revenue data..."

**Complexity**: Low-Medium
**Impact**: Medium - Better user experience

---

### 4. **Contextual Follow-ups** (UX)
**Problem**: Follow-up questions are generic.

**Solution**:
- Use conversation history to generate more relevant follow-ups
- Example: If user asked "revenue 2020-2024", suggest "How does this compare to 2015-2019?"
- Include data-driven suggestions: "Would you like to see profit margins for these years?"

**Complexity**: Low
**Impact**: Medium - More engaging conversations

---

### 5. **Multi-Company Support** (Feature Expansion)
**Problem**: Currently only AAPL.

**Solution**:
- Extract ticker from question: "What's Microsoft's revenue?"
- Pass ticker to tools: `getFinancialsByMetric({symbol: 'MSFT', metric: 'revenue'})`
- Update database queries to filter by symbol
- Add symbol validation (check if ticker exists)

**Complexity**: High
**Impact**: High - Major feature expansion

---

### 6. **Answer Quality Scoring** (Analytics)
**Problem**: No way to measure answer quality automatically.

**Solution**:
- **LLM-as-judge**: Use GPT-4 to score answers (1-10) on accuracy, completeness, clarity
- **User feedback correlation**: Compare scores to thumbs up/down
- **A/B testing**: Test different prompts and measure scores
- **Dashboard**: Show quality trends over time

**Complexity**: Medium
**Impact**: Medium - Better insights for improvement

---

### 7. **Streaming Tool Execution** (UX)
**Problem**: Tool execution is a black box - user waits with no feedback.

**Solution**:
- Stream progress: "Fetching 2024 data...", "Fetching 2023 data...", etc.
- Show data as it arrives (for multi-year queries)
- Progressive chart rendering

**Complexity**: Medium
**Impact**: Low-Medium - Better perceived performance

---

### 8. **Conversation Summarization** (Context Management)
**Problem**: Long conversations hit token limits.

**Solution**:
- Summarize old messages when conversation > 20 messages
- Keep last 5 messages + summary of earlier context
- Use LLM to generate concise summary: "User asked about revenue trends, profit margins, and P/E ratios for 2020-2024"

**Complexity**: Medium
**Impact**: Medium - Enables longer conversations

---

### 9. **Smart Tool Suggestions** (UX)
**Problem**: Users don't know what they can ask.

**Solution**:
- Show tool-specific examples in input placeholder
- "Try: 'What's the P/E ratio?' or 'Show revenue trend'"
- Context-aware suggestions based on current conversation
- Tool discovery: "You can also ask about [related metrics]"

**Complexity**: Low
**Impact**: Medium - Better discoverability

---

### 10. **Answer Citations** (Trust)
**Problem**: Users can't verify where numbers came from.

**Solution**:
- Add inline citations: "Revenue was $383.3B (2024 10-K, p. 23)"
- Link to source data: Click citation → show raw data row
- For filing quotes: Show exact passage with highlighting
- Visual indicators: Hover to see source

**Complexity**: Medium
**Impact**: High - Builds trust and transparency

---

### 11. **Batch Queries** (Efficiency)
**Problem**: Multiple related questions require multiple API calls.

**Solution**:
- Detect related questions: "What's revenue? What's profit? What's the margin?"
- Batch into single tool selection: `[getFinancials(revenue), getFinancials(net_income)]`
- Generate single answer covering all questions
- Reduces latency and cost

**Complexity**: High
**Impact**: Medium - Better for power users

---

### 12. **Answer Templates** (Consistency)
**Problem**: Answer format varies (sometimes lists, sometimes prose).

**Solution**:
- Define answer templates by question type:
  - Trend questions → "X increased from Y to Z (change%)"
  - Comparison questions → "X was A in 2020 vs B in 2024"
  - Single value → "X was Y in [year]"
- LLM fills template slots
- Ensures consistent, scannable answers

**Complexity**: Low-Medium
**Impact**: Medium - More professional output

---

### 13. **Proactive Insights** (Intelligence)
**Problem**: Answers are reactive - only answer what's asked.

**Solution**:
- Detect interesting patterns: "Revenue grew 40% but profit only 20% - margin compression"
- Flag anomalies: "This year's P/E is 2x higher than 5-year average"
- Suggest deeper dives: "Would you like to see what drove this change?"

**Complexity**: High
**Impact**: High - More valuable insights

---

### 14. **Voice Input** (Accessibility)
**Problem**: Typing questions is slow.

**Solution**:
- Browser Speech Recognition API
- Convert speech → text → existing pipeline
- Show transcript for verification
- Voice output option (text-to-speech)

**Complexity**: Low-Medium
**Impact**: Medium - Better accessibility

---

### 15. **Export Functionality** (Utility)
**Problem**: Users can't save/share answers.

**Solution**:
- Export conversation as PDF/Markdown
- Export data tables as CSV/Excel
- Share conversation via link (read-only)
- Email summary of conversation

**Complexity**: Low-Medium
**Impact**: Medium - Better utility

---

## Priority Recommendations

### Quick Wins (Low effort, Medium impact)
1. **Contextual Follow-ups** - Use conversation history better
2. **Smart Tool Suggestions** - Show examples in UI
3. **Answer Templates** - Standardize format

### High Impact (Medium-High effort, High impact)
1. **Multi-Tool Queries** - Enable comparisons
2. **Multi-Company Support** - Major feature expansion
3. **Answer Citations** - Build trust

### Performance (Medium effort, High impact)
1. **Smart Caching** - Reduce latency and costs
2. **Streaming Tool Execution** - Better perceived performance

### Analytics (Medium effort, Medium impact)
1. **Answer Quality Scoring** - Measure improvement
2. **Better Error Recovery** - Improve reliability

---

## Implementation Notes

### Current Limitations
- Single tool per query
- AAPL-only (hardcoded symbol)
- No caching (repeated queries hit DB/LLM)
- Limited error recovery
- No answer citations
- Follow-ups are generic

### Technical Debt
- Two code paths: streaming (`/api/ask`) vs non-streaming (`askQuestion`)
- Tool selection prompt is very long (could be optimized)
- Validation runs after answer generation (could be faster)
- No rate limiting on API endpoints

### Architecture Strengths
- Clean separation: tool selection → execution → answer
- Validation catches hallucinations
- Regeneration auto-fixes errors
- Extensible tool system
- Good observability (flow events, query logs)
