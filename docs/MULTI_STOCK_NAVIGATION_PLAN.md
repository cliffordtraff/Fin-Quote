# Multi-Stock Navigation Implementation Plan

## Overview

Convert the hardcoded AAPL stock detail page to support any S&P 500 stock via dynamic routing, and add a stock search feature to the navigation.

**Current State:** Stock page hardcoded to `/stock/aapl/page.tsx` with all server actions returning AAPL data only.

**Target State:** Dynamic `/stock/[symbol]/page.tsx` supporting 500+ stocks with searchable navigation.

---

## Phase 1: Dynamic Routing & Server Actions

### 1.1 Convert Page to Dynamic Route

**Task:** Rename `/app/stock/aapl/page.tsx` → `/app/stock/[symbol]/page.tsx`

```typescript
// BEFORE
export default async function AAPLPage() {
  const overview = await getStockOverview()
  // ...
}

// AFTER
interface PageProps {
  params: Promise<{ symbol: string }>
}

export default async function StockPage({ params }: PageProps) {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  // Validate symbol exists
  const isValid = await isValidSymbol(normalizedSymbol)
  if (!isValid) {
    notFound()
  }

  const overview = await getStockOverview(normalizedSymbol)
  // ...
}
```

**Cached Profile Fetching (avoid duplicate API calls):**

Both `generateMetadata` and the page component need the company profile. Use React's `cache()` to deduplicate:

```typescript
import { cache } from 'react'

// Cached profile loader - called by both metadata and page
const getCachedProfile = cache(async (symbol: string) => {
  return getCompanyProfile(symbol)
})
```

**Dynamic Metadata (with error handling):**
```typescript
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  try {
    const profile = await getCachedProfile(normalizedSymbol)
    return {
      title: `${profile.companyName} (${normalizedSymbol}) - The Intraday`,
      description: `Stock data, financials, and analysis for ${profile.companyName}`
    }
  } catch {
    // Fallback if profile fetch fails
    return {
      title: `${normalizedSymbol} Stock - The Intraday`,
      description: `Stock data and financials for ${normalizedSymbol}`
    }
  }
}
```

**In page component:**
```typescript
export default async function StockPage({ params }: PageProps) {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  // Uses same cached call - no duplicate API request
  const profile = await getCachedProfile(normalizedSymbol)
  // ...
}
```

### 1.2 Update Server Actions (12 files)

Each action needs a `symbol` parameter instead of hardcoded 'AAPL':

| File | Current | Change |
|------|---------|--------|
| `stock-overview.ts` | `const symbol = 'AAPL'` | `symbol: string` param |
| `stock-key-stats.ts` | `const symbol = 'AAPL'` | `symbol: string` param |
| `get-all-financials.ts` | `.eq('symbol', 'AAPL')` | `.eq('symbol', symbol)` |
| `get-stock-news.ts` | `const symbol = 'AAPL'` | `symbol: string` param |
| `get-all-metrics.ts` | `.eq('symbol', 'AAPL')` | `.eq('symbol', symbol)` |
| `market-data.ts` | `.eq('symbol', 'AAPL')` | Add symbol param to relevant functions |
| `segment-data.ts` | `.eq('symbol', 'AAPL')` | `.eq('symbol', symbol)` |
| `get-income-statement.ts` | `symbol = 'AAPL'` default | Keep default, but accept param |
| `financials.ts` | Fallback to 'AAPL' | Accept symbol param |
| `filings.ts` | **Blocks non-AAPL** | Remove restriction |
| `prices.ts` | Has `getAaplPrices()` | Use generic `getPrices({ symbol })` |

**Example Change Pattern:**
```typescript
// BEFORE (stock-overview.ts)
export async function getStockOverview(): Promise<StockOverview | null> {
  const symbol = 'AAPL'
  const response = await fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}`)
  // ...
}

// AFTER - symbol is REQUIRED (no default)
// This catches bugs early - if you forget to pass symbol, you get an error
export async function getStockOverview(symbol: string): Promise<StockOverview | null> {
  const response = await fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}`)
  // ...
}
```

**Why no default?** Removing the `= 'AAPL'` default prevents silently serving Apple data when wiring up a new page. If you forget to pass the symbol, you'll get a TypeScript error immediately.

### 1.3 Update Components

**StockPriceChart.tsx:**
```typescript
// BEFORE
const { data: priceData } = await getAaplPrices()

// AFTER
interface StockPriceChartProps {
  symbol: string
}

export default function StockPriceChart({ symbol }: StockPriceChartProps) {
  const { data: priceData } = await getPrices({ symbol })
  // ...
}
```

### 1.4 Remove Filings Restriction

**filings.ts** has a blocker that must be removed:
```typescript
// REMOVE THIS CHECK
if (ticker !== 'AAPL') {
  throw new Error('Only AAPL filings are currently supported')
}
```

---

## Phase 2: Stock Search Component

### 2.1 Create StockSearch Component

**New file:** `/components/StockSearch.tsx`

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Stock {
  symbol: string
  name: string
}

export default function StockSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Stock[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search with AbortController to prevent stale responses
  useEffect(() => {
    if (query.length < 1) {
      setResults([])
      setIsLoading(false)
      setIsOpen(false)  // Keep closed until we have results
      return
    }

    setIsLoading(true)
    const abortController = new AbortController()

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search-stocks?q=${encodeURIComponent(query)}`,
          { signal: abortController.signal }
        )
        if (!response.ok) throw new Error('Search failed')
        const data = await response.json()
        setResults(data.slice(0, 8))
        setIsOpen(true)  // Only open when we have results
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Search error:', error)
          setResults([])
        }
      } finally {
        setIsLoading(false)
        setSelectedIndex(-1)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      abortController.abort()  // Cancel in-flight request
    }
  }, [query])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (symbol: string) => {
    router.push(`/stock/${symbol.toUpperCase()}`)  // Always uppercase
    setQuery('')
    setIsOpen(false)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex].symbol)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search stocks..."
        className="w-48 px-3 py-1.5 text-sm border rounded-lg
                   dark:bg-gray-800 dark:border-gray-700"
      />

      {isOpen && (
        <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-gray-800
                        border rounded-lg shadow-lg">
          {isLoading && (
            <div className="px-3 py-2 text-gray-500 text-sm">Searching...</div>
          )}

          {!isLoading && query.length > 0 && results.length === 0 && (
            <div className="px-3 py-2 text-gray-500 text-sm">No results found</div>
          )}

          {results.map((stock, index) => (
            <button
              key={stock.symbol}
              onClick={() => handleSelect(stock.symbol)}
              className={`w-full px-3 py-2 text-left flex justify-between
                         ${index === selectedIndex
                           ? 'bg-blue-100 dark:bg-blue-900'
                           : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <span className="font-medium">{stock.symbol}</span>
              <span className="text-gray-500 text-sm truncate ml-2">
                {stock.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 2.2 Create Search API Route

**New file:** `/app/api/search-stocks/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { searchSymbols } from '@/lib/symbol-resolver'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || ''

  if (query.length < 1) {
    return NextResponse.json([])
  }

  const results = await searchSymbols(query)
  return NextResponse.json(results)
}
```

### 2.3 Add searchSymbols() to symbol-resolver.ts

**Important:** The existing `getAllSymbols()` returns `string[]`, but search needs `{ symbol, name }[]`. Add this function:

```typescript
export async function searchSymbols(query: string): Promise<Array<{ symbol: string; name: string }>> {
  const cache = await loadSymbolCache()  // Returns Map with { symbol, name } objects
  const normalizedQuery = query.toUpperCase()

  const results = Array.from(cache.values())
    .filter(stock =>
      stock.symbol.includes(normalizedQuery) ||
      stock.name.toUpperCase().includes(normalizedQuery)
    )
    .sort((a, b) => {
      // Exact symbol matches first
      if (a.symbol === normalizedQuery) return -1
      if (b.symbol === normalizedQuery) return 1
      // Then symbol starts-with
      if (a.symbol.startsWith(normalizedQuery)) return -1
      if (b.symbol.startsWith(normalizedQuery)) return 1
      // Then name starts-with
      if (a.name.toUpperCase().startsWith(normalizedQuery)) return -1
      if (b.name.toUpperCase().startsWith(normalizedQuery)) return 1
      return 0
    })
    .slice(0, 10)

  return results
}
```

### 2.4 Update Navigation Component

**Important:** The "Company" link should be dynamic - if user is on `/stock/MSFT`, it should stay on MSFT, not jump to AAPL.

```typescript
// Navigation.tsx
'use client'

import { usePathname } from 'next/navigation'
import StockSearch from './StockSearch'

export default function Navigation() {
  const pathname = usePathname()

  // Extract current symbol from URL, default to AAPL
  const currentSymbol = pathname?.match(/\/stock\/([^/]+)/)?.[1]?.toUpperCase() || 'AAPL'

  return (
    <nav>
      {/* Top Header Row */}
      <div className="...">
        <Link href="/">The Intraday</Link>
        <StockSearch />  {/* Add search here */}
      </div>

      {/* Navigation Tabs */}
      <div className="...">
        <Link href="/">Market</Link>
        <Link href={`/stock/${currentSymbol}`}>Company</Link>  {/* Dynamic! */}
        {/* ... */}
      </div>
    </nav>
  )
}
```

---

## Phase 3: Data Validation & Error Handling

### 3.1 Symbol Validation in Page

```typescript
// /app/stock/[symbol]/page.tsx
import { notFound } from 'next/navigation'
import { isValidSymbol } from '@/lib/symbol-resolver'

export default async function StockPage({ params }: PageProps) {
  const { symbol } = await params
  const normalizedSymbol = symbol.toUpperCase()

  // Validate symbol
  if (!await isValidSymbol(normalizedSymbol)) {
    notFound()
  }

  // Fetch data...
}
```

### 3.2 Create Not Found Page

**New file:** `/app/stock/[symbol]/not-found.tsx`

```typescript
import Link from 'next/link'

export default function StockNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <h1 className="text-2xl font-bold mb-4">Stock Not Found</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        The stock symbol you're looking for doesn't exist or isn't supported.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Back to Market Dashboard
      </Link>
    </div>
  )
}
```

### 3.3 Create Loading Skeleton

**New file:** `/app/stock/[symbol]/loading.tsx`

```typescript
export default function StockLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-8" />

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  )
}
```

### 3.4 Handle Missing Data Gracefully

```typescript
// In page component
const [overview, keyStats, financials, news] = await Promise.all([
  getStockOverview(symbol).catch(() => null),
  getStockKeyStats(symbol).catch(() => null),
  getAllFinancials(symbol).catch(() => []),
  getStockNews(symbol).catch(() => [])
])

// In component rendering - use context-aware messages
{overview ? (
  <StockOverviewCard data={overview} />
) : (
  <div className="text-amber-600 dark:text-amber-400">
    Company overview for {symbol} is being loaded. Check back soon!
  </div>
)}

{financials.length > 0 ? (
  <FinancialStatementsTabs data={financials} />
) : (
  <div className="text-amber-600 dark:text-amber-400">
    Financial statements for {symbol} are not yet available.
  </div>
)}
```

---

## Files to Modify Summary

### Must Modify (14 files)
| File | Action |
|------|--------|
| `/app/stock/aapl/page.tsx` | Rename to `[symbol]/page.tsx`, add symbol param |
| `/app/actions/stock-overview.ts` | Add symbol parameter |
| `/app/actions/stock-key-stats.ts` | Add symbol parameter |
| `/app/actions/get-all-financials.ts` | Add symbol parameter |
| `/app/actions/get-stock-news.ts` | Add symbol parameter |
| `/app/actions/get-all-metrics.ts` | Add symbol parameter |
| `/app/actions/market-data.ts` | Add symbol parameter where needed |
| `/app/actions/segment-data.ts` | Add symbol parameter |
| `/app/actions/get-income-statement.ts` | Add symbol parameter |
| `/app/actions/financials.ts` | Add symbol parameter |
| `/app/actions/filings.ts` | Remove AAPL-only restriction |
| `/components/StockPriceChart.tsx` | Accept symbol prop |
| `/components/Navigation.tsx` | Add StockSearch component |
| `/lib/symbol-resolver.ts` | Add searchSymbols function (if missing) |

### New Files (4 files)
| File | Purpose |
|------|---------|
| `/components/StockSearch.tsx` | Stock search dropdown component |
| `/app/api/search-stocks/route.ts` | API endpoint for stock search |
| `/app/stock/[symbol]/not-found.tsx` | 404 page for invalid symbols |
| `/app/stock/[symbol]/loading.tsx` | Loading skeleton (required for good UX) |

### Already Ready (no changes needed)
- `/lib/symbol-resolver.ts` - Has `isValidSymbol()`, `getAllSymbols()`
- `/app/actions/prices.ts` - `getPrices({ symbol })` already supports symbols
- `/app/actions/get-company-profile.ts` - Already accepts symbol param
- `/data/us_tickers_metadata.json` - Stock list ready

---

## Implementation Order

```
Week 1: Core Routing
├── Day 1-2: Convert page to dynamic route
│   ├── Rename aapl/ to [symbol]/
│   ├── Update page to extract symbol from params
│   └── Add symbol validation with notFound()
│
├── Day 3-4: Update server actions (12 files)
│   ├── Add symbol parameter to each action
│   ├── Remove AAPL hardcoding
│   └── Remove filings.ts AAPL restriction
│
└── Day 5: Test with multiple symbols
    ├── Test AAPL, MSFT, GOOGL, NVDA
    ├── Verify all data loads correctly
    └── Fix any edge cases

Week 2: Search & Polish
├── Day 1-2: Build StockSearch component
│   ├── Create component with dropdown
│   ├── Create API route for search
│   └── Add to Navigation
│
├── Day 3: Error handling
│   ├── Create not-found.tsx
│   ├── Add graceful fallbacks for missing data
│   └── Test invalid symbols
│
└── Day 4-5: Polish & testing
    ├── Dynamic metadata (title, description)
    ├── Loading states
    └── Mobile responsiveness
```

---

## Testing Checklist

### Manual Testing
- [ ] `/stock/AAPL` loads correctly (existing behavior)
- [ ] `/stock/aapl` (lowercase) loads correctly
- [ ] `/stock/MSFT` loads with Microsoft data
- [ ] `/stock/GOOGL` loads with Google data
- [ ] `/stock/INVALID` shows 404 page
- [ ] Stock search finds "Apple" → AAPL
- [ ] Stock search finds "MSFT" → Microsoft
- [ ] Navigation search dropdown works
- [ ] Page metadata shows correct company name
- [ ] All data sections load or show "unavailable"
- [ ] Mobile layout works
- [ ] Navigation "Company" link stays on current stock

### Automated Tests (Regression Prevention)

Add these tests to prevent future regressions:

**`lib/__tests__/symbol-resolver.test.ts`:**
```typescript
describe('searchSymbols', () => {
  it('returns exact symbol matches first', async () => {
    const results = await searchSymbols('AAPL')
    expect(results[0].symbol).toBe('AAPL')
  })

  it('matches by company name', async () => {
    const results = await searchSymbols('Apple')
    expect(results.some(r => r.symbol === 'AAPL')).toBe(true)
  })

  it('returns empty array for no matches', async () => {
    const results = await searchSymbols('XYZNOTREAL')
    expect(results).toHaveLength(0)
  })

  it('limits results to 10', async () => {
    const results = await searchSymbols('A')  // Many matches
    expect(results.length).toBeLessThanOrEqual(10)
  })
})
```

**`app/api/search-stocks/__tests__/route.test.ts`:**
```typescript
describe('GET /api/search-stocks', () => {
  it('returns stocks matching query', async () => {
    const response = await GET(new Request('http://test?q=MSFT'))
    const data = await response.json()
    expect(data.some(s => s.symbol === 'MSFT')).toBe(true)
  })

  it('returns empty array for empty query', async () => {
    const response = await GET(new Request('http://test?q='))
    const data = await response.json()
    expect(data).toEqual([])
  })
})
```

**`app/stock/[symbol]/__tests__/page.test.ts`:**
```typescript
describe('Stock Page', () => {
  it('returns 404 for invalid symbol', async () => {
    // Test that /stock/INVALID triggers notFound()
  })

  it('normalizes lowercase symbols', async () => {
    // Test that /stock/aapl works same as /stock/AAPL
  })
})
```

---

## Potential Issues

1. **Data availability** - Not all stocks may have complete financial data in the database. FMP API will return data, but Supabase tables may only have AAPL data ingested.

2. **Filing content** - Only AAPL filings are ingested. Other stocks will show empty filings until data is ingested.

3. **API rate limits** - FMP API has rate limits. Consider caching strategy for frequently accessed stocks.

4. **Chatbot** - The chatbot already supports multi-stock queries via symbol extraction in `lib/tools.ts`. No changes needed for this feature.

---

## Future Enhancements (Phase 2+)

These are nice-to-have improvements for after the core implementation:

- **SEO**: Structured data (JSON-LD), Open Graph tags, sitemap generation
- **Performance**: ISR for popular stocks, caching, prefetching on hover
- **Accessibility**: ARIA labels, screen reader support, focus management
- **Mobile**: Full-screen search modal, touch-friendly interactions
- **Analytics**: Track popular searches, page load times, 404 rates
- **Edge cases**: Symbols with dots (BRK.B), API fallbacks, input validation

