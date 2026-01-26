# Company Tab Implementation Plan

## Overview

Create a new "Company" tab at `/company/[symbol]` that displays a company summary page with:
1. **Segments Section** - Business segment and geographic segment breakdowns with revenue and percentage bars
2. **Fundamentals & Estimates Section** - Annual data table with FY columns and quarterly breakdown columns

This is based on the screenshot reference showing a Tesla-style company summary layout.

---

## Scope Clarification

**In scope:**
- Segments section (business + geographic)
- Fundamentals & Estimates table (annual + quarterly data)

**Out of scope (per user request):**
- Export to Excel functionality
- EPS and GAAP estimates sections (data not available)

---

## Section 1: Segments

### Layout
Two side-by-side tables:
- **Left**: Business Segment (e.g., Automotive, Energy Generation)
- **Right**: Geographic Segment (e.g., United States, International, China)

Each table shows:
- Segment name
- Revenue value
- Horizontal percentage bar with percentage label

### Data Source
- **Table**: `company_metrics`
- **Server Action**: `getSegmentData()` from `app/actions/segment-data.ts`
- Already supports both `product` and `geographic` segment types

### Implementation Steps

1. **Create a new component** `CompanySegmentsCard.tsx` in `/components/`
   - Props: `productSegments: SegmentData[]`, `geographicSegments: SegmentData[]`
   - Displays two columns side by side
   - For each segment: show name, revenue, and a percentage bar

2. **Percentage bar styling**:
   - Width proportional to segment's share of total
   - Use theme-aware colors (light blue/gray for light mode)
   - Display percentage value at end of bar

---

## Section 2: Fundamentals & Estimates

### Layout
A dense data table with:
- **Rows**: Revenue, EBITDA, EBIT, Pretax, Net Income, EPS, Operating Cash Flow, Capital Expenditure, Net Asset Value
- **Columns**: FY years (FY 2023, FY 2024) + quarterly columns (Q1 MAR, Q2 JUN, Q3 SEP, Q4 DEC) + future years

### Data Sources

| Metric | Source Table | Field |
|--------|--------------|-------|
| Revenue | `financials_std` | `revenue` |
| EBITDA | `financial_metrics` | `ebitda` |
| EBIT | `financial_metrics` | `operatingIncome` (or derive from financials_std) |
| Pretax | `financial_metrics` | `incomeBeforeTax` |
| Net Income | `financials_std` | `net_income` |
| EPS | `financials_std` | `eps` |
| Operating Cash Flow | `financials_std` | `operating_cash_flow` |
| Capital Expenditure | `financial_metrics` | `capitalExpenditure` |
| Net Asset Value | Calculate: `total_assets - total_liabilities` |

### Implementation Steps

1. **Create server action** `getCompanyFundamentals(symbol: string)` in `app/actions/company-fundamentals.ts`
   - Fetch annual data from `financials_std` (last 3-4 years)
   - Fetch quarterly data from `financials_std` (last 4-8 quarters)
   - Fetch extended metrics from `financial_metrics`
   - Return structured data with both annual and quarterly breakdowns

2. **Create component** `FundamentalsTable.tsx` in `/components/`
   - Props: annual data, quarterly data
   - Render table with year headers + quarterly sub-columns
   - Format values: use millions with "M" suffix, billions with no suffix (like screenshot)
   - Align numbers right, labels left

---

## Page Structure

### Route
`/app/company/[symbol]/page.tsx`

### Layout
```
Navigation
Stock Price Header (existing component)
────────────────────────────────────────
Segments Section
├── Business Segment table (left)
└── Geographic Segment table (right)
────────────────────────────────────────
Fundamentals & Estimates Section
└── Dense data table with FY + quarterly columns
────────────────────────────────────────
Footer
```

### Server Component Structure
```typescript
export default async function CompanyPage({ params }) {
  const symbol = (await params).symbol.toUpperCase()

  // Parallel data fetching
  const [overview, productSegments, geoSegments, fundamentals] = await Promise.all([
    getStockOverview(symbol),
    getSegmentData({ symbol, segmentType: 'product', periodType: 'annual' }),
    getSegmentData({ symbol, segmentType: 'geographic', periodType: 'annual' }),
    getCompanyFundamentals(symbol),
  ])

  return (
    <div>
      <Navigation />
      <StockPriceHeader {...} />
      <CompanySegmentsCard
        productSegments={productSegments}
        geographicSegments={geoSegments}
      />
      <FundamentalsTable data={fundamentals} />
      <Footer />
    </div>
  )
}
```

---

## Navigation Update

Update `components/Navigation.tsx`:
- Change the "Company" link from `/stock/[symbol]` to `/company/[symbol]`
- OR add a new "Summary" tab that goes to `/company/[symbol]`

---

## Files to Create/Modify

### New Files
1. `app/company/[symbol]/page.tsx` - Main company page
2. `app/actions/company-fundamentals.ts` - Server action for fundamentals data
3. `components/CompanySegmentsCard.tsx` - Segments display component
4. `components/FundamentalsTable.tsx` - Fundamentals table component

### Modified Files
1. `components/Navigation.tsx` - Update Company tab link

---

## Data Availability Check

Before implementation, verify data exists for:
- [ ] Product segments in `company_metrics` table
- [ ] Geographic segments in `company_metrics` table
- [ ] Quarterly financial data in `financials_std` table
- [ ] Extended metrics (EBITDA, Pretax, CapEx) in `financial_metrics` table

---

## Styling Notes

- Follow existing app styling patterns (rounded cards, gray backgrounds in dark mode)
- Use `bg-gray-100 dark:bg-[rgb(38,38,38)]` for card backgrounds
- Use `max-w-7xl` container width
- Table text: `text-sm` or `text-xs` for dense data
- Numbers right-aligned, labels left-aligned
- Segment percentage bars: horizontal, filled proportionally
