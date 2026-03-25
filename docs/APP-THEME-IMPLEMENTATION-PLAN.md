# The Intraday - App Theme Implementation Plan

## Overview

This document outlines how to apply the sage/cream theme (established on the landing page) to all authenticated app pages: **Dashboard**, **Charts**, **Financials (Stock Pages)**, **Calendar**, and **Insiders**.

The goal is visual consistency across the entire application while:
- Maintaining all existing functionality
- Preserving dark mode support
- Using the Trinity Financial template as a style reference (not copying content)

---

## Current State Analysis

### Pages to Theme

| Page | Route | Navigation | Current Background |
|------|-------|------------|-------------------|
| Dashboard | `/dashboard` | AppNavigation | `bg-cream-100` (already updated) |
| Charts | `/charts` | Navigation | `bg-gray-50` |
| Stock/Financials | `/stock/[symbol]` | Navigation | `bg-gray-50` |
| Calendar | `/calendar` | Navigation | `bg-gray-50` |
| Insiders | `/insiders` | Navigation | `bg-gray-50` |

### Key Components Requiring Updates

| Component | Used By | Key Changes Needed |
|-----------|---------|-------------------|
| `Navigation.tsx` | Charts, Stock, Calendar, Insiders | Replace with `AppNavigation` or restyle |
| `MarketDashboardSunday.tsx` | Dashboard | Card styling, accent colors |
| `MultiMetricChart.tsx` | Charts | Chart colors, controls styling |
| `FinancialStatementsTabs.tsx` | Stock pages | Tab styling, table styling |
| `EconomicCalendar.tsx` | Calendar, Dashboard | Card and row styling |
| `EarningsCalendar.tsx` | Calendar, Dashboard | Card and row styling |
| `InsidersPageClient.tsx` | Insiders | Table and filter styling |
| `IndexSparklines.tsx` | Dashboard | Card borders, text colors |
| `SectorHeatmap.tsx` | Dashboard | Color scheme for sectors |
| `FuturesTable.tsx` | Dashboard | Table row styling |
| `MarketSessions.tsx` | Calendar | Card styling |

---

## Design System Reference

### Color Tokens (from tailwind.config.ts)

```
Light Mode:
- Page Background:     bg-cream-100      (#f5f5f0)
- Card Background:     bg-white          (#ffffff)
- Card Alt Background: bg-cream-50       (#fdfdfb)
- Border:              border-cream-300  (#e5e5e0)
- Primary Accent:      sage-500          (#5a6b4a)
- Primary Hover:       sage-600          (#4a5a3a)
- Primary Light:       sage-400          (#8a9b7a)
- Text Heading:        text-gray-900     (#1a1a1a)
- Text Body:           text-gray-600     (#4a4a4a)
- Text Muted:          text-gray-500     (#6b6b6b)

Dark Mode:
- Page Background:     bg-gray-900       (#111827)
- Card Background:     bg-gray-800       (#1f2937)
- Card Alt Background: bg-gray-850       (#1a1f2e)
- Border:              border-gray-700   (#374151)
- Primary Accent:      sage-400          (#8a9b7a)
- Primary Hover:       sage-300          (#b5bea6)
- Text Heading:        text-white
- Text Body:           text-gray-300
- Text Muted:          text-gray-400

Status Colors (both modes):
- Positive:            text-green-500    (#22c55e)
- Negative:            text-red-500      (#ef4444)
- Warning:             text-amber-500    (#f59e0b)
```

### Component Styling Patterns

**Cards (Primary)**
```tsx
// Light
className="bg-white rounded-2xl border border-cream-300 shadow-sm"
// Dark
className="dark:bg-gray-800 dark:border-gray-700"
// Combined
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 shadow-sm"
```

**Cards (Elevated)**
```tsx
className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg"
```

**Cards (Subtle/Nested)**
```tsx
className="bg-cream-50 dark:bg-gray-850 rounded-xl border border-cream-200 dark:border-gray-700"
```

**Primary Button**
```tsx
className="bg-sage-500 hover:bg-sage-600 text-white px-4 py-2 rounded-lg transition-colors"
// Dark mode adjustment
className="dark:bg-sage-600 dark:hover:bg-sage-500"
```

**Secondary Button**
```tsx
className="bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-cream-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
```

**Toggle/Tab Active State**
```tsx
// Active
className="bg-sage-500/10 dark:bg-sage-400/10 text-sage-600 dark:text-sage-400 font-medium"
// Inactive
className="text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
```

**Table Rows**
```tsx
// Default row
className="border-b border-cream-200 dark:border-gray-700"
// Hover
className="hover:bg-cream-50 dark:hover:bg-gray-800/50"
// Alternating (optional)
className="even:bg-cream-50 dark:even:bg-gray-800/30"
```

**Input Fields**
```tsx
className="bg-cream-50 dark:bg-gray-800 border border-cream-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
```

**Dropdown/Select**
```tsx
className="bg-white dark:bg-gray-800 border border-cream-300 dark:border-gray-700 rounded-lg shadow-lg"
```

---

## Phase 1: Foundation & Navigation

### 1.1 Unify Navigation Component

**Goal**: All app pages should use a consistent navigation that matches the landing page style.

**Options**:
1. **Option A (Recommended)**: Update all app pages to use `AppNavigation.tsx`
2. **Option B**: Restyle `Navigation.tsx` to match the new theme

**Changes to AppNavigation.tsx**:
```tsx
// Update accent colors from blue to sage
// Before: text-blue-600, bg-blue-500/10
// After:  text-sage-600, bg-sage-500/10

// Ensure the green underline accent matches
// border-b-2 border-sage-500
```

### 1.2 Update Global Background Colors

**Files to update**: All page.tsx files

Replace:
```tsx
// Old
bg-gray-50 dark:bg-[rgb(33,33,33)]
// New
bg-cream-100 dark:bg-gray-900
```

---

## Phase 2: Dashboard Components

The dashboard is the most complex page with many sub-components.

### 2.1 MarketDashboardSunday.tsx

**Section backgrounds**:
- Main container: Already `bg-cream-100 dark:bg-gray-900`
- Index cards: Update to new card style
- Sector heatmap container: New card style
- Tables: New table styling

### 2.2 IndexSparklines.tsx

```tsx
// Card wrapper
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 p-4"

// Index name
className="text-gray-900 dark:text-white font-medium"

// Price
className="text-gray-600 dark:text-gray-300"

// Change (positive)
className="text-green-500"

// Change (negative)
className="text-red-500"
```

### 2.3 SectorHeatmap.tsx

Update the color scale to incorporate sage tones for neutral/mixed sectors:
```tsx
// Strong positive: green-500
// Weak positive:   sage-400
// Neutral:         cream-300 / gray-600 (dark)
// Weak negative:   orange-400
// Strong negative: red-500
```

### 2.4 MarketTrendsCombined.tsx (Tabs)

```tsx
// Tab container
className="bg-cream-50 dark:bg-gray-800 rounded-lg p-1"

// Active tab
className="bg-white dark:bg-gray-700 text-sage-600 dark:text-sage-400 shadow-sm rounded-md px-3 py-1.5"

// Inactive tab
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1.5"
```

### 2.5 FuturesTable.tsx & Other Tables

```tsx
// Table header
className="bg-cream-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider"

// Table row
className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-800/50"

// Cell text
className="text-gray-900 dark:text-white"
className="text-gray-600 dark:text-gray-400" // secondary
```

### 2.6 TopGainerSparklines.tsx

```tsx
// Toggle buttons
// Active
className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded"
// or for losers
className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded"

// Inactive
className="text-gray-400 hover:text-gray-300"
```

### 2.7 EconomicCalendar.tsx & EarningsCalendar.tsx

```tsx
// Card wrapper
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 shadow-sm"

// Header
className="px-4 py-3 border-b border-cream-200 dark:border-gray-700"

// Event row
className="px-4 py-2 border-b border-cream-100 dark:border-gray-700/50 hover:bg-cream-50 dark:hover:bg-gray-800/50"

// Event time
className="text-xs text-gray-500 dark:text-gray-400"

// Event name
className="text-sm text-gray-900 dark:text-white font-medium"

// Impact badge
// High: bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400
// Medium: bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400
// Low: bg-cream-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400
```

---

## Phase 3: Charts Page

### 3.1 Page Background

```tsx
// app/charts/page.tsx
className="min-h-screen bg-cream-100 dark:bg-gray-900"
```

### 3.2 Main Card Container

```tsx
className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-cream-300 dark:border-gray-700"
```

### 3.3 Stock Selector & Metric Selector

```tsx
// Input field
className="bg-cream-50 dark:bg-gray-700 border border-cream-300 dark:border-gray-600 rounded-lg"

// Focus ring (replace blue)
className="focus:ring-2 focus:ring-sage-500 focus:border-sage-500"

// Dropdown items
className="hover:bg-sage-50 dark:hover:bg-sage-900/20"
```

### 3.4 Stock/Metric Tags (Checkboxes)

```tsx
// Tag container
className="bg-cream-100 dark:bg-gray-700 px-2 py-1 rounded-md"

// Stock symbol (replace blue with sage)
className="text-sm font-semibold text-sage-600 dark:text-sage-400"

// Checkbox accent (replace blue)
className="text-sage-600 focus:ring-sage-500"

// Remove button
className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
```

### 3.5 Period Toggle (Annual/Quarterly)

```tsx
// Container
className="bg-cream-100 dark:bg-gray-700 rounded-lg p-1"

// Active
className="bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm rounded-md"

// Inactive
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
```

### 3.6 Time Range Slider

```tsx
// Track
className="bg-cream-200 dark:bg-gray-600"

// Range (filled)
className="bg-sage-500 dark:bg-sage-400"

// Thumb
className="bg-white border-2 border-sage-500 dark:border-sage-400"

// Year labels
className="text-gray-500 dark:text-gray-400"
```

### 3.7 Chart Presets

```tsx
// Preset button
className="px-4 py-2 text-sm font-medium bg-cream-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-sage-100 dark:hover:bg-sage-900/20 hover:text-sage-700 dark:hover:text-sage-300 border border-cream-200 dark:border-gray-600"
```

### 3.8 MultiMetricChart.tsx Colors

For the chart itself, consider updating the default color palette to include sage tones:

```tsx
const COLOR_PALETTE_LIGHT = [
  '#1e3a5f', // Navy (primary - revenue)
  '#5a6b4a', // Sage green (secondary - profits)
  '#8b4513', // Saddle brown (tertiary)
  '#2d4a3e', // Forest green
  '#4a2c2c', // Burgundy
  '#3d3520', // Bronze
  // ... more colors
]

const COLOR_PALETTE_DARK = [
  '#6b8cce', // Soft blue
  '#8a9b7a', // Sage green
  '#c4956a', // Tan
  '#7ab08a', // Light sage
  '#c27878', // Dusty rose
  '#b8a870', // Khaki
  // ... more colors
]
```

---

## Phase 4: Stock/Financials Page

### 4.1 Page Layout

```tsx
// app/stock/[symbol]/page.tsx
className="min-h-screen bg-cream-100 dark:bg-gray-900"
```

### 4.2 StockPriceHeader.tsx

```tsx
// Price container
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 p-4"

// Company name
className="text-2xl font-semibold text-gray-900 dark:text-white"

// Symbol
className="text-sage-600 dark:text-sage-400 font-medium"

// Current price
className="text-3xl font-bold text-gray-900 dark:text-white"

// Change positive
className="text-green-500"

// Change negative
className="text-red-500"
```

### 4.3 FinancialStatementsTabs.tsx

```tsx
// Tab bar
className="border-b border-cream-200 dark:border-gray-700"

// Active tab
className="border-b-2 border-sage-500 text-sage-600 dark:text-sage-400 font-medium"

// Inactive tab
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"

// Table container
className="bg-white dark:bg-gray-800 rounded-xl border border-cream-300 dark:border-gray-700 overflow-hidden"

// Table header row
className="bg-cream-50 dark:bg-gray-700"

// Year columns
className="text-gray-900 dark:text-white font-medium"

// Metric rows
className="border-b border-cream-100 dark:border-gray-700/50 hover:bg-cream-50 dark:hover:bg-gray-800/50"
```

### 4.4 Key Stats Section

```tsx
// Stat card
className="bg-cream-50 dark:bg-gray-800 rounded-xl p-4"

// Stat label
className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"

// Stat value
className="text-lg font-semibold text-gray-900 dark:text-white"
```

### 4.5 CompanyDescription.tsx

```tsx
// Card
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 p-6"

// Description text
className="text-gray-600 dark:text-gray-300 leading-relaxed"

// "Show more" button
className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 text-sm font-medium"
```

### 4.6 NewsFeed.tsx

```tsx
// News item
className="border-b border-cream-200 dark:border-gray-700 py-4 hover:bg-cream-50 dark:hover:bg-gray-800/50"

// News title
className="text-gray-900 dark:text-white font-medium hover:text-sage-600 dark:hover:text-sage-400"

// News source/time
className="text-xs text-gray-500 dark:text-gray-400"
```

---

## Phase 5: Calendar Page

### 5.1 Page Layout

```tsx
// app/calendar/page.tsx
className="min-h-screen bg-cream-100 dark:bg-gray-900"
```

### 5.2 Page Title

```tsx
className="text-xl font-semibold text-gray-900 dark:text-white font-serif"
```

### 5.3 MarketSessions.tsx

```tsx
// Session card
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 p-4"

// Session status badge
// Open: bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400
// Closed: bg-cream-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400
// Pre-market: bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400
```

---

## Phase 6: Insiders Page

### 6.1 Page Layout

```tsx
// app/insiders/page.tsx
className="min-h-screen bg-cream-100 dark:bg-gray-900"
```

### 6.2 InsidersPageClient.tsx

```tsx
// Filter controls container
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 p-4 mb-6"

// Filter labels
className="text-sm font-medium text-gray-700 dark:text-gray-300"

// Filter inputs/selects
className="bg-cream-50 dark:bg-gray-700 border border-cream-300 dark:border-gray-600 rounded-lg"
```

### 6.3 Insider Trades Table

```tsx
// Table container
className="bg-white dark:bg-gray-800 rounded-2xl border border-cream-300 dark:border-gray-700 overflow-hidden"

// Table header
className="bg-cream-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"

// Buy transaction
className="text-green-500"

// Sell transaction
className="text-red-500"

// Insider name link
className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 font-medium"
```

---

## Phase 7: Dark Mode Verification

### Contrast Checks

Ensure all text/background combinations meet WCAG AA (4.5:1 for normal text):

| Element | Light Mode | Dark Mode | Ratio |
|---------|------------|-----------|-------|
| Body text on page bg | `gray-600` on `cream-100` | `gray-300` on `gray-900` | 7.0:1 / 7.3:1 |
| Heading on page bg | `gray-900` on `cream-100` | `white` on `gray-900` | 15.4:1 / 17.1:1 |
| Sage accent on white | `sage-600` on `white` | `sage-400` on `gray-800` | 5.2:1 / 4.8:1 |
| Muted text on card | `gray-500` on `white` | `gray-400` on `gray-800` | 6.0:1 / 5.4:1 |

### Focus States

All interactive elements must have visible focus indicators:
```tsx
className="focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
```

---

## Implementation Order

### Sprint 1: Global Changes (Day 1)
1. Update all page backgrounds to `bg-cream-100 dark:bg-gray-900`
2. Replace `Navigation` with `AppNavigation` on all app pages
3. Update AppNavigation accent colors (blue → sage)

### Sprint 2: Dashboard (Days 2-3)
1. Update MarketDashboardSunday card containers
2. Update IndexSparklines styling
3. Update all table components (Futures, Gainers, etc.)
4. Update EconomicCalendar and EarningsCalendar
5. Update TopGainerSparklines
6. Update SectorHeatmap color scheme

### Sprint 3: Charts Page (Day 4)
1. Update page layout and main card
2. Update selector components (Stock, Metric)
3. Update checkbox tags and toggles
4. Update time range slider colors
5. Update preset buttons
6. Review/update chart color palettes

### Sprint 4: Stock Pages (Days 5-6)
1. Update page layout
2. Update StockPriceHeader
3. Update FinancialStatementsTabs
4. Update key stats section
5. Update CompanyDescription
6. Update NewsFeed
7. Update FinancialMetricsCharts
8. Update StockInsiderTrades

### Sprint 5: Calendar & Insiders (Day 7)
1. Update Calendar page layout
2. Update MarketSessions
3. Update Insiders page layout
4. Update InsidersPageClient filters
5. Update insider trades table

### Sprint 6: Polish & QA (Day 8)
1. Dark mode testing on all pages
2. Mobile responsiveness check
3. Focus state verification
4. Color contrast verification
5. Cross-browser testing
6. Final visual consistency pass

---

## Files Checklist

### Pages
- [ ] `app/dashboard/page.tsx` - Already updated
- [ ] `app/charts/page.tsx`
- [ ] `app/stock/[symbol]/page.tsx`
- [ ] `app/calendar/page.tsx`
- [ ] `app/insiders/page.tsx`

### Navigation
- [ ] `components/AppNavigation.tsx` - Update accent colors
- [ ] `components/Navigation.tsx` - Deprecate or update

### Dashboard Components
- [ ] `components/MarketDashboardSunday.tsx`
- [ ] `components/IndexSparklines.tsx`
- [ ] `components/SectorHeatmap.tsx`
- [ ] `components/MarketTrendsCombined.tsx`
- [ ] `components/FuturesTable.tsx`
- [ ] `components/TopGainerSparklines.tsx`
- [ ] `components/EconomicCalendar.tsx`
- [ ] `components/EarningsCalendar.tsx`
- [ ] `components/MarketHeadlines.tsx`
- [ ] `components/MarketInsights.tsx`
- [ ] `components/ForexBondsTable.tsx`
- [ ] `components/MarketSessions.tsx`
- [ ] `components/TopInsiderTrades.tsx`

### Charts Components
- [ ] `components/MetricSelector.tsx`
- [ ] `components/StockSelector.tsx`
- [ ] `components/MultiMetricChart.tsx`

### Stock Page Components
- [ ] `components/StockPriceHeader.tsx`
- [ ] `components/StockPriceChart.tsx`
- [ ] `components/FinancialStatementsTabs.tsx`
- [ ] `components/FinancialMetricsCharts.tsx`
- [ ] `components/NewsFeed.tsx`
- [ ] `components/CompanyDescription.tsx`
- [ ] `components/StockInsiderTrades.tsx`
- [ ] `components/CompanySegmentsCard.tsx`
- [ ] `components/DiscoverMoreCarousel.tsx`

### Insiders Components
- [ ] `components/InsidersPageClient.tsx`
- [ ] `components/InsiderTradesTable.tsx`

---

## Visual Reference

The Trinity Financial template demonstrates:

1. **Clean card design** - Rounded corners (16-24px), subtle shadows, clear borders
2. **Generous whitespace** - Cards have breathing room, sections are well-separated
3. **Muted color palette** - Sage greens and creams as primary colors, not competing with data
4. **Typography hierarchy** - Serif for headings (optional), clean sans-serif for data
5. **Subtle decorative elements** - Geometric patterns as accents, not distractions
6. **Data-forward design** - Colors enhance readability, don't distract from numbers

The key principle: **The UI should support the financial data, not compete with it.**

---

## Notes

- **Don't break functionality**: All existing features must work identically
- **Mobile-first**: Test all changes on mobile viewports
- **Performance**: Avoid adding unnecessary CSS or components
- **Consistency**: If updating one table, update all tables the same way
- **Dark mode**: Every light mode color change needs a dark mode counterpart

---

*Document created: February 8, 2026*
