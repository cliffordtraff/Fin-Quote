# AAPL Charting Platform Implementation Plan

## Overview

Build a dedicated charting page (`/charts`) where users can select financial metrics from a dropdown and visualize them as bar charts. The platform will support multi-metric overlay with dual Y-axes for comparing metrics with different scales.

## Goals

1. **Phase 1**: Core charting with 9 standard metrics (revenue, net income, etc.)
2. **Phase 2** (Future): AAPL-specific segment data from SEC filings
   - Product categories: iPhone, Mac, iPad, Wearables/Home/Accessories, Services
   - Geographic segments: Americas, Europe, Greater China, Japan, Rest of Asia Pacific

---

## Phase 1: Core Charting Platform

### New Files to Create

#### 1. `/app/charts/page.tsx` - Main Charts Page

**Purpose**: Client-side page with metric selection and chart display

**Key Features**:
- Metric selector dropdown (multi-select, up to 4 metrics)
- Time range controls:
  - Quick presets (5, 10, 15, 20 years)
  - Custom min/max year inputs (validated, clamped to data)
- Selected metrics shown as removable pills
- Loading and error states
- Info section explaining the chart

**State Management**:
```typescript
const [selectedMetrics, setSelectedMetrics] = useState<MetricId[]>(['revenue'])
const [metricsData, setMetricsData] = useState<MetricData[]>([])
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [yearRangePreset, setYearRangePreset] = useState(10)
const [minYear, setMinYear] = useState<number | null>(null)
const [maxYear, setMaxYear] = useState<number | null>(null)
const [yearBounds, setYearBounds] = useState<{ min: number; max: number } | null>(null)
```

**Available Metrics** (Core 9):
| ID | Label | Unit |
|----|-------|------|
| `revenue` | Revenue | currency |
| `gross_profit` | Gross Profit | currency |
| `net_income` | Net Income | currency |
| `operating_income` | Operating Income | currency |
| `total_assets` | Total Assets | currency |
| `total_liabilities` | Total Liabilities | currency |
| `shareholders_equity` | Shareholders' Equity | currency |
| `operating_cash_flow` | Operating Cash Flow | currency |
| `eps` | Earnings Per Share (EPS) | number |

---

#### 2. `/app/actions/chart-metrics.ts` - Server Action

**Purpose**: Fetch multiple metrics in a single database call

**Function Signature**:
```typescript
export async function getMultipleMetrics(params: {
  metrics: string[]
  limit?: number
}): Promise<{
  data: MetricData[] | null
  error: string | null
  yearBounds?: { min: number; max: number }
}>
```

**Return Type**:
```typescript
export type MetricData = {
  metric: string
  label: string
  unit: 'currency' | 'number'
  data: Array<{
    year: number
    value: number
  }>
}
```

**Implementation Notes**:
- Query `financials_std` table with all requested columns in a single call
- Transform rows into per-metric arrays
- Sort by year ascending for chart display
- Validate metrics against whitelist
- Return year bounds for custom range validation (min/max fiscal year)

---

#### 3. `/components/MetricSelector.tsx` - Dropdown Component

**Purpose**: Multi-select dropdown for choosing metrics

**Props**:
```typescript
interface MetricSelectorProps {
  metrics: readonly { id: string; label: string; unit: string }[]
  selectedMetrics: string[]
  onToggle: (metricId: string) => void
  onClear: () => void
}
```

**Features**:
- Dropdown with checkboxes for each metric
- Shows selected count in button text
- "Clear All" button
- Keyboard accessible
- Click outside to close

---

#### 4. `/components/MultiMetricChart.tsx` - Chart Component

**Purpose**: Highcharts bar chart with optional dual Y-axes

**Props**:
```typescript
interface MultiMetricChartProps {
  data: MetricData[]
  metrics: string[]
  minYear?: number | null
  maxYear?: number | null
}
```

**Features**:
- Grouped bar chart (side-by-side bars per year)
- Dual Y-axes when mixing currency and non-currency metrics (e.g., Revenue + EPS)
- Single Y-axis when all metrics have same unit
- Color-coded series with legend
- Responsive design
- Dark/light theme support
- Export to PNG/CSV
- Data table toggle (collapsible)
- Filtered by custom year range when provided

**Dual Y-Axis Logic**:
```typescript
// Check if we need dual axes
const hasCurrencyMetrics = data.some(d => d.unit === 'currency')
const hasNonCurrencyMetrics = data.some(d => d.unit !== 'currency')
const needsDualAxis = hasCurrencyMetrics && hasNonCurrencyMetrics
```

**Color Palette** (for up to 4 series):
```typescript
const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
]
```

---

### Navigation Update

**File**: `/components/Navigation.tsx`

**Change**: Add "Charts" link after "Financials"

```tsx
<Link
  href="/charts"
  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    pathname === '/charts'
      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
  }`}
>
  Charts
</Link>
```

---

## Implementation Order

### Step 1: Server Action (`/app/actions/chart-metrics.ts`)
- Create `getMultipleMetrics` function
- Define `MetricData` type
- Test with single and multiple metrics

### Step 2: MetricSelector Component (`/components/MetricSelector.tsx`)
- Create dropdown UI
- Handle multi-select logic
- Style for dark/light mode

### Step 3: MultiMetricChart Component (`/components/MultiMetricChart.tsx`)
- Build on existing `FinancialChart.tsx` patterns
- Add multi-series support
- Implement dual Y-axis logic
- Add legend and series colors

### Step 4: Charts Page (`/app/charts/page.tsx`)
- Assemble components
- Add state management
- Handle loading/error states
- Add custom year range inputs and validation
- When preset selected, derive min/max from yearBounds

### Step 5: Navigation Update
- Add "Charts" link to nav bar

### Step 6: Testing
- Test with 1, 2, 3, 4 metrics
- Test currency vs non-currency combinations
- Test quick presets and custom min/max year inputs
- Test invalid ranges (min > max, outside bounds)
- Verify dark/light mode
- Test responsive design

---

## UI Mockup

```
+------------------------------------------------------------------+
| Fin Quote    [Chatbot] [Market] [Financials] [Charts]    [Theme] |
+------------------------------------------------------------------+
|                                                                  |
|  AAPL Financial Charts                                           |
|  Select metrics to visualize Apple's financial performance       |
|                                                                  |
|  +------------------------------------------------------------+  |
|  | Select Metrics (up to 4)              | Time Range         |  |
|  | [v] Revenue                           | [10 Years    v]    |  |
|  | [v] Net Income                        |                    |  |
|  | [ ] Gross Profit                      |                    |  |
|  | [ ] Operating Income                  |                    |  |
|  | ... (dropdown)                        |                    |  |
|  +------------------------------------------------------------+  |
|  | [Revenue x] [Net Income x]                                 |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |                                                            |  |
|  |  Revenue and Net Income (2015-2024)                        |  |
|  |                                                            |  |
|  |  $400B |    ██                                             |  |
|  |        |    ██    ██                                       |  |
|  |  $300B | ██ ██ ██ ██ ██                                    |  |
|  |        | ██ ██ ██ ██ ██ ██                                 |  |
|  |  $200B | ██ ██ ██ ██ ██ ██ ██                              |  |
|  |        |--------------------------------------------       |  |
|  |        | 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 |  |
|  |                                                            |  |
|  |  [■ Revenue] [■ Net Income]               [View Data Table]|  |
|  +------------------------------------------------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Phase 2: Segment Data (Future)

### Data Requirements

**Product Segment Data** (from 10-K filings):
- Need to extract from "Net sales by product category" table
- Metrics: iPhone, Mac, iPad, Wearables/Home/Accessories, Services
- Historical data: 2015-present

**Geographic Segment Data** (from 10-K filings):
- Need to extract from "Net sales by reportable segment" table
- Metrics: Americas, Europe, Greater China, Japan, Rest of Asia Pacific
- Historical data: 2015-present

### Implementation Approach

1. **Option A**: Manual data entry
   - Extract data from PDFs/filings manually
   - Create `segment_data` table in Supabase
   - Pros: Accurate, controlled
   - Cons: Manual effort, needs updates each year

2. **Option B**: Automated extraction (harder)
   - Use existing filing chunks + LLM to extract structured data
   - Parse tables from HTML filings
   - Pros: Scalable
   - Cons: Complex, error-prone

### Proposed Database Schema

```sql
CREATE TABLE segment_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL DEFAULT 'AAPL',
  fiscal_year INTEGER NOT NULL,
  segment_type TEXT NOT NULL, -- 'product' or 'geographic'
  segment_name TEXT NOT NULL, -- 'iPhone', 'Americas', etc.
  value BIGINT NOT NULL, -- Revenue in dollars
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, fiscal_year, segment_type, segment_name)
);
```

### UI Extension

Add a "Segment Type" selector:
- Standard Financials (current)
- Product Segments (iPhone, Mac, iPad, etc.)
- Geographic Segments (Americas, Europe, etc.)

---

## File Summary

| File | Type | Description |
|------|------|-------------|
| `/app/charts/page.tsx` | New | Main charts page with state management |
| `/app/actions/chart-metrics.ts` | New | Server action for multi-metric fetching |
| `/components/MetricSelector.tsx` | New | Dropdown for metric selection |
| `/components/MultiMetricChart.tsx` | New | Highcharts component with dual Y-axis |
| `/components/Navigation.tsx` | Modify | Add "Charts" link |

---

## Dependencies

No new dependencies required. Uses existing:
- Highcharts (via `highcharts-react-official`)
- Supabase client
- Tailwind CSS

---

## Questions to Resolve Before Implementation

1. Should the chart default to a specific metric on page load, or show an empty state?
   - **Proposed**: Default to Revenue

2. Should we limit to 4 metrics, or allow more?
   - **Proposed**: Limit to 4 for readability

3. Should we support calculated metrics (gross margin, ROE) in addition to raw metrics?
   - **Proposed**: Phase 1 = raw metrics only; Phase 2 = add calculated

4. What should happen when comparing EPS (small numbers) with Revenue (large numbers)?
   - **Proposed**: Dual Y-axes with clear labeling
