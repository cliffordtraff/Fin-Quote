# Financial Metrics for AAPL

This document details all financial metrics (primitives and calculated) available for Apple Inc. (AAPL) in the Fin Quote system.

---

## Data Coverage

- **Ticker**: AAPL (Apple Inc.)
- **Years Available**: 2006 - 2025 (20 years)
- **Data Source**: Financial Modeling Prep API
- **Database Table**: `financials_std`

---

## Raw Financial Metrics (Primitives)

These metrics are stored directly in the database and fetched from the Financial Modeling Prep API.

### Income Statement Metrics

| Metric | Database Field | Description | Unit |
|--------|---------------|-------------|------|
| **Revenue** | `revenue` | Total revenue (sales) for the fiscal year | USD |
| **Gross Profit** | `gross_profit` | Revenue minus cost of goods sold (COGS) | USD |
| **Operating Income** | `operating_income` | Profit from core business operations (EBIT) | USD |
| **Net Income** | `net_income` | Bottom line profit after all expenses and taxes | USD |
| **EPS** | `eps` | Earnings per share (diluted) | USD per share |

### Balance Sheet Metrics

| Metric | Database Field | Description | Unit |
|--------|---------------|-------------|------|
| **Total Assets** | `total_assets` | Sum of all assets owned by the company | USD |
| **Total Liabilities** | `total_liabilities` | Sum of all debts and obligations | USD |
| **Shareholders' Equity** | `shareholders_equity` | Net worth of the company (Assets - Liabilities) | USD |

### Cash Flow Statement Metrics

| Metric | Database Field | Description | Unit |
|--------|---------------|-------------|------|
| **Operating Cash Flow** | `operating_cash_flow` | Cash generated from core business operations | USD |

---

## Calculated Financial Metrics (Derived)

These metrics are computed on-the-fly from raw metrics when requested. They are not stored in the database.

### Profitability Ratios

#### Gross Margin
- **Formula**: `(gross_profit / revenue) × 100`
- **Unit**: Percentage (%)
- **Description**: Percentage of revenue retained after accounting for cost of goods sold. Higher is better.
- **Interpretation**:
  - Shows how efficiently a company produces its goods
  - AAPL typically has high gross margins (40-45%) due to premium pricing

#### Return on Equity (ROE)
- **Formula**: `(net_income / shareholders_equity) × 100`
- **Unit**: Percentage (%)
- **Description**: Measures profitability relative to shareholders' equity. Shows how well the company generates profits from its equity capital.
- **Interpretation**:
  - Higher ROE = more efficient use of equity
  - AAPL has extremely high ROE (often >100%) due to share buybacks reducing equity

### Leverage Ratios

#### Debt-to-Equity Ratio
- **Formula**: `total_liabilities / shareholders_equity`
- **Unit**: Ratio (decimal)
- **Description**: Measures financial leverage by comparing total debt to shareholders' equity
- **Interpretation**:
  - Higher ratio = more leverage/debt
  - AAPL's ratio has increased over time as they've taken on debt and bought back shares

---

## Additional Calculated Metrics (Supported in Code)

The following calculated metrics are referenced in the codebase and can be computed from available raw data:

### Profitability Ratios

| Metric | Formula | Components | Description |
|--------|---------|------------|-------------|
| **Net Margin** | `(net_income / revenue) × 100` | `net_income`, `revenue` | Percentage of revenue that becomes profit |
| **Operating Margin** | `(operating_income / revenue) × 100` | `operating_income`, `revenue` | Profit margin from operations before interest and taxes |
| **ROA (Return on Assets)** | `(net_income / total_assets) × 100` | `net_income`, `total_assets` | How efficiently assets generate profit |

### Efficiency Ratios

| Metric | Formula | Components | Description |
|--------|---------|------------|-------------|
| **Asset Turnover** | `revenue / total_assets` | `revenue`, `total_assets` | How efficiently assets generate revenue |

---

## Metric Type Definitions (TypeScript)

### Raw Metrics
```typescript
export type RawFinancialMetric =
  | 'revenue'
  | 'gross_profit'
  | 'net_income'
  | 'operating_income'
  | 'total_assets'
  | 'total_liabilities'
  | 'shareholders_equity'
  | 'operating_cash_flow'
  | 'eps'
```

### Calculated Metrics
```typescript
export type CalculatedFinancialMetric =
  | 'debt_to_equity_ratio'
  | 'gross_margin'
  | 'roe'
```

### Combined
```typescript
export type FinancialMetric = RawFinancialMetric | CalculatedFinancialMetric
```

---

## Data Point Structure

Each metric data point returned by the API includes:

```typescript
export type FinancialMetricDataPoint = {
  year: number                    // Fiscal year
  value: number                   // The metric value
  metric: FinancialMetric         // Metric name
  revenue?: number | null         // Included for margin calculations
  shareholders_equity?: number | null  // Included for ROE/debt calculations
  total_assets?: number | null    // Included for ROA calculations
  total_liabilities?: number | null   // Included for leverage calculations
}
```

---

## Server Action API

### Function: `getAaplFinancialsByMetric`

**Purpose**: Fetch financial data for AAPL by metric type (raw or calculated)

**Parameters**:
```typescript
{
  metric: FinancialMetric  // The metric to fetch
  limit?: number           // Number of years (default: 4, max: 20)
}
```

**Returns**:
```typescript
{
  data: FinancialMetricDataPoint[] | null
  error: string | null
}
```

**Example Usage**:
```typescript
// Fetch revenue for last 10 years
const result = await getAaplFinancialsByMetric({
  metric: 'revenue',
  limit: 10
})

// Fetch ROE for last 5 years (calculated on-the-fly)
const roeResult = await getAaplFinancialsByMetric({
  metric: 'roe',
  limit: 5
})
```

---

## Query Constraints

- **Limit**: 1-20 years (enforced by server action)
- **Symbol**: Hardcoded to AAPL only (MVP constraint)
- **Sorting**: Always descending by year (most recent first)
- **Null Handling**: Calculated metrics return 0 if denominator is 0 or null

---

## Chart Support

All raw and calculated metrics support chart visualization via Highcharts:

- **Line charts**: For trends over time
- **Bar charts**: For year-over-year comparisons
- **Ratio charts**: Special formatting for percentages and ratios

See `lib/chart-helpers.ts` for chart generation logic.

---

## LLM Tool Selection

When users ask financial questions, the LLM selects the appropriate metric using natural language mapping:

| User Terms | Maps To Metric |
|------------|---------------|
| sales, revenue, top line | `revenue` |
| profit, bottom line, earnings | `net_income` |
| gross profit, COGS | `gross_profit` |
| EBIT, operating profit | `operating_income` |
| EPS, earnings per share | `eps` |
| assets | `total_assets` |
| debt, liabilities | `total_liabilities` |
| equity, book value | `shareholders_equity` |
| cash flow, OCF | `operating_cash_flow` |
| gross margin, profit margin | `gross_margin` |
| ROE, return on equity | `roe` |
| leverage, debt ratio | `debt_to_equity_ratio` |

See `lib/tools.ts` for the complete tool selection prompt with metric mappings.

---

## Data Validation

All financial data is validated during:
1. **Ingestion** (`scripts/ingest-financials.ts`)
2. **Answer generation** (`lib/validators.ts`)
3. **Display** (number formatting with B/M suffixes)

Validation checks:
- ✅ Number accuracy (±2% tolerance)
- ✅ Year correctness (only years in dataset)
- ✅ Magnitude (billions vs millions)
- ✅ Nullability (handle missing data gracefully)

---

## Future Expansions

Potential additional metrics that could be added:

### From Income Statement
- EBITDA (Operating Income + Depreciation + Amortization)
- R&D Expenses
- SG&A Expenses
- Interest Expense
- Tax Expense

### From Balance Sheet
- Current Assets
- Current Liabilities
- Long-term Debt
- Cash and Cash Equivalents
- Inventory

### From Cash Flow Statement
- Free Cash Flow (Operating Cash Flow - CapEx)
- Capital Expenditures (CapEx)
- Investing Cash Flow
- Financing Cash Flow

### Additional Ratios
- Current Ratio (Current Assets / Current Liabilities)
- Quick Ratio
- Debt-to-Assets
- Price-to-Earnings (requires stock price data)
- Dividend Yield (requires dividend data)

---

## References

- **Code Location**: `app/actions/financials.ts` (lines 64-305)
- **Database Schema**: `lib/database.types.ts` (lines 36-90)
- **Tool Definitions**: `lib/tools.ts`
- **Chart Helpers**: `lib/chart-helpers.ts`
- **Data Scripts**: `scripts/fetch-aapl-data.ts`, `scripts/ingest-financials.ts`
