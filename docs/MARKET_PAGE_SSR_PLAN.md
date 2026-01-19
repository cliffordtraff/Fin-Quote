# Market Page SSR Implementation Plan

## Overview

Convert the Market page from Client-Side Rendering (CSR) to Server-Side Rendering (SSR) with ISR caching and client-side polling for updates.

**Current state:** `'use client'` component that fetches all data in `useEffect` after page loads
**Target state:** Server Component that fetches data at request time, passes to client component for polling

---

## Architecture

### Before (CSR)
```
Browser loads page → Shows "Loading..." → JS executes → Fetches 11 APIs → Renders data
```

### After (SSR + Client Polling)
```
Request hits server → Server fetches 11 APIs in parallel → Renders HTML with data →
Sends to browser → User sees data immediately → Client hydrates → Starts 60s polling
```

---

## File Structure

### Current
```
app/page.tsx (Client Component - everything in one file)
```

### After
```
app/page.tsx (Server Component - fetches data, passes to client)
components/MarketDashboard.tsx (Client Component - UI + polling)
lib/market-types.ts (Shared types - optional, for cleaner code)
```

---

## Implementation Steps

### Step 1: Create Type Definitions File (Optional but Recommended)

**File:** `lib/market-types.ts`

Extract the type definitions from `app/page.tsx` into a shared file:
- `MarketData` interface
- `FutureData` interface
- Re-export types from server actions

This keeps types consistent between server and client components.

---

### Step 2: Create the Client Component

**File:** `components/MarketDashboard.tsx`

This component will:
- Accept all market data as props (initial data from server)
- Initialize state with the props
- Set up 60-second polling interval to refresh data
- Render all the UI (index charts, tables, heatmap, etc.)
- Handle loading/error states for polling (not initial load)

```tsx
'use client'

interface MarketDashboardProps {
  initialData: {
    spx: MarketData | null
    nasdaq: MarketData | null
    dow: MarketData | null
    russell: MarketData | null
    futures: FutureData[]
    gainers: GainerData[]
    losers: LoserData[]
    stocks: StockData[]
    sectors: SectorData[]
    vix: VIXData | null
    economicEvents: EconomicEvent[]
  }
}

export default function MarketDashboard({ initialData }: MarketDashboardProps) {
  const [data, setData] = useState(initialData)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  // Polling effect - refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const freshData = await fetchAllMarketData()
      setData(freshData)
      setLastUpdated(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // ... rest of the UI (copy from current page.tsx)
}
```

---

### Step 3: Create Data Fetching Helper

**File:** `lib/fetch-market-data.ts`

Extract the parallel fetch logic into a reusable function that can be called from:
1. Server component (initial load)
2. Client component (polling)

```tsx
export async function fetchAllMarketData() {
  const [spxResult, nasdaqResult, ...rest] = await Promise.all([
    getAaplMarketData(),
    getNasdaqMarketData(),
    getDowMarketData(),
    getRussellMarketData(),
    getFuturesData(),
    getGainersData(),
    getLosersData(),
    getStocksData(),
    getSectorPerformance(),
    getVIXData(),
    getEconomicEvents()
  ])

  // Process results - gracefully handle failures per-section
  // Each section that fails returns null, others continue to display
  return {
    spx: 'error' in spxResult ? null : spxResult,
    nasdaq: 'error' in nasdaqResult ? null : nasdaqResult,
    // ... etc
  }
}
```

---

### Step 4: Convert Page to Server Component

**File:** `app/page.tsx`

Remove `'use client'` and convert to async server component:

```tsx
// No 'use client' - this is a Server Component

import Navigation from '@/components/Navigation'
import MarketDashboard from '@/components/MarketDashboard'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Optional: Enable ISR with 60-second revalidation
// export const revalidate = 60

export default async function Home() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <MarketDashboard initialData={initialData} />
      </main>
    </div>
  )
}
```

---

### Step 5: Handle Caching (ISR vs SSR)

**Option A: Pure SSR (fresh every request)**
```tsx
// No special config needed - default behavior with dynamic data
export const dynamic = 'force-dynamic'
```

**Option B: ISR with 60-second cache (recommended)**
```tsx
// Cache for 60 seconds, revalidate in background
export const revalidate = 60
```

For your use case, ISR is fine since client polling will refresh anyway.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `lib/market-types.ts` | Create | Shared type definitions |
| `lib/fetch-market-data.ts` | Create | Reusable data fetching function |
| `components/MarketDashboard.tsx` | Create | Client component with UI + polling |
| `app/page.tsx` | Modify | Convert to Server Component |

---

## Child Components (No Changes Needed)

These components are already `'use client'` and will work as-is:
- `SimpleCanvasChart` - Canvas-based chart (browser API) - receives data as props from server
- `FuturesTable` - Check if client component
- `GainersTable` - Check if client component
- `LosersTable` - Check if client component
- `StocksTable` - Check if client component
- `SectorHeatmap` - Check if client component
- `VIXCard` - Check if client component
- `EconomicCalendar` - Check if client component
- `Navigation` - Already `'use client'` (uses `usePathname`)

**Important:** Any child component that uses browser APIs (canvas, localStorage, etc.) or React hooks must be a Client Component. Verify each has `'use client'` directive or it will break SSR.

---

## Testing

After implementation:

1. **Initial load:** Page should render with data immediately (no loading spinner)
2. **View source:** HTML should contain actual market data (not "Loading...")
3. **Network tab:** Initial request should include data in HTML response
4. **After 60 seconds:** Data should refresh automatically
5. **Hard refresh:** Should show fresh data (ISR revalidation)
6. **Hydration check:** No React hydration warnings in console
7. **Error resilience:** If a fetch fails, remaining data still displays correctly

---

## Rollback Plan

If issues arise, simply:
1. Restore `'use client'` to `app/page.tsx`
2. Restore the `useEffect` data fetching
3. Delete the new files

The server actions remain unchanged, so rollback is safe.

---

## Performance Comparison

| Metric | Before (CSR) | After (SSR) |
|--------|--------------|-------------|
| Time to First Paint | Fast (empty shell) | Fast (same) |
| Time to First Data | Slow (JS + fetch) | Fast (in HTML) |
| SEO | None | Full |
| Server Load | Lower | Higher (per-request fetch) |
| API Calls | Per user | Per user (or cached with ISR) |

---

## Optional Enhancements

### Show "Last Updated" timestamp
```tsx
<span className="text-xs text-gray-500">
  Last updated: {lastUpdated.toLocaleTimeString()}
</span>
```

### Show refresh indicator during polling
```tsx
const [isRefreshing, setIsRefreshing] = useState(false)

// In polling effect:
setIsRefreshing(true)
const freshData = await fetchAllMarketData()
setIsRefreshing(false)
```

### Manual refresh button
```tsx
<button onClick={handleRefresh} disabled={isRefreshing}>
  {isRefreshing ? 'Refreshing...' : 'Refresh'}
</button>
```

---

## Review Feedback (Incorporated)

> ✅ The following feedback has been incorporated into the plan above. This section can be ignored during implementation.

- ~~Error and stale handling~~ → Added to Testing section (#7), clarified in fetch helper comments
- ~~Freshness UX~~ → Already covered in Optional Enhancements ("Last Updated" timestamp)
- ~~Chart strategy~~ → Clarified in Child Components section (client-only with server data)
- ~~Types and error unions~~ → Clarified in fetch helper code comments
- ~~Caching differentiation~~ → Deferred (adds complexity; single 60s cache for MVP)
- ~~Testing additions~~ → Added hydration check to Testing section (#6)
- ~~Component boundaries~~ → Clarified in Child Components section with warning
