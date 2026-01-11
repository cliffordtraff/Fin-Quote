# Learning Roadmap for Fin Quote Codebase

## ✅ What You've Learned

1. **Server Actions** - Functions that run on server, can access database/secrets
2. **Helper Functions** - Reusable functions in `lib/` that do the actual work
3. **useState & useEffect** - React hooks for managing state and side effects

---

## 🎯 What to Learn Next (In Order)

### 1. **Async/Await & Promises** ⭐ MOST IMPORTANT
**Why**: Almost everything in your codebase is async (database calls, API calls, etc.)

**What You'll See**:
```typescript
// Everywhere in your codebase:
const data = await getAaplFinancialsByMetric()  // ← await keyword
const result = await askQuestion(question)      // ← async function
```

**Key Concepts**:
- `async` functions return Promises
- `await` waits for Promise to finish
- `try/catch` handles errors
- `Promise.all()` runs things in parallel

**Where to Practice**:
- Look at `app/actions/ask-question.ts` - full of async/await
- Look at `app/market/page.tsx` - uses `Promise.all()` for parallel fetching

**Resources**:
- MDN: "Async/Await" (15 min read)
- Practice: Convert a callback to async/await

---

### 2. **TypeScript Basics** ⭐ VERY IMPORTANT
**Why**: Your entire codebase is TypeScript - you need to understand types

**What You'll See**:
```typescript
// Type annotations everywhere:
const [question, setQuestion] = useState<string>('')  // ← string type
const data: MarketData | null = null                   // ← union type
function getData(): Promise<Data> { ... }            // ← return type
```

**Key Concepts**:
- Type annotations (`: string`, `: number`)
- Interfaces (`interface MarketData { ... }`)
- Union types (`string | null`)
- Type safety (TypeScript catches errors before runtime)

**Where to Practice**:
- Look at `lib/database.types.ts` - see how database types are defined
- Look at function parameters - they all have types
- Try removing a type annotation and see the error

**Resources**:
- TypeScript Handbook: "Basic Types" (30 min)
- Practice: Add types to a function you write

---

### 3. **API Routes vs Server Actions** ⭐ IMPORTANT
**Why**: You have both - need to understand when to use which

**What You'll See**:
```typescript
// API Route (app/api/ask/route.ts)
export async function POST(req: NextRequest) {
  // Handles HTTP requests
  // Can stream responses
  // More control over response format
}

// Server Action (app/actions/ask-question.ts)
'use server'
export async function askQuestion() {
  // Called directly from components
  // Simpler, but less control
}
```

**Key Concepts**:
- API Routes: Full HTTP control, streaming, custom headers
- Server Actions: Simpler, type-safe, Next.js handles the HTTP
- Your codebase uses API route for streaming, server action for simple calls

**Where to Practice**:
- Compare `app/api/ask/route.ts` (streaming) vs `app/actions/ask-question.ts` (non-streaming)
- Both do the same thing, but API route streams the response

**Resources**:
- Next.js docs: "API Routes" vs "Server Actions"
- Practice: Convert a server action to an API route (or vice versa)

---

### 4. **Error Handling (try/catch)** ⭐ IMPORTANT
**Why**: Everything can fail - database, API calls, parsing JSON

**What You'll See**:
```typescript
try {
  const data = await fetchData()
  return { data, error: null }
} catch (err) {
  return { data: null, error: err.message }
}
```

**Key Concepts**:
- `try` - code that might fail
- `catch` - what to do if it fails
- Always return `{ data, error }` pattern
- Check for errors before using data

**Where to Practice**:
- Look at any server action - they all use try/catch
- See how errors are returned to the client

**Resources**:
- MDN: "try/catch" (10 min)
- Practice: Add error handling to a function

---

### 5. **Database Queries (Supabase)** ⭐ IMPORTANT
**Why**: Most of your data comes from Supabase database

**What You'll See**:
```typescript
const supabase = await createServerClient()
const { data, error } = await supabase
  .from('financials_std')
  .select('*')
  .eq('symbol', 'AAPL')
  .order('year', { ascending: false })
  .limit(5)
```

**Key Concepts**:
- `.from()` - which table
- `.select()` - which columns
- `.eq()` - filter (equals)
- `.order()` - sort
- `.limit()` - how many rows
- Always check `error` before using `data`

**Where to Practice**:
- Look at `app/actions/financials.ts` - see database queries
- Try writing a simple query yourself

**Resources**:
- Supabase docs: "Querying Data" (20 min)
- Practice: Write a query to get data from a table

---

### 6. **Streaming (Server-Sent Events)** ⭐ ADVANCED
**Why**: Your chatbot uses streaming for real-time updates

**What You'll See**:
```typescript
// app/api/ask/route.ts
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue(encoder.encode(`event: answer\ndata: ${chunk}\n\n`))
  }
})
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream' }
})
```

**Key Concepts**:
- Streaming sends data as it's generated (not all at once)
- Server-Sent Events (SSE) protocol
- `ReadableStream` - how to create a stream
- Client reads stream chunk by chunk

**Where to Practice**:
- Look at `app/api/ask/route.ts` - see how streaming works
- Look at `app/page.tsx` - see how client reads the stream

**Resources**:
- MDN: "Server-Sent Events" (20 min)
- Practice: Create a simple streaming endpoint

---

### 7. **TypeScript Interfaces & Types** ⭐ IMPORTANT
**Why**: Your codebase uses lots of custom types

**What You'll See**:
```typescript
interface MarketData {
  currentPrice: number
  priceChange: number
  priceHistory: Array<{ date: string; open: number }>
}

type ValidationStatus = 'pass' | 'fail' | 'skip'
```

**Key Concepts**:
- `interface` - defines object shape
- `type` - defines any type (union, object, etc.)
- `Array<T>` - array of type T
- Union types (`'pass' | 'fail'`)

**Where to Practice**:
- Look at `lib/database.types.ts` - see database types
- Look at `types/chart.ts` - see chart types
- Create your own interface for something

**Resources**:
- TypeScript Handbook: "Interfaces" (20 min)
- Practice: Create an interface for a data structure you use

---

### 8. **Destructuring & Spread Operator** ⭐ HELPFUL
**Why**: Used everywhere in React/TypeScript

**What You'll See**:
```typescript
// Destructuring
const { data, error } = await supabase.from('table').select('*')
const [question, setQuestion] = useState('')

// Spread operator
const newHistory = [...conversationHistory, newMessage]
const updated = { ...oldData, newField: value }
```

**Key Concepts**:
- Destructuring: Extract values from objects/arrays
- Spread: Copy arrays/objects, merge properties

**Where to Practice**:
- Look at any React component - uses destructuring
- Look at state updates - uses spread operator

**Resources**:
- MDN: "Destructuring" (15 min)
- Practice: Refactor code to use destructuring

---

### 9. **Array Methods (map, filter, find)** ⭐ HELPFUL
**Why**: Used constantly for processing data

**What You'll See**:
```typescript
// map - transform each item
const formatted = data.map(item => formatValue(item))

// filter - keep only matching items
const recent = data.filter(item => item.year >= 2020)

// find - get first matching item
const current = data.find(item => item.year === 2024)
```

**Key Concepts**:
- `.map()` - transform array
- `.filter()` - remove items
- `.find()` - find one item
- `.slice()` - get portion of array

**Where to Practice**:
- Look at `app/actions/financials.ts` - uses map/filter
- Look at any data processing code

**Resources**:
- MDN: "Array Methods" (30 min)
- Practice: Process an array of data

---

### 10. **JSON & Data Formatting** ⭐ HELPFUL
**Why**: Data is constantly converted to/from JSON

**What You'll See**:
```typescript
// Convert to JSON
const json = JSON.stringify(data)

// Parse from JSON
const data = JSON.parse(json)

// Round numbers
const rounded = Math.round(value * 100) / 100
```

**Key Concepts**:
- `JSON.stringify()` - object → string
- `JSON.parse()` - string → object
- Number formatting (rounding, decimals)
- Date formatting

**Where to Practice**:
- Look at `app/api/ask/route.ts` - see JSON.stringify usage
- Look at `lib/chart-helpers.ts` - see number formatting

**Resources**:
- MDN: "JSON" (15 min)
- Practice: Format some data as JSON

---

## Learning Order (Recommended)

### Week 1: Foundation
1. **Async/Await** (2-3 hours)
   - Most critical - everything uses it
   - Practice with your server actions

2. **TypeScript Basics** (3-4 hours)
   - Types, interfaces, type annotations
   - Practice by reading your type files

3. **Error Handling** (1-2 hours)
   - try/catch, error patterns
   - Practice by adding error handling

### Week 2: Data & APIs
4. **Database Queries** (2-3 hours)
   - Supabase query syntax
   - Practice by writing queries

5. **API Routes vs Server Actions** (1-2 hours)
   - When to use which
   - Practice by comparing your code

### Week 3: Advanced
6. **TypeScript Interfaces** (2 hours)
   - Custom types, unions
   - Practice by creating types

7. **Array Methods** (1-2 hours)
   - map, filter, find
   - Practice by processing data

8. **Streaming** (2-3 hours)
   - Only if you want to understand streaming
   - Can skip for now if not needed

---

## Quick Reference: What Each Concept Does

| Concept | What It Does | Example |
|---------|--------------|---------|
| **async/await** | Wait for slow operations | `const data = await fetchData()` |
| **TypeScript** | Catch errors before runtime | `const name: string = "test"` |
| **try/catch** | Handle errors gracefully | `try { ... } catch (err) { ... }` |
| **Database Query** | Get data from Supabase | `supabase.from('table').select('*')` |
| **API Route** | HTTP endpoint | `export async function POST(req)` |
| **Interface** | Define data shape | `interface User { name: string }` |
| **Array Methods** | Process arrays | `data.map(x => x * 2)` |
| **Destructuring** | Extract values | `const { name } = user` |
| **JSON** | Convert data format | `JSON.stringify(data)` |

---

## Practice Exercises

### Exercise 1: Async/Await
```typescript
// Write a function that:
// 1. Fetches data (simulate with setTimeout)
// 2. Formats it
// 3. Returns it
// Use async/await and try/catch
```

### Exercise 2: TypeScript
```typescript
// Create an interface for a "Stock" with:
// - symbol (string)
// - price (number)
// - change (number, can be negative)
// Write a function that takes Stock and returns formatted string
```

### Exercise 3: Database Query
```typescript
// Write a function that:
// 1. Queries financials_std table
// 2. Gets revenue for last 5 years
// 3. Formats the data
// 4. Returns it with error handling
```

### Exercise 4: Error Handling
```typescript
// Write a function that:
// 1. Tries to parse JSON
// 2. Catches errors
// 3. Returns { data, error } pattern
```

---

## How to Learn Each Concept

### For Each Topic:
1. **Read** - Quick tutorial (15-30 min)
2. **Look** - Find examples in your codebase
3. **Practice** - Write a small example yourself
4. **Apply** - Use it in your actual code

### Best Learning Resources:
- **MDN Web Docs** - JavaScript/TypeScript basics
- **TypeScript Handbook** - TypeScript concepts
- **Next.js Docs** - Server Actions, API Routes
- **Supabase Docs** - Database queries

---

## What You Can Skip (For Now)

- **Advanced TypeScript** (generics, advanced types) - Learn basics first
- **React Advanced** (useMemo, useCallback) - You have these but don't need to understand deeply yet
- **Testing** - Can learn later when you write tests
- **Deployment** - Learn when you're ready to deploy

---

## Summary: Priority Order

1. **Async/Await** ⭐⭐⭐ (Do this first!)
2. **TypeScript Basics** ⭐⭐⭐ (Very important)
3. **Error Handling** ⭐⭐ (Important)
4. **Database Queries** ⭐⭐ (Important)
5. **API Routes** ⭐ (Helpful)
6. **Interfaces/Types** ⭐ (Helpful)
7. **Array Methods** ⭐ (Helpful)
8. **Streaming** (Advanced - can skip)

Focus on #1-4 first - those are the foundation for everything else!
