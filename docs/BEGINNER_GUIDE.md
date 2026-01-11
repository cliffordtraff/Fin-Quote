# Beginner's Guide to This Codebase

## 🎯 What This Guide Covers

This guide explains the most important concepts and patterns you'll see in this codebase. Each section uses examples from your actual code.

---

## 1. How Data Flows Through Your App

### The Journey of a Question

When a user asks "What was Apple's revenue in 2023?", here's what happens:

```
User Types Question
    ↓
app/page.tsx (Component)
    ↓
fetch('/api/ask') (API Call)
    ↓
app/api/ask/route.ts (API Route)
    ↓
app/actions/ask-question.ts (Server Action)
    ↓
lib/tools.ts (Helper - Builds Prompt)
    ↓
OpenAI API (LLM)
    ↓
app/actions/financials.ts (Server Action - Gets Data)
    ↓
Supabase Database (Stores Data)
    ↓
Back to Component (Displays Answer)
```

### Real Example from Your Code

**Step 1: User submits question** (`app/page.tsx` line 284)
```typescript
const response = await fetch('/api/ask', {
  method: 'POST',
  body: JSON.stringify({ question, conversationHistory, sessionId })
})
```

**Step 2: API route receives it** (`app/api/ask/route.ts` line 59)
```typescript
export async function POST(req: NextRequest) {
  const { question, conversationHistory, sessionId } = await req.json()
  // Process the question...
}
```

**Step 3: Server action gets data** (`app/actions/ask-question.ts` line 400)
```typescript
const toolResult = await getAaplFinancialsByMetric({
  metricNames: ['revenue'],
  years: [2023]
})
```

**Step 4: Data comes back** → Component displays it

---

## 2. The Error Handling Pattern

Your codebase uses a consistent pattern for errors:

### Pattern: `{ data, error }`

Almost every function returns an object with `data` and `error`:

```typescript
// From app/actions/financials.ts
const { data, error } = await supabase
  .from('financials_std')
  .select('*')

if (error) {
  return { data: null, error: error.message }
}
return { data, error: null }
```

### How to Use It

**Always check for errors first:**
```typescript
const result = await getAaplFinancialsByMetric(...)

if ('error' in result) {
  // Handle error
  setError(result.error)
} else {
  // Use the data
  setData(result.data)
}
```

**Real example from `app/market/page.tsx` (line 78):**
```typescript
if ('error' in spxResult) {
  setError(spxResult.error)  // Show error to user
} else {
  setSpxData(spxResult as MarketData)  // Use the data
}
```

---

## 3. State Management Pattern

Your app uses React's `useState` to track what's happening:

### Common State Variables

**From `app/page.tsx`:**
```typescript
// User input
const [question, setQuestion] = useState('')

// Loading state
const [chatbotLoading, setChatbotLoading] = useState(false)

// Error state
const [chatbotError, setChatbotError] = useState('')

// Data state
const [answer, setAnswer] = useState('')
const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
```

### The Pattern:
1. **Declare state** with `useState`
2. **Update state** with setter function
3. **Component re-renders** when state changes

**Example:**
```typescript
// 1. Declare
const [loading, setLoading] = useState(false)

// 2. Update
setLoading(true)  // Component re-renders
await fetchData()
setLoading(false)  // Component re-renders again
```

---

## 4. The Tool System (How the Chatbot Works)

Your chatbot uses a "tool system" - the AI picks which function to call:

### Step 1: User Asks Question
```
"What was Apple's revenue in 2023?"
```

### Step 2: AI Selects Tool
The AI looks at available tools in `lib/tools.ts` and picks:
```json
{
  "tool": "getAaplFinancialsByMetric",
  "args": {
    "metricNames": ["revenue"],
    "years": [2023]
  }
}
```

### Step 3: Server Executes Tool
```typescript
// From app/actions/ask-question.ts
if (tool === 'getAaplFinancialsByMetric') {
  const result = await getAaplFinancialsByMetric(args)
}
```

### Step 4: AI Generates Answer
The AI gets the data and writes an answer:
```
"Apple's revenue in 2023 was $383.3 billion."
```

### Why This Pattern?
- **Safety**: AI can't run arbitrary code
- **Control**: You decide what tools are available
- **Validation**: You can check the data before showing it

---

## 5. Streaming (Real-Time Updates)

Your chatbot uses "streaming" to show answers as they're generated:

### Without Streaming (Old Way)
```
User: "What was revenue?"
[Wait 5 seconds...]
AI: "Apple's revenue was..."
```

### With Streaming (Your App)
```
User: "What was revenue?"
AI: "Apple's..." (appears immediately)
AI: "...revenue was..." (keeps appearing)
AI: "...$383.3 billion." (completes)
```

### How It Works

**Server sends chunks** (`app/api/ask/route.ts` line 659):
```typescript
for await (const chunk of answerStream) {
  sendEvent('answer', { content: chunk })  // Send each piece
}
```

**Client receives chunks** (`app/page.tsx` line 309):
```typescript
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  // Decode and display each chunk
  const chunk = decoder.decode(value)
  setAnswer(prev => prev + chunk)  // Add to existing answer
}
```

**Result**: Answer appears word-by-word instead of all at once!

---

## 6. The Validation System

Your chatbot validates answers before showing them:

### What Gets Validated

1. **Numbers** - Are the numbers correct?
2. **Years** - Do the years exist in the database?
3. **Citations** - Are the filing references valid?

### How It Works

**From `lib/validators.ts`:**
```typescript
const validationResults = await validateAnswer(
  answer,           // The AI's answer
  sourceData,      // The data it used
  checkYearInDatabase  // Helper function
)

if (validationResults.passed === false) {
  // Regenerate the answer with error hints
  const newAnswer = await regenerateAnswer(answer, validationResults)
}
```

### Real Example

**AI says:** "Revenue was $400 billion in 2023"
**Validator checks:** Database shows $383.3 billion
**Result:** Validation fails → AI regenerates answer with correct number

---

## 7. Common Patterns You'll See

### Pattern 1: Loading States

```typescript
// 1. Set loading to true
setLoading(true)

// 2. Do the work
const data = await fetchData()

// 3. Set loading to false
setLoading(false)
```

### Pattern 2: Error Handling

```typescript
try {
  const data = await fetchData()
  // Use data
} catch (error) {
  // Handle error
  setError(error.message)
}
```

### Pattern 3: Conditional Rendering

```typescript
{loading ? (
  <div>Loading...</div>
) : error ? (
  <div>Error: {error}</div>
) : (
  <div>Data: {data}</div>
)}
```

### Pattern 4: Parallel Fetching

**From `app/market/page.tsx` (line 64):**
```typescript
// Fetch 11 things at the same time (faster!)
const [spx, nasdaq, dow, ...] = await Promise.all([
  getAaplMarketData(),
  getNasdaqMarketData(),
  getDowMarketData(),
  // ... 8 more
])
```

---

## 8. TypeScript Types

Your codebase uses TypeScript to catch errors:

### Common Types You'll See

**From `types/chart.ts`:**
```typescript
type ChartConfig = {
  type: 'line' | 'column'
  data: Array<{ year: number; value: number }>
  title: string
}
```

**From `types/conversation.ts`:**
```typescript
type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
```

### Why Types Matter

**Without types:**
```typescript
const data = getData()
data.year  // ❌ Might not exist - runtime error!
```

**With types:**
```typescript
const data: ChartConfig = getData()
data.year  // ✅ TypeScript knows this exists
```

---

## 9. Database Queries (Supabase)

Your app uses Supabase to store and retrieve data:

### Basic Query Pattern

```typescript
const { data, error } = await supabase
  .from('financials_std')      // Which table
  .select('*')                  // Which columns
  .eq('symbol', 'AAPL')        // Filter: symbol equals 'AAPL'
  .eq('year', 2023)            // Filter: year equals 2023
  .order('year', { ascending: false })  // Sort
  .limit(5)                     // Only get 5 rows
```

### Common Methods

- `.from('table')` - Which table
- `.select('*')` - Which columns (or `'column1, column2'`)
- `.eq('column', value)` - Filter: equals
- `.gt('column', value)` - Filter: greater than
- `.order('column')` - Sort
- `.limit(10)` - Only get 10 rows

---

## 10. Component Structure

Your React components follow a pattern:

### Component Template

```typescript
'use client'  // Client component (can use hooks)

import { useState, useEffect } from 'react'

export default function MyComponent() {
  // 1. State declarations
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  
  // 2. Effects (run on mount)
  useEffect(() => {
    fetchData()
  }, [])
  
  // 3. Event handlers
  const handleClick = () => {
    // Do something
  }
  
  // 4. Render
  return (
    <div>
      {/* Your JSX */}
    </div>
  )
}
```

### Real Example: `app/market/page.tsx`

1. **State** (lines 46-58) - All the data variables
2. **useEffect** (line 60) - Fetch data on mount
3. **Event handlers** - Handle user interactions
4. **Return** (line 172) - Render the UI

---

## 11. Import Patterns

Your codebase uses consistent import patterns:

### Import Types

```typescript
// React hooks
import { useState, useEffect } from 'react'

// Next.js
import { useRouter } from 'next/navigation'

// Your components
import Navigation from '@/components/Navigation'

// Your server actions
import { getAaplFinancialsByMetric } from '@/app/actions/financials'

// Your helpers
import { validateAnswer } from '@/lib/validators'

// Types
import type { ChartConfig } from '@/types/chart'
```

### The `@/` Alias

`@/` means "start from the root folder":
- `@/components/` → `components/`
- `@/lib/` → `lib/`
- `@/app/` → `app/`

---

## 12. Key Files to Understand

### Most Important Files

1. **`app/page.tsx`** - Homepage with chatbot
   - Uses: useState, useEffect, fetch, streaming

2. **`app/api/ask/route.ts`** - Chatbot API endpoint
   - Uses: async/await, streaming, error handling

3. **`app/actions/ask-question.ts`** - Main chatbot logic
   - Uses: tool selection, data fetching, validation

4. **`lib/tools.ts`** - Tool definitions and prompts
   - Uses: String templates, prompt building

5. **`components/AssistantChat.tsx`** - Chat UI component
   - Uses: React hooks, streaming display

---

## 13. Common Mistakes to Avoid

### ❌ Don't Forget `await`

```typescript
// Wrong
const data = fetchData()  // Returns Promise, not data!

// Right
const data = await fetchData()  // Waits for data
```

### ❌ Don't Forget Error Checking

```typescript
// Wrong
const { data } = await supabase.from('table').select('*')
console.log(data)  // Might be null if error!

// Right
const { data, error } = await supabase.from('table').select('*')
if (error) {
  console.error(error)
  return
}
console.log(data)
```

### ❌ Don't Update State Directly

```typescript
// Wrong
data.push(newItem)  // Mutates state directly

// Right
setData([...data, newItem])  // Creates new array
```

---

## 14. Debugging Tips

### 1. Use `console.log`

```typescript
console.log('Data received:', data)
console.log('Error:', error)
```

### 2. Check Browser Console

Open DevTools (F12) → Console tab → See your logs

### 3. Check Network Tab

See API calls, their responses, and errors

### 4. Use TypeScript Errors

TypeScript will tell you if something's wrong before you run it!

---

## 15. Next Steps

### What to Learn Next

1. **Async/Await** - Most important! Everything uses it
2. **TypeScript Basics** - Types, interfaces, type annotations
3. **Error Handling** - try/catch, error patterns
4. **Database Queries** - Supabase query syntax

### Practice Exercises

1. **Add a new tool** - Create a new function in `app/actions/`
2. **Add a new component** - Create a component in `components/`
3. **Add error handling** - Wrap a function in try/catch
4. **Write a database query** - Query a table and display data

---

## Summary: Key Concepts

| Concept | What It Does | Example |
|---------|--------------|---------|
| **useState** | Store data that changes | `const [count, setCount] = useState(0)` |
| **useEffect** | Run code when component loads | `useEffect(() => { fetchData() }, [])` |
| **async/await** | Wait for slow operations | `const data = await fetchData()` |
| **try/catch** | Handle errors | `try { ... } catch (err) { ... }` |
| **Server Actions** | Functions that run on server | `'use server' export async function...` |
| **API Routes** | HTTP endpoints | `app/api/ask/route.ts` |
| **Components** | Reusable UI pieces | `components/AssistantChat.tsx` |
| **Helpers** | Reusable functions | `lib/validators.ts` |

---

## Questions to Ask Yourself

When reading code, ask:

1. **Where does this data come from?** (Database? API? User input?)
2. **Where does this data go?** (Displayed? Saved? Sent to API?)
3. **What happens if this fails?** (Is there error handling?)
4. **When does this run?** (On page load? On button click? On timer?)

---

## Resources

- **Learning Roadmap**: `docs/LEARNING_ROADMAP.md`
- **Database Guide**: `docs/DATABASE_STRUCTURE_AND_IMPROVEMENTS.md`
- **Tutor Questions**: `docs/TUTOR_QUESTIONS.md`

---

**Remember**: You don't need to understand everything at once. Start with one concept, practice it, then move to the next!
