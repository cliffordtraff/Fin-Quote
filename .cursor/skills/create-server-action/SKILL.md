---
name: create-server-action
description: Create Next.js server actions following Fin Quote patterns. Use when creating new server actions, adding data fetching functions, or implementing backend API endpoints.
---

# Server Action Creation Pattern

## Quick Template

Every server action in Fin Quote follows this structure:

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
    
    // 3. Query database or fetch data
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

---

## Required Steps

1. **Add `'use server'` directive** at the very top
2. **Import Supabase client**: `import { createServerClient } from '@/lib/supabase/server'`
3. **Define TypeScript types** for parameters and return value
4. **Validate inputs** (check required fields, normalize strings)
5. **Create client**: `const supabase = await createServerClient()`
6. **Query or fetch** data
7. **Check for errors** before using data
8. **Return** `{ data, error: null }` or `{ data: null, error: 'message' }`
9. **Wrap in try/catch** for unexpected errors

---

## Error Handling Rules

**Always use this pattern:**
```typescript
Promise<{ data: DataType[] | null; error: string | null }>
```

**Never:**
- ❌ `throw new Error()` - return error instead
- ❌ Return `null` directly - wrap in `{ data: null, error: 'message' }`
- ❌ Use `Promise<void>` - always return data/error shape

**Always:**
- ✅ Check `if (error)` before using data
- ✅ Return `{ data: null, error: error.message }` on errors
- ✅ Return `{ data, error: null }` on success

---

## Input Validation Pattern

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

---

## Supabase Query Pattern

```typescript
const supabase = await createServerClient()

// Basic query
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('symbol', symbol)
  .order('date', { ascending: false })
  .limit(limit)

// Always check error
if (error) {
  return { data: null, error: error.message }
}

return { data, error: null }
```

---

## FMP API Integration Pattern

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

---

## TypeScript Interface Pattern

```typescript
// Define parameter types
export type MyParams = {
  symbol: string
  limit?: number  // Optional with default
  startDate?: string
}

// Define return type
export type MyResult = 
  | { data: MyData[] }
  | { error: string }

// Or use union in function signature
export async function myFunction(
  params: MyParams
): Promise<{ data: MyData[] | null; error: string | null }> {
  // ...
}
```

---

## Real Examples

**Simple query** (`app/actions/insider-trading.ts`):
```typescript
'use server'

export async function getLatestInsiderTrades(
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }> {
  // FMP API fetch with error handling
}
```

**Complex query** (`app/actions/financials.ts`):
```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

export async function getFinancialsByMetric(
  params: FinancialParams
): Promise<{ data: FinancialData[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient()
    // Complex query with joins, filters, calculations
  } catch (err) {
    return { data: null, error: err.message }
  }
}
```

---

## Common Mistakes

- ❌ Forgetting `'use server'` directive
- ❌ Not importing `createServerClient`
- ❌ Throwing errors instead of returning them
- ❌ Not validating inputs
- ❌ Not checking `error` before using `data`
- ❌ Missing try/catch for unexpected errors
- ✅ Always follow the `{ data, error }` return pattern

---

## Files to Reference

- `app/actions/financials.ts` - Complex Supabase query example
- `app/actions/prices.ts` - FMP API integration example
- `app/actions/insider-trading.ts` - Simple FMP API example
- `app/actions/get-financial-metric.ts` - Advanced query example
