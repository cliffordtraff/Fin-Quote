# Company Page Data Requirements for Multi-Ticker Support

This document outlines all the financial metrics required for the S&P 500 company pages, based on Finviz.com's layouts for Key Statistics, Balance Sheet, and Cash Flow.

## Overview

We have added all the Finviz metrics to our UI, but many fields show "N/A" because we haven't ingested the data yet. This document tracks what we have and what we need.

---

## Key Statistics Table

### Column 1: Company Info

| Metric | Status | Source |
|--------|--------|--------|
| Index | Missing | Need separate data source (S&P 500, NASDAQ, etc.) |
| Market Cap | Available | FMP Quote API (`marketCap`) |
| Enterprise Value | Available | FMP Key Metrics (`enterpriseValue`) |
| Income | Available | `financials_std.net_income` |
| Sales | Available | `financials_std.revenue` |
| Book/sh | Available | FMP Key Metrics (`bookValuePerShare`) |
| Cash/sh | Available | FMP Key Metrics (`cashPerShare`) |
| Dividend Est. | Missing | FMP Analyst Estimates API |
| Dividend TTM | Available | `financial_metrics.dividendPerShare` |
| Dividend Ex-Date | Missing | FMP Stock Dividend Calendar API |
| Dividend Gr. 3/5Y | Missing | Need to calculate from historical data |
| Payout | Available | `financial_metrics.payoutRatio` |
| Employees | Missing | FMP Company Profile (`fullTimeEmployees`) |
| IPO | Missing | FMP Company Profile (`ipoDate`) |

### Column 2: Valuation Ratios

| Metric | Status | Source |
|--------|--------|--------|
| P/E | Available | FMP Quote API (`pe`) |
| Forward P/E | Available | FMP Key Metrics (`forwardPE`) |
| PEG | Available | FMP Key Metrics (`pegRatio`) |
| P/S | Available | FMP Key Metrics (`priceToSalesRatio`) |
| P/B | Available | FMP Key Metrics (`pbRatio`) |
| P/C | Available | FMP Key Metrics (`pfcfRatio`) |
| P/FCF | Available | `financial_metrics.priceToFreeCashFlowsRatio` |
| EV/EBITDA | Available | FMP Key Metrics (`enterpriseValueOverEBITDA`) |
| EV/Sales | Missing | Need to calculate (EV / Revenue) |
| Quick Ratio | Available | `financial_metrics.quickRatio` |
| Current Ratio | Available | `financial_metrics.currentRatio` |
| Debt/Eq | Available | `financial_metrics.debtToEquity` |
| LT Debt/Eq | Missing | `financial_metrics.longTermDebtToCapitalization` |
| Option/Short | Missing | Separate data source needed |

### Column 3: EPS & Sales Growth

| Metric | Status | Source |
|--------|--------|--------|
| EPS (ttm) | Available | FMP Quote API (`eps`) |
| EPS next Y | Missing | FMP Analyst Estimates API |
| EPS next Q | Missing | FMP Analyst Estimates API |
| EPS this Y | Partial | `financial_metrics.netIncomeGrowth` |
| EPS next Y (growth) | Missing | FMP Analyst Estimates API |
| EPS next 5Y | Missing | FMP Analyst Estimates API |
| EPS past 3/5Y | Partial | `financial_metrics.threeYNetIncomeGrowthPerShare` |
| Sales past 3/5Y | Partial | `financial_metrics.threeYRevenueGrowthPerShare` |
| Sales Y/Y TTM | Available | `financial_metrics.revenueGrowth` |
| EPS Q/Q | Missing | Need quarterly data calculation |
| Sales Q/Q | Missing | Need quarterly data calculation |
| Earnings | Missing | FMP Earnings Calendar API |
| EPS Surpr. | Missing | FMP Earnings Surprises API |
| Sales Surpr. | Missing | FMP Earnings Surprises API |

### Column 4: Ownership & Returns

| Metric | Status | Source |
|--------|--------|--------|
| Insider Own | Missing | FMP Insider Trading API |
| Insider Trans | Missing | FMP Insider Trading API |
| Inst Own | Missing | FMP Institutional Holders API |
| Inst Trans | Missing | FMP Institutional Holders API |
| ROA | Available | `financial_metrics.returnOnAssets` |
| ROE | Available | `financial_metrics.returnOnEquity` |
| ROIC | Available | `financial_metrics.returnOnCapitalEmployed` |
| Gross Margin | Available | `financial_metrics.grossProfitMargin` |
| Oper. Margin | Available | `financial_metrics.operatingProfitMargin` |
| Profit Margin | Available | `financial_metrics.netProfitMargin` |
| SMA20 | Missing | FMP Technical Indicators API |
| SMA50 | Missing | FMP Technical Indicators API |
| SMA200 | Missing | FMP Technical Indicators API |
| Trades | Missing | Premium data source needed |

### Column 5: Shares & Volatility

| Metric | Status | Source |
|--------|--------|--------|
| Shs Outstand | Available | FMP Quote API (`sharesOutstanding`) |
| Shs Float | Missing | FMP Stock Screener or separate API |
| Short Float | Missing | FMP Short Interest API |
| Short Ratio | Missing | FMP Short Interest API |
| Short Interest | Missing | FMP Short Interest API |
| 52W High | Available | FMP Quote API (`yearHigh`) |
| 52W Low | Available | FMP Quote API (`yearLow`) |
| Volatility | Missing | Need to calculate from price history |
| ATR (14) | Missing | FMP Technical Indicators API |
| RSI (14) | Missing | FMP Technical Indicators API |
| Beta | Available | FMP Key Metrics (`beta`) |
| Rel Volume | Available | Calculated (`volume / avgVolume`) |
| Avg Volume | Available | FMP Quote API (`avgVolume`) |
| Volume | Available | FMP Quote API (`volume`) |

### Column 6: Performance

| Metric | Status | Source |
|--------|--------|--------|
| Perf Week | Missing | FMP Stock Price Change API |
| Perf Month | Missing | FMP Stock Price Change API |
| Perf Quarter | Missing | FMP Stock Price Change API |
| Perf Half Y | Missing | FMP Stock Price Change API |
| Perf YTD | Available | FMP Quote API (`ytdChange`) |
| Perf Year | Missing | FMP Stock Price Change API |
| Perf 3Y | Missing | Need to calculate from price history |
| Perf 5Y | Missing | Need to calculate from price history |
| Perf 10Y | Missing | Need to calculate from price history |
| Recom | Missing | FMP Analyst Estimates API |
| Target Price | Partial | FMP Quote API (`targetPrice`) |
| Prev Close | Available | FMP Quote API (`previousClose`) |
| Price | Available | FMP Quote API (`price`) |
| Change | Available | FMP Quote API (`changesPercentage`) |

### FMP API Endpoints for Key Statistics

| Data Category | FMP Endpoint |
|---------------|--------------|
| Real-time Quote | `GET /api/v3/quote/{symbol}` |
| Key Metrics | `GET /api/v3/key-metrics/{symbol}` |
| Financial Ratios | `GET /api/v3/ratios/{symbol}` |
| Company Profile | `GET /api/v3/profile/{symbol}` |
| Analyst Estimates | `GET /api/v3/analyst-estimates/{symbol}` |
| Earnings Calendar | `GET /api/v3/earning_calendar` |
| Earnings Surprises | `GET /api/v3/earnings-surprises/{symbol}` |
| Insider Trading | `GET /api/v4/insider-trading` |
| Institutional Holders | `GET /api/v3/institutional-holder/{symbol}` |
| Stock Price Change | `GET /api/v3/stock-price-change/{symbol}` |
| Technical Indicators | `GET /api/v3/technical_indicator/daily/{symbol}` |

---

## Balance Sheet

### Currently Available (from `financial_metrics` table)

| Metric | Database Field |
|--------|----------------|
| Total Assets | `financials_std.total_assets` |
| Total Liabilities | `financials_std.total_liabilities` |
| Total Shareholders Equity | `financials_std.shareholders_equity` |
| Book Value Per Share | `bookValuePerShare` |
| Tangible Book Value Per Share | `tangibleBookValuePerShare` |
| Price to Book Ratio | `priceToBookRatio` |
| Return on Assets | `returnOnAssets` |
| Return on Equity | `returnOnEquity` |
| Return on Invested Capital | `roic` |
| Quick Ratio | `quickRatio` |
| Current Ratio | `currentRatio` |

### Missing Data - Needs FMP Balance Sheet API Ingestion

FMP Endpoint: `https://financialmodelingprep.com/api/v3/balance-sheet-statement/{symbol}?period=annual&apikey=YOUR_KEY`

#### Assets
| Metric | FMP Field (likely) |
|--------|-------------------|
| Cash & Short Term Investments | `cashAndShortTermInvestments` |
| Short Term Receivables | `netReceivables` |
| Inventories | `inventory` |
| Other Current Assets | `otherCurrentAssets` |
| Total Current Assets | `totalCurrentAssets` |
| Net Property, Plant & Equipment | `propertyPlantEquipmentNet` |
| Total Investments and Advances | `longTermInvestments` |
| Long-Term Note Receivable | `longTermDebtNoncurrent` (or similar) |
| Intangible Assets | `intangibleAssets` or `goodwillAndIntangibleAssets` |
| Deferred Tax Assets | `deferredTaxAssetsNoncurrent` |
| Other Assets | `otherNonCurrentAssets` |

#### Liabilities
| Metric | FMP Field (likely) |
|--------|-------------------|
| Short Term Debt Incl. Current Port. of LT Debt | `shortTermDebt` |
| Accounts Payable | `accountPayables` |
| Income Tax Payable | `taxPayables` |
| Other Current Liabilities | `otherCurrentLiabilities` |
| Total Current Liabilities | `totalCurrentLiabilities` |
| Long Term Debt | `longTermDebt` |
| Provision for Risks Charges | (may not be available) |
| Deferred Tax Liabilities | `deferredTaxLiabilitiesNoncurrent` |
| Other Liabilities | `otherNonCurrentLiabilities` |

#### Equity
| Metric | FMP Field (likely) |
|--------|-------------------|
| Non-Equity Reserves | (may need calculation) |
| Preferred Stock - Carrying Value | `preferredStock` |
| Common Equity | `commonStock` |
| Accumulated Minority Interest | `minorityInterest` |
| Total Equity | `totalEquity` or `totalStockholdersEquity` |
| Total Liabilities & Stockholders Equity | `totalLiabilitiesAndStockholdersEquity` |

#### Other Data
| Metric | Source |
|--------|--------|
| Full-Time Employees | FMP Company Profile endpoint (`fullTimeEmployees`) |

---

## Cash Flow Statement

### Currently Available (from existing tables)

| Metric | Database Field |
|--------|----------------|
| Net Income | `financials_std.net_income` |
| Cash from Operating Activities | `financials_std.operating_cash_flow` |
| Depreciation | `depreciationAndAmortization` (financial_metrics) |
| Capital Expenditures | `capitalExpenditure` (financial_metrics) |
| Free Cash Flow | `freeCashFlow` (financial_metrics) |
| Cash Dividends Paid | `dividendsPaid` (financial_metrics) |
| Repurchase of Common Pref Stock | `commonStockRepurchased` (financial_metrics) |
| Price to Free Cash Flow | `priceToFreeCashFlowsRatio` (financial_metrics) |

### Missing Data - Needs FMP Cash Flow API Ingestion

FMP Endpoint: `https://financialmodelingprep.com/api/v3/cash-flow-statement/{symbol}?period=annual&apikey=YOUR_KEY`

#### Operating Activities
| Metric | FMP Field (likely) |
|--------|-------------------|
| Other Funds (Non Cash) | `otherNonCashItems` |
| Funds from Operations | (calculated: net income + D&A + other non-cash) |
| Extraordinary Item | `effectOfForexChangesOnCash` or similar |
| Changes in Working Capital | `changeInWorkingCapital` |
| Income Taxes Payable | `deferredIncomeTax` |

#### Investing Activities
| Metric | FMP Field (likely) |
|--------|-------------------|
| Net Assets From Acquisitions | `acquisitionsNet` |
| Sale of Fixed Assets and Businesses | `salesMaturitiesOfInvestments` (partial) |
| Purchase or Sale of Investments | `investmentsInPropertyPlantAndEquipment` |
| Purchase of Investments | `purchasesOfInvestments` |
| Sale Or Maturity of Investments | `salesMaturitiesOfInvestments` |
| Other Uses | `otherInvestingActivites` |
| Other Sources | (may be combined with other uses) |
| Cash from Investing Activities | `netCashUsedForInvestingActivites` |

#### Financing Activities
| Metric | FMP Field (likely) |
|--------|-------------------|
| Change in Capital Stock | `commonStockIssued` - `commonStockRepurchased` |
| Sale of Common Pref Stock | `commonStockIssued` |
| Proceeds from Stock Options | (may be part of commonStockIssued) |
| Issuance or Reduction of Debt, Net | `debtRepayment` + `netDebtProceeds` |
| Change in Long Term Debt | `netDebtProceeds` |
| Issuance of Long Term Debt | (part of debt issuance) |
| Reduction of Long Term Debt | `debtRepayment` |
| Net Financing Active Other Cash Flow | `otherFinancingActivites` |
| Other Financing Activities Uses | (may be combined) |
| Cash from Financing Activities | `netCashUsedProvidedByFinancingActivities` |

#### Summary
| Metric | FMP Field (likely) |
|--------|-------------------|
| Exchange Rate Effect | `effectOfForexChangesOnCash` |
| Net Change in Cash | `netChangeInCash` |
| Preferred Dividends (Cash Flow) | `preferredDividendsPaid` or similar |

---

## Implementation Plan

When building multi-ticker support for company pages:

### 1. Create New Ingestion Scripts

```bash
# Balance Sheet ingestion
npx tsx scripts/ingest-balance-sheet.ts

# Cash Flow Statement ingestion
npx tsx scripts/ingest-cash-flow.ts
```

### 2. Database Schema Changes

#### Option A: Separate Tables (Recommended)

```sql
-- Balance Sheet Details Table
CREATE TABLE balance_sheet_details (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period_type TEXT NOT NULL, -- 'annual' or 'quarterly'
  fiscal_quarter INTEGER,
  -- Assets
  cash_and_short_term_investments NUMERIC,
  net_receivables NUMERIC,
  inventory NUMERIC,
  other_current_assets NUMERIC,
  total_current_assets NUMERIC,
  property_plant_equipment_net NUMERIC,
  long_term_investments NUMERIC,
  intangible_assets NUMERIC,
  deferred_tax_assets NUMERIC,
  other_non_current_assets NUMERIC,
  -- Liabilities
  short_term_debt NUMERIC,
  accounts_payable NUMERIC,
  tax_payables NUMERIC,
  other_current_liabilities NUMERIC,
  total_current_liabilities NUMERIC,
  long_term_debt NUMERIC,
  deferred_tax_liabilities NUMERIC,
  other_non_current_liabilities NUMERIC,
  -- Equity
  preferred_stock NUMERIC,
  common_stock NUMERIC,
  retained_earnings NUMERIC,
  minority_interest NUMERIC,
  total_stockholders_equity NUMERIC,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, year, period_type, fiscal_quarter)
);

-- Cash Flow Details Table
CREATE TABLE cash_flow_details (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period_type TEXT NOT NULL,
  fiscal_quarter INTEGER,
  -- Operating Activities
  net_income NUMERIC,
  depreciation_and_amortization NUMERIC,
  stock_based_compensation NUMERIC,
  change_in_working_capital NUMERIC,
  other_non_cash_items NUMERIC,
  net_cash_from_operating NUMERIC,
  -- Investing Activities
  capital_expenditure NUMERIC,
  acquisitions_net NUMERIC,
  purchases_of_investments NUMERIC,
  sales_of_investments NUMERIC,
  other_investing_activities NUMERIC,
  net_cash_from_investing NUMERIC,
  -- Financing Activities
  dividends_paid NUMERIC,
  common_stock_issued NUMERIC,
  common_stock_repurchased NUMERIC,
  debt_repayment NUMERIC,
  debt_proceeds NUMERIC,
  other_financing_activities NUMERIC,
  net_cash_from_financing NUMERIC,
  -- Summary
  effect_of_forex NUMERIC,
  net_change_in_cash NUMERIC,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, year, period_type, fiscal_quarter)
);
```

#### Option B: Extend Existing `financials_std` Table

Add columns to the existing table (simpler but may get unwieldy).

### 3. Update Server Action

Update `get-all-financials.ts` to:
- JOIN with new tables
- Fall back to null for missing data
- Keep backward compatibility

### 4. Batch Ingestion for S&P 500

Create batch ingestion similar to existing `batch-ingest-financials.ts`:
- Rate limiting (FMP has limits)
- Progress tracking
- Error handling for missing tickers

---

## FMP API Endpoints Reference

| Statement | Endpoint |
|-----------|----------|
| Balance Sheet | `GET /api/v3/balance-sheet-statement/{symbol}` |
| Cash Flow Statement | `GET /api/v3/cash-flow-statement/{symbol}` |
| Income Statement | `GET /api/v3/income-statement/{symbol}` |
| Company Profile | `GET /api/v3/profile/{symbol}` |

Query parameters:
- `period=annual` or `period=quarter`
- `limit=10` (number of periods)
- `apikey=YOUR_KEY`

---

## Notes

- FMP provides both annual and quarterly data
- Consider rate limiting when batch ingesting for 500+ tickers
- Some fields may have different names across FMP API versions
- Test with a few tickers first (AAPL, MSFT, GOOGL) before full S&P 500 ingestion
- Some Finviz metrics may be calculated from multiple FMP fields
- "Period End Date" and "Period Length" from Finviz can be derived from the date fields
