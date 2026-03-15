# Implementation Plan: Fetch Once, Filter Client-Side

## Problem

When the user drags the year range slider on `/charts-experiment-2`, every tick triggers a server round-trip:

```
slider move → minYear/maxYear state → 300ms debounce → fetchData() → server action
→ Supabase query (with WHERE year >= X AND year <= Y) → network response → setState → re-render
```

Even with the 300ms debounce, this causes visible lag: the bars take ~400-700ms to update after the user releases the slider. Each drag produces multiple intermediate fetches that are immediately discarded.

## Solution

**Fetch all available data once** when stocks/metrics change, cache it in state, and **filter client-side** when the slider moves.

```
stock/metric change → fetchData() (no year filter) → fullData stored in state
slider move → useMemo filters fullData by year → instant re-render (0ms)
```

The slider becomes purely a client-side filter — no network calls, no debounce needed.

## Why This Works

The datasets are small. A stock with 20 years of annual data has ~20 rows per metric. Even with 10 metrics across 2 stocks, that's 400 data points — trivially small. Quarterly data maxes at ~80 rows per metric. There is no performance reason to re-fetch subsets from the server.

## Files to Change

| File | Action | What Changes |
|------|--------|-------------|
| `app/charts-experiment-2/page.tsx` | **MODIFY** | Core refactor: add fullData cache, filter via useMemo, remove debounce |

No server action changes needed. `getMultipleMetrics` already supports being called without year params.

## Detailed Changes

### 1. New State: `fullData` (raw cache)

```typescript
// Full dataset from server (unfiltered by year range)
const [fullData, setFullData] = useState<MetricData[]>([])
```

This replaces `metricsData` as the data source. The existing `metricsData` state becomes the filtered view (or we derive it via `useMemo`).

### 2. Modify `fetchData()` — Remove Year Params

Current `fetchData()` passes `minYearParam` and `maxYearParam` to `getMultipleMetrics`. Change it to:

- Call `getMultipleMetrics` **without** `minYear`/`maxYear` (fetches all available data for that stock+metric+period)
- Call `getMonthlyChartPriceData` **without** `minYear`/`maxYear` (fetches full price history)
- Store result in `fullData` instead of `metricsData`
- Keep yearBounds logic (still need it for the slider range)

### 3. Derive `metricsData` via `useMemo`

```typescript
const metricsData = useMemo(() => {
  if (fullData.length === 0) return []

  const min = minYear ?? yearBounds?.min ?? -Infinity
  const max = maxYear ?? yearBounds?.max ?? Infinity

  return fullData.map(metric => ({
    ...metric,
    data: metric.data.filter(point => point.year >= min && point.year <= max)
  }))
}, [fullData, minYear, maxYear, yearBounds])
```

This runs synchronously on every slider tick — no network call, no debounce.

### 4. Remove Debounce Logic

Delete entirely:
- `debounceRef`
- `debouncedMinYear` / `debouncedMaxYear` state
- The `useEffect` that manages the debounce timeout
- All references to debounced values in `fetchData`

The debounce was a band-aid for the real problem (server fetches on slider). With client-side filtering, it's unnecessary.

### 5. Update `fetchData` Dependencies

Current: `[visibleMetrics, debouncedMinYear, debouncedMaxYear, yearBounds, periodType, selectedStocks, showStockPrice]`

New: `[visibleMetrics, periodType, selectedStocks, showStockPrice]`

Year range no longer triggers a refetch. Only changes to *what* data we need (different stocks, metrics, or period type) trigger server calls.

### 6. Price Data Filtering

Price data uses `timestamp` for x-axis positioning, not `year`. The filter needs to handle this:

```typescript
// For price data, filter by year extracted from the date
data: metric.data.filter(point => {
  if (metric.unit === 'price' && point.date) {
    const pointYear = new Date(point.date).getFullYear()
    return pointYear >= min && pointYear <= max
  }
  return point.year >= min && point.year <= max
})
```

### 7. Initial Year Range

Keep the `DEFAULT_MIN_YEAR = 2018` logic for the initial slider position. The slider still starts at 2018, but now it's just filtering a cached dataset instead of requesting a subset from the server.

## What Stays the Same

- `getMultipleMetrics` server action — no changes
- `getMonthlyChartPriceData` server action — no changes
- `MultiMetricChart` component — receives the same `MetricData[]` shape
- `ChartSidebar` — no changes
- Year bounds calculation — still computed from server response
- Slider UI — same range inputs, same visual behavior
- Period type toggle — still triggers a refetch (annual vs quarterly is a different dataset)
- Stock/metric add/remove — still triggers a refetch

## Expected Performance Improvement

| Action | Before | After |
|--------|--------|-------|
| Slider drag (per tick) | 400-700ms (server RTT) | 0ms (synchronous filter) |
| Slider with debounce | 300ms delay + 400ms fetch | 0ms (no debounce needed) |
| Initial load | Same | Same (maybe slightly larger payload, negligible) |
| Period type change | Same | Same |
| Add metric | Same | Same |

## Edge Cases

1. **Empty fullData**: If no stocks/metrics selected, `fullData` is empty, `metricsData` is empty. Same as before.
2. **Year bounds wider than data**: Slider can go beyond data range — filter naturally excludes gaps. Same as before.
3. **Period type toggle**: Triggers a full refetch (annual ↔ quarterly are different datasets). This is correct behavior.
4. **Stock price in annual mode**: Weekly price data points filtered by year works fine — all weeks within the year range are included.

## Implementation Order

1. Add `fullData` state
2. Modify `fetchData` to remove year params and store in `fullData`
3. Add `useMemo` for `metricsData` derivation
4. Remove debounce logic
5. Update `fetchData` dependency array
6. Test: verify slider is instant, data still correct, period toggle works
