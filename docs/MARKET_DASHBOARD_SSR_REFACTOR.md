# Market Dashboard SSR Refactor

## Goal

Refactor the market dashboard (`/market`) from client-rendered to server-rendered, similar to how Finviz.com works.

## Current State

The market page (`app/market/page.tsx`) is currently client-rendered:

```typescript
'use client'

export default function MarketPage() {
  const [spxData, setSpxData] = useState(null)

  useEffect(() => {
    fetchData()
    setInterval(fetchData, 10000)
  }, [])
}
```

**Current behavior:**
1. Server sends empty HTML shell
2. Browser downloads JavaScript
3. Browser executes JavaScript
4. Browser fetches market data from server actions
5. Browser renders the page
6. Browser polls every 10 seconds for updates

**Problems with current approach:**
- User sees "Loading market data..." on first visit
- Slower perceived performance (blank → loading → content)
- Poor SEO (Google sees empty page)
- More work pushed to user's browser

## Target State

Server-rendered dashboard like Finviz.com:

```typescript
// No 'use client' directive
export default async function MarketPage() {
  const [spxData, nasdaqData, dowData, ...] = await Promise.all([
    getAaplMarketData(),
    getNasdaqMarketData(),
    getDowMarketData(),
    // ...
  ])

  return <MarketDashboard data={...} />
}
```

**Target behavior:**
1. Server fetches all market data
2. Server builds complete HTML with all numbers/charts
3. Browser receives fully-formed page (data visible immediately)
4. Small client component handles periodic refresh

## Why Finviz.com as the Model

Finviz is a successful financial dashboard that uses server-rendering:

- **Fast first load** - Data appears instantly, no loading spinner
- **SEO friendly** - Search engines index all market data
- **Works without JavaScript** - Core content visible even if JS fails
- **Simple architecture** - Server does the heavy lifting

Their refresh strategy:
- Page data is relatively fresh on load (server fetches on each request or uses short cache)
- Users manually refresh for latest data, or page auto-refreshes periodically
- Some sections use small AJAX updates without full page reload

## Implementation Approach

### 1. Server Component for Initial Render

The main page component fetches data on the server:

```typescript
// app/market/page.tsx
export const revalidate = 60  // ISR: regenerate every 60 seconds

export default async function MarketPage() {
  const data = await fetchAllMarketData()
  return <MarketDashboardClient initialData={data} />
}
```

### 2. Client Component for Interactivity

A thin client wrapper handles refresh:

```typescript
// components/MarketDashboardClient.tsx
'use client'

export default function MarketDashboardClient({ initialData }) {
  const [data, setData] = useState(initialData)

  // Optional: poll for updates
  // Or: show "last updated X seconds ago" with refresh button
}
```

### 3. Caching Strategy

Options for keeping data fresh:

| Strategy | How it works | Trade-off |
|----------|--------------|-----------|
| ISR (revalidate: 60) | Server regenerates page every 60s | Simple, slightly stale data |
| On-demand revalidation | Regenerate when data changes | Complex, always fresh |
| Client polling | Client fetches updates | More client work, always fresh |
| Manual refresh | User clicks refresh button | Simple, user-controlled |

Recommended: ISR with 60-second revalidation + optional client refresh button.

## Components to Refactor

| Component | Current | Target |
|-----------|---------|--------|
| `app/market/page.tsx` | `'use client'` | Server component |
| Index cards (SPX, NASDAQ, etc.) | Client state | Props from server |
| `GainersTable` | Client state | Props from server |
| `LosersTable` | Client state | Props from server |
| `FuturesTable` | Client state | Props from server |
| `SectorHeatmap` | Client state | Props from server |
| `VIXCard` | Client state | Props from server |
| `EconomicCalendar` | Client state | Props from server |
| Charts (`SimpleCanvasChart`) | Keep as client | Receives data as props |

## Benefits After Refactor

1. **Faster perceived load time** - Users see data immediately
2. **Better SEO** - Google indexes market data
3. **Simpler mental model** - Data flows from server to client
4. **Reduced client JavaScript** - Less code shipped to browser
5. **More reliable** - Works even if JavaScript is slow/fails
6. **Consistent with `/stock/aapl`** - That page already uses this pattern

## Open Questions

1. **Refresh frequency** - How often should data update? (60s ISR? 30s? User-triggered?)
2. **Loading states** - Show stale data with "updating..." indicator, or block until fresh?
3. **Charts** - Keep polling for real-time chart updates, or accept slightly stale?
4. **Mobile** - Any different behavior for mobile users?

## Reference

- Current client-rendered page: `app/market/page.tsx`
- Example SSR page in codebase: `app/stock/aapl/page.tsx`
- Finviz homepage: https://finviz.com
