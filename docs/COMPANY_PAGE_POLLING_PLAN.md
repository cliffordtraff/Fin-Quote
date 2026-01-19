# Company Page Client Polling Implementation Plan

## Current State

The Company page (`app/stock/[symbol]/page.tsx`) already has:
- ✅ Server-side data fetching (SSR)
- ✅ ISR with 60-second revalidation (`export const revalidate = 60`)
- ✅ Parallel data fetching for all sections
- ❌ No client-side polling for live price updates

## Goal

Add client-side polling so the **price header** updates every 60 seconds without requiring a page refresh.

## What Needs to Update

Only the sticky header price section needs live updates:
- Current price (`$XXX.XX`)
- Price change (`+$X.XX`)
- Percent change (`(X.XX%)`)
- Market status badge (Open/Closed/Pre-Market/After Hours)

Other sections (news, financials, key stats) can stay static - they don't change frequently.

---

## Architecture

### Before (Current)
```
Server fetches all data → Renders page → User sees data
                                        ↓
                          Data stays frozen until refresh
```

### After
```
Server fetches all data → Renders page → User sees data immediately
                                        ↓
                          Client polls price every 60s → Updates header
```

---

## Implementation Steps

### Step 1: Create a Client Component for the Price Header

**File:** `components/StockPriceHeader.tsx`

This component will:
- Accept initial price data as props (from server)
- Display the price header UI
- Poll for price updates every 60 seconds
- Update only the price/change values

```tsx
'use client'

interface StockPriceHeaderProps {
  symbol: string
  companyName: string
  sector: string
  initialPrice: number
  initialPriceChange: number
  initialPriceChangePercent: number
  initialMarketStatus: 'open' | 'closed' | 'premarket' | 'afterhours'
}

export default function StockPriceHeader({
  symbol,
  companyName,
  sector,
  initialPrice,
  initialPriceChange,
  initialPriceChangePercent,
  initialMarketStatus
}: StockPriceHeaderProps) {
  const [price, setPrice] = useState(initialPrice)
  const [priceChange, setPriceChange] = useState(initialPriceChange)
  const [priceChangePercent, setPriceChangePercent] = useState(initialPriceChangePercent)
  const [marketStatus, setMarketStatus] = useState(initialMarketStatus)

  // Polling effect - refresh price every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await getStockOverview(symbol)
      if (data) {
        setPrice(data.currentPrice)
        setPriceChange(data.priceChange)
        setPriceChangePercent(data.priceChangePercent)
        setMarketStatus(data.marketStatus)
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [symbol])

  // ... render UI (copy from current page.tsx header section)
}
```

### Step 2: Update the Page to Use the Client Component

**File:** `app/stock/[symbol]/page.tsx`

Replace the inline header section with the new client component:

```tsx
// Before: Inline header JSX
<section className="sticky top-0 z-30 ...">
  <div>...</div>  {/* 100+ lines of header JSX */}
</section>

// After: Client component
<StockPriceHeader
  symbol={normalizedSymbol}
  companyName={overview.company.name}
  sector={overview.company.sector}
  initialPrice={overview.currentPrice}
  initialPriceChange={overview.priceChange}
  initialPriceChangePercent={overview.priceChangePercent}
  initialMarketStatus={overview.marketStatus}
/>
```

### Step 3: Adjust ISR Revalidation (Optional)

Since client polling handles price freshness, we can optionally increase the ISR revalidation time to reduce server load:

```tsx
// Current: 60 seconds
export const revalidate = 60

// Optional: Increase to 5 minutes since client handles price updates
export const revalidate = 300
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `components/StockPriceHeader.tsx` | Create | Client component with price polling |
| `app/stock/[symbol]/page.tsx` | Modify | Replace inline header with client component |

---

## Benefits

1. **Instant page load** - Server renders full page with data
2. **Live prices** - Client keeps header prices fresh
3. **Reduced server load** - Only price endpoint called every 60s (not full page data)
4. **Better UX** - User doesn't need to refresh to see updated prices

---

## Alternative: Full Page Polling

If you wanted ALL data to update (not just price), you'd need to:
1. Create a `StockPageClient.tsx` component (like `MarketDashboard.tsx`)
2. Move all UI rendering to that component
3. Poll `getAllStockData()` every 60 seconds

But this is overkill - news and financials don't change every minute. The header-only approach is more efficient.

---

## Testing

After implementation:
1. **Initial load:** Page should render with data immediately
2. **After 60 seconds:** Price in header should update (check browser console for fetch)
3. **Market status:** Should reflect current market state (open/closed)
4. **Other sections:** Should stay static (no unnecessary re-renders)
