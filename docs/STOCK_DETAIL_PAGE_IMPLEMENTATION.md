# Stock Detail Page Implementation Plan

## Overview

Create a comprehensive stock detail page at `/stock/AAPL` that displays all financial data, price charts, SEC filings, key metrics, and AI-powered insights in a single scrollable page (similar to finviz.com). This will serve as the primary destination for deep-dive stock analysis.

**Status**: Planning
**Priority**: High
**Target**: AAPL-only MVP (no multi-stock expansion planned)

---

## Goals

1. **Provide comprehensive stock information** in a single scrollable page with dense information architecture
2. **Leverage existing AI capabilities** for natural language financial analysis
3. **Reuse existing data infrastructure** (financials_std, financial_metrics, filings, prices)
4. **Create finviz-style experience** with all metrics visible at a glance
5. **Differentiate from competitors** through AI-first interface and grounded answers

---

## Page Structure

### URL Pattern
```
/stock/AAPL           # Single stock page for Apple (only AAPL supported)
```

### Layout Hierarchy (Single Scrollable Page)

```
┌─────────────────────────────────────────────────────────────┐
│ Navigation Bar (existing)                                   │
├─────────────────────────────────────────────────────────────┤
│ SECTION 1: Stock Header                                     │
│ - Company Name, Symbol, Sector                              │
│ - Current Price (real-time updates)                         │
│ - Price Change ($ and %)                                    │
│ - Market Status (Open/Closed/Pre-market/After-hours)        │
├─────────────────────────────────────────────────────────────┤
│ SECTION 2: Quick Stats Grid (finviz-style)                  │
│ - 3-4 column grid with 20+ key metrics                      │
│ - Market Cap, P/E, EPS, Beta, Div Yield, etc.               │
│ - Dense information display                                 │
├─────────────────────────────────────────────────────────────┤
│ SECTION 3: Price Chart                                      │
│ - Interactive chart (1D, 5D, 1M, 3M, 6M, 1Y, 5Y, MAX)      │
│ - Chart type toggle: Line, Candlestick, Area               │
│ - Volume overlay                                            │
├─────────────────────────────────────────────────────────────┤
│ SECTION 4: Financials Tables                                │
│ - Income Statement (table: 5 years side-by-side)            │
│ - Balance Sheet (table: 5 years side-by-side)               │
│ - Cash Flow (table: 5 years side-by-side)                   │
│ - All three visible without tabs                            │
├─────────────────────────────────────────────────────────────┤
│ SECTION 5: Financial Metrics Grid                           │
│ - All 139 metrics organized by category                     │
│ - Table format: Metric | Current | 1Y | 3Y | 5Y | Trend     │
│ - Collapsible categories                                    │
├─────────────────────────────────────────────────────────────┤
│ SECTION 6: SEC Filings                                      │
│ - Table of recent filings (10-K, 10-Q)                      │
│ - Search bar for semantic search                            │
├─────────────────────────────────────────────────────────────┤
│ SECTION 7: AI Insights Panel (Sticky Sidebar or Bottom)     │
│ - Quick chat interface                                      │
│ - Pre-populated questions                                   │
│ - "Ask about this metric" integration                       │
├─────────────────────────────────────────────────────────────┤
│ Footer (existing)                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Section Details

### Section 1: Stock Header

**Layout:**
- Full-width banner with dark background
- Left: Company name, symbol, sector, industry
- Center: Large price display with change indicator
- Right: Market status badge

**Content:**
- Company Name: "Apple Inc."
- Symbol: "AAPL"
- Sector: "Technology"
- Current Price: "$150.25" (large, prominent)
- Price Change: "+$2.50 (+1.69%)" (green/red based on direction)
- Market Status: Badge showing "Market Open" / "Pre-Market" / "After-Hours" / "Closed"

**Data Sources:**
- `company` table (name, sector)
- FMP API `/quote` endpoint (current price, change)
- `lib/market-utils.ts` (market status)

**Real-time Updates:**
- Client-side polling every 10s during market hours
- Pause polling when market closed
- Optimistic UI updates

---

### Section 2: Quick Stats Grid (Finviz-Style)

**Layout:**
- Dense 3-4 column grid
- Each cell: Label | Value
- Compact, information-dense design
- No cards, just clean table-like structure

**Metrics (20-30 key stats):**

**Column 1: Valuation**
- Market Cap
- Enterprise Value
- P/E Ratio
- Forward P/E
- PEG Ratio
- P/S Ratio
- P/B Ratio
- Price/Cash Flow

**Column 2: Performance**
- 52-Week High
- 52-Week Low
- YTD Return
- 1-Year Return
- 3-Year CAGR
- 5-Year CAGR
- Beta
- Average Volume

**Column 3: Profitability**
- Gross Margin
- Operating Margin
- Net Margin
- ROE
- ROA
- ROIC
- Revenue (TTM)
- Net Income (TTM)

**Column 4: Financial Health**
- Debt-to-Equity
- Current Ratio
- Quick Ratio
- Operating Cash Flow
- Free Cash Flow
- Dividend Yield
- Payout Ratio
- EPS (TTM)

**Data Sources:**
- `financial_metrics` table (latest year for all ratios)
- `financials_std` table (latest year for core metrics)
- FMP API (52-week high/low, volume, current metrics)

**Formatting:**
- $ values: B/M suffixes (e.g., "$383.3B")
- % values: 2 decimals (e.g., "28.5%")
- Ratios: 2 decimals (e.g., "1.25")
- Color coding: Green/red for positive/negative values where applicable

---

### Section 3: Price Chart

**Layout:**
- Full-width interactive chart
- Timeframe selector above chart: [1D] [5D] [1M] [3M] [6M] [1Y] [5Y] [MAX]
- Chart type toggle: [Line] [Candlestick] [Area]
- Volume bars below main chart

**Features:**
- Zoom/pan
- Crosshair tooltip with OHLCV data
- Responsive design
- Dark/light theme support

**Data Sources:**
- `getPrices()` server action (FMP API)
- Date ranges: from/to parameters based on selected timeframe

**Implementation:**
- Reuse/extend `FinancialChart.tsx` component
- Add candlestick chart type support via Highcharts
- Client-side state for timeframe/chart type selection

---

### Section 4: Financials Tables

**Layout:**
- Three separate tables, stacked vertically
- Each table: Rows = Metrics, Columns = Years (2024, 2023, 2022, 2021, 2020)
- Section headers: "Income Statement", "Balance Sheet", "Cash Flow Statement"
- No tabs, no toggling - all visible on scroll

**Income Statement Table:**
```
Metric                    2024        2023        2022        2021        2020
────────────────────────────────────────────────────────────────────────────────
Revenue                   $383.3B     $394.3B     $365.8B     $365.8B     $274.5B
Cost of Revenue           $214.1B     $223.5B     $212.3B     $210.4B     $169.6B
Gross Profit              $169.2B     $170.8B     $153.5B     $155.4B     $104.9B
  Gross Margin            44.1%       43.3%       42.0%       42.5%       38.2%
Operating Expenses        $54.8B      $51.3B      $48.9B      $46.2B      $38.7B
Operating Income          $114.4B     $119.5B     $104.6B     $109.2B     $66.2B
  Operating Margin        29.8%       30.3%       28.6%       29.9%       24.1%
Net Income                $97.0B      $96.9B      $94.7B      $94.7B      $57.4B
  Net Margin              25.3%       24.6%       25.9%       25.9%       20.9%
EPS (Basic)               $6.08       $6.11       $6.11       $5.67       $3.31
```

**Balance Sheet Table:**
```
Metric                    2024        2023        2022        2021        2020
────────────────────────────────────────────────────────────────────────────────
Total Assets              $364.0B     $352.8B     $352.8B     $351.0B     $323.9B
Current Assets            $143.6B     $135.4B     $135.4B     $134.8B     $143.7B
Cash & Equivalents        $29.9B      $30.7B      $23.6B      $34.9B      $38.0B
Total Liabilities         $290.0B     $279.4B     $279.4B     $287.9B     $258.5B
Current Liabilities       $145.3B     $133.9B     $133.9B     $125.5B     $105.4B
Long-term Debt            $95.3B      $95.3B      $98.9B      $109.1B     $107.0B
Shareholders' Equity      $74.0B      $73.4B      $73.4B      $63.1B      $65.3B
  Debt-to-Equity          1.29        1.30        1.35        1.73        1.64
  Current Ratio           0.99        1.01        1.01        1.07        1.36
```

**Cash Flow Statement Table:**
```
Metric                    2024        2023        2022        2021        2020
────────────────────────────────────────────────────────────────────────────────
Operating Cash Flow       $118.3B     $110.5B     $122.2B     $104.0B     $80.7B
Investing Cash Flow       -$8.8B      -$3.7B      -$22.4B     -$14.5B     -$4.3B
Financing Cash Flow       -$108.5B    -$108.5B    -$110.7B    -$93.4B     -$86.8B
Free Cash Flow            $111.4B     $99.6B      $111.4B     $92.9B      $73.4B
Capital Expenditures      $6.9B       $10.9B      $10.8B      $11.1B      $7.3B
```

**Data Sources:**
- `financials_std` table (core 9 metrics)
- `financial_metrics` table (calculated ratios if not in financials_std)

**Formatting:**
- $ values: B/M suffixes
- % values: 2 decimals for margins/ratios
- Negative values in red with minus sign
- Indented rows for calculated metrics (margins, ratios)

**Interactions:**
- Hover on any metric → Tooltip with definition
- Click metric name → "Ask AI about this metric" action
- Sticky table headers on scroll

---

### Section 5: Financial Metrics Grid

**Layout:**
- Large table grouped by category
- Collapsible category sections
- Columns: Metric Name | Current Value | 1Y Ago | 3Y Ago | 5Y Ago | 5Y Trend Sparkline

**Categories (Collapsible):**

**1. Valuation Ratios** (collapsed by default, expand on demand)
```
Metric                    Current    1Y Ago     3Y Ago     5Y Ago     Trend
─────────────────────────────────────────────────────────────────────────────
P/E Ratio                 28.5       27.8       25.4       18.2       [sparkline ↗]
P/B Ratio                 45.2       42.1       38.9       32.1       [sparkline ↗]
P/S Ratio                 7.8        7.2        6.5        5.1        [sparkline ↗]
EV/EBITDA                 22.1       21.5       20.3       17.8       [sparkline ↗]
PEG Ratio                 2.15       2.05       1.98       1.75       [sparkline ↗]
Market Cap                $2.5T      $2.4T      $2.1T      $1.3T      [sparkline ↗]
Enterprise Value          $2.6T      $2.5T      $2.2T      $1.4T      [sparkline ↗]
```

**2. Profitability & Returns**
```
ROE                       147%       145%       138%       105%       [sparkline ↗]
ROA                       22.4%      21.8%      20.1%      16.5%      [sparkline ↗]
ROIC                      51.2%      49.8%      47.3%      38.9%      [sparkline ↗]
Gross Margin              44.1%      43.3%      42.0%      38.2%      [sparkline ↗]
Operating Margin          29.8%      30.3%      28.6%      24.1%      [sparkline ↗]
Net Margin                25.3%      24.6%      25.9%      20.9%      [sparkline ↗]
```

**3. Leverage & Solvency**
```
Debt-to-Equity            1.29       1.30       1.35       1.64       [sparkline ↘]
Debt-to-Assets            0.26       0.27       0.28       0.33       [sparkline ↘]
Interest Coverage         25.3       24.8       22.1       18.5       [sparkline ↗]
Current Ratio             0.99       1.01       1.07       1.36       [sparkline ↘]
Quick Ratio               0.85       0.87       0.93       1.15       [sparkline ↘]
```

**4. Efficiency**
```
Asset Turnover            1.05       1.12       1.08       0.89       [sparkline ↗]
Inventory Turnover        34.2       32.8       31.5       29.1       [sparkline ↗]
Receivables Turnover      15.4       14.9       14.2       13.1       [sparkline ↗]
Days Sales Outstanding    23.7       24.5       25.7       27.9       [sparkline ↘]
```

**5. Growth Rates**
```
Revenue Growth (YoY)      -2.8%      7.8%       8.0%       5.5%       [sparkline ~]
EPS Growth (YoY)          -0.5%      0.0%       25.3%      16.0%      [sparkline ~]
Revenue CAGR (3Y)         4.3%       -          -          -          -
Revenue CAGR (5Y)         7.8%       -          -          -          -
EPS CAGR (5Y)             16.4%      -          -          -          -
```

**6. Per-Share Metrics**
```
Book Value per Share      $4.82      $4.68      $4.25      $3.85      [sparkline ↗]
Operating CF per Share    $7.65      $7.23      $6.89      $5.15      [sparkline ↗]
Free CF per Share         $7.20      $6.52      $6.21      $4.68      [sparkline ↗]
```

**7. Capital Returns & Share Data**
```
Dividend Yield            0.52%      0.55%      0.58%      0.75%      [sparkline ↘]
Payout Ratio              15.0%      15.2%      14.8%      22.6%      [sparkline ↘]
Share Buyback Ratio       5.8%       6.2%       5.5%       4.2%       [sparkline ↗]
Shares Outstanding        15.5B      15.8B      16.2B      17.1B      [sparkline ↘]
```

**Data Sources:**
- `financial_metrics` table (all 139 metrics)
- Query last 5 years of data for trend sparklines

**Features:**
- Category headers are clickable to expand/collapse
- Default: Show top 20 most important metrics, hide rest
- "Show All Metrics" button to expand all categories
- Search/filter box to find specific metrics
- Sparklines use `SimpleCanvasChart.tsx`

**Interactions:**
- Click metric name → Scroll to detailed chart section (future)
- "Ask AI" button next to each metric
- Sort by current value, 1Y change, 5Y change

---

### Section 6: SEC Filings

**Layout:**
- Table with filters
- Search bar above table for semantic search

**Table Columns:**
```
Filing Type | Period Ending | Filed Date | Fiscal Year | Quarter | Actions
─────────────────────────────────────────────────────────────────────────────
10-K        | Sep 30, 2024  | Nov 1, 2024| 2024        | FY      | [View] [Ask AI]
10-Q        | Jun 29, 2024  | Aug 1, 2024| 2024        | Q3      | [View] [Ask AI]
10-Q        | Mar 30, 2024  | May 2, 2024| 2024        | Q2      | [View] [Ask AI]
10-Q        | Dec 30, 2023  | Feb 1, 2024| 2024        | Q1      | [View] [Ask AI]
10-K        | Sep 30, 2023  | Nov 3, 2023| 2023        | FY      | [View] [Ask AI]
```

**Filters:**
- Filing Type dropdown: All / 10-K / 10-Q / 8-K
- Year range selector: Last 1Y / 3Y / 5Y / All

**Search Feature:**
- Input: "Search filings for..." (placeholder: e.g., "supply chain risks", "revenue guidance")
- Button: "Search"
- On search → Results panel appears below with passages + citations
- Uses `searchFilings()` server action (existing RAG)

**Actions:**
- **View**: Link to SEC EDGAR URL
- **Ask AI**: Opens chatbot with pre-filled question: "What are the key points in the 10-K filed on Nov 1, 2024?"

**Data Sources:**
- `filings` table (metadata)
- `filing_chunks` + `search_filing_chunks()` RPC (semantic search)

---

### Section 7: AI Insights Panel

**Layout Option A (Sticky Sidebar - Desktop):**
- Right sidebar (300px wide)
- Sticky positioning (stays visible on scroll)
- Compact chat interface
- Hidden on mobile (replaced with bottom sheet)

**Layout Option B (Bottom Section - All Devices):**
- Full-width section at bottom of page
- Always visible on scroll
- Horizontal layout on desktop, vertical on mobile

**Recommended: Option B** (simpler, works on all devices)

**Content:**
- **Header**: "Ask AI about AAPL"
- **Pre-populated Questions** (clickable chips):
  - "What's the revenue trend over the last 5 years?"
  - "How has gross margin changed?"
  - "What are the biggest risks in the latest 10-K?"
  - "Compare ROE to historical average"
  - "Why did net income decrease in 2024?"

- **Chat Input**: Text field with "Ask a question..." placeholder
- **Recent Answers** (if any): Show last 2-3 Q&A pairs

**Interactions:**
- Click pre-populated question → Send to chatbot, show answer
- Type custom question → Send, show streaming answer
- "Ask AI" buttons throughout page → Scroll to this section + pre-fill question

**Data Sources:**
- All existing server actions (financials, metrics, prices, filings, search)
- `conversations` and `messages` tables for history

**Implementation:**
- Reuse `AssistantChat.tsx` component
- Embed in stock page (not sidebar like homepage)
- Pass hardcoded symbol: 'AAPL'

---

## Component Architecture

### New Components

**1. `app/stock/aapl/page.tsx`**
- Main page component (Server Component)
- Fetches all initial data in parallel
- Renders all sections in single scrollable layout
- No tabs, no client-side routing

**2. `components/stock/StockHeader.tsx`**
- Section 1: Header with price, company info, market status
- Client component with real-time price polling
- Props: company, currentPrice, priceChange, marketStatus

**3. `components/stock/QuickStatsGrid.tsx`**
- Section 2: Dense grid of 20-30 key metrics
- Server component (pre-rendered with ISR)
- Props: stats (object with all key metrics)

**4. `components/stock/StockPriceChart.tsx`**
- Section 3: Interactive price chart
- Client component with timeframe/chart type state
- Wraps `FinancialChart.tsx` with candlestick support
- Props: initialData (7D default)

**5. `components/stock/FinancialsSection.tsx`**
- Section 4: Three financial statement tables
- Server component (or client with pre-loaded data)
- Sub-components:
  - `IncomeStatementTable.tsx`
  - `BalanceSheetTable.tsx`
  - `CashFlowTable.tsx`

**6. `components/stock/MetricsGrid.tsx`**
- Section 5: All 139 metrics in categorized table
- Client component with expand/collapse state
- Props: metrics (grouped by category), years (1Y, 3Y, 5Y data)

**7. `components/stock/FilingsSection.tsx`**
- Section 6: Filings table + search
- Client component with filter state
- Props: filings (list of recent filings)

**8. `components/stock/AIInsightsPanel.tsx`**
- Section 7: AI chat interface
- Client component (wraps `AssistantChat.tsx`)
- Props: symbol ('AAPL')

### Modified Components

**1. `FinancialChart.tsx`**
- Add candlestick chart type support
- Add price chart mode (vs financial metric mode)
- Ensure OHLCV data format support

**2. `AssistantChat.tsx`**
- No changes needed (already supports symbol prop)

### Reused Components

- `SimpleCanvasChart.tsx` - Sparklines in metrics grid
- `Navigation.tsx` - Top navigation
- `ThemeToggle.tsx` - Dark/light mode

---

## Server Actions

### New Server Actions

**1. `app/actions/stock-overview.ts`**
```typescript
export async function getStockOverview(): Promise<{
  company: { name: string; symbol: string; sector: string; industry: string };
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  marketStatus: 'open' | 'closed' | 'premarket' | 'afterhours';
}>
```
- Fetches current price from FMP API `/quote/AAPL`
- Fetches company info from `company` table (AAPL row)
- Determines market status using `lib/market-utils.ts`

**2. `app/actions/stock-key-stats.ts`**
```typescript
export async function getStockKeyStats(): Promise<{
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  forwardPE: number;
  pegRatio: number;
  priceToSales: number;
  priceToBook: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number;
  avgVolume: number;
  ytdReturn: number;
  oneYearReturn: number;
  threeYearCAGR: number;
  fiveYearCAGR: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  roic: number;
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  dividendYield: number;
  payoutRatio: number;
  eps: number;
  revenue: number;
  netIncome: number;
}>
```
- Fetches from `financial_metrics` table (latest year)
- Fetches from `financials_std` table (latest year for core metrics)
- Fetches from FMP API for real-time metrics (52-week high/low, volume, etc.)

**3. `app/actions/get-all-financials.ts`**
```typescript
export async function getAllFinancials(): Promise<{
  incomeStatement: Array<{year: number; revenue: number; costOfRevenue: number; ...}>;
  balanceSheet: Array<{year: number; totalAssets: number; totalLiabilities: number; ...}>;
  cashFlow: Array<{year: number; operatingCashFlow: number; investingCashFlow: number; ...}>;
}>
```
- Fetches last 5 years from `financials_std` table
- Returns all metrics organized by statement type

**4. `app/actions/get-all-metrics.ts`**
```typescript
export async function getAllMetrics(): Promise<{
  valuation: Array<{metricName: string; current: number; oneYearAgo: number; threeYearsAgo: number; fiveYearsAgo: number;}>;
  profitability: Array<...>;
  leverage: Array<...>;
  efficiency: Array<...>;
  growth: Array<...>;
  perShare: Array<...>;
  capitalReturns: Array<...>;
}>
```
- Fetches last 5 years from `financial_metrics` table
- Groups metrics by category (using `lib/metric-metadata.ts`)
- Returns data for sparklines and trend display

### Existing Server Actions (No Changes Needed)

- `getPrices()` - Already supports AAPL, custom date ranges
- `getRecentFilings()` - Already supports AAPL
- `searchFilings()` - Already supports AAPL
- `askQuestion()` - Already supports AAPL (hardcoded)

---

## Data Fetching Strategy

### Initial Page Load (Server Component)

```typescript
// app/stock/aapl/page.tsx
export default async function StockPage() {
  // Parallel data fetching
  const [overview, keyStats, financials, metrics, filings] = await Promise.all([
    getStockOverview(),
    getStockKeyStats(),
    getAllFinancials(),
    getAllMetrics(),
    getRecentFilings('AAPL', 20) // Last 20 filings
  ]);

  return (
    <div>
      <StockHeader {...overview} />
      <QuickStatsGrid stats={keyStats} />
      <StockPriceChart initialData={[]} /> {/* Fetch client-side for interactivity */}
      <FinancialsSection data={financials} />
      <MetricsGrid metrics={metrics} />
      <FilingsSection filings={filings} />
      <AIInsightsPanel symbol="AAPL" />
    </div>
  );
}

// ISR with 60s revalidation
export const revalidate = 60;
```

### Client-Side Data Fetching

**Price Chart:**
- Default: Load 7D data on mount
- On timeframe change: Fetch new data via `getPrices()`

**Real-time Price:**
- Poll `getStockOverview()` every 10s during market hours
- Update header price display

**AI Chat:**
- Fetch answers via `askQuestion()` on user input
- Stream responses using existing implementation

---

## UI/UX Design Decisions

### 1. Single Page Scroll vs Tabs

**Decision**: Single scrollable page (no tabs)

**Rationale:**
- Finviz-style dense information display
- Faster information scanning (no clicking required)
- Better for power users who want to see everything
- Simpler implementation (no tab state management)
- Better SEO (all content rendered on page)

**Trade-offs:**
- Longer initial page load (more data)
- May be overwhelming for casual users
- Larger bundle size

**Mitigations:**
- Use ISR to pre-render server-side (fast TTFB)
- Lazy load images and charts below fold
- Skeleton loaders for each section

### 2. Information Density

**Decision**: High information density (finviz-style)

**Design principles:**
- Compact table layouts (no excessive padding)
- Dense grids (3-4 columns on desktop)
- Minimal whitespace
- Small font sizes (but still readable)
- Efficient use of screen real estate

**Accessibility considerations:**
- Maintain WCAG AA contrast ratios despite compact design
- Ensure clickable areas are at least 44x44px
- Provide tooltips for abbreviations and dense data

### 3. Real-time Price Updates

**Decision**: Client-side polling during market hours

**Implementation:**
```typescript
useEffect(() => {
  if (marketStatus === 'open') {
    const interval = setInterval(async () => {
      const { currentPrice, priceChange, priceChangePercent } = await getStockOverview();
      setPrice({ currentPrice, priceChange, priceChangePercent });
    }, 10000); // 10s
    return () => clearInterval(interval);
  }
}, [marketStatus]);
```

### 4. Chart Interactivity

**Decision**: Use Highcharts for financial charts, Canvas for sparklines

**Features:**
- Zoom/pan on price chart
- Crosshair tooltip with OHLCV data
- Export to PNG/CSV
- Responsive sizing

**Sparklines:**
- Lightweight canvas-based charts in metrics grid
- No interactivity (static trend indicators)
- Fast rendering for 139+ metrics

### 5. Mobile Responsiveness

**Breakpoints:**
- Desktop (1024px+): Full 3-4 column layouts
- Tablet (768px-1023px): 2 column layouts, condensed tables
- Mobile (<768px): Single column, horizontal scroll for tables

**Mobile Optimizations:**
- Sticky header with price during scroll
- Collapsible sections (all collapsed by default on mobile)
- Horizontal scroll for wide financial tables
- Simplified price chart (line only, no candlestick on mobile)
- AI panel as bottom sheet (slide up on demand)

### 6. Dark Mode Support

**Decision**: Full dark mode support

**Implementation:**
- Tailwind dark mode classes throughout
- Highcharts dark theme for charts
- Ensure high contrast for tables and grids

### 7. Loading States

**Strategy:**
- Skeleton loaders for each section during SSR
- Inline spinners for client-side fetches (price updates, chart data)
- Optimistic updates for real-time price

**Skeleton Components:**
- `StockHeaderSkeleton.tsx`
- `QuickStatsGridSkeleton.tsx`
- `ChartSkeleton.tsx`
- `TableSkeleton.tsx`
- `MetricsGridSkeleton.tsx`

---

## Performance Optimization

### 1. Bundle Size

**Targets:**
- Initial page: <150 KB (gzipped)
- Total JS: <300 KB (gzipped)

**Optimizations:**
- Tree-shake unused Highcharts modules
- Lazy load AI chat component (below fold)
- Code split by route (stock page separate from homepage)

### 2. Rendering Performance

**Strategy:**
- Server-side render as much as possible (ISR)
- Minimize client-side JavaScript
- Virtualize long tables (if 139 metrics cause performance issues)

**Critical rendering path:**
- Prioritize above-fold content (header, quick stats, chart)
- Defer below-fold content (metrics grid, filings, AI panel)

### 3. Database Query Optimization

**Queries:**
- `getAllFinancials()`: Single query fetching last 5 years
- `getAllMetrics()`: Single query fetching last 5 years of all metrics
- Both use existing indexes on `fiscal_year` and `date` columns

**Caching:**
- ISR cache: 60s revalidation
- Server-side memoization for expensive calculations
- Client-side SWR/React Query for price updates

### 4. Image Optimization

**Not applicable** (no images beyond logo/icons)

---

## SEO Optimization

### 1. Metadata

```typescript
// app/stock/aapl/page.tsx
export const metadata = {
  title: 'Apple Inc. (AAPL) Stock - Financial Data, Metrics & AI Analysis | Fin Quote',
  description: 'Comprehensive financial analysis for Apple Inc. (AAPL). View income statements, balance sheets, cash flow, 139+ financial metrics, SEC filings, and AI-powered insights.',
  openGraph: {
    title: 'Apple Inc. (AAPL) Stock Analysis',
    description: 'Complete financial data and AI insights for Apple',
    images: ['/og-image-aapl.png'],
  },
};
```

### 2. Structured Data (JSON-LD)

```typescript
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Corporation",
  "name": "Apple Inc.",
  "tickerSymbol": "AAPL",
  "url": "https://www.apple.com",
  "description": "Technology company...",
};
```

### 3. URL Structure

**Simple, clean URL:**
- `/stock/aapl` (lowercase, SEO-friendly)

**Future consideration:**
- Canonical URL to handle case variations (/stock/AAPL → /stock/aapl)

### 4. Static Generation

**ISR with 60s revalidation:**
- Pre-render page at build time
- Revalidate every 60s in production
- Fast TTFB, always fresh data

---

## Testing Strategy

### 1. Unit Tests

**Components to test:**
- `QuickStatsGrid.tsx` - Number formatting, metric calculations
- `FinancialsSection.tsx` - Table rendering, data transformation
- `MetricsGrid.tsx` - Category expand/collapse, sorting, filtering
- `StockHeader.tsx` - Price formatting, market status logic

**Test framework:** Vitest + React Testing Library

### 2. Integration Tests

**Server Actions:**
- `getStockOverview()` - Fetch real data from FMP API
- `getAllFinancials()` - Query database, verify data shape
- `getAllMetrics()` - Query database, verify 139 metrics returned

**Test script:**
```bash
node scripts/test-stock-page.mjs
```

### 3. Performance Testing

**Lighthouse CI:**
- Target: Performance >90, Accessibility >95, SEO >95
- Test on desktop and mobile
- Monitor bundle size over time

**Load Testing:**
- Concurrent users viewing stock page
- Database query performance under load

---

## Analytics & Monitoring

### 1. Page View Tracking

**Events:**
- `stock_page_view` - Track AAPL page views
- `section_scroll` - Which sections users scroll to
- `metric_click` - Which metrics users interact with
- `ask_ai_click` - AI panel usage
- `chart_interaction` - Chart timeframe changes

### 2. Performance Monitoring

**Metrics:**
- Page load time (TTFB, FCP, LCP)
- Chart render time
- API response times
- Database query latency

**Tools:**
- Vercel Analytics
- Sentry for errors

### 3. User Behavior Insights

**Questions to answer:**
- What sections do users scroll to most?
- Which metrics do users view/expand?
- How often do users ask AI questions from stock page?
- Do users prefer table or chart views? (if we add toggle)

---

## Accessibility

### 1. Keyboard Navigation

- Tab through all interactive elements
- Enter/Space to expand/collapse sections
- Escape to close modals/tooltips

### 2. Screen Reader Support

- Semantic HTML (`<table>`, `<th>`, `<td>` for data tables)
- ARIA labels for charts
- `aria-live="polite"` for real-time price updates
- Proper heading hierarchy

### 3. Color Contrast

- WCAG AA compliance (4.5:1 text, 3:1 UI elements)
- Test dark mode separately
- Positive/negative indicators use icons (↑/↓) not just color

### 4. Focus Indicators

- Visible focus rings on all interactive elements
- High contrast in both light/dark modes

---

## Implementation Timeline

### Week 1: Setup & Core Infrastructure
- [ ] Create `/stock/aapl` route
- [ ] Build server actions: `getStockOverview()`, `getStockKeyStats()`, `getAllFinancials()`, `getAllMetrics()`
- [ ] Test data fetching with real AAPL data

### Week 2: Header & Quick Stats
- [ ] Build `StockHeader.tsx` with real-time price updates
- [ ] Build `QuickStatsGrid.tsx` with 30 key metrics
- [ ] Style with finviz-inspired design
- [ ] Add skeleton loaders

### Week 3: Charts & Financials
- [ ] Build `StockPriceChart.tsx` with Highcharts (candlestick support)
- [ ] Build `FinancialsSection.tsx` with 3 tables (Income, Balance, Cash Flow)
- [ ] Add responsive table styling
- [ ] Test chart interactivity

### Week 4: Metrics Grid & Filings
- [ ] Build `MetricsGrid.tsx` with 139 metrics, collapsible categories
- [ ] Add sparklines using `SimpleCanvasChart.tsx`
- [ ] Build `FilingsSection.tsx` with table + search
- [ ] Test semantic search integration

### Week 5: AI Panel & Polish
- [ ] Build `AIInsightsPanel.tsx` (embed `AssistantChat.tsx`)
- [ ] Add "Ask AI" buttons throughout page
- [ ] Implement pre-populated questions
- [ ] Mobile responsive testing
- [ ] Dark mode polish

### Week 6: Testing & Launch
- [ ] Unit tests for all components
- [ ] Integration tests for server actions
- [ ] Lighthouse performance audit
- [ ] Accessibility audit (axe DevTools)
- [ ] Deploy to staging
- [ ] Internal dogfooding
- [ ] Fix bugs and polish
- [ ] Deploy to production

---

## Success Metrics

### Launch Goals (30 days post-launch)

**Traffic:**
- 2,000 stock page views
- 300 unique visitors
- Average time on page: >3 minutes

**Engagement:**
- 25% of visitors ask AI questions from stock page
- 50% scroll to Financials section
- 30% expand Metrics grid

**Performance:**
- Page load time <2s (p50)
- Lighthouse Performance >90
- Zero critical errors

**SEO:**
- Page indexed by Google
- Rank in top 10 for "AAPL stock analysis"
- 50+ organic visits from search

---

## Future Enhancements

### 1. Chart Enhancements
- Add technical indicators (SMA, EMA, RSI, MACD)
- Drawing tools (trendlines, support/resistance)
- Comparison overlay (AAPL vs S&P 500)

### 2. Data Enhancements
- Quarterly financials (toggle annual/quarterly)
- Earnings calendar with transcripts
- Insider trading data
- Institutional ownership

### 3. AI Enhancements
- "Ask AI about this chart" (upload chart screenshot to vision model)
- Auto-generated insights ("Key takeaways from latest 10-K")
- Comparative analysis ("How does AAPL compare to MSFT?")

### 4. Personalization
- Customizable metrics (choose which 20 to show in Quick Stats)
- Save favorite sections (collapse others by default)
- Watchlist integration (if we add more stocks later)

---

## Conclusion

This single-page stock detail page will provide a comprehensive, finviz-style view of Apple Inc. (AAPL) with all financial data, metrics, filings, and AI-powered insights in one scrollable interface. The AAPL-only focus allows for rapid development and polish without the complexity of multi-stock infrastructure.

**Next Steps:**
1. Review and approve this plan
2. Set up `/stock/aapl` route
3. Build server actions (Week 1)
4. Start component development (Week 2)
5. Target launch: 6 weeks

**Key Advantages:**
- Dense, information-rich layout (finviz-style)
- No multi-stock complexity (AAPL-only)
- Reuses existing data infrastructure
- AI-first differentiation
- Fast time-to-market (6 weeks)
