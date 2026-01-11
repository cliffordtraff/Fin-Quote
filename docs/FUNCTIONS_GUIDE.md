# Functions Guide: What You Need to Learn

## 🎯 Quick Answer

**Yes, async/await are THE MOST IMPORTANT** function concepts in your codebase. Almost everything uses them!

But let's start from the beginning...

---

## 1. What is a Function? (The Basics)

A function is a **reusable piece of code** that does something.

### Simple Function Example

```typescript
// Function that adds two numbers
function add(a: number, b: number): number {
  return a + b
}

// Use it:
const result = add(2, 3)  // result = 5
```

**Parts of a function:**
- `function` - keyword
- `add` - function name
- `(a, b)` - parameters (inputs)
- `: number` - return type (what it gives back)
- `{ return a + b }` - function body (what it does)

### Real Example from Your Code

**From `lib/market-utils.ts` (line 28):**
```typescript
export function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return MARKET_HOLIDAYS_2025.includes(dateStr)
}

// Use it:
const isHoliday = isMarketHoliday(new Date())  // true or false
```

---

## 2. Regular Functions vs Async Functions

### Regular Function (Synchronous)

```typescript
// This runs immediately and finishes immediately
function formatNumber(num: number): string {
  return num.toLocaleString()
}

const result = formatNumber(1000)  // "1,000" (instant!)
```

**When to use:** Simple calculations, formatting, transformations

### Async Function (Asynchronous)

```typescript
// This takes time to finish (waits for database, API, etc.)
async function getData(): Promise<string> {
  const data = await fetchFromDatabase()  // Wait for this...
  return data  // Then return
}

const result = await getData()  // Must use "await"!
```

**When to use:** Database queries, API calls, file reading - anything slow

---

## 3. Async/Await - THE MOST IMPORTANT CONCEPT

### Why Async/Await is Critical

**In your codebase, almost EVERYTHING is async:**
- Database queries → async
- API calls → async
- File reading → async
- LLM calls → async

**You'll see `async` and `await` everywhere!**

### What is `async`?

`async` means "this function takes time to finish"

```typescript
// Regular function
function getData() {
  return "hello"
}

// Async function
async function getData() {
  return "hello"  // Actually returns a Promise
}
```

### What is `await`?

`await` means "wait here until this finishes"

```typescript
async function getData() {
  const result = await fetchFromDatabase()  // Wait for database
  return result  // Then continue
}
```

---

## 4. Real Examples from Your Codebase

### Example 1: Database Query

**From `app/actions/financials.ts` (line 104):**
```typescript
export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric
}): Promise<{ data: FinancialMetricDataPoint[] | null; error: string | null }> {
  // 1. Function is async (takes time)
  const supabase = await createServerClient()  // 2. Wait for database connection
  
  // 3. Wait for database query
  const { data, error } = await supabase
    .from('financials_std')
    .select('*')
    .eq('symbol', 'AAPL')
  
  return { data, error }  // 4. Return result
}
```

**What happens:**
1. Function is marked `async` (can take time)
2. `await createServerClient()` - Wait for database connection
3. `await supabase.from(...)` - Wait for database query (could be 100ms-1 second)
4. Return the result

### Example 2: Helper Function (Regular Function)

**From `lib/market-utils.ts` (line 28):**
```typescript
export function isMarketHoliday(date: Date): boolean {
  // No async - this is instant!
  const dateStr = date.toISOString().split('T')[0]
  return MARKET_HOLIDAYS_2025.includes(dateStr)
}
```

**What happens:**
1. Function is NOT async (runs instantly)
2. Formats the date (instant)
3. Checks if it's a holiday (instant)
4. Returns true/false (instant)

---

## 5. The Pattern You'll See Everywhere

### Pattern: Async Function with Await

```typescript
async function doSomething() {
  // 1. Get something (wait for it)
  const data = await getData()
  
  // 2. Process it
  const processed = processData(data)
  
  // 3. Save it (wait for it)
  await saveData(processed)
  
  // 4. Return result
  return processed
}
```

### Real Example from Your Code

**From `app/actions/ask-question.ts`:**
```typescript
export async function askQuestion(question: string) {
  // 1. Wait for tool selection
  const tool = await selectTool(question)
  
  // 2. Wait for data fetching
  const data = await executeTool(tool)
  
  // 3. Wait for answer generation
  const answer = await generateAnswer(question, data)
  
  // 4. Return everything
  return { answer, data }
}
```

---

## 6. Common Mistakes (And How to Fix Them)

### ❌ Mistake 1: Forgetting `await`

```typescript
// Wrong
async function getData() {
  const result = fetchFromDatabase()  // Missing await!
  return result  // Returns Promise, not data!
}

// Right
async function getData() {
  const result = await fetchFromDatabase()  // Wait for it!
  return result  // Returns actual data
}
```

### ❌ Mistake 2: Using `await` in Non-Async Function

```typescript
// Wrong
function getData() {
  const result = await fetchFromDatabase()  // Error! Function not async
}

// Right
async function getData() {
  const result = await fetchFromDatabase()  // OK! Function is async
}
```

### ❌ Mistake 3: Not Waiting for Async Function

```typescript
// Wrong
const data = getData()  // Returns Promise, not data!
console.log(data)  // Shows Promise object, not actual data

// Right
const data = await getData()  // Wait for it!
console.log(data)  // Shows actual data
```

---

## 7. Function Types You'll See

### Type 1: Regular Function

```typescript
function formatValue(value: number): string {
  return value.toLocaleString()
}
```

**Use when:** Simple, instant operations

### Type 2: Async Function

```typescript
async function fetchData(): Promise<Data> {
  const data = await getFromDatabase()
  return data
}
```

**Use when:** Database, API, file operations

### Type 3: Arrow Function

```typescript
const formatValue = (value: number): string => {
  return value.toLocaleString()
}

// Or shorter:
const formatValue = (value: number) => value.toLocaleString()
```

**Use when:** Short functions, callbacks

### Type 4: Exported Function

```typescript
export function formatValue(value: number): string {
  return value.toLocaleString()
}
```

**Use when:** Function needs to be used in other files

---

## 8. Function Parameters and Return Values

### Parameters (Inputs)

```typescript
// One parameter
function greet(name: string) {
  return `Hello, ${name}!`
}

// Multiple parameters
function add(a: number, b: number) {
  return a + b
}

// Optional parameter
function greet(name: string, title?: string) {
  if (title) {
    return `Hello, ${title} ${name}!`
  }
  return `Hello, ${name}!`
}
```

### Return Values (Outputs)

```typescript
// Returns a string
function getName(): string {
  return "John"
}

// Returns a number
function getAge(): number {
  return 25
}

// Returns an object
function getUser(): { name: string; age: number } {
  return { name: "John", age: 25 }
}

// Returns nothing (void)
function logMessage(message: string): void {
  console.log(message)
}
```

### Real Example from Your Code

**From `app/actions/financials.ts`:**
```typescript
export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric      // Required parameter
  limit?: number              // Optional parameter
}): Promise<{                  // Return type
  data: FinancialMetricDataPoint[] | null
  error: string | null
}> {
  // Function body
}
```

---

## 9. Calling Functions

### Regular Function Call

```typescript
function add(a: number, b: number) {
  return a + b
}

const result = add(2, 3)  // result = 5
```

### Async Function Call (Must Use Await)

```typescript
async function getData() {
  return "hello"
}

// Must use await!
const result = await getData()  // result = "hello"
```

### In Async Function

```typescript
async function processData() {
  // Can call other async functions with await
  const data = await getData()
  const processed = await process(data)
  return processed
}
```

---

## 10. The Most Important Pattern: Error Handling

### Pattern: Try/Catch with Async

```typescript
async function getData() {
  try {
    const data = await fetchFromDatabase()  // Might fail!
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}
```

### Real Example from Your Code

**From `app/actions/financials.ts`:**
```typescript
export async function getAaplFinancialsByMetric(params) {
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase.from('financials_std').select('*')
    
    if (error) {
      return { data: null, error: error.message }
    }
    
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err.message }
  }
}
```

---

## 11. What You Need to Learn (Priority Order)

### ⭐⭐⭐ MOST IMPORTANT

1. **Async/Await**
   - What `async` means
   - What `await` means
   - How to use them together
   - **Time:** 2-3 hours
   - **Why:** Used in 90% of your codebase!

### ⭐⭐ IMPORTANT

2. **Function Basics**
   - How to write a function
   - Parameters and return values
   - **Time:** 1-2 hours

3. **Error Handling**
   - Try/catch with async functions
   - **Time:** 1 hour

### ⭐ HELPFUL

4. **Arrow Functions**
   - Shorthand syntax
   - **Time:** 30 minutes

5. **Function Types**
   - TypeScript function types
   - **Time:** 1 hour

---

## 12. Practice Exercises

### Exercise 1: Write a Regular Function

```typescript
// Write a function that formats a number as currency
function formatCurrency(amount: number): string {
  // Your code here
}

// Test it:
formatCurrency(1000)  // Should return "$1,000.00"
```

### Exercise 2: Write an Async Function

```typescript
// Write a function that simulates fetching data
async function fetchData(): Promise<string> {
  // Simulate waiting 1 second
  await new Promise(resolve => setTimeout(resolve, 1000))
  return "Data loaded!"
}

// Test it:
const data = await fetchData()  // Should wait 1 second, then return "Data loaded!"
```

### Exercise 3: Error Handling

```typescript
// Write a function that handles errors
async function safeFetch(): Promise<{ data: string | null; error: string | null }> {
  try {
    const data = await fetchData()
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}
```

---

## 13. Quick Reference

### Function Syntax

```typescript
// Regular function
function name(params): returnType {
  return value
}

// Async function
async function name(params): Promise<returnType> {
  const result = await something()
  return result
}

// Arrow function
const name = (params): returnType => {
  return value
}

// Async arrow function
const name = async (params): Promise<returnType> => {
  const result = await something()
  return result
}
```

### Common Patterns

```typescript
// Pattern 1: Simple function
function format(value) {
  return value.toFixed(2)
}

// Pattern 2: Async with await
async function getData() {
  const data = await fetch()
  return data
}

// Pattern 3: Error handling
async function safeGet() {
  try {
    const data = await fetch()
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err.message }
  }
}
```

---

## 14. Summary

### Key Takeaways

1. **Functions are reusable code blocks**
   - Take inputs (parameters)
   - Do something
   - Return outputs

2. **Async/Await is THE MOST IMPORTANT**
   - `async` = function takes time
   - `await` = wait for it to finish
   - Used everywhere in your codebase!

3. **Always use `await` with async functions**
   - `const data = await getData()` ✅
   - `const data = getData()` ❌ (returns Promise, not data)

4. **Handle errors with try/catch**
   - Async operations can fail
   - Always wrap in try/catch

### What to Focus On

**Week 1:**
- Learn async/await (most important!)
- Practice writing async functions
- Practice using await

**Week 2:**
- Function basics (parameters, return values)
- Error handling (try/catch)

**Week 3:**
- Arrow functions
- Function types

---

## 15. Real Code to Study

### Study These Files:

1. **`app/actions/financials.ts`** - See async functions with database queries
2. **`lib/market-utils.ts`** - See regular functions (no async)
3. **`app/actions/ask-question.ts`** - See complex async function with multiple awaits

### Questions to Ask:

1. Is this function `async`? Why or why not?
2. Where is `await` used? What is it waiting for?
3. How does this function handle errors?
4. What does this function return?

---

**Remember:** Async/await is the foundation of your codebase. Master it first, then everything else becomes easier!
