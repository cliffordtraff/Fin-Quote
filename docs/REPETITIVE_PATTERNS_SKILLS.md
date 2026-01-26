# Repetitive Patterns Skills for Fin Quote

You're right - skills should be for **repetitive patterns** you do over and over, not one-time feature builds. Here are the actual repetitive patterns in your codebase:

---

## High-Priority Repetitive Patterns

### 1. **Server Action Creation** ⭐ MOST REPETITIVE

**You do this every time you add a new data source or feature.**

**Pattern you repeat**:
```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function myFunction(
  params: MyParams
): Promise<{ data: DataType[] | null; error: string | null }> {
  try {
    // 1. Validate input
    if (!params.symbol) {
      return { data: null, error: 'Symbol required' }
    }
    
    // 2. Create Supabase client
    const supabase = await createServerClient()
    
    // 3. Query database
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('symbol', params.symbol)
    
    // 4. Handle errors
    if (error) {
      return { data: null, error: error.message }
    }
    
    // 5. Return data
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unexpected error'
    }
  }
}
```

**When you'd use this skill**:
- "Create a server action to fetch sector data"
- "Add a server action for earnings data"
- "Create a server action for analyst ratings"

**Files showing this pattern**:
- `app/actions/financials.ts` (lines 1-57)
- `app/actions/prices.ts` (lines 1-80)
- `app/actions/insider-trading.ts` (lines 1-70)

---

### 2. **FMP API Integration** ⭐ VERY REPETITIVE

**You integrate FMP API endpoints repeatedly (financials, prices, insider trading, market data, etc.).**

**Pattern you repeat**:
```typescript
export async function fetchFromFMP(
  endpoint: string,
  params: Record<string, string>
): Promise<{ data: any[] | null; error: string | null }> {
  const apiKey = process.env.FMP_API_KEY
  
  if (!apiKey) {
    return { data: null, error: 'API configuration error' }
  }
  
  try {
    const url = `https://financialmodelingprep.com/api/v4/${endpoint}?${new URLSearchParams({ ...params, apikey: apiKey })}`
    
    const response = await fetch(url, {
      next: { revalidate: 300 } // 5 minute cache
    })
    
    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Validate and transform data
    if (Array.isArray(data) && data.length > 0) {
      return { data: data.map(transformItem), error: null }
    }
    
    return { data: [], error: null }
  } catch (error) {
    console.error('Error fetching from FMP:', error)
    return { data: null, error: 'Failed to fetch data' }
  }
}
```

**When you'd use this skill**:
- "Add FMP endpoint for earnings data"
- "Integrate FMP analyst ratings endpoint"
- "Fetch FMP sector performance data"

**Files showing this pattern**:
- `app/actions/insider-trading.ts` (lines 22-70)
- `app/actions/prices.ts` (FMP price fetching)
- `app/actions/financials.ts` (FMP financials)

---

### 3. **Error Handling Pattern** ⭐ USED EVERYWHERE

**You use this `{ data, error }` pattern in every function.**

**Pattern you repeat**:
```typescript
// Always return this shape
Promise<{ data: DataType | null; error: string | null }>

// Or for arrays
Promise<{ data: DataType[] | null; error: string | null }>

// Or for specific types
Promise<{ trades: Trade[] } | { error: string }>

// Never throw errors
// ❌ Bad: throw new Error('Something failed')
// ✅ Good: return { data: null, error: 'Something failed' }

// Always check errors first
const result = await myFunction()
if ('error' in result) {
  // Handle error
  return
}
// Use result.data
```

**When you'd use this skill**:
- "Add error handling to this function"
- "Fix error handling in this server action"
- "Make this function follow our error pattern"

**Files showing this pattern**:
- Every file in `app/actions/`
- `app/actions/financials.ts` (lines 6-57)
- `app/actions/prices.ts` (error handling throughout)

---

### 4. **Supabase Query Patterns** ⭐ REPETITIVE

**You write Supabase queries with the same patterns repeatedly.**

**Patterns you repeat**:
```typescript
// 1. Create client
const supabase = await createServerClient()

// 2. Basic query
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('symbol', symbol)
  .order('date', { ascending: false })
  .limit(100)

// 3. Query with filters
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('symbol', symbol)
  .gte('date', startDate)
  .lte('date', endDate)
  .order('date', { ascending: false })

// 4. Pagination
const { data, error, count } = await supabase
  .from('table_name')
  .select('*', { count: 'exact' })
  .range(from, to)

// 5. Always check error
if (error) {
  return { data: null, error: error.message }
}
```

**When you'd use this skill**:
- "Query the database for earnings data"
- "Add pagination to this query"
- "Filter this query by date range"

**Files showing this pattern**:
- `app/actions/financials.ts` (lines 11-49)
- All server actions use this pattern

---

### 5. **TypeScript Interface Creation** ⭐ REPETITIVE

**You create TypeScript interfaces for every data type.**

**Patterns you repeat**:
```typescript
// Interface for data models
export interface MyData {
  id: string
  symbol: string
  date: string
  value: number
  // Optional fields use ?
  metadata?: string
}

// Union type for error handling
export type MyResult = 
  | { data: MyData[] }
  | { error: string }

// Type for function parameters
export type MyParams = {
  symbol: string
  limit?: number  // Optional with default
  startDate?: string
}
```

**When you'd use this skill**:
- "Create a TypeScript interface for earnings data"
- "Add types to this function"
- "Define the return type for this server action"

**Files showing this pattern**:
- `app/actions/insider-trading.ts` (lines 3-17)
- `app/actions/prices.ts` (lines 3-14)
- `app/actions/financials.ts` (lines 65-99)

---

### 6. **Input Validation Pattern** ⭐ REPETITIVE

**You validate inputs in every server action.**

**Pattern you repeat**:
```typescript
export async function myFunction(
  symbol: string,
  limit: number = 100
): Promise<{ data: Data[] | null; error: string | null }> {
  // Validate required fields
  if (!symbol || !symbol.trim()) {
    return { data: null, error: 'Symbol is required' }
  }
  
  // Normalize input
  const normalizedSymbol = symbol.trim().toUpperCase()
  
  // Validate numeric inputs
  if (limit < 1 || limit > 1000) {
    return { data: null, error: 'Limit must be between 1 and 1000' }
  }
  
  // Continue with function...
}
```

**When you'd use this skill**:
- "Add validation to this server action"
- "Validate the inputs for this function"
- "Check for required parameters"

**Files showing this pattern**:
- `app/actions/insider-trading.ts` (lines 75-80)
- `app/actions/financials.ts` (validation throughout)

---

## Medium-Priority Repetitive Patterns

### 7. **Data Transformation/Mapping**

**You transform FMP API responses to your data models repeatedly.**

**Pattern you repeat**:
```typescript
const transformed = data.map((item: any) => ({
  symbol: item.symbol,
  date: item.date,
  value: item.value || 0,  // Default values
  // Map fields with different names
  reportingName: item.reportingName || item.name,
  // Handle nulls
  price: item.price || null,
}))
```

---

### 8. **React Component Patterns**

**You create similar components repeatedly (tables, cards, charts).**

**Patterns you repeat**:
- `'use client'` directive
- `useState` for local state
- `useEffect` for data fetching
- Loading/error states
- TypeScript props interfaces

---

### 9. **Database Migration Creation**

**You create migrations with the same structure repeatedly.**

**Pattern you repeat**:
- File naming: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Idempotency checks
- Index creation
- Transaction wrapping

---

## What Skills Should Actually Look Like

### Example: Server Action Creation Skill

```markdown
---
name: create-server-action
description: Create Next.js server actions following Fin Quote patterns. Use when creating new server actions, adding data fetching functions, or implementing API endpoints.
---

# Server Action Creation Pattern

## Required Structure

Every server action must follow this pattern:

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function myFunction(
  params: MyParams
): Promise<{ data: DataType[] | null; error: string | null }> {
  try {
    // 1. Validate input
    // 2. Create Supabase client
    // 3. Query database or call API
    // 4. Handle errors
    // 5. Return data
  } catch (err) {
    return { data: null, error: err.message }
  }
}
```

## Step-by-Step

1. **Add 'use server' directive** at top
2. **Import createServerClient** from '@/lib/supabase/server'
3. **Define TypeScript interface** for parameters
4. **Validate inputs** (check for required fields, normalize)
5. **Create Supabase client**: `const supabase = await createServerClient()`
6. **Query or fetch data**
7. **Check for errors**: `if (error) return { data: null, error: error.message }`
8. **Return data**: `return { data, error: null }`
9. **Wrap in try/catch** for unexpected errors

## Error Handling Rules

- ✅ Always return `{ data, error }` shape
- ✅ Never throw errors
- ✅ Check errors before using data
- ❌ Don't return `null` directly
- ❌ Don't use `throw new Error()`

## Examples

See:
- `app/actions/financials.ts` - Complex query example
- `app/actions/prices.ts` - API integration example
- `app/actions/insider-trading.ts` - Simple query example
```

---

## Summary

**Skills should encode patterns you repeat**, like:
- ✅ Creating server actions (you do this constantly)
- ✅ Integrating FMP API (you do this for every new data source)
- ✅ Error handling (used in every function)
- ✅ Supabase queries (written repeatedly)
- ✅ TypeScript interfaces (created for every data type)

**Skills should NOT be for**:
- ❌ One-time feature implementations (like insider trading)
- ❌ Specific feature requirements
- ❌ Project planning documents

Think of skills as "how to do X" templates that you'll use many times, not "how to build Y feature" guides.
