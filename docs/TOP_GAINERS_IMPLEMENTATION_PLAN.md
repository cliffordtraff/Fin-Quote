# Top 20 Gainers Table - Implementation Plan

## Overview

This document outlines the implementation plan for adding a "Top 20 Gainers" table to the Fin Quote homepage. The table will display stocks with the highest percentage gains for the day, positioned above the existing Futures table.

**Key Requirements:**
- Display top 20 stocks by percentage gain
- Show 5 columns: Symbol, Last Price, Change ($), Change (%), Volume
- Position above the existing Futures table on homepage
- Auto-refresh every 60 seconds
- Match existing dark mode styling and component patterns

**Architectural Approach:**
- This feature is **completely separate** from the AAPL Q&A system
- Uses FMP API for real-time market data (same as Futures table)
- No database storage (live API calls with caching)
- Follows existing server action + client component pattern

---

## Architecture

### Data Flow

```
User visits homepage
    ↓
useEffect triggers on mount
    ↓
getGainersData() server action called
    ↓
FMP API: /api/v3/stock_market/gainers
    ↓
Returns top 20 gainers (cached 60s)
    ↓
GainersTable component renders
    ↓
Auto-refresh every 10 seconds (via setInterval)
```

### Separation from AAPL Q&A System

**AAPL Q&A System (existing, unchanged):**
- Path: `/ask`
- Server actions: `app/actions/ask-question.ts`, `financials.ts`, etc.
- Tables: `financials_std`, `financial_metrics`, `filings`, etc.
- Focus: Deep analysis of single ticker (AAPL only)

**Gainers Table (new, separate):**
- Path: `/` (homepage only)
- Server action: `app/actions/gainers.ts`
- No database tables (API only)
- Focus: Broad market view of multiple tickers

**Shared infrastructure:**
- FMP API client (both use FMP_API_KEY)
- Number formatting utilities (can be extracted to `lib/shared/formatters.ts` if needed)
- Tailwind styling patterns

---

## Files to Create/Modify

### Create New Files

1. **`app/actions/gainers.ts`** - Server action to fetch gainers from FMP API
2. **`components/GainersTable.tsx`** - UI component to display the table

### Modify Existing Files

1. **`app/page.tsx`** - Homepage layout to integrate the new table

### No Changes Required

- `.env.local` (already has `FMP_API_KEY`)
- Database schema (no new tables)
- Any AAPL Q&A code (`app/ask/`, `lib/tools.ts`, etc.)

---

## Step 1: Create Server Action (`app/actions/gainers.ts`)

### Purpose
Fetch top 20 stock gainers from Financial Modeling Prep API on the server side.

### Implementation Pattern
Follow the exact pattern from `app/actions/futures.ts`:
- `'use server'` directive for Next.js server-side execution
- Use `FMP_API_KEY` environment variable (never exposed to browser)
- Implement Next.js caching with `fetch()` and `next: { revalidate: 60 }`
- Return typed data or error object

### FMP API Endpoint
```
https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}
```

**Alternative endpoint (newer):**
```
https://financialmodelingprep.com/stable/biggest-gainers?apikey=${apiKey}
```

### Expected Response from FMP
```json
[
  {
    "symbol": "MSGM",
    "name": "Motorsport Games Inc.",
    "price": 3.74,
    "change": 2.50,
    "changesPercentage": 70.78,
    "volume": 105180000
  },
  {
    "symbol": "BKYI",
    "name": "BIO-key International, Inc.",
    "price": 0.96,
    "change": 0.51,
    "changesPercentage": 51.57,
    "volume": 475510000
  }
  // ... up to 100+ gainers
]
```

### TypeScript Interface
```typescript
export interface GainerData {
  symbol: string              // Stock ticker (e.g., "MSGM")
  name: string               // Company name
  price: number              // Current price
  change: number             // Dollar change
  changesPercentage: number  // Percentage change
  volume: number             // Trading volume
}
```

### Return Type
```typescript
Promise<{ gainers: GainerData[] } | { error: string }>
```

### Caching Strategy
- Cache for 60 seconds using Next.js `fetch()` revalidation
- Same as futures data (line 23 in `futures.ts`)
- Reduces API calls and improves performance

### Error Handling
- Check if `FMP_API_KEY` exists (return error if missing)
- Catch fetch errors (network issues, API downtime)
- Validate response structure before returning
- Return `{ error: string }` on any failure

### Key Implementation Details
1. Fetch data from FMP API
2. Sort by `changesPercentage` descending (highest gains first)
3. Limit to top 20 results
4. Return with proper typing

### Code Pattern Reference
See `app/actions/futures.ts:1-78` for exact implementation pattern.

---

## Step 2: Create GainersTable Component (`components/GainersTable.tsx`)

### Purpose
Display the gainers data in a styled, responsive table matching the app's design system.

### Component Type
- Client component (`'use client'` directive)
- Reason: Needs interactivity for hover states, potential future sorting

### Props Interface
```typescript
interface GainersTableProps {
  gainers: GainerData[]
}
```

### Layout Structure
- **Container**: Rounded card with border, dark mode support
- **Grid Layout**: 5 columns (Symbol, Last, Change, Change %, Volume)
- **Header Row**: Fixed header with column titles
- **Data Rows**: Map over gainers array (20 rows)
- **Scrolling**: Consider max-height with overflow if table is too tall

### Styling Guidelines

**Match existing patterns from `FuturesTable.tsx`:**

**Container:**
```css
bg-white dark:bg-[rgb(33,33,33)]
rounded-lg
border border-gray-200 dark:border-gray-700
overflow-hidden
```

**Header Row:**
```css
bg-gray-100 dark:bg-[rgb(26,26,26)]
grid grid-cols-5
text-xs font-semibold
text-gray-700 dark:text-gray-300
```

**Data Rows:**
```css
grid grid-cols-5
text-xs
border-t border-gray-100 dark:border-gray-750
hover:bg-gray-50 dark:hover:bg-gray-750
```

**Column Styling:**
- Symbol: `text-blue-400 font-medium` (clickable appearance)
- Price: `text-right` (right-aligned for numbers)
- Change ($): `text-right text-green-500` (positive only for gainers)
- Change (%): `text-right text-green-500 font-semibold` (emphasis)
- Volume: `text-right text-gray-600 dark:text-gray-400`

### Number Formatting Functions

**Price Formatting:**
```typescript
const formatPrice = (price: number): string => {
  return `$${price.toFixed(2)}`
}
```
Example: `$3.74`, `$11.78`

**Change Formatting:**
```typescript
const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : ''
  return `${sign}$${change.toFixed(2)}`
}
```
Example: `+$2.50`, `+$5.39`

**Percentage Formatting:**
```typescript
const formatPercentage = (percentage: number): string => {
  const sign = percentage >= 0 ? '+' : ''
  return `${sign}${percentage.toFixed(2)}%`
}
```
Example: `+70.78%`, `+51.57%`

**Volume Formatting:**
```typescript
const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(1)}B`
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`
  }
  return volume.toLocaleString()
}
```
Examples: `105.2M`, `1.3B`, `998.0K`

### Column Widths (Grid Template)
Suggested proportions for `grid-cols-5`:
- Symbol: `1fr` (wider for longer tickers)
- Last: `0.8fr` (compact)
- Change: `0.8fr` (compact)
- Change %: `0.9fr` (slightly wider)
- Volume: `1fr` (wider for formatted volumes)

Or use explicit widths:
```css
grid-template-columns: 100px 80px 80px 90px 100px
```

### Empty State Handling
```typescript
if (gainers.length === 0) {
  return (
    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
      Loading gainers data...
    </div>
  )
}
```

### Code Pattern Reference
See `components/FuturesTable.tsx:1-110` for exact implementation pattern.

---

## Step 3: Update Homepage Layout (`app/page.tsx`)

### Changes Required

#### 1. Add Imports
```typescript
import { getGainersData } from '@/app/actions/gainers'
import GainersTable from '@/components/GainersTable'
import type { GainerData } from '@/app/actions/gainers'
```

**Location:** Top of file with other imports (around line 10)

#### 2. Add State Variable
```typescript
const [gainersData, setGainersData] = useState<GainerData[]>([])
```

**Location:** With other state declarations (around line 50-60)

#### 3. Modify useEffect for Data Fetching

**Current code (around line 104):**
```typescript
useEffect(() => {
  const fetchData = async () => {
    const [indicesResult, futuresResult] = await Promise.all([
      getIndicesData(),
      getFuturesData()
    ])
    // ... set state
  }

  fetchData()
  const interval = setInterval(fetchData, 10000)
  return () => clearInterval(interval)
}, [])
```

**Updated code:**
```typescript
useEffect(() => {
  const fetchData = async () => {
    const [indicesResult, futuresResult, gainersResult] = await Promise.all([
      getIndicesData(),
      getFuturesData(),
      getGainersData()  // NEW
    ])

    // Existing state updates...

    // NEW state update
    if ('gainers' in gainersResult) {
      setGainersData(gainersResult.gainers)
    }
  }

  fetchData()
  const interval = setInterval(fetchData, 10000)
  return () => clearInterval(interval)
}, [])
```

**Key points:**
- Add `getGainersData()` to the `Promise.all` array (parallel fetching)
- Destructure `gainersResult` from the promise array
- Set state if data exists (error handling)
- Same 10-second interval applies to all data sources

#### 4. Update JSX Layout

**Current structure (simplified):**
```jsx
<div className="flex-1 w-full">
  {/* Index charts */}

  {/* Large gap */}
  <div className="mt-[500px]">
    <FuturesTable futures={futuresData} />
  </div>
</div>
```

**New structure:**
```jsx
<div className="flex-1 w-full">
  {/* Index charts (unchanged) */}

  {/* NEW: Gainers table */}
  <div className="mt-[500px] flex flex-col items-center">
    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
      Top 20 Gainers
    </h2>
    <GainersTable gainers={gainersData} />
  </div>

  {/* Futures table (moved down) */}
  <div className="mt-8 flex flex-col items-center">
    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
      Futures
    </h2>
    <FuturesTable futures={futuresData} />
  </div>
</div>
```

**Layout decisions:**
- Keep the `mt-[500px]` spacing on gainers table (same gap as before)
- Add modest spacing between gainers and futures (`mt-8`)
- Center both tables with `flex flex-col items-center`
- Add section headers for clarity

**Alternative layout (side-by-side on large screens):**
```jsx
<div className="mt-[500px] flex flex-col lg:flex-row gap-8 items-start justify-center">
  <div>
    <h2>Top 20 Gainers</h2>
    <GainersTable gainers={gainersData} />
  </div>
  <div>
    <h2>Futures</h2>
    <FuturesTable futures={futuresData} />
  </div>
</div>
```

Choose based on table width and visual balance.

---

## Step 4: Visual Polish & Enhancements

### Section Headers
Add styled headers above each table:

```jsx
<div className="flex items-center justify-between mb-3 w-full max-w-sm">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
    Top 20 Gainers
  </h2>
  <span className="text-xs text-gray-500 dark:text-gray-400">
    Updated {lastUpdateTime}
  </span>
</div>
```

### Loading States
While data is fetching (first load or error):

```typescript
{gainersData.length === 0 ? (
  <div className="w-full max-w-sm h-48 flex items-center justify-center">
    <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  </div>
) : (
  <GainersTable gainers={gainersData} />
)}
```

Or use skeleton rows:
```jsx
<div className="animate-pulse">
  {[...Array(10)].map((_, i) => (
    <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 mb-1" />
  ))}
</div>
```

### Scrollable Container
If 20 rows is too tall:

```jsx
<div className="w-full max-w-sm max-h-[600px] overflow-y-auto">
  <GainersTable gainers={gainersData} />
</div>
```

Adds vertical scroll with fixed height.

### Update Timestamp
Track when data was last fetched:

```typescript
const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

// In fetchData():
setLastUpdate(new Date())

// In JSX:
<span className="text-xs text-gray-500">
  Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
</span>
```

Requires `date-fns` library (already in project).

### Interactive Enhancements (Future)
- **Clickable tickers**: Link to external source (Yahoo Finance, Google Finance)
- **Sorting**: Click column headers to re-sort
- **Toggle losers**: Button to switch between gainers and losers
- **Search/filter**: Filter by ticker symbol
- **Detailed view**: Click row to expand with mini chart

---

## Step 5: Testing & Verification

### Pre-Launch Checklist

**Environment Setup:**
- [ ] Verify `FMP_API_KEY` exists in `.env.local`
- [ ] Confirm FMP API has available quota (check rate limits)
- [ ] Test API endpoint manually: `curl "https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=YOUR_KEY"`

**Development Testing:**
- [ ] Run `npm run dev` and visit `http://localhost:3000`
- [ ] Check browser console for errors
- [ ] Verify gainers table appears above futures table
- [ ] Confirm data displays correctly (20 rows, 5 columns)
- [ ] Test dark mode toggle (should work seamlessly)

**Data Validation:**
- [ ] Verify numbers format correctly (prices, percentages, volumes)
- [ ] Check that percentages are sorted descending (highest first)
- [ ] Confirm all 5 columns render (Symbol, Last, Change, Change %, Volume)
- [ ] Validate green color applied to positive changes

**Functional Testing:**
- [ ] Wait 60 seconds and confirm data refreshes
- [ ] Check network tab for FMP API calls (should see `/stock_market/gainers`)
- [ ] Verify caching works (no excessive API calls)
- [ ] Test error handling: temporarily break API key, check error state

**Responsive Design:**
- [ ] Test on desktop (1920px width)
- [ ] Test on tablet (768px width)
- [ ] Test on mobile (375px width)
- [ ] Verify table doesn't overflow or break layout

**Performance:**
- [ ] Check page load time (should not significantly increase)
- [ ] Monitor memory usage (20 rows shouldn't cause issues)
- [ ] Verify no layout shift when data loads

**Edge Cases:**
- [ ] No internet connection (error state)
- [ ] FMP API down (error message)
- [ ] Empty response from API (handle gracefully)
- [ ] After market hours (data still shows day's gainers)

### Known FMP API Behaviors

**Market Hours (9:30 AM - 4:00 PM ET):**
- Data updates frequently (every few minutes)
- Gainers list changes dynamically
- Volume increases throughout the day

**After Hours (4:00 PM - 9:30 AM ET):**
- Data shows final daily results
- No intraday changes
- Volume is final day's total

**Weekends:**
- Shows Friday's closing gainers
- Data is static until Monday open

**Rate Limits:**
- Free tier: 250 calls/day
- With 60s cache + 10s refresh, you'll make ~1 call/minute
- That's ~1,440 calls/day if server runs 24/7
- **Solution**: Increase cache time to 5 minutes, or upgrade FMP tier

### Debugging Tips

**If table doesn't appear:**
1. Check browser console for errors
2. Verify server action imported correctly
3. Check network tab for API call
4. Console.log the gainersData state

**If data looks wrong:**
1. Inspect FMP API response in network tab
2. Verify data structure matches TypeScript interface
3. Check sorting logic (should be descending)
4. Confirm limit to 20 results

**If styling is off:**
1. Compare class names to FuturesTable
2. Check dark mode classes (dark: prefix)
3. Verify grid column count (5 not 4)
4. Inspect computed styles in DevTools

---

## Expected Result

### Final Homepage Layout

**Visual Structure:**
```
┌─────────────────────────────────────────────────────┐
│                   Navigation Bar                     │
├─────────────────────────────────────────────────────┤
│                                                       │
│   [SPX Chart] [NASDAQ Chart] [DOW Chart] [RUS Chart] │
│                                                       │
├─────────────────────────────────────────────────────┤
│                   Top 20 Gainers                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Symbol │ Last  │ Change │ Change % │ Volume │  │
│  ├────────┼───────┼────────┼──────────┼────────┤  │
│  │ MSGM   │ $3.74 │ +$2.50 │  +70.78% │ 105.2M │  │
│  │ BKYI   │ $0.96 │ +$0.51 │  +51.57% │ 475.5M │  │
│  │ GIFI   │$11.78 │ +$5.39 │  +49.68% │ 998.0K │  │
│  │   ...  │  ...  │  ...   │    ...   │   ...  │  │
│  │ (20 rows total)                              │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│                      Futures                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ Name   │ Last  │ Change │ Change %          │  │
│  ├────────┼───────┼────────┼──────────────────┤  │
│  │ CL     │$68.50 │ +$1.20 │  +1.78%          │  │
│  │   ...  │  ...  │  ...   │    ...           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Sample Data Display

**Top 3 rows of gainers table:**

| Symbol | Last   | Change  | Change %  | Volume  |
|--------|--------|---------|-----------|---------|
| MSGM   | $3.74  | +$2.50  | +70.78%   | 105.2M  |
| BKYI   | $0.96  | +$0.51  | +51.57%   | 475.5M  |
| GIFI   | $11.78 | +$5.39  | +49.68%   | 998.0K  |

All text in green (positive changes).

### Dark Mode Appearance

**Dark theme colors:**
- Background: Dark gray `rgb(33,33,33)`
- Header: Darker gray `rgb(26,26,26)`
- Text: White/light gray
- Borders: Subtle gray `border-gray-700`
- Ticker symbols: Bright blue `text-blue-400`
- Changes: Bright green `text-green-500`

Seamlessly matches existing futures table and index charts.

---

## Future Enhancements

### Phase 2: Top Losers Table
- Add a second table showing biggest percentage losers
- Use FMP endpoint: `/api/v3/stock_market/losers`
- Same component structure, but with red styling
- Add tabs to toggle between gainers and losers

### Phase 3: Detailed Ticker View
- Click a ticker symbol to see more details
- Modal or slide-over with:
  - Company info
  - Intraday chart
  - Recent news (if available)
  - Basic financials
- Could integrate with Q&A system: "Tell me about [TICKER]"

### Phase 4: Customizable Watchlist
- Let users save favorite tickers
- Filter gainers table to show only watchlist
- Highlight watchlist tickers in the table

### Phase 5: Advanced Signals
- Add "Signal" column (like the screenshot: "New High", "Unusual Volume", "Overbought")
- Implement signal detection logic:
  - New High: price near 52-week high
  - Unusual Volume: volume > 2x average
  - Overbought: RSI > 70
- Color-code or badge the signals

### Phase 6: Export & Sharing
- "Export to CSV" button
- Share button to copy link with current gainers snapshot
- Email alerts for specific stocks hitting gain thresholds

---

## Cost & Performance Considerations

### FMP API Costs

**Free Tier:**
- 250 API calls per day
- Current usage: ~1 call/minute = ~1,440 calls/day
- **Exceeds free tier** - need mitigation

**Solutions:**
1. Increase cache from 60s to 5 minutes (reduces to ~288 calls/day)
2. Only fetch during market hours (9:30 AM - 4:00 PM ET)
3. Upgrade to paid tier ($14/month = 10,000 calls/day)

**Professional Tier ($14/month):**
- 10,000 calls per day
- Real-time data
- Access to all endpoints
- **Recommended if building production app**

### Performance Impact

**Page Load:**
- Adding one API call (~200ms latency)
- Minimal impact with parallel fetching (Promise.all)
- Perceived load time: unchanged

**Memory:**
- 20 rows × 6 fields × ~50 bytes = ~6 KB
- Negligible memory footprint

**Rendering:**
- 20 rows with hover states
- No virtualization needed (small list)
- Smooth 60fps scrolling expected

### Optimization Strategies

**If performance becomes an issue:**
1. Implement virtual scrolling (react-window)
2. Debounce hover states
3. Memoize formatters with useMemo
4. Lazy load below fold (intersection observer)

**For production:**
- Add CDN caching (Cloudflare, Vercel Edge)
- Implement SWR for client-side revalidation
- Consider WebSocket for real-time updates (no polling)

---

## Implementation Timeline

### Estimated Development Time

**Step 1: Server Action (30 minutes)**
- Copy pattern from futures.ts
- Update types and endpoint
- Test API response

**Step 2: GainersTable Component (1 hour)**
- Create component structure
- Implement grid layout
- Add number formatters
- Style with Tailwind (match FuturesTable)
- Test dark mode

**Step 3: Homepage Integration (30 minutes)**
- Add imports and state
- Modify useEffect
- Update JSX layout
- Test data flow

**Step 4: Visual Polish (30 minutes)**
- Add headers
- Implement loading states
- Fine-tune spacing
- Test responsiveness

**Step 5: Testing (30 minutes)**
- Manual testing across browsers
- Dark mode verification
- Error handling
- Performance check

**Total: ~3 hours** for complete implementation

---

## Success Criteria

**Feature is complete when:**
- ✅ Top 20 gainers display on homepage above futures table
- ✅ Data refreshes automatically every 60 seconds (or custom interval)
- ✅ All 5 columns render correctly (Symbol, Last, Change, Change %, Volume)
- ✅ Numbers formatted properly ($ for prices, % for percentages, M/B for volume)
- ✅ Green color applied to positive changes
- ✅ Dark mode works seamlessly
- ✅ No errors in browser console
- ✅ Responsive design works on mobile/tablet/desktop
- ✅ Loading states handle empty data gracefully
- ✅ No impact on existing AAPL Q&A functionality

**Quality checks:**
- Code follows existing patterns (matches futures.ts and FuturesTable.tsx)
- TypeScript types are properly defined (no `any` types)
- Error handling covers edge cases (API down, rate limits, etc.)
- Performance is acceptable (no lag or slowdown)
- Accessibility: keyboard navigable, screen reader friendly

---

## Additional Resources

### FMP API Documentation
- Stock Market Gainers: https://site.financialmodelingprep.com/developer/docs#stock-market-gainers
- Rate Limits: https://site.financialmodelingprep.com/developer/docs#rate-limit
- Pricing: https://site.financialmodelingprep.com/developer/docs/pricing

### Reference Files
- Server Action Pattern: `app/actions/futures.ts`
- Component Pattern: `components/FuturesTable.tsx`
- Homepage Layout: `app/page.tsx`
- Number Formatting: `lib/chart-helpers.ts` (for reference)

### Related Documentation
- `PROJECT_PLAN.md` - Overall system architecture
- `CLAUDE.md` - Project overview and tech stack

---

## Conclusion

This implementation plan provides a complete blueprint for adding a Top 20 Gainers table to the Fin Quote homepage. By following existing patterns and keeping the feature separate from the AAPL Q&A system, we ensure:

1. **Zero risk** to existing functionality
2. **Consistent UX** matching current design
3. **Maintainable code** following established patterns
4. **Fast implementation** (~3 hours total)
5. **Scalable foundation** for future market screener features

The gainers table will provide immediate value to users by surfacing high-momentum stocks, while maintaining the app's focus on deep AAPL analysis through the Q&A system.

Ready to implement!
