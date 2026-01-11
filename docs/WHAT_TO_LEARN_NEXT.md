# What Else Should You Learn?

Based on what you've already learned, here's what to focus on next, in priority order.

---

## ✅ What You've Already Learned

1. ✅ Server Actions
2. ✅ Helper Functions
3. ✅ useState & useEffect basics
4. ✅ Async/Await
5. ✅ Function syntax
6. ✅ Basic syntax patterns

---

## 🎯 What to Learn Next (Priority Order)

### 1. **React Hooks (Advanced)** ⭐⭐⭐⭐⭐ MOST IMPORTANT

**Why:** You see these everywhere in your components

**What to Learn:**

#### useRef
```typescript
const inputRef = useRef<HTMLInputElement>(null)
inputRef.current?.focus()  // Access DOM element
```

**Real example from your code (`app/page.tsx` line 43):**
```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null)
textareaRef.current?.focus()  // Focus the textarea
```

**What it does:** Reference to a DOM element or value that persists across renders

**Time:** 30 minutes

---

#### useMemo
```typescript
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data)
}, [data])  // Only recompute when data changes
```

**What it does:** Memoize (cache) expensive calculations

**Time:** 30 minutes

---

**Where to see it:**
- `app/page.tsx` - uses `useRef` for DOM references
- Look for `useMemo` in components that do heavy calculations

---

### 2. **Component Props & Communication** ⭐⭐⭐⭐⭐ VERY IMPORTANT

**Why:** Components need to pass data to each other

**What to Learn:**

#### Props (Passing Data to Components)
```typescript
// Parent component
<ChildComponent name="John" age={25} />

// Child component
type Props = {
  name: string
  age: number
}

export default function ChildComponent({ name, age }: Props) {
  return <div>{name} is {age}</div>
}
```

**Real example from your code (`components/AssistantChat.tsx` line 10):**
```typescript
type AssistantChatProps = {
  conversationHistory: ConversationHistory
  sessionId: string
  onNewMessage?: (userMessage: string, assistantMessage: string) => void
}

export default function AssistantChat({
  conversationHistory,
  sessionId,
  onNewMessage,
}: AssistantChatProps) {
  // Use props here
}
```

**What to learn:**
- How to define props with TypeScript
- How to pass props from parent to child
- Optional props (`?`)
- Function props (callbacks)

**Time:** 1-2 hours

---

### 3. **Event Handlers** ⭐⭐⭐⭐⭐ VERY IMPORTANT

**Why:** User interactions (clicks, form submits, typing)

**What to Learn:**

#### onClick
```typescript
<button onClick={() => handleClick()}>Click me</button>

const handleClick = () => {
  console.log('Clicked!')
}
```

#### onSubmit
```typescript
<form onSubmit={handleSubmit}>
  <input type="text" />
  <button type="submit">Submit</button>
</form>

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()  // Prevent page refresh
  // Handle form submission
}
```

#### onChange
```typescript
<input 
  value={question}
  onChange={(e) => setQuestion(e.target.value)}
/>
```

**Real example from your code (`app/page.tsx` line 253):**
```typescript
const handleSubmitStreaming = async (e: React.FormEvent) => {
  e.preventDefault()  // Prevent form from refreshing page
  
  if (!question.trim()) {
    setChatbotError('Please enter a question')
    return
  }
  
  // Handle submission...
}
```

**What to learn:**
- `onClick` - button clicks
- `onSubmit` - form submissions
- `onChange` - input changes
- `e.preventDefault()` - prevent default behavior
- `e.target.value` - get input value

**Time:** 1-2 hours

---

### 4. **JSX/TSX Syntax** ⭐⭐⭐⭐ IMPORTANT

**Why:** This is how you write React components

**What to Learn:**

#### Basic JSX
```typescript
return (
  <div>
    <h1>Title</h1>
    <p>Paragraph</p>
  </div>
)
```

#### Conditional Rendering
```typescript
{loading ? (
  <div>Loading...</div>
) : error ? (
  <div>Error: {error}</div>
) : (
  <div>Data: {data}</div>
)}
```

#### Rendering Lists
```typescript
{items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

#### Inline Styles
```typescript
<div style={{ color: 'red', fontSize: '20px' }}>
  Text
</div>
```

**Real example from your code:**
```typescript
{chatbotLoading ? (
  <div>Loading...</div>
) : (
  <div>{answer}</div>
)}
```

**What to learn:**
- JSX syntax (HTML-like in JavaScript)
- Conditional rendering (`? :` and `&&`)
- Rendering lists with `.map()`
- `key` prop for lists
- Inline styles (double curly braces)

**Time:** 2-3 hours

---

### 5. **Database Queries (Supabase)** ⭐⭐⭐⭐ IMPORTANT

**Why:** Most of your data comes from Supabase

**What to Learn:**

#### Basic Query
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('column', 'value')
  .order('column', { ascending: false })
  .limit(10)
```

**Real example from your code (`app/actions/financials.ts` line 123):**
```typescript
const { data, error } = await supabase
  .from('financials_std')
  .select('year, total_liabilities, shareholders_equity')
  .eq('symbol', 'AAPL')
  .order('year', { ascending: false })
  .limit(safeLimit)
```

**What to learn:**
- `.from()` - which table
- `.select()` - which columns
- `.eq()` - filter (equals)
- `.gt()`, `.lt()` - greater/less than
- `.order()` - sorting
- `.limit()` - how many rows
- Always check `error` before using `data`

**Time:** 2-3 hours

---

### 6. **Array Methods** ⭐⭐⭐ IMPORTANT

**Why:** Used constantly for processing data

**What to Learn:**

#### .map() - Transform Each Item
```typescript
const doubled = numbers.map(num => num * 2)
```

#### .filter() - Keep Only Matching Items
```typescript
const evens = numbers.filter(num => num % 2 === 0)
```

#### .find() - Find First Match
```typescript
const found = items.find(item => item.id === 5)
```

#### .slice() - Get Portion of Array
```typescript
const firstThree = items.slice(0, 3)
const lastTwo = items.slice(-2)
```

**Real examples from your code:**
```typescript
// app/page.tsx - Filter conversation history
const previousToolResults = conversationHistory
  .filter(msg => msg.role === 'assistant' && msg.dataUsed)
  .slice(-2)  // Get last 2
  .map(msg => ({ question: ..., answer: ... }))
```

**What to learn:**
- `.map()` - transform array
- `.filter()` - remove items
- `.find()` - find one item
- `.slice()` - get portion
- Chaining methods together

**Time:** 1-2 hours

---

### 7. **TypeScript Interfaces & Types** ⭐⭐⭐ IMPORTANT

**Why:** Your codebase uses TypeScript everywhere

**What to Learn:**

#### Interface
```typescript
interface User {
  name: string
  age: number
  email?: string  // Optional
}

const user: User = {
  name: "John",
  age: 25
}
```

#### Type Alias
```typescript
type Status = 'loading' | 'success' | 'error'
const status: Status = 'loading'
```

**Real example from your code (`types/conversation.ts`):**
```typescript
export type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  chartConfig?: ChartConfig
}
```

**What to learn:**
- `interface` vs `type`
- Optional properties (`?`)
- Union types (`'a' | 'b'`)
- Extending interfaces

**Time:** 2-3 hours

---

### 8. **JSON.stringify & JSON.parse** ⭐⭐⭐ HELPFUL

**Why:** Data is constantly converted to/from JSON

**What to Learn:**

#### JSON.stringify - Object to String
```typescript
const obj = { name: "John", age: 25 }
const json = JSON.stringify(obj)
// Result: '{"name":"John","age":25}'
```

#### JSON.parse - String to Object
```typescript
const json = '{"name":"John","age":25}'
const obj = JSON.parse(json)
// Result: { name: "John", age: 25 }
```

**Real example from your code (`app/page.tsx` line 287):**
```typescript
body: JSON.stringify({
  question: userMessage.content,
  conversationHistory,
  sessionId,
})
```

**What to learn:**
- `JSON.stringify()` - convert object to JSON string
- `JSON.parse()` - convert JSON string to object
- When to use each (API requests, localStorage, etc.)

**Time:** 30 minutes

---

### 9. **Object Manipulation** ⭐⭐⭐ HELPFUL

**Why:** Objects are everywhere

**What to Learn:**

#### Spread Operator
```typescript
const newObj = { ...oldObj, newProperty: value }
```

#### Destructuring
```typescript
const { name, age } = person
```

#### Adding Properties
```typescript
const updated = { ...person, age: 26 }
```

**Real example from your code:**
```typescript
const userMessage: Message = {
  role: 'user',
  content: question,
  timestamp: new Date().toISOString(),
}
```

**What to learn:**
- Spread operator (`...`)
- Destructuring (`{ prop }`)
- Creating new objects
- Updating objects immutably

**Time:** 1 hour

---

### 10. **Error Handling Patterns** ⭐⭐⭐ HELPFUL

**Why:** Everything can fail

**What to Learn:**

#### Try/Catch
```typescript
try {
  const data = await riskyOperation()
  return { data, error: null }
} catch (error) {
  return { data: null, error: error.message }
}
```

#### Error Checking Pattern
```typescript
const { data, error } = await operation()
if (error) {
  // Handle error
  return
}
// Use data
```

**Real example from your code:**
```typescript
try {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('table').select('*')
  
  if (error) {
    return { data: null, error: error.message }
  }
  
  return { data, error: null }
} catch (err) {
  return { data: null, error: err.message }
}
```

**What to learn:**
- `try/catch` blocks
- Checking for errors before using data
- Returning `{ data, error }` pattern
- Error messages

**Time:** 1 hour

---

### 11. **Import/Export Patterns** ⭐⭐ HELPFUL

**Why:** Code is split across files

**What to Learn:**

#### Default Export
```typescript
// Export
export default function MyComponent() { }

// Import
import MyComponent from './MyComponent'
```

#### Named Export
```typescript
// Export
export function myFunction() { }
export const myConstant = 5

// Import
import { myFunction, myConstant } from './file'
```

#### Type Import
```typescript
// Export
export type MyType = { name: string }

// Import
import type { MyType } from './file'
```

**Real examples from your code:**
```typescript
// Default import
import Navigation from '@/components/Navigation'

// Named imports
import { useState, useEffect } from 'react'
import { getAaplFinancialsByMetric } from '@/app/actions/financials'

// Type import
import type { ChartConfig } from '@/types/chart'
```

**What to learn:**
- `export default` vs `export`
- `import` vs `import type`
- The `@/` alias (means root folder)

**Time:** 30 minutes

---

### 12. **useEffect Dependencies** ⭐⭐ HELPFUL

**Why:** Controls when effects run

**What to Learn:**

#### Empty Array (Run Once)
```typescript
useEffect(() => {
  fetchData()
}, [])  // Run only on mount
```

#### With Dependencies
```typescript
useEffect(() => {
  fetchData(id)
}, [id])  // Run when id changes
```

**Real example from your code (`app/page.tsx` line 63):**
```typescript
useEffect(() => {
  let id = localStorage.getItem('finquote_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('finquote_session_id', id)
  }
  setSessionId(id)
}, [])  // Run only once on mount
```

**What to learn:**
- Empty array `[]` - run once
- Dependencies `[id]` - run when id changes
- Why dependencies matter

**Time:** 30 minutes

---

## 📚 Learning Plan (4 Weeks)

### Week 1: React Fundamentals
- **Day 1-2:** Component Props & Communication (2 hours)
- **Day 3-4:** Event Handlers (2 hours)
- **Day 5:** JSX/TSX Syntax (2 hours)
- **Day 6-7:** Practice building a simple component

**Total:** ~6-8 hours

---

### Week 2: Data & Types
- **Day 1-2:** Database Queries (Supabase) (3 hours)
- **Day 3:** Array Methods (2 hours)
- **Day 4-5:** TypeScript Interfaces & Types (3 hours)
- **Day 6-7:** Practice querying and displaying data

**Total:** ~8-10 hours

---

### Week 3: Advanced React
- **Day 1:** useRef (30 min)
- **Day 2:** useMemo (30 min)
- **Day 3:** useEffect Dependencies (30 min)
- **Day 4:** Object Manipulation (1 hour)
- **Day 5:** Error Handling Patterns (1 hour)
- **Day 6-7:** Practice with real components

**Total:** ~4-5 hours

---

### Week 4: Polish & Practice
- **Day 1:** JSON.stringify/parse (30 min)
- **Day 2:** Import/Export patterns (30 min)
- **Day 3-7:** Build something using everything you learned

**Total:** ~1 hour + practice

---

## 🎯 Quick Reference: What to Focus On

### Must Learn (Do These First)
1. ✅ **Component Props** - How components communicate
2. ✅ **Event Handlers** - User interactions
3. ✅ **JSX Syntax** - How to write React components
4. ✅ **Database Queries** - How to get data

### Should Learn (Important)
5. ✅ **Array Methods** - Processing data
6. ✅ **TypeScript Types** - Type safety
7. ✅ **useRef** - DOM references
8. ✅ **Error Handling** - Handling failures

### Nice to Learn (Can Wait)
9. ✅ **useMemo** - Performance optimization
10. ✅ **JSON methods** - Data conversion
11. ✅ **Import/Export** - Code organization

---

## 📖 Where to Practice

### Study These Files:

1. **`app/page.tsx`**
   - See: useState, useEffect, useRef, event handlers, props
   - Practice: Understanding the component structure

2. **`components/AssistantChat.tsx`**
   - See: Props, event handlers, async functions
   - Practice: How components receive and use props

3. **`app/actions/financials.ts`**
   - See: Database queries, error handling, TypeScript types
   - Practice: Writing a query yourself

4. **`app/market/page.tsx`**
   - See: Multiple useState, useEffect, Promise.all
   - Practice: Fetching and displaying data

---

## 🎓 Practice Exercises

### Exercise 1: Create a Component with Props
```typescript
// Create a component that takes a name prop and displays it
type Props = {
  name: string
}

export default function Greeting({ name }: Props) {
  return <div>Hello, {name}!</div>
}
```

### Exercise 2: Add Event Handler
```typescript
// Add a button that increments a counter
const [count, setCount] = useState(0)

const handleClick = () => {
  setCount(count + 1)
}

return (
  <div>
    <p>Count: {count}</p>
    <button onClick={handleClick}>Increment</button>
  </div>
)
```

### Exercise 3: Write a Database Query
```typescript
// Write a function that queries the database
async function getUsers() {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(10)
  
  if (error) {
    return { data: null, error: error.message }
  }
  
  return { data, error: null }
}
```

---

## 📝 Summary

**Priority Order:**
1. **Component Props** (Week 1)
2. **Event Handlers** (Week 1)
3. **JSX Syntax** (Week 1)
4. **Database Queries** (Week 2)
5. **Array Methods** (Week 2)
6. **TypeScript Types** (Week 2)
7. **Advanced Hooks** (Week 3)
8. **Everything Else** (Week 4)

**Total Time:** ~20-25 hours over 4 weeks

**Remember:** You don't need to learn everything at once. Focus on one concept, practice it, then move to the next!

---

## 🚀 Next Steps

1. **Start with Component Props** - Most important for understanding your codebase
2. **Then Event Handlers** - Needed for interactivity
3. **Then JSX Syntax** - Needed for writing components
4. **Then Database Queries** - Needed for getting data

After these 4, you'll understand 80% of your codebase!
