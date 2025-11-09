# Missing FMP API Data

## Current State

We're currently fetching from **5 endpoints**:
1. ✅ `key-metrics` - Key financial metrics (P/E, ROE, book value, etc.)
2. ✅ `ratios` - Financial ratios (current ratio, debt ratios, turnover ratios)
3. ✅ `financial-growth` - Growth rates (revenue growth, EPS growth, etc.)
4. ✅ `enterprise-values` - Enterprise value components (market cap, debt, cash)
5. ✅ `income-statement` - Revenue, expenses, EBITDA, margins (NEWLY ADDED)

## Missing Endpoints with Valuable Data

### 1. Balance Sheet Statement (`/balance-sheet-statement`)

**What it provides:**
- **Assets**: Cash, receivables, inventory, PP&E, investments, intangibles, goodwill
- **Liabilities**: Payables, short-term debt, long-term debt, deferred revenue
- **Equity**: Common stock, retained earnings, accumulated OCI
- **Calculated fields**: Total debt, net debt, total investments

**Why it's important:**
- We currently have basic balance sheet items (total_assets, total_liabilities, shareholders_equity) from `financials_std` table
- But we're missing detailed breakdowns like:
  - Current vs non-current assets/liabilities
  - PP&E (property, plant, equipment)
  - Working capital components (inventory, receivables, payables - detailed values, not just turnover ratios)
  - Debt structure (short-term vs long-term debt)
  - Cash vs investments breakdown

**Example data (AAPL 2025):**
```
cashAndCashEquivalents: $33.5B
inventory: $5.7B
propertyPlantEquipmentNet: $61.0B
shortTermDebt: $22.4B
longTermDebt: $89.9B
totalDebt: $112.4B
netDebt: $78.8B
```

### 2. Cash Flow Statement (`/cash-flow-statement`)

**What it provides:**
- **Operating Activities**: Net income adjustments, working capital changes, D&A, stock-based comp
- **Investing Activities**: Capex, acquisitions, investment purchases/sales
- **Financing Activities**: Debt repayment, stock repurchases, dividends
- **Calculated fields**: Free cash flow, operating cash flow, capex

**Why it's important:**
- We currently only have `operating_cash_flow` from `financials_std` table
- But we're missing:
  - **Free cash flow** (operating cash flow - capex) - critical metric!
  - Capital expenditures (capex) - investment in growth
  - Stock-based compensation - important for tech companies
  - Share buybacks and dividends - capital allocation
  - Working capital changes - operational efficiency
  - Debt repayment activity

**Example data (AAPL 2025):**
```
operatingCashFlow: $111.5B
capitalExpenditure: -$12.7B
freeCashFlow: $98.8B (calculated!)
commonStockRepurchased: -$90.7B (massive buybacks!)
dividendsPaid: -$15.4B
debtRepayment: -$8.5B
stockBasedCompensation: $12.9B
```

### 3. Statement Growth Endpoints (Optional)

- `/balance-sheet-statement-growth` - YoY growth rates for balance sheet items
- `/cash-flow-statement-growth` - YoY growth rates for cash flow items

We already have `/financial-growth` which covers income statement growth, so these are lower priority.

---

## Impact Analysis

### High Priority: Cash Flow Statement
**Critical Missing Metrics:**
1. **Free Cash Flow** - One of the most important metrics for valuation
2. **Capital Expenditure** - Understanding growth investment
3. **Share Buybacks** - Understanding capital allocation
4. **Stock-Based Compensation** - Especially important for tech companies

**Why we need this:**
- Users frequently ask about free cash flow
- FCF is critical for DCF valuation models
- Capex shows growth vs maintenance spending
- Buybacks show shareholder return strategy

### Medium Priority: Balance Sheet Statement
**Useful Missing Metrics:**
1. **Working Capital Components** - Cash, inventory, receivables, payables (absolute values)
2. **Debt Structure** - Short-term vs long-term debt breakdown
3. **PP&E** - Physical asset base
4. **Retained Earnings** - Accumulated profits

**Why we need this:**
- More granular liquidity analysis
- Better debt maturity understanding
- Asset-heavy vs asset-light business model analysis
- Historical profit accumulation

---

## Recommendation

### Phase 1: Add Cash Flow Statement (HIGH PRIORITY)
Add the following metrics from `/cash-flow-statement`:
- `freeCashFlow` - Free cash flow (operating CF - capex)
- `capitalExpenditure` - Capital expenditures
- `commonStockRepurchased` - Share buybacks
- `dividendsPaid` - Dividends (we have yield/payout ratio, but not absolute amount)
- `stockBasedCompensation` - Stock-based compensation expense
- `changeInWorkingCapital` - Working capital changes

### Phase 2: Add Balance Sheet Details (MEDIUM PRIORITY)
Add detailed balance sheet components:
- `cashAndCashEquivalents` - Cash only (we have total current assets)
- `inventory` - Inventory levels (we have turnover, not absolute value)
- `propertyPlantEquipmentNet` - PP&E net value
- `shortTermDebt` / `longTermDebt` - Debt maturity structure
- `retainedEarnings` - Accumulated retained earnings

---

## Data Coverage

Both endpoints have the same coverage as our current data:
- **20 years of annual data** (2006-2025)
- Quarterly data also available if needed
- Same structure and quality as income statement

---

## Current vs Enhanced Coverage

### Income Statement (Current Coverage: Good ✅)
- ✅ Revenue, gross profit, operating income, net income
- ✅ EBITDA, EBITDA margin
- ✅ Margins (gross, operating, net)
- ✅ EPS

### Balance Sheet (Current Coverage: Basic ⚠️)
- ✅ Total assets, total liabilities, shareholders equity
- ❌ Asset/liability breakdown
- ❌ Working capital components
- ❌ Debt structure

### Cash Flow (Current Coverage: Minimal ⚠️)
- ✅ Operating cash flow
- ❌ **Free cash flow** (CRITICAL!)
- ❌ Capex
- ❌ Buybacks and dividends
- ❌ Financing activities

---

## Next Steps

1. Add `/cash-flow-statement` endpoint to fetch script
2. Select 6-8 most valuable cash flow metrics
3. Add to metric metadata
4. Fetch and ingest data
5. Update tool prompts
6. Test with queries like "What's Apple's free cash flow?"
