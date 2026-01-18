# Stock Price on Charts - Implementation Plan

## Overview

Add stock price as a selectable metric on the charting page, allowing users to visualize price alongside fundamental metrics like revenue, net income, and profitability ratios.

---

## Key Design Decisions

### 1. Data Source

- **Source**: FMP API via existing `getPrices` action in `app/actions/prices.ts`
- **Data format**: Daily OHLCV (Open, High, Low, Close, Volume)
- **Display value**: Closing price (simplest, most commonly used)

### 2. Time Granularity

**Problem**: Financials have one data point per year/quarter, while prices are daily (250+ points per year).

**Solution for v1**: Stay fiscal-label-based, inject price at fiscal labels

Rather than switching the chart to use real dates (which would require reworking the x-axis, slider, and table), we:
- **Keep fiscal labels** on x-axis ("2024", "Q1 2024")
- **Match price to period_end_date** internally, but display at the fiscal label
- **Pad missing prices with nulls** (e.g., IPO gaps)

This avoids breaking existing chart infrastructure while still aligning price to the correct fiscal periods.

**How it works:**
1. Financial data includes `period_end_date` (e.g., "2024-09-28" for Apple FY 2024)
2. Price matcher finds closing price on that date (or nearest prior trading day)
3. Price value is injected at the fiscal label position ("2024")
4. X-axis continues to show fiscal labels, not actual dates

**Benefits:**
- No changes to slider, table, or x-axis rendering
- Handles different fiscal calendars automatically
- Missing data shows as gaps (null padding)

**Future enhancement:** Switch to true date-based x-axis for more precision.

### 3. UI Integration

Add "Stock Price" as a metric in the existing MetricSelector dropdown:
- Create a new category: **"Price"**
- Metric name: `stock_price` (or `closing_price`)
- Appears alongside existing categories (Income Statement, Balance Sheet, etc.)

Benefits:
- Consistent UX - users don't need to learn a new interaction pattern
- Works naturally with existing multi-stock comparison
- Integrates with existing color picker and visibility toggles

### 4. Y-Axis Scaling

**Problem**: Revenue might be $400B while price is $200 - vastly different scales.

**Solution**:
- Auto-assign price to the right Y-axis
- MultiMetricChart already supports dual Y-axes
- Add logic to detect "price" metrics and assign to secondary axis

### 5. Multi-Stock Support

When comparing multiple stocks (e.g., AAPL vs MSFT):
- Each stock gets its own price series (e.g., "AAPL Stock Price", "MSFT Stock Price")
- Colors follow existing stock color family pattern
- Both appear on the same right Y-axis for comparison

---

## Implementation Steps

### Step 1: Add period_end_date to Financial Data

**Goal**: Enable price matching by exposing the actual period end date.

- Add `period_end_date` column to `financials_std` table in Supabase (if not present)
- Update `getMultipleMetrics` in `app/actions/chart-metrics.ts` to select and return `period_end_date`
- Extend `MetricDataPoint` type to include optional `date?: string` field
- Plan to pad missing price points with nulls to maintain category alignment

### Step 2: Add Price Unit and Axis Formatting

**Goal**: Ensure price displays correctly (not as "$0.00B").

- Add `'price'` as a new unit type alongside existing units
- Update `MultiMetricChart.tsx` axis selection logic:
  - Price unit → always use right Y-axis (yAxis: 1)
  - Format as currency without billion scaling (e.g., "$175.50")
- Ensure right Y-axis is created when any price metric is present

### Step 3: Add stock_price to Catalog and Price Category to Selector

**Goal**: Make price selectable in the UI.

- Add `stock_price` entry to metrics catalog in `app/actions/chart-metrics.ts`:
  - `id: 'stock_price'`
  - `statement: 'price'`
  - `unit: 'price'`
  - `label: 'Stock Price'`
- Update `MetricSelector.tsx`:
  - Add "Price" to `StatementType` / category labels
  - Update sort order so Price appears appropriately
  - Ensure color maps work for price metrics

### Step 4: Build Price Matcher Utility

**Goal**: Match price data to fiscal period dates.

Create `lib/price-matcher.ts`:
- Sort price data ascending by date before searching
- For each `period_end_date`, find closing price:
  - If exact date found → use it
  - If not found (market closed) → use nearest prior trading day (bounded lookback, e.g., 5 days)
  - If before IPO → return null
- Return array aligned to fiscal labels with nulls for missing data

### Step 5: Create Price Data Fetcher

**Goal**: Fetch and align price data for chart consumption.

Create `app/actions/chart-price.ts`:
- Fetch daily prices from FMP API for symbol and date range
- Get period end dates from financial data (or generate calendar dates for price-only)
- Use price-matcher to align prices to periods
- Return in `MetricData` format with fiscal labels as categories

### Step 6: Integrate Price Fetching in Charts Page

**Goal**: Wire everything together.

Modify `app/charts/page.tsx`:
- Detect when `stock_price` is in selected metrics
- Fetch financial data first (to get period_end_dates)
- Call price fetcher with those dates
- Merge price data into `metricsData` array using shared fiscal categories
- Handle price-only selection (generate calendar-based dates)

**Testing scenarios**:
- Price + revenue (dual axis)
- Price only (calendar fallback)
- Multi-stock with different fiscal years
- IPO gaps (null padding)
- Annual vs quarterly

---

## Data Flow

```
User selects "Stock Price" + "Revenue"
        ↓
charts/page.tsx detects price metric in selection
        ↓
Fetch financial data (revenue) - includes period_end_date for each point
        ↓
Extract fiscal labels ("2024", "2023", ...) and period_end_dates
        ↓
Fetch daily prices from FMP API for date range
        ↓
price-matcher.ts finds closing price for each period_end_date
  - Exact match or nearest prior trading day
  - Returns null for missing/pre-IPO dates
        ↓
Price data aligned to same fiscal labels as financials
        ↓
Merged into metricsData array (both use same categories)
        ↓
MultiMetricChart renders:
  - Revenue on left Y-axis (billions)
  - Price on right Y-axis (dollars)
  - X-axis shows fiscal labels ("2024", "2023", ...)
```

**Price-only flow** (no financial metrics):
```
User selects only "Stock Price"
        ↓
No financial data to get period_end_dates from
        ↓
Generate calendar-based dates:
  - Annual: Dec 31 of each year in range
  - Quarterly: Mar 31, Jun 30, Sep 30, Dec 31
        ↓
Fetch prices, match to calendar dates
        ↓
Display with calendar-based fiscal labels
```

---

## Edge Cases to Handle

1. **No price data for old years**: FMP may not have price history for all years in range
2. **Stock splits**: Historical prices should be split-adjusted (FMP provides this)
3. **Different fiscal year ends**: AAPL ends in September, MSFT in June - use actual fiscal year end dates
4. **Quarterly alignment**: Q1 for different companies may end on different dates
5. **IPO dates**: Can't show price data before company went public
6. **Price-only selection** (no financial metrics selected):
   - Fall back to calendar period end dates:
     - **Annual mode**: Use Dec 31 of each year
     - **Quarterly mode**: Use Mar 31, Jun 30, Sep 30, Dec 31
   - This ensures price can be displayed standalone without requiring a financial metric

---

## Future Enhancements

1. **Price variants**: Let user choose between close, open, high, low, adjusted close
2. **Volume**: Add trading volume as another price-related metric
3. **Returns**: Show percentage returns instead of absolute price
4. **Moving averages**: Add 50-day, 200-day MA as additional price metrics
5. **Daily resolution toggle**: Option to show full daily prices (would need different chart handling)
6. **Multi-stock aggregation**: For multi-stock comparisons, aggregate prices to standardized periods (e.g., calendar quarters) so dates align across companies

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `lib/price-matcher.ts` | Create - match prices to financial period end dates |
| `app/actions/chart-price.ts` | Create - fetch and match price data to financial periods |
| `app/actions/chart-metrics.ts` | Modify - add stock_price to catalog |
| `app/charts/page.tsx` | Modify - handle price metric fetching |
| `components/MultiMetricChart.tsx` | Modify - dual Y-axis for price |
| `components/MetricSelector.tsx` | Modify - add Price category |

---

## Feedback & Recommendations (from review)

### Gaps to solve
- **Date alignment risk**: Chart x-axis, slider, and table all assume numeric years/fiscal labels. Price data brings real dates; without a date field in chart data, points will misalign or be dropped.
- **Missing period_end_date**: `financials_std` isn’t returning `period_end_date`, so the matcher can’t align price to fiscal dates. Add the column in Supabase and select it in `getMultipleMetrics`.
- **Price scaling/axis**: Currency metrics are shown in billions (“USD (Billions)”). Raw prices (~$200) would display as `0.00B`. Add a new `price` unit (or special-case price) with its own formatter and force it onto the secondary axis.
- **Category alignment**: Chart categories come from the first metric and index other series by position. If price has missing dates/IPO gaps, tooltips/legend/table will misalign unless you pad missing points with nulls or move to a true date-based axis.
- **Year bounds for slider**: Year bounds are derived from financial metrics. Price-only selection would leave the slider/table without keys unless you derive bounds from price data or synthesize a `year`.

### Recommended adjustments
- **Stay fiscal-label-based for v1**: Keep using fiscal labels/years for x-axis; inject price values at those labels and fill missing with nulls. Avoids reworking the date axis and slider now.
- **Plumb dates**: Add `period_end_date` to `financials_std` selections and extend `MetricDataPoint` with a `date` field so price matching and future date-axis work are possible.
- **Add `price` unit**: Update chart axis selection/formatters so price isn’t scaled to billions and always lands on the right axis with dollar formatting.
- **Selector/catalog wiring**: Add “Price” category, update `StatementType`/labels/sort order/color maps so price shows up cleanly in the dropdown and legend.
- **Matcher behavior**: Sort price data ascending before searching; when exact dates are missing, pick the nearest prior trading day with a bounded lookback; respect IPO start (no price before first available).

### Implementation order (beginner-friendly)
1) Keep fiscal labels; plan to pad missing price points with nulls.  
2) Add `period_end_date` to `financials_std` and to `getMultipleMetrics`; extend chart data to include an optional `date`.  
3) Add `price` unit/axis formatting; ensure price goes on the secondary axis without billion scaling.  
4) Add `stock_price` to the catalog and “Price” category to the selector.  
5) Build `price-matcher` (nearest prior trading day, bounded).  
6) Fetch/merge price data in `charts/page.tsx` using the shared categories; test price-only, price+revenue, multi-stock with IPO gaps, annual vs quarterly.

---

## Testing Checklist

- [ ] Stock price appears in metric dropdown under "Price" category
- [ ] Selecting stock price fetches and displays data correctly
- [ ] Price aligns to fiscal labels (same x-axis position as financial metrics)
- [ ] Price displayed in dollars, not billions (e.g., "$175.50" not "$0.00B")
- [ ] Price appears on right Y-axis with correct scale
- [ ] Price + revenue together renders with dual axes (left: billions, right: dollars)
- [ ] Date range slider works correctly with price data
- [ ] Removing price metric cleans up right Y-axis
- [ ] Color picker works for price metric
- [ ] Missing price data shows as gap (null), not misaligned
- [ ] Market-closed dates use nearest prior trading day
- [ ] Pre-IPO periods show null (gap in chart)
- [ ] Price-only selection uses calendar dates (Dec 31 / quarter-ends)
- [ ] Multi-stock price comparison works (both on right axis)
- [ ] Annual vs quarterly toggle works with price
