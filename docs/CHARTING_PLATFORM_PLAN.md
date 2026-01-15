# AAPL Charting Platform Implementation Plan

## Overview

Build a dedicated charting page (`/charts`) where users can select financial metrics from a dropdown and visualize them as bar charts. The platform will support multi-metric overlay with dual Y-axes for comparing metrics with different scales.

## Implementation Status

- **Phase 1**: ✅ **COMPLETE** - Core charting with 9 standard metrics (revenue, net income, etc.)
- **Phase 2**: ✅ **PARTIALLY COMPLETE** - Segment data implemented with manual data entry (2020-2024)

## Goals

1. **Phase 1**: ✅ Core charting with 9 standard metrics (revenue, net income, etc.)
2. **Phase 2**: ✅ AAPL-specific segment data (Product and Geographic segments)
   - Product categories: iPhone, Mac, iPad, Wearables/Home/Accessories, Services
   - Geographic segments: Americas, Europe, Greater China, Japan, Rest of Asia Pacific

---

## Phase 1: Core Charting Platform ✅ COMPLETE

### Files Created

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

## Phase 2: Segment Data ✅ PARTIALLY COMPLETE

### Implementation Status

**Status**: Phase 2 has been implemented using **Option A (Manual Data Entry)** with data from external sources.

**Coverage**: FY2020-FY2024 (5 years) - Limited compared to original plan of 2015-present (10 years)

**Data Sources**:
- Product segments: Apple 10-K filings, Bullfincher, stockanalysis.com
- Geographic segments: stockanalysis.com, Bullfincher

### Files Created

#### 1. `/scripts/ingest-segment-data.ts` - Data Ingestion Script

**Purpose**: Manually ingest segment revenue data into the `company_metrics` table

**What It Does**:
1. Contains hardcoded segment data arrays (in millions USD):
   - `productSegmentData`: 25 rows (5 segments × 5 years)
   - `geographicSegmentData`: 25 rows (5 segments × 5 years)
2. Transforms data format:
   - **Input**: `{ year: 2024, segment: 'iPhone', value: 201183 }` (millions)
   - **Output**: Database row with `metric_value: 201183000000` (actual dollars)
3. Clears existing segment data before inserting
4. Inserts all 50 rows (25 product + 25 geographic) into `company_metrics` table
5. Verifies insertion with summary output

**Implementation Details**:

**Environment Setup**:
```typescript
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Uses service role key to bypass RLS for data ingestion
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**Data Structure - Product Segments**:
The script contains complete hardcoded data for all 5 product segments across 5 years:
- **iPhone**: Largest segment, ranging from $137.8B (2020) to $201.2B (2024)
- **Services**: Fast-growing segment, from $53.8B (2020) to $96.2B (2024)
- **Mac**: Hardware segment, ranging from $28.6B (2020) to $40.2B (2022)
- **iPad**: Tablet segment, relatively stable around $23-32B
- **Wearables, Home and Accessories**: Accessories segment, ranging from $30.6B (2020) to $41.2B (2022)

**Data Structure - Geographic Segments**:
Complete hardcoded data for all 5 geographic regions across 5 years:
- **Americas**: Largest region, ranging from $129.5B (2020) to $167.1B (2024)
- **Europe**: Second largest, from $72.7B (2020) to $101.3B (2024)
- **Greater China**: Significant market, from $48.0B (2020) to $74.5B (2022), then declining to $67.0B (2024)
- **Japan**: Smaller but stable, around $23-28B
- **Rest of Asia Pacific**: Growing region, from $20.4B (2020) to $30.7B (2024)

**Data Transformation Process**:
```typescript
// Step 1: Prepare rows for insertion
const rows: Array<{
  symbol: string;
  year: number;
  period: string;
  metric_name: string;
  metric_value: number;  // Stored in actual dollars, not millions
  unit: string;
  dimension_type: string;
  dimension_value: string;
  data_source: string;
}> = [];

// Step 2: Transform product segment data
for (const item of productSegmentData) {
  rows.push({
    symbol: 'AAPL',
    year: item.year,
    period: 'FY',
    metric_name: 'segment_revenue',
    metric_value: item.value * 1_000_000, // Convert millions to dollars
    unit: 'currency',
    dimension_type: 'product',
    dimension_value: item.segment,
    data_source: 'SEC', // Note: Actually from external sources, but marked as SEC
  });
}

// Step 3: Transform geographic segment data (same pattern)
for (const item of geographicSegmentData) {
  rows.push({
    symbol: 'AAPL',
    year: item.year,
    period: 'FY',
    metric_name: 'segment_revenue',
    metric_value: item.value * 1_000_000,
    unit: 'currency',
    dimension_type: 'geographic',
    dimension_value: item.segment,
    data_source: 'SEC',
  });
}
```

**Database Operations**:
```typescript
// 1. Clear existing segment data (idempotent operation)
const { error: deleteError } = await supabase
  .from('company_metrics')
  .delete()
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'segment_revenue');

// 2. Batch insert all 50 rows at once
const { data, error } = await supabase
  .from('company_metrics')
  .insert(rows)
  .select();

// 3. Verification query - fetches back and organizes by year
const { data: productCheck } = await supabase
  .from('company_metrics')
  .select('year, dimension_value, metric_value')
  .eq('symbol', 'AAPL')
  .eq('dimension_type', 'product')
  .order('year', { ascending: true })
  .order('dimension_value', { ascending: true });
```

**Verification Output**:
The script performs comprehensive verification by:
1. Querying back all inserted data
2. Organizing by year and segment
3. Calculating totals per year
4. Formatting output in billions for readability
5. Printing a summary table showing:
   - Total revenue per year (sum of all segments)
   - Individual segment breakdown per year
   - Both product and geographic summaries

**Data Structure**:
```typescript
// Product segments (5 segments × 5 years = 25 rows)
const productSegmentData = [
  { year: 2020, segment: 'iPhone', value: 137781 },      // millions
  { year: 2020, segment: 'Mac', value: 28622 },
  { year: 2020, segment: 'iPad', value: 23724 },
  { year: 2020, segment: 'Wearables, Home and Accessories', value: 30620 },
  { year: 2020, segment: 'Services', value: 53768 },
  // ... continues for 2021-2024
]

// Geographic segments (5 segments × 5 years = 25 rows)
const geographicSegmentData = [
  { year: 2020, segment: 'Americas', value: 129500 },
  { year: 2020, segment: 'Europe', value: 72700 },
  { year: 2020, segment: 'Greater China', value: 48000 },
  { year: 2020, segment: 'Japan', value: 23500 },
  { year: 2020, segment: 'Rest of Asia Pacific', value: 20400 },
  // ... continues for 2021-2024
]
```

**Transformation Logic**:
```typescript
// Converts millions to actual dollars
metric_value: item.value * 1_000_000

// Example:
// Input:  { year: 2024, segment: 'iPhone', value: 201183 }  (millions)
// Output: { metric_value: 201183000000 }  (dollars)
```

**Database Storage**:
- Uses existing `company_metrics` table (no new table created)
- Stores with:
  - `metric_name: 'segment_revenue'`
  - `dimension_type: 'product'` or `'geographic'`
  - `dimension_value: 'iPhone'`, `'Americas'`, etc.
  - `data_source: 'SEC'` (though data actually from external sources)

**Verification**:
After insertion, the script queries back and prints a summary:
```
Product Segments by Year:
  FY2020: Total = $274.5B
    - iPhone: $137.8B
    - Mac: $28.6B
    - ...
  FY2021: Total = $365.8B
    - iPhone: $192.0B
    - ...
```

---

#### 2. `/app/actions/segment-data.ts` - Server Action

**Purpose**: Fetch segment data from `company_metrics` table for charting

**Functions**:

**`getSegmentData(params)`**:
```typescript
export async function getSegmentData(params: {
  segmentType: 'product' | 'geographic'
  segments?: string[]  // Optional: specific segments to fetch
  minYear?: number
  maxYear?: number
}): Promise<SegmentResult>
```

**Implementation Details**:

**1. Validation Logic**:
```typescript
// Validate segment type
if (segmentType !== 'product' && segmentType !== 'geographic') {
  return { data: null, error: 'Invalid segment type', segmentType }
}

// Validate year range
if (typeof minYear === 'number' && typeof maxYear === 'number' && minYear > maxYear) {
  return { data: null, error: 'Invalid year range', segmentType }
}
```

**2. Segment Selection Logic**:
```typescript
// Predefined segment lists in display order
const PRODUCT_SEGMENTS = [
  'iPhone',
  'Services',
  'Wearables, Home and Accessories',
  'Mac',
  'iPad',
]

const GEOGRAPHIC_SEGMENTS = [
  'Americas',
  'Europe',
  'Greater China',
  'Japan',
  'Rest of Asia Pacific',
]

// Determine which segments to fetch
const allSegments = segmentType === 'product' ? PRODUCT_SEGMENTS : GEOGRAPHIC_SEGMENTS
const requestedSegments = segments && segments.length > 0
  ? segments.filter(s => allSegments.includes(s))  // Filter to valid segments only
  : allSegments  // If none specified, fetch all
```

**3. Database Query Construction**:
```typescript
const supabase = await createServerClient()

// Build query with Supabase client
let query = supabase
  .from('company_metrics')
  .select('year, dimension_value, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'segment_revenue')
  .eq('dimension_type', segmentType)
  .in('dimension_value', requestedSegments)  // Filter to requested segments
  .order('year', { ascending: true })

// Add optional year filters
if (typeof minYear === 'number') {
  query = query.gte('year', minYear)
}
if (typeof maxYear === 'number') {
  query = query.lte('year', maxYear)
}

const { data, error } = await query
```

**4. Data Organization**:
The raw database rows are transformed into a structure optimized for charting:
```typescript
// Raw database rows look like:
// [
//   { year: 2020, dimension_value: 'iPhone', metric_value: 137781000000 },
//   { year: 2021, dimension_value: 'iPhone', metric_value: 191973000000 },
//   { year: 2020, dimension_value: 'Services', metric_value: 53768000000 },
//   ...
// ]

// Transformed into segment-organized structure:
const segmentDataMap: Record<string, SegmentDataPoint[]> = {}
for (const row of data) {
  const segment = row.dimension_value
  if (!segmentDataMap[segment]) {
    segmentDataMap[segment] = []
  }
  segmentDataMap[segment].push({
    year: row.year,
    value: row.metric_value,  // Already in dollars from database
  })
}

// Final result maintains display order:
const result: SegmentData[] = requestedSegments
  .filter(segment => segmentDataMap[segment])  // Only include segments with data
  .map(segment => ({
    segment,
    data: segmentDataMap[segment].sort((a, b) => a.year - b.year),  // Sort by year
  }))
```

**5. Year Bounds Calculation**:
```typescript
// Extract all years from the data
const years = data.map(row => row.year)
const yearBounds = {
  min: Math.min(...years),
  max: Math.max(...years),
}

// Returned in result for UI validation
return { data: result, error: null, segmentType, yearBounds }
```

**What It Does**:
1. ✅ Validates segment type and year range
2. ✅ Queries `company_metrics` table with proper filters
3. ✅ Organizes data by segment (transforms flat rows into nested structure)
4. ✅ Returns data in predefined display order
5. ✅ Returns year bounds for UI validation
6. ✅ Handles errors gracefully with descriptive messages

**`getAvailableSegments(segmentType)`**:
```typescript
export async function getAvailableSegments(segmentType: SegmentType): Promise<{
  segments: string[]
  error: string | null
}> {
  if (segmentType === 'product') {
    return { segments: PRODUCT_SEGMENTS, error: null }
  } else if (segmentType === 'geographic') {
    return { segments: GEOGRAPHIC_SEGMENTS, error: null }
  }
  return { segments: [], error: 'Invalid segment type' }
}
```

**Purpose**: Returns the list of available segments for a given type, useful for:
- Populating UI dropdowns/selectors
- Validating user input
- Displaying segment options before data is fetched

**Return Values**:
- Product: `['iPhone', 'Services', 'Wearables, Home and Accessories', 'Mac', 'iPad']`
- Geographic: `['Americas', 'Europe', 'Greater China', 'Japan', 'Rest of Asia Pacific']`

**Return Types**:
```typescript
export type SegmentData = {
  segment: string
  data: Array<{ year: number; value: number }>
}

export type SegmentResult = {
  data: SegmentData[] | null
  error: string | null
  segmentType: SegmentType
  yearBounds?: { min: number; max: number }
}
```

---

#### 3. `/components/SegmentChart.tsx` - Chart Component

**Purpose**: Highcharts stacked column chart for segment data visualization

**Props**:
```typescript
interface SegmentChartProps {
  data: SegmentData[]              // Array of segment data with year/value pairs
  segmentType: 'product' | 'geographic'  // Type of segments being displayed
  visibleSegments: string[]        // Which segments to show (filtered from data)
  customColors?: Record<string, string>  // Optional color overrides
  stacked?: boolean                 // Default: true (stacked vs side-by-side)
}
```

**Implementation Details**:

**1. Component Setup**:
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Highcharts from 'highcharts'
import { useTheme } from '@/components/ThemeProvider'
import type { SegmentData, SegmentType } from '@/app/actions/segment-data'

// Dynamic import for SSR compatibility
const HighchartsReact = dynamic(() => import('highcharts-react-official'), {
  ssr: false,
})
```

**2. State Management**:
```typescript
const [showDataLabels, setShowDataLabels] = useState(false)  // Toggle value labels on bars
const [showExportMenu, setShowExportMenu] = useState(false)  // Export dropdown state
const exportMenuRef = useRef<HTMLDivElement>(null)          // Ref for click-outside detection
const { theme } = useTheme()                                 // Theme context
const isDark = theme === 'dark'                             // Dark mode flag
const [isMounted, setIsMounted] = useState(false)            // SSR safety flag
const chartRef = useRef<Highcharts.Chart | null>(null)      // Chart instance ref
```

**3. Color System**:
```typescript
// Predefined color palette for segments
const SEGMENT_COLORS: Record<string, string> = {
  // Product segments
  iPhone: '#3b82f6',                            // blue-500
  Services: '#10b981',                          // emerald-500
  'Wearables, Home and Accessories': '#f59e0b', // amber-500
  Mac: '#8b5cf6',                               // violet-500
  iPad: '#ec4899',                              // pink-500
  // Geographic segments (same colors reused for consistency)
  Americas: '#3b82f6',
  Europe: '#10b981',
  'Greater China': '#f59e0b',
  Japan: '#8b5cf6',
  'Rest of Asia Pacific': '#ec4899',
}

// Fallback colors if segment not in map
const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

// Color resolution logic:
const color = customColors[segmentData.segment] 
  ?? SEGMENT_COLORS[segmentData.segment] 
  ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
```

**4. Data Processing**:
```typescript
// Filter data to only visible segments
const filteredData = data.filter(d => visibleSegments.includes(d.segment))

// Extract years from first segment (all segments should have same years)
const years = filteredData[0].data.map(d => d.year.toString())

// Build Highcharts series
const series: Highcharts.SeriesOptionsType[] = filteredData.map((segmentData, index) => {
  // Convert dollars to billions for display
  const values = segmentData.data.map(d => d.value / 1_000_000_000)
  
  // Resolve color (custom > predefined > fallback)
  const color = customColors[segmentData.segment] 
    ?? SEGMENT_COLORS[segmentData.segment] 
    ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

  return {
    type: 'column',
    name: segmentData.segment,
    data: values,  // Array of billions: [137.781, 191.973, ...]
    color,
  }
})
```

**5. Chart Configuration**:
```typescript
const options: Highcharts.Options = {
  chart: {
    type: 'column',
    height: 650,
    backgroundColor: isDark ? 'rgb(45, 45, 45)' : 'transparent',
    animation: false,  // Disable for performance
  },
  xAxis: {
    categories: years,  // ['2020', '2021', '2022', ...]
    labels: {
      style: {
        fontSize: '12px',
        color: isDark ? '#9ca3af' : '#6b7280',
      },
    },
  },
  yAxis: {
    labels: {
      formatter: function() {
        const val = typeof this.value === 'number' ? this.value : Number(this.value)
        return `$${val}B`  // Format as billions: "$137B"
      },
    },
    stackLabels: stacked ? {
      enabled: true,
      formatter: function() {
        return `$${(this.total ?? 0).toFixed(0)}B`  // Total on top of stack
      },
    } : undefined,
  },
  plotOptions: {
    column: {
      stacking: stacked ? 'normal' : undefined,  // Stacked or side-by-side
      dataLabels: {
        enabled: showDataLabels,  // Toggleable value labels
        formatter: function() {
          const val = this.point.y ?? 0
          return val >= 10 ? `$${val.toFixed(0)}B` : `$${val.toFixed(1)}B`
        },
      },
    },
  },
  tooltip: {
    shared: true,  // Show all segments in one tooltip
    formatter: function() {
      const points = this.points || []
      let total = 0
      let html = `<div style="font-weight: 600; margin-bottom: 8px;">FY ${this.x}</div>`

      points.forEach((point) => {
        const val = point.y ?? 0
        total += val
        html += `<div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 10px; height: 10px; background-color: ${point.color}; border-radius: 50%;"></span>
          <span>${point.series.name}: <strong>$${val.toFixed(1)}B</strong></span>
        </div>`
      })

      if (stacked && points.length > 1) {
        html += `<div style="border-top: 1px solid ...; margin-top: 8px; padding-top: 8px; font-weight: 600;">
          Total: $${total.toFixed(1)}B
        </div>`
      }

      return html
    },
    useHTML: true,
  },
}
```

**6. Interactive Features**:

**Data Labels Toggle**:
```typescript
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={showDataLabels}
    onChange={(e) => setShowDataLabels(e.target.checked)}
  />
  <span>Show Labels</span>
</label>
```

**Export Menu**:
```typescript
<button onClick={() => setShowExportMenu(!showExportMenu)}>Export</button>
{showExportMenu && (
  <div className="absolute bottom-full right-0 ...">
    <button onClick={() => chartRef.current?.exportChart({ type: 'image/png' }, {})}>
      Download PNG
    </button>
    <button onClick={() => chartRef.current?.exportChart({ type: 'image/jpeg' }, {})}>
      Download JPEG
    </button>
    <button onClick={() => chartRef.current?.exportChart({ type: 'application/pdf' }, {})}>
      Download PDF
    </button>
    <button onClick={() => chartRef.current?.exportChart({ type: 'image/svg+xml' }, {})}>
      Download SVG
    </button>
  </div>
)}
```

**CSV Export**:
```typescript
const copyToClipboard = () => {
  const headers = ['Year', ...filteredData.map(d => d.segment)]
  const rows = years.map((year, i) => {
    const values = filteredData.map(d => {
      const value = d.data[i]?.value || 0
      return (value / 1_000_000_000).toFixed(2)  // Convert to billions
    })
    return [year, ...values]
  })

  const csvData = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  navigator.clipboard.writeText(csvData)
}
```

**7. Data Table**:
```typescript
<table className="w-full table-fixed">
  <thead>
    <tr>
      <th>Segment</th>
      {years.map((year) => (
        <th key={year}>{year}</th>
      ))}
    </tr>
  </thead>
  <tbody>
    {filteredData.map((segmentData) => (
      <tr key={segmentData.segment}>
        <td>{segmentData.segment} ($B)</td>
        {years.map((year, yearIndex) => {
          const value = segmentData.data[yearIndex]?.value || 0
          return (
            <td key={year}>
              ${(value / 1_000_000_000).toFixed(1)}B
            </td>
          )
        })}
      </tr>
    ))}
    {/* Total row */}
    <tr className="bg-gray-100">
      <td>Total ($B)</td>
      {years.map((year, yearIndex) => {
        const total = filteredData.reduce((sum, seg) => {
          return sum + (seg.data[yearIndex]?.value || 0)
        }, 0)
        return (
          <td key={year}>
            ${(total / 1_000_000_000).toFixed(1)}B
          </td>
        )
      })}
    </tr>
  </tbody>
</table>
```

**8. Responsive Design**:
```typescript
responsive: {
  rules: [
    {
      condition: { maxWidth: 500 },
      chartOptions: {
        chart: { height: 300 },  // Smaller on mobile
        legend: {
          layout: 'horizontal',   // Horizontal legend on mobile
          align: 'center',
          verticalAlign: 'bottom',
        },
        xAxis: {
          labels: {
            rotation: -45,        // Rotate labels on narrow screens
            style: { fontSize: '10px' },
          },
        },
      },
    },
  ],
}
```

**Features Summary**:
1. ✅ **Stacked Column Chart**: Default stacked view, optional side-by-side
2. ✅ **Color Mapping**: Predefined colors with custom override support
3. ✅ **Data Conversion**: Dollars → billions for display
4. ✅ **Interactive Features**: Data labels, export menu, CSV copy
5. ✅ **Data Table**: Complete table with totals row
6. ✅ **Responsive Design**: Mobile-optimized layout
7. ✅ **Theme Support**: Full dark/light mode
8. ✅ **Performance**: Animation disabled, dynamic imports for SSR

---

### Data Flow Architecture

**Complete Data Flow for Segment Charts**:

```
1. Data Ingestion (One-time setup)
   └─> scripts/ingest-segment-data.ts
       ├─> Hardcoded arrays (millions USD)
       ├─> Transform: millions → dollars
       ├─> Clear existing data
       └─> Insert into company_metrics table
           └─> 50 rows (25 product + 25 geographic)

2. Data Retrieval (On-demand)
   └─> app/actions/segment-data.ts
       ├─> getSegmentData(params)
       │   ├─> Validate inputs
       │   ├─> Query company_metrics table
       │   ├─> Filter by segment type, segments, year range
       │   ├─> Transform: flat rows → nested by segment
       │   └─> Return SegmentData[] + yearBounds
       └─> getAvailableSegments(segmentType)
           └─> Return predefined segment lists

3. Data Visualization (Client-side)
   └─> components/SegmentChart.tsx
       ├─> Receive SegmentData[] from server action
       ├─> Filter to visibleSegments
       ├─> Transform: dollars → billions for display
       ├─> Build Highcharts series
       ├─> Render chart + data table
       └─> Handle user interactions (export, labels, etc.)
```

**Example Usage Flow**:

```typescript
// 1. In a page component (e.g., app/charts/page.tsx)
'use client'
import { useState, useEffect } from 'react'
import { getSegmentData } from '@/app/actions/segment-data'
import SegmentChart from '@/components/SegmentChart'

export default function SegmentPage() {
  const [segmentData, setSegmentData] = useState<SegmentData[]>([])
  const [visibleSegments, setVisibleSegments] = useState<string[]>(['iPhone', 'Services'])
  const [segmentType, setSegmentType] = useState<'product' | 'geographic'>('product')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const result = await getSegmentData({
        segmentType,
        segments: visibleSegments,
        minYear: 2020,
        maxYear: 2024,
      })
      
      if (result.data) {
        setSegmentData(result.data)
      }
      setLoading(false)
    }
    fetchData()
  }, [segmentType, visibleSegments])

  return (
    <SegmentChart
      data={segmentData}
      segmentType={segmentType}
      visibleSegments={visibleSegments}
      stacked={true}
    />
  )
}
```

**Database Query Pattern**:

The server action performs a single optimized query:
```typescript
// Single query fetches all requested segments at once
const { data } = await supabase
  .from('company_metrics')
  .select('year, dimension_value, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'segment_revenue')
  .eq('dimension_type', 'product')  // or 'geographic'
  .in('dimension_value', ['iPhone', 'Services', 'Mac'])  // Filter segments
  .gte('year', 2020)  // Optional year range
  .lte('year', 2024)
  .order('year', { ascending: true })

// Returns:
// [
//   { year: 2020, dimension_value: 'iPhone', metric_value: 137781000000 },
//   { year: 2021, dimension_value: 'iPhone', metric_value: 191973000000 },
//   { year: 2020, dimension_value: 'Services', metric_value: 53768000000 },
//   ...
// ]

// Transformed client-side into:
// [
//   {
//     segment: 'iPhone',
//     data: [
//       { year: 2020, value: 137781000000 },
//       { year: 2021, value: 191973000000 },
//     ]
//   },
//   {
//     segment: 'Services',
//     data: [
//       { year: 2020, value: 53768000000 },
//       ...
//     ]
//   }
// ]
```

---

### Database Schema (Actual Implementation)

**Note**: The original plan proposed a new `segment_data` table, but the implementation uses the existing `company_metrics` table, which is more flexible.

**Storage in `company_metrics` table**:
```sql
-- Example row for iPhone revenue 2024
INSERT INTO company_metrics (
  symbol,              -- 'AAPL'
  year,                -- 2024
  period,              -- 'FY'
  metric_name,         -- 'segment_revenue'
  metric_value,        -- 201183000000 (dollars)
  unit,                -- 'currency'
  dimension_type,      -- 'product'
  dimension_value,     -- 'iPhone'
  data_source          -- 'SEC'
)
```

**Why This Approach**:
- ✅ Reuses existing table structure
- ✅ Consistent with other dimensioned metrics
- ✅ Flexible for future segment types
- ✅ No schema changes needed

---

### Data Coverage

**Product Segments** (5 segments × 5 years = 25 data points):
| Segment | Years Available |
|---------|----------------|
| iPhone | 2020-2024 |
| Mac | 2020-2024 |
| iPad | 2020-2024 |
| Wearables, Home and Accessories | 2020-2024 |
| Services | 2020-2024 |

**Geographic Segments** (5 segments × 5 years = 25 data points):
| Segment | Years Available |
|---------|----------------|
| Americas | 2020-2024 |
| Europe | 2020-2024 |
| Greater China | 2020-2024 |
| Japan | 2020-2024 |
| Rest of Asia Pacific | 2020-2024 |

**Total**: 50 rows in database (25 product + 25 geographic)

---

### Current Limitations

1. **Limited Historical Coverage**: Only 5 years (2020-2024) vs. original plan of 10 years (2015-present)
2. **Manual Data Entry**: Not automated - requires manual updates each year
3. **External Data Sources**: Data from Bullfincher/stockanalysis.com, not directly from SEC filings
4. **No Validation**: Segment totals are not automatically validated against total revenue from `financials_std`
5. **UI Integration**: Segment charts may not be fully integrated into the main charts page yet (separate component exists)

---

### Future Improvements

1. **Extend Historical Data**: Add 2015-2019 data (5 more years)
2. **Automated Extraction**: Implement LLM-based extraction from filing chunks (Option B from original plan)
3. **Data Validation**: Add automatic validation that segment totals match total revenue
4. **UI Integration**: Fully integrate segment selector into `/charts` page
5. **Data Source Tracking**: Track which source each data point came from (SEC filing vs. external source)

---

## File Summary

### Phase 1 Files (✅ Complete)

| File | Type | Status | Description |
|------|------|--------|-------------|
| `/app/charts/page.tsx` | New | ✅ Complete | Main charts page with state management, metric selection, year range slider |
| `/app/actions/chart-metrics.ts` | New | ✅ Complete | Server action for multi-metric fetching from `financials_std` |
| `/components/MetricSelector.tsx` | New | ✅ Complete | Dropdown for metric selection with checkboxes |
| `/components/MultiMetricChart.tsx` | New | ✅ Complete | Highcharts component with dual Y-axis support |
| `/components/Navigation.tsx` | Modify | ✅ Complete | Added "Charts" link to navigation |

### Phase 2 Files (✅ Partially Complete)

| File | Type | Status | Description |
|------|------|--------|-------------|
| `/scripts/ingest-segment-data.ts` | New | ✅ Complete | Data ingestion script with hardcoded segment data (2020-2024) |
| `/app/actions/segment-data.ts` | New | ✅ Complete | Server action for fetching segment data from `company_metrics` |
| `/components/SegmentChart.tsx` | New | ✅ Complete | Highcharts stacked column chart for segment visualization |
| `/app/charts/page.tsx` | Modify | ⚠️ Pending | UI integration for segment type selector (component exists but may not be integrated) |

---

## Dependencies

No new dependencies required. Uses existing:
- Highcharts (via `highcharts-react-official`)
- Supabase client
- Tailwind CSS

---

## Implementation Decisions Made

1. **Chart Default**: ✅ Defaults to Revenue on page load
2. **Metric Limit**: ✅ Allows up to 6 metrics to be added, but only 4 visible on chart at once
3. **Calculated Metrics**: ⚠️ Not yet implemented - Phase 1 uses raw metrics only
4. **Dual Y-Axes**: ✅ Implemented - Automatically uses dual axes when mixing currency and non-currency metrics

---

## Phase 2 Implementation Details

### Data Ingestion Process

**Script**: `scripts/ingest-segment-data.ts`

**How to Run**:
```bash
npx tsx scripts/ingest-segment-data.ts
```

**Process**:
1. **Load Data**: Reads hardcoded arrays from script
2. **Transform**: Converts millions to dollars (`value × 1,000,000`)
3. **Clear**: Deletes existing segment data for AAPL
4. **Insert**: Batch inserts 50 rows into `company_metrics`
5. **Verify**: Queries back and prints summary

**Output Example**:
```
Starting segment data ingestion...

Prepared 50 rows for insertion
- Product segments: 25 rows
- Geographic segments: 25 rows

Clearing existing segment data...
Existing data cleared.

Inserting new segment data...
Successfully inserted 50 rows!

Verification Summary:
==================================================

Product Segments by Year:
  FY2020: Total = $274.5B
    - iPhone: $137.8B
    - Mac: $28.6B
    - iPad: $23.7B
    - Wearables, Home and Accessories: $30.6B
    - Services: $53.8B
  FY2021: Total = $365.8B
    - iPhone: $192.0B
    - ...
```

---

### Server Action Implementation

**File**: `app/actions/segment-data.ts`

**Query Example**:
```typescript
// Fetch iPhone and Services revenue for 2020-2024
const result = await getSegmentData({
  segmentType: 'product',
  segments: ['iPhone', 'Services'],
  minYear: 2020,
  maxYear: 2024
})

// Returns:
{
  data: [
    {
      segment: 'iPhone',
      data: [
        { year: 2020, value: 137781000000 },
        { year: 2021, value: 191973000000 },
        { year: 2022, value: 205489000000 },
        { year: 2023, value: 200583000000 },
        { year: 2024, value: 201183000000 }
      ]
    },
    {
      segment: 'Services',
      data: [
        { year: 2020, value: 53768000000 },
        // ...
      ]
    }
  ],
  yearBounds: { min: 2020, max: 2024 },
  error: null
}
```

---

### Chart Component Features

**File**: `components/SegmentChart.tsx`

**Key Features Implemented**:
1. **Stacked Columns**: Default view shows segments stacked on top of each other
2. **Unstacked Toggle**: Can switch to side-by-side bars for comparison
3. **Data Labels**: Toggle to show/hide values on bars
4. **Export Options**: PNG, JPEG, PDF, SVG, CSV
5. **Data Table**: Collapsible table with all values
6. **Color Customization**: Supports custom colors via props
7. **Responsive**: Adapts to mobile screens
8. **Dark Mode**: Full theme support

**Chart Configuration**:
- Type: Column chart (Highcharts)
- Stacking: Normal (when stacked=true)
- Height: 650px
- Tooltip: Shows all segments + total for each year
- Legend: Floating, left-aligned
- Y-axis: Formatted as `$XXXB` (billions)

---

### Data Quality Notes

**Segment Totals**:
- Product segments should sum to total revenue
- Geographic segments should sum to total revenue
- Current implementation does not validate this automatically
- Manual verification shows totals are close but may have small discrepancies due to rounding or data source differences

**Data Accuracy**:
- Data sourced from external providers (Bullfincher, stockanalysis.com)
- Not directly extracted from SEC filings
- Should be validated against official 10-K filings for production use

---

## Phase 2 Usage Guide

### Running the Data Ingestion Script

**Prerequisites**:
- `.env.local` file with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Node.js environment with `tsx` available (or use `ts-node`)

**Command**:
```bash
npx tsx scripts/ingest-segment-data.ts
```

**What Happens**:
1. Script connects to Supabase using service role key
2. Prepares 50 rows (25 product + 25 geographic segments)
3. Deletes existing segment data for AAPL (idempotent)
4. Inserts new data in a single batch operation
5. Verifies insertion by querying back and printing summary

**Expected Output**:
```
Starting segment data ingestion...

Prepared 50 rows for insertion
- Product segments: 25 rows
- Geographic segments: 25 rows

Clearing existing segment data...
Existing data cleared.

Inserting new segment data...
Successfully inserted 50 rows!

Verification Summary:
==================================================

Product Segments by Year:
  FY2020: Total = $274.5B
    - iPhone: $137.8B
    - Mac: $28.6B
    - iPad: $23.7B
    - Wearables, Home and Accessories: $30.6B
    - Services: $53.8B
  FY2021: Total = $365.8B
    - iPhone: $192.0B
    - Mac: $35.2B
    - iPad: $31.9B
    - Wearables, Home and Accessories: $38.4B
    - Services: $68.4B
  ... (continues for all years)

Geographic Segments by Year:
  FY2020: Total = $294.1B
    - Americas: $129.5B
    - Europe: $72.7B
    - Greater China: $48.0B
    - Japan: $23.5B
    - Rest of Asia Pacific: $20.4B
  ... (continues for all years)

==================================================
Segment data ingestion complete!
```

### Using the Server Action

**Basic Usage**:
```typescript
import { getSegmentData } from '@/app/actions/segment-data'

// Fetch all product segments for all available years
const result = await getSegmentData({
  segmentType: 'product'
})

// Fetch specific segments for a year range
const result = await getSegmentData({
  segmentType: 'geographic',
  segments: ['Americas', 'Europe', 'Greater China'],
  minYear: 2020,
  maxYear: 2024
})
```

**Error Handling**:
```typescript
const result = await getSegmentData({
  segmentType: 'product',
  segments: ['iPhone', 'Services'],
  minYear: 2020,
  maxYear: 2024
})

if (result.error) {
  console.error('Error:', result.error)
  // Handle error (e.g., show user message)
} else if (result.data) {
  // Use result.data for charting
  // result.yearBounds contains { min: 2020, max: 2024 }
}
```

**Getting Available Segments**:
```typescript
import { getAvailableSegments } from '@/app/actions/segment-data'

const { segments, error } = await getAvailableSegments('product')
// Returns: ['iPhone', 'Services', 'Wearables, Home and Accessories', 'Mac', 'iPad']

const { segments: geo } = await getAvailableSegments('geographic')
// Returns: ['Americas', 'Europe', 'Greater China', 'Japan', 'Rest of Asia Pacific']
```

### Using the SegmentChart Component

**Basic Usage**:
```typescript
import SegmentChart from '@/components/SegmentChart'
import { getSegmentData } from '@/app/actions/segment-data'

export default function MyPage() {
  const [data, setData] = useState<SegmentData[]>([])
  
  useEffect(() => {
    async function load() {
      const result = await getSegmentData({ segmentType: 'product' })
      if (result.data) setData(result.data)
    }
    load()
  }, [])

  return (
    <SegmentChart
      data={data}
      segmentType="product"
      visibleSegments={['iPhone', 'Services', 'Mac']}
      stacked={true}
    />
  )
}
```

**With Custom Colors**:
```typescript
const customColors = {
  iPhone: '#ff0000',      // Red
  Services: '#00ff00',    // Green
  Mac: '#0000ff',         // Blue
}

<SegmentChart
  data={data}
  segmentType="product"
  visibleSegments={['iPhone', 'Services', 'Mac']}
  customColors={customColors}
  stacked={false}  // Side-by-side instead of stacked
/>
```

**Component Features**:
- **Data Labels**: Toggle checkbox to show/hide values on bars
- **Export Menu**: Click "Export" button for PNG, JPEG, PDF, SVG downloads
- **CSV Copy**: Click "Copy as CSV" to copy data to clipboard
- **Data Table**: Automatically displayed below chart with all values and totals
- **Responsive**: Adapts to mobile screens automatically
- **Theme Support**: Automatically uses dark/light theme from ThemeProvider

---

## Next Steps for Phase 2 Completion

1. **Extend Historical Coverage**: Add 2015-2019 data (5 more years)
   - Update `productSegmentData` and `geographicSegmentData` arrays in `ingest-segment-data.ts`
   - Run ingestion script again
   - Verify totals match `financials_std.revenue` for those years

2. **UI Integration**: Add segment type selector to `/charts` page
   - Add toggle/selector for "Product" vs "Geographic" segments
   - Add segment checkboxes (similar to metric checkboxes)
   - Integrate `SegmentChart` component alongside `MultiMetricChart`
   - Add year range controls (reuse existing slider logic)

3. **Data Validation**: Add automatic validation against `financials_std.revenue`
   - Create validation function in ingestion script
   - Compare segment totals to total revenue
   - Warn if discrepancies exceed threshold (e.g., 1%)
   - Add validation to server action for runtime checks

4. **Automated Extraction**: Implement LLM-based extraction for future years
   - Use existing `filing_chunks` table with embeddings
   - Create prompt to extract segment data from filing text
   - Parse LLM response into structured data
   - Validate and insert into `company_metrics`
   - Fallback to manual entry if extraction fails

5. **Data Source Tracking**: Add `data_source` field to track origin of each data point
   - Update ingestion script to use accurate sources:
     - `'SEC'` for data extracted from SEC filings
     - `'EXTERNAL'` for data from Bullfincher/stockanalysis.com
     - `'LLM_EXTRACTED'` for data extracted via LLM
   - Add UI indicator showing data source
   - Add data quality score based on source reliability