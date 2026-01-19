# Smooth Stock Price Line Implementation Plan

## Overview

Enable the stock price line to display with higher granularity (monthly data points) while keeping the X-axis labels as years and financial metrics positioned at their fiscal year-end dates.

## Current State

- X-axis uses categorical labels: `['2018', '2019', '2020', ...]`
- All data series (financials and price) have one data point per category
- Stock price line appears "jagged" because it only shows annual values

## Target State

- X-axis displays year labels but uses datetime positioning internally
- Financial metrics: One bar per year, positioned at fiscal year-end
- Stock price: Monthly data points (~12 per year), creating a smooth line
- Year labels appear at consistent intervals (Jan 1 or Dec 31 of each year)

## Implementation Steps

### Step 1: Update Chart to Use Datetime X-Axis

**File:** `components/MultiMetricChart.tsx`

- Change xAxis from `categories` to `type: 'datetime'`
- Configure `dateTimeLabelFormats` to show only years
- Set `tickInterval` to one year (365.25 * 24 * 3600 * 1000 ms)
- Update all series data format from `[value1, value2, ...]` to `[[timestamp, value], ...]`

### Step 2: Update Financial Metrics Data Format

**File:** `app/actions/chart-metrics.ts`

- Add `timestamp` field to `MetricDataPoint` type (derived from `date` or fiscal year-end)
- Ensure each data point includes a proper timestamp for positioning

**File:** `components/MultiMetricChart.tsx`

- Convert financial metric data points to `[timestamp, value]` format
- Position bars at their fiscal year-end dates

### Step 3: Create Monthly Price Data Fetcher

**File:** `app/actions/chart-price.ts`

- Add new function `getMonthlyChartPriceData()` or modify `getChartPriceData()`
- When `showStockPrice` is enabled, fetch price data at monthly intervals
- Generate month-end dates for the selected year range
- Return ~12 data points per year instead of 1

**Changes:**
- Generate dates: Last trading day of each month within the year range
- Fetch prices for all these dates using existing `getPrices()` action
- Return data with timestamps for proper X-axis positioning

### Step 4: Update Price Data Structure

**File:** `app/actions/chart-price.ts`

- Return price data with timestamps: `{ timestamp: number, value: number }`
- Each data point represents month-end closing price

**File:** `lib/price-matcher.ts`

- Add helper `generateMonthlyDates(startYear, endYear)` to create month-end dates
- Reuse existing `matchPricesToDates()` for finding nearest trading day

### Step 5: Handle Mixed Series Types in Chart

**File:** `components/MultiMetricChart.tsx`

- Financial metrics: Use `column` type with datetime positioning
- Stock price: Use `line` type with datetime positioning
- Both share the same datetime X-axis
- Configure `pointPlacement` for columns to center on their date

### Step 6: Update Charts Page Data Handling

**File:** `app/charts/page.tsx`

- When `showStockPrice` is true, request monthly price data
- Pass the data to `MultiMetricChart` with proper timestamp format
- No changes needed to the checkbox UI

### Step 7: Update Tooltip and Legend

**File:** `components/MultiMetricChart.tsx`

- Tooltip: Show month/year for price points, fiscal year for financials
- Legend: No changes needed (already shows "Stock Price")
- Data table: May need adjustment for different data point counts

## Data Flow

```
User enables "Stock Price" checkbox
    ↓
charts/page.tsx calls getChartPriceData() with monthly=true
    ↓
chart-price.ts generates month-end dates for year range
    ↓
chart-price.ts fetches prices, matches to nearest trading days
    ↓
Returns ~12 * numYears data points with timestamps
    ↓
MultiMetricChart renders with datetime X-axis
    ↓
Price line shows smooth monthly progression
Financial bars positioned at fiscal year-end dates
X-axis labels show only years
```

## Technical Considerations

### Highcharts Configuration

```
xAxis: {
  type: 'datetime',
  dateTimeLabelFormats: {
    year: '%Y'
  },
  tickInterval: 365.25 * 24 * 3600 * 1000, // One year
  labels: {
    format: '{value:%Y}'
  }
}
```

### Series Data Format

```
// Financial metric (one per year)
series: {
  type: 'column',
  data: [
    [Date.UTC(2018, 11, 31), 265.6],  // Dec 31, 2018
    [Date.UTC(2019, 11, 31), 274.5],  // Dec 31, 2019
    ...
  ]
}

// Stock price (monthly)
series: {
  type: 'line',
  data: [
    [Date.UTC(2018, 0, 31), 167.43],   // Jan 31, 2018
    [Date.UTC(2018, 1, 28), 175.50],   // Feb 28, 2018
    [Date.UTC(2018, 2, 31), 168.34],   // Mar 31, 2018
    ...
  ]
}
```

### Data Table Handling

The data table currently assumes all series have the same number of points. Options:
1. Hide price from table when monthly (too many rows)
2. Show price in a separate summary row (e.g., year-end values only)
3. Keep table as-is, showing financial metrics only

**Recommendation:** Option 2 or 3 - show price in table at annual granularity for readability

## Edge Cases

1. **Quarterly mode:** When user switches to quarterly, price could show weekly data (~13 per quarter) or stay monthly
2. **Missing price data:** Some months may not have trading data (pre-IPO) - show gaps
3. **Multiple stocks:** Each stock gets its own monthly price line
4. **Year range changes:** Monthly dates regenerate based on slider selection

## Effort Estimate

- Step 1: Medium - Core chart axis change
- Step 2: Small - Data format update
- Step 3: Medium - New monthly price fetching
- Step 4: Small - Helper functions
- Step 5: Medium - Mixed series handling
- Step 6: Small - Page integration
- Step 7: Small - Tooltip updates

**Total:** Medium complexity, affects core charting infrastructure

## Testing Checklist

- [ ] Price-only chart shows smooth monthly line
- [ ] Financial metrics still display as bars at correct positions
- [ ] Combined view (price + financials) renders correctly
- [ ] X-axis labels show years only
- [ ] Tooltip shows appropriate date format for each series type
- [ ] Year range slider works with new data format
- [ ] Quarterly mode still functions
- [ ] Multiple stocks work correctly
- [ ] Dark/light theme colors preserved
