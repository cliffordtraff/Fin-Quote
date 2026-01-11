# Syntax Guide: Understanding the Code

This guide explains every syntax pattern you'll see in your codebase, piece by piece.

---

## 1. Variable Declarations

### `const` - Constant (Can't Change)

```typescript
const name = "John"
const age = 25
const isActive = true
```

**Meaning:** Variable that can't be reassigned

**From your code (`app/page.tsx` line 23):**
```typescript
const [user, setUser] = useState<User | null>(null)
```

---

### `let` - Variable (Can Change)

```typescript
let count = 0
count = 1  // OK - can change
```

**Meaning:** Variable that can be reassigned

**Note:** In your codebase, you mostly see `const` (even for things that change, because you use `useState`)

---

## 2. Function Syntax

### Regular Function

```typescript
function functionName(parameter: type): returnType {
  // code here
  return value
}
```

**Breaking it down:**
- `function` - keyword
- `functionName` - name you give it
- `(parameter: type)` - inputs (parameters)
- `: returnType` - what it returns
- `{ }` - function body

**Real example (`lib/market-utils.ts` line 28):**
```typescript
export function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return MARKET_HOLIDAYS_2025.includes(dateStr)
}
```

**Parts:**
- `export` - can be used in other files
- `function` - it's a function
- `isMarketHoliday` - function name
- `(date: Date)` - takes a Date as input
- `: boolean` - returns true or false
- `{ ... }` - what it does

---

### Async Function

```typescript
async function functionName(params): Promise<returnType> {
  const result = await something()
  return result
}
```

**Breaking it down:**
- `async` - this function takes time
- `Promise<returnType>` - returns a Promise that resolves to returnType
- `await` - wait for something to finish

**Real example (`app/actions/financials.ts` line 104):**
```typescript
export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric
  limit?: number
}): Promise<{
  data: FinancialMetricDataPoint[] | null
  error: string | null
}> {
  // function body
}
```

**Parts:**
- `export` - can be imported elsewhere
- `async` - takes time (database query)
- `function` - it's a function
- `getAaplFinancialsByMetric` - function name
- `(params: { ... })` - takes an object with specific properties
- `: Promise<{ ... }>` - returns a Promise that resolves to an object
- `{ }` - function body

---

### Arrow Function

```typescript
const functionName = (param: type): returnType => {
  return value
}

// Shorter version (if just returning):
const functionName = (param: type) => value
```

**Breaking it down:**
- `const` - variable declaration
- `functionName` - function name
- `=` - assignment
- `(param: type)` - parameters
- `=>` - arrow (means "returns")
- `{ }` or `value` - function body

**Example:**
```typescript
// Long version
const add = (a: number, b: number): number => {
  return a + b
}

// Short version
const add = (a: number, b: number) => a + b
```

---

## 3. TypeScript Types

### Type Annotations

```typescript
const name: string = "John"
const age: number = 25
const isActive: boolean = true
```

**Breaking it down:**
- `const name` - variable name
- `: string` - type annotation (must be a string)
- `= "John"` - value

**Real example (`app/page.tsx` line 23):**
```typescript
const [user, setUser] = useState<User | null>(null)
```

**Parts:**
- `user` - variable name
- `: User | null` - type (User OR null)
- `= useState(...)` - initial value

---

### Union Types (`|`)

```typescript
const value: string | number = "hello"  // Can be string OR number
const data: Data | null = null  // Can be Data OR null
```

**Meaning:** Variable can be one of several types

**Real example (`app/page.tsx` line 31):**
```typescript
const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
```

**Meaning:** `chartConfig` can be a `ChartConfig` object OR `null`

---

### Object Types

```typescript
const person: { name: string; age: number } = {
  name: "John",
  age: 25
}
```

**Breaking it down:**
- `{ name: string; age: number }` - object shape
- `name: string` - property "name" must be string
- `age: number` - property "age" must be number

**Real example (`app/actions/financials.ts` line 104):**
```typescript
export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric
  limit?: number
}): Promise<{
  data: FinancialMetricDataPoint[] | null
  error: string | null
}>
```

**Parts:**
- `params: { ... }` - parameter is an object
- `metric: FinancialMetric` - required property
- `limit?: number` - optional property (`?` means optional)
- `Promise<{ ... }>` - returns Promise of object
- `data: ... | null` - property can be array OR null
- `error: string | null` - property can be string OR null

---

### Array Types

```typescript
const numbers: number[] = [1, 2, 3]
const names: string[] = ["John", "Jane"]
const items: Array<number> = [1, 2, 3]  // Same as above
```

**Breaking it down:**
- `number[]` - array of numbers
- `string[]` - array of strings
- `Array<number>` - same as `number[]` (generic syntax)

**Real example (`app/page.tsx` line 32):**
```typescript
const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
```

**Meaning:** `conversationHistory` is an array of `ConversationHistory` items

---

## 4. useState Syntax

### Basic useState

```typescript
const [variableName, setVariableName] = useState<Type>(initialValue)
```

**Breaking it down:**
- `const [ ... ]` - array destructuring
- `variableName` - current value
- `setVariableName` - function to update it
- `useState<Type>` - React hook with type
- `(initialValue)` - starting value

**Real examples from your code (`app/page.tsx`):**

```typescript
// String state
const [question, setQuestion] = useState('')

// Number state
const [refreshQueriesTrigger, setRefreshQueriesTrigger] = useState(0)

// Boolean state
const [sidebarOpen, setSidebarOpen] = useState(false)

// Object or null
const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)

// Array
const [conversationHistory, setConversationHistory] = useState<ConversationHistory>([])
```

**How to use:**
```typescript
// Read value
console.log(question)  // Get current value

// Update value
setQuestion("new question")  // Change it
```

---

## 5. Object Destructuring

### Basic Destructuring

```typescript
const person = { name: "John", age: 25 }
const { name, age } = person
// Now: name = "John", age = 25
```

**Breaking it down:**
- `{ name, age }` - extract properties
- `= person` - from this object

**Real example (`app/actions/financials.ts` line 111):**
```typescript
const { metric } = params
```

**Meaning:** Extract `metric` property from `params` object

---

### Destructuring with Renaming

```typescript
const { name: personName, age: personAge } = person
// Now: personName = "John", personAge = 25
```

---

### Destructuring from Function Returns

```typescript
const { data, error } = await supabase.from('table').select('*')
```

**Real example (`app/actions/financials.ts` line 123):**
```typescript
const { data, error } = await supabase
  .from('financials_std')
  .select('year, total_liabilities, shareholders_equity')
```

**Meaning:** Get `data` and `error` from the result

---

## 6. Optional Chaining (`?.`)

```typescript
const value = object?.property?.nested
```

**Meaning:** If `object` is null/undefined, return undefined instead of error

**Example:**
```typescript
const user = { name: "John", address: { city: "NYC" } }

// Safe access
const city = user?.address?.city  // "NYC"
const zip = user?.address?.zip  // undefined (no error!)
```

**Real example:**
```typescript
const name = user?.name  // Safe - won't error if user is null
```

---

## 7. Nullish Coalescing (`??`)

```typescript
const value = something ?? defaultValue
```

**Meaning:** Use `defaultValue` if `something` is null or undefined

**Real example (`app/actions/financials.ts` line 112):**
```typescript
const requestedLimit = params.limit ?? 4
```

**Meaning:** Use `params.limit` if it exists, otherwise use `4`

**Difference from `||`:**
```typescript
const value1 = 0 ?? 10  // 0 (because 0 is not null/undefined)
const value2 = 0 || 10  // 10 (because 0 is falsy)
```

---

## 8. Template Literals (Backticks)

```typescript
const message = `Hello, ${name}!`
```

**Breaking it down:**
- `` ` `` - backtick (not single quote)
- `${name}` - insert variable

**Example:**
```typescript
const name = "John"
const greeting = `Hello, ${name}!`  // "Hello, John!"
```

**Real example:**
```typescript
const url = `/api/data?id=${id}&name=${name}`
```

---

## 9. Conditional Syntax

### If/Else

```typescript
if (condition) {
  // do this
} else {
  // do that
}
```

**Real example (`app/actions/financials.ts` line 130):**
```typescript
if (error) {
  return { data: null, error: error.message }
} else {
  return { data, error: null }
}
```

---

### Ternary Operator (`? :`)

```typescript
const value = condition ? valueIfTrue : valueIfFalse
```

**Breaking it down:**
- `condition` - check this
- `?` - if true
- `valueIfTrue` - use this
- `:` - if false
- `valueIfFalse` - use this

**Example:**
```typescript
const message = age >= 18 ? "Adult" : "Minor"
```

**Same as:**
```typescript
let message
if (age >= 18) {
  message = "Adult"
} else {
  message = "Minor"
}
```

---

### Optional Property (`?`)

```typescript
const obj: { name: string; age?: number } = {
  name: "John"
  // age is optional - can omit it
}
```

**Real example (`app/actions/financials.ts` line 106):**
```typescript
limit?: number  // Optional - might not be provided
```

---

## 10. Array Methods

### `.map()` - Transform Each Item

```typescript
const doubled = numbers.map(num => num * 2)
```

**Breaking it down:**
- `numbers.map(...)` - go through each item
- `num => num * 2` - transform each item

**Example:**
```typescript
const numbers = [1, 2, 3]
const doubled = numbers.map(num => num * 2)  // [2, 4, 6]
```

---

### `.filter()` - Keep Only Matching Items

```typescript
const evens = numbers.filter(num => num % 2 === 0)
```

**Breaking it down:**
- `numbers.filter(...)` - check each item
- `num => num % 2 === 0` - keep if true

**Example:**
```typescript
const numbers = [1, 2, 3, 4, 5]
const evens = numbers.filter(num => num % 2 === 0)  // [2, 4]
```

---

### `.find()` - Find First Matching Item

```typescript
const found = items.find(item => item.id === 5)
```

**Breaking it down:**
- `items.find(...)` - search through items
- `item => item.id === 5` - condition to match

**Example:**
```typescript
const users = [{ id: 1, name: "John" }, { id: 2, name: "Jane" }]
const user = users.find(u => u.id === 1)  // { id: 1, name: "John" }
```

---

### `.slice()` - Get Portion of Array

```typescript
const firstThree = items.slice(0, 3)
const lastTwo = items.slice(-2)
```

**Breaking it down:**
- `slice(0, 3)` - get items from index 0 to 3 (not including 3)
- `slice(-2)` - get last 2 items

**Example:**
```typescript
const numbers = [1, 2, 3, 4, 5]
const firstThree = numbers.slice(0, 3)  // [1, 2, 3]
const lastTwo = numbers.slice(-2)  // [4, 5]
```

---

## 11. Import/Export Syntax

### Import

```typescript
import Something from './file'
import { function1, function2 } from './file'
import type { TypeName } from './file'
```

**Breaking it down:**
- `import` - bring in code from another file
- `Something` - default export
- `{ function1, function2 }` - named exports
- `type { TypeName }` - import only types (not code)

**Real examples from your code:**

```typescript
// Default import
import Navigation from '@/components/Navigation'

// Named imports
import { useState, useEffect } from 'react'

// Type import
import type { ChartConfig } from '@/types/chart'

// Mixed
import { getAaplFinancialsByMetric, FinancialMetric } from './financials'
```

---

### Export

```typescript
// Default export
export default function MyComponent() { }

// Named export
export function myFunction() { }
export const myConstant = 5

// Type export
export type MyType = { name: string }
```

**Breaking it down:**
- `export default` - main export (only one per file)
- `export` - named export (can have many)
- `export type` - export TypeScript type

**Real examples:**

```typescript
// Default export (app/page.tsx)
export default function Home() { }

// Named export (app/actions/financials.ts)
export async function getAaplFinancialsByMetric() { }

// Type export
export type FinancialMetric = 'revenue' | 'profit'
```

---

## 12. Async/Await Syntax

### Async Function Declaration

```typescript
async function myFunction(): Promise<ReturnType> {
  // code
}
```

**Breaking it down:**
- `async` - function takes time
- `Promise<ReturnType>` - returns Promise that resolves to ReturnType

---

### Await Syntax

```typescript
const result = await asyncFunction()
```

**Breaking it down:**
- `await` - wait for this to finish
- `asyncFunction()` - function that takes time
- `result` - get the actual value (not Promise)

**Real example (`app/actions/financials.ts` line 116):**
```typescript
const supabase = await createServerClient()
```

**Meaning:** Wait for `createServerClient()` to finish, then store result in `supabase`

---

### Multiple Awaits

```typescript
const step1 = await doStep1()
const step2 = await doStep2(step1)
const step3 = await doStep3(step2)
```

**Real example:**
```typescript
const supabase = await createServerClient()
const { data } = await supabase.from('table').select('*')
const processed = await processData(data)
```

---

## 13. Try/Catch Syntax

```typescript
try {
  // code that might fail
  const result = await riskyOperation()
} catch (error) {
  // handle error
  console.error(error)
}
```

**Breaking it down:**
- `try { }` - try to run this code
- `catch (error) { }` - if it fails, do this

**Real example (`app/actions/financials.ts` line 115):**
```typescript
try {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('financials_std').select('*')
  // ...
} catch (err) {
  return { data: null, error: err.message }
}
```

---

## 14. Object Syntax

### Object Creation

```typescript
const obj = {
  property1: value1,
  property2: value2
}
```

**Real example:**
```typescript
const user = {
  name: "John",
  age: 25,
  isActive: true
}
```

---

### Object Property Access

```typescript
const name = obj.name
const age = obj['age']  // Alternative syntax
```

---

### Spread Operator (`...`)

```typescript
const newObj = { ...oldObj, newProperty: value }
```

**Breaking it down:**
- `...oldObj` - copy all properties
- `newProperty: value` - add/override property

**Example:**
```typescript
const person = { name: "John", age: 25 }
const updated = { ...person, age: 26 }  // { name: "John", age: 26 }
```

---

## 15. Common Operators

### Assignment Operators

```typescript
=   // Assign
+=  // Add and assign: x += 5 means x = x + 5
-=  // Subtract and assign
*=  // Multiply and assign
```

---

### Comparison Operators

```typescript
===  // Equal (strict)
!==  // Not equal (strict)
<    // Less than
>    // Greater than
<=   // Less than or equal
>=   // Greater than or equal
```

---

### Logical Operators

```typescript
&&  // AND: both must be true
||  // OR: either can be true
!   // NOT: reverse boolean
```

**Example:**
```typescript
if (age >= 18 && hasLicense) {
  // Both must be true
}

if (isWeekend || isHoliday) {
  // Either can be true
}
```

---

## 16. Type Assertions (`as`)

```typescript
const value = something as Type
```

**Breaking it down:**
- `as Type` - tell TypeScript "trust me, this is Type"

**Real example (`app/market/page.tsx` line 85):**
```typescript
setSpxData(spxResult as MarketData)
```

**Meaning:** TypeScript, treat `spxResult` as `MarketData` type

---

## 17. Function Parameters

### Required Parameters

```typescript
function greet(name: string) {
  return `Hello, ${name}!`
}
```

---

### Optional Parameters

```typescript
function greet(name: string, title?: string) {
  if (title) {
    return `Hello, ${title} ${name}!`
  }
  return `Hello, ${name}!`
}
```

**Breaking it down:**
- `title?: string` - `?` means optional

---

### Default Parameters

```typescript
function greet(name: string, greeting: string = "Hello") {
  return `${greeting}, ${name}!`
}
```

**Breaking it down:**
- `greeting: string = "Hello"` - default value

**Real example (`app/actions/financials.ts` line 112):**
```typescript
const requestedLimit = params.limit ?? 4
```

**Meaning:** Use `params.limit` if provided, otherwise `4`

---

## 18. Comments

```typescript
// Single line comment

/* 
   Multi-line
   comment
*/

/**
 * JSDoc comment
 * @param name - The person's name
 * @returns A greeting string
 */
```

---

## 19. Common Patterns in Your Codebase

### Pattern 1: Server Action

```typescript
'use server'

export async function myFunction(params: {
  param1: string
  param2?: number
}): Promise<{ data: Data | null; error: string | null }> {
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
}
```

---

### Pattern 2: React Component

```typescript
'use client'

import { useState, useEffect } from 'react'

export default function MyComponent() {
  const [data, setData] = useState<DataType | null>(null)
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const result = await getData()
      setData(result)
      setLoading(false)
    }
    fetchData()
  }, [])
  
  return (
    <div>
      {loading ? <p>Loading...</p> : <p>{data}</p>}
    </div>
  )
}
```

---

## 20. Quick Reference

| Syntax | Meaning | Example |
|--------|---------|---------|
| `const` | Constant variable | `const name = "John"` |
| `let` | Variable | `let count = 0` |
| `function` | Function | `function add(a, b) { }` |
| `async function` | Async function | `async function get() { }` |
| `await` | Wait for async | `const data = await get()` |
| `: type` | Type annotation | `const name: string = "John"` |
| `\|` | Union type | `string \| null` |
| `?` | Optional | `param?: string` |
| `??` | Nullish coalescing | `value ?? defaultValue` |
| `?.` | Optional chaining | `obj?.property` |
| `...` | Spread | `{ ...obj, new: value }` |
| `as` | Type assertion | `value as Type` |
| `[]` | Array | `const arr: number[] = [1, 2]` |
| `{}` | Object | `const obj = { name: "John" }` |
| `()` | Function call | `myFunction()` |
| `=>` | Arrow function | `(x) => x * 2` |

---

## Summary

**Most Important Syntax:**
1. **Function syntax** - `function name() { }` or `const name = () => { }`
2. **Async/await** - `async function` and `await`
3. **TypeScript types** - `: Type` and `Type | null`
4. **useState** - `const [value, setValue] = useState<Type>(initial)`
5. **Destructuring** - `const { prop } = obj`
6. **Optional chaining** - `obj?.property`
7. **Nullish coalescing** - `value ?? defaultValue`

**Practice reading:**
- Start with simple functions
- Then async functions
- Then TypeScript types
- Then React hooks

The more you read, the more familiar the syntax becomes!
