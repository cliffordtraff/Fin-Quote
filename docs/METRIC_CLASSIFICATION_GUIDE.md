# Metric Classification Guide

## Introduction

This guide explains how to classify financial metrics when adding new companies and data to the Fin Quote charting platform. Proper classification ensures data consistency, enables meaningful comparisons, and maintains a well-organized database as the platform scales.

---

## Background: Why We Need Classification

### The Problem We're Solving

Fin Quote is a financial data platform that extracts metrics from SEC filings and displays them in interactive charts. We started with Apple (AAPL) and plan to expand to many more companies.

The challenge: **Different companies report different types of metrics**, and we need a systematic way to organize them.

Consider these examples:
- Apple reports **iPhone revenue** (a product segment)
- Amazon reports **Subscription services revenue** (a revenue category)
- Roblox reports **Daily Active Users** (a non-financial KPI)
- NVIDIA reports **Inventories** (a standard balance sheet item)

These are all "metrics," but they're fundamentally different types of data with different regulatory requirements and meanings. Lumping them together without classification would create confusion and make the data harder to query, display, and analyze.

### Our Solution: Accounting-Based Taxonomy

We classify metrics based on their **accounting and regulatory basis**. This isn't arbitrary - it reflects how companies are actually required (or choose) to report data under U.S. GAAP and SEC rules.

The classification system has three categories:

| Category | Accounting Basis | Required? |
|----------|------------------|-----------|
| `segment_reporting` | ASC 280 | Yes |
| `revenue_disaggregation` | ASC 606 | Partially |
| `operating_kpi` | None (voluntary) | No |

There's also a fourth implicit category: **standard financials** (revenue, net income, assets, etc.) which belong in separate tables (`financials_std`, `financial_metrics`) rather than the `company_metrics` table.

---

## The Three Categories Explained

### 1. Segment Reporting (ASC 280)

**What it is**: Revenue and profit broken down by operating segments that management uses to run the business.

**Accounting standard**: ASC 280 - Segment Reporting

**Regulatory requirement**: Mandatory for public companies

#### What Makes Something a "Segment"?

Under GAAP, a **reportable segment** must meet these criteria:

1. **Engages in business activities** that generate revenue and incur expenses
2. **Reviewed by the CODM**: The Chief Operating Decision Maker (usually the CEO) regularly reviews its operating results
3. **Discrete financial information**: Separate financial data is available for it

The key insight: **Segments reflect how management actually runs the company.** If the CEO looks at "Data Center" as a separate business unit with its own profit responsibility, it's a segment.

#### Examples by Company

| Company | Segments | Why These Are Segments |
|---------|----------|------------------------|
| **Apple** | iPhone, Mac, iPad, Services, Wearables | Apple's CEO reviews each product line's performance separately |
| **Apple** | Americas, Europe, Greater China, Japan, Rest of Asia Pacific | Geographic segments with separate P&L responsibility |
| **NVIDIA** | Data Center, Gaming, Professional Visualization, Automotive | Each has its own revenue AND operating income reported |
| **Amazon** | North America, International, AWS | Three distinct business units with separate financials |
| **Microsoft** | Productivity & Business Processes, Intelligent Cloud, More Personal Computing | How Microsoft's management structure is organized |
| **Alphabet** | Google Services, Google Cloud, Other Bets | Separate operating units with distinct strategies |

#### What Segment Data Looks Like in Filings

In a 10-K, you'll find segment data in "Note X - Segment Information" or similar. It typically includes:
- Segment revenue
- Segment operating income (or profit)
- Sometimes segment assets

The distinguishing feature: **Each segment has its own profitability metrics**, not just revenue.

#### Database Values

```
metric_category: 'segment_reporting'
metric_name: 'segment_revenue' or 'segment_operating_income'
dimension_type: 'product', 'geographic', or 'segment'
dimension_value: 'iPhone', 'Data Center', 'AWS', etc.
```

---

### 2. Revenue Disaggregation (ASC 606)

**What it is**: Total revenue broken down by categories that show how economic factors affect revenue patterns.

**Accounting standard**: ASC 606 - Revenue from Contracts with Customers

**Regulatory requirement**: Partially mandatory (see below)

#### The Nuance: Required Act, Chosen Categories

ASC 606 requires companies to "disaggregate revenue into categories that depict how the nature, amount, timing, and uncertainty of revenue and cash flows are affected by economic factors."

However, **the standard does not prescribe which categories to use.** Companies choose their own disaggregation approach based on what they believe is meaningful. Common approaches:

| Disaggregation Type | Example |
|---------------------|---------|
| By product/service type | Amazon: Online stores, Physical stores, Third-party seller services, Subscription services, Advertising, AWS |
| By geography | Netflix: UCAN, EMEA, LATAM, APAC |
| By customer type | Monday.com: Enterprise vs. SMB |
| By sales channel | Nike: Direct vs. Wholesale |
| By timing of recognition | Point-in-time vs. over-time revenue |
| By contract type | Subscription vs. transactional |

Once a company chooses a disaggregation method, they must apply it consistently. But the specific categories are their choice.

#### Segment vs. Disaggregation: The Critical Distinction

This is the most confusing part of the classification system. Here's how to tell them apart:

**Segment (ASC 280)**:
- Has its own **operating income/profit** reported
- Managed as a **separate business unit**
- CEO reviews it as a distinct operation

**Disaggregation (ASC 606)**:
- Only shows **revenue** breakdown
- No separate P&L - just splits total revenue into categories
- May cut across segments or exist within a single segment

#### Example: Amazon

Amazon has **3 segments** (ASC 280):
- North America
- International
- AWS

Amazon also disaggregates revenue into **6 categories** (ASC 606):
- Online stores
- Physical stores
- Third-party seller services
- Subscription services
- Advertising services
- AWS

Notice: "Subscription services" is a disaggregation category, not a segment. Amazon doesn't report "Subscription services operating income" - it's just a revenue line item within the North America and International segments.

AWS appears in both because it's large enough to be both a segment AND a revenue category.

#### Database Values

```
metric_category: 'revenue_disaggregation'
metric_name: 'revenue_by_category', 'revenue_by_channel', 'revenue_by_timing'
dimension_type: 'product_category', 'channel', 'customer_type', 'timing'
dimension_value: 'Subscription services', 'Enterprise', 'Direct', etc.
```

---

### 3. Operating KPIs (Voluntary Disclosure)

**What it is**: Company-specific metrics that help investors understand business performance beyond GAAP financials.

**Accounting standard**: None

**Regulatory requirement**: Completely voluntary

#### Why Companies Disclose KPIs

GAAP financials tell you revenue and profit, but they don't tell the full story. Investors want to understand:

- **Scale**: How big is the platform? (users, subscribers, stores)
- **Engagement**: How active are users? (DAU, MAU, time spent)
- **Unit economics**: How efficient is the business? (revenue per user, cost per acquisition)
- **Growth drivers**: What's fueling growth? (new stores, new subscribers)

Companies voluntarily disclose these metrics because:
1. Investors demand them
2. They help tell the company's story
3. Analysts use them in valuation models
4. Competitors disclose them (competitive pressure)

#### Common Types of Operating KPIs

| KPI Type | Examples | Companies |
|----------|----------|-----------|
| **User metrics** | DAU, MAU, subscribers | Meta, Roblox, Netflix, Spotify |
| **Store/location count** | Restaurant count, store count | Starbucks, Chipotle, Kava |
| **Assets under management** | AUM, AUC (assets under custody) | BlackRock, Robinhood, Schwab |
| **Transaction metrics** | Gross bookings, GMV, trips | Uber, Airbnb, eBay |
| **Unit economics** | ARPU, revenue per launch | Netflix, Rocket Lab |
| **Industry-specific** | Deposits (banks), premiums written (insurance) | Nu Bank, Progressive |

#### Important: KPIs Are Not Audited

Unlike GAAP financials (which are audited) and segment data (which is part of audited financials), operating KPIs are typically:
- Disclosed in MD&A (Management Discussion & Analysis)
- Disclosed in earnings releases
- Disclosed in investor presentations
- **Not subject to the same audit scrutiny**

This doesn't mean they're unreliable, but it's worth noting the distinction.

#### Database Values

```
metric_category: 'operating_kpi'
metric_name: 'daily_active_users', 'store_count', 'assets_under_custody', 'arpu', etc.
dimension_type: 'geographic' (if broken down) or NULL (if company-wide total)
dimension_value: 'US', 'EMEA', etc. or NULL
unit: 'count', 'currency', 'percentage'
```

---

## What Doesn't Belong in company_metrics

The `company_metrics` table is for **company-specific dimensional data**. Standard GAAP line items belong elsewhere:

| Data Type | Table | Examples |
|-----------|-------|----------|
| Income statement | `financials_std` | Revenue, gross profit, net income, EPS |
| Balance sheet | `financials_std` | Total assets, total liabilities, shareholders' equity |
| Cash flow | `financials_std` | Operating cash flow, capex, free cash flow |
| Financial ratios | `financial_metrics` | P/E, ROE, debt-to-equity, margins |
| **Segment data** | `company_metrics` | iPhone revenue, AWS revenue |
| **Revenue disaggregation** | `company_metrics` | Subscription revenue, enterprise % |
| **Operating KPIs** | `company_metrics` | DAU, store count, AUM |

**Example**: NVIDIA's "Inventories" is a standard balance sheet line item. It goes in `financials_std`, not `company_metrics`. But NVIDIA's "Data Center revenue" is segment data and belongs in `company_metrics`.

---

## The Classification Framework

Use this decision tree when classifying a new metric:

```
START: What type of data is this?
│
├── Standard GAAP line item? (revenue, net income, assets, liabilities, cash flow)
│   └── YES → Use financials_std or financial_metrics, NOT company_metrics
│
└── NO → Is it REVENUE data?
    │
    ├── YES → Is it broken down by OPERATING SEGMENT?
    │   │    (Does this segment have its own operating income reported?)
    │   │
    │   ├── YES → segment_reporting (ASC 280)
    │   │         Examples: Apple iPhone, NVIDIA Data Center, Amazon AWS
    │   │
    │   └── NO → revenue_disaggregation (ASC 606)
    │             Examples: Amazon Subscriptions, Monday.com Enterprise %
    │
    └── NO → Is it a company-specific performance metric?
        │
        ├── YES → operating_kpi (voluntary)
        │         Examples: DAU, store count, AUC, ARPU
        │
        └── NO → Probably doesn't belong in company_metrics
                 (Might be a standard financial ratio → financial_metrics)
```

### Quick Reference Questions

When you encounter a new metric, ask yourself:

1. **Is this a standard GAAP line item?** (revenue, net income, assets)
   - YES → Don't use `company_metrics`

2. **Is this revenue broken down by something?**
   - YES → Continue to question 3
   - NO → Probably `operating_kpi` or doesn't belong

3. **Does this breakdown have its own P&L (operating income)?**
   - YES → `segment_reporting`
   - NO → `revenue_disaggregation`

4. **Is this a non-financial metric (users, stores, units)?**
   - YES → `operating_kpi`

---

## Worked Examples

Let's classify some real metrics using the framework:

### Example 1: Apple iPhone Revenue

1. Standard GAAP line item? NO (it's a breakdown of revenue)
2. Is it revenue data? YES
3. Does iPhone have its own operating income reported? YES (Apple reports segment operating income)
4. **Classification: `segment_reporting`**

### Example 2: Amazon Subscription Services Revenue

1. Standard GAAP line item? NO (it's a breakdown of revenue)
2. Is it revenue data? YES
3. Does "Subscription services" have its own operating income? NO (only North America, International, and AWS have segment P&Ls)
4. **Classification: `revenue_disaggregation`**

### Example 3: Roblox Daily Active Users

1. Standard GAAP line item? NO
2. Is it revenue data? NO (it's a user count)
3. Is it a company-specific performance metric? YES
4. **Classification: `operating_kpi`**

### Example 4: NVIDIA Inventories

1. Standard GAAP line item? YES (balance sheet item)
2. **Classification: Use `financials_std`, not `company_metrics`**

### Example 5: Monday.com % Revenue from Enterprise

1. Standard GAAP line item? NO
2. Is it revenue data? YES (it's a percentage of revenue)
3. Does "Enterprise" have its own operating income? NO (Monday.com doesn't report segment P&Ls by customer type)
4. **Classification: `revenue_disaggregation`**

### Example 6: Robinhood Assets Under Custody

1. Standard GAAP line item? NO (AUC is brokerage-specific)
2. Is it revenue data? NO (it's an asset metric)
3. Is it a company-specific performance metric? YES
4. **Classification: `operating_kpi`**

### Example 7: Nu Bank Total Deposits

1. Standard GAAP line item? Technically yes for banks, but...
2. Is it revenue data? NO (deposits are liabilities)
3. Is it a company-specific performance metric? YES (it's a key banking KPI)
4. **Classification: `operating_kpi`**

Note: Bank accounting is complex. Deposits are on the balance sheet, but fintech companies like Nu Bank often highlight them as KPIs because deposit growth signals customer trust and funding capacity.

### Example 8: Progressive Premiums Written

1. Standard GAAP line item? NO (insurance uses different revenue recognition)
2. Is it revenue data? Sort of (but "premiums earned" is GAAP revenue, not "premiums written")
3. Is it a company-specific performance metric? YES (industry KPI)
4. **Classification: `operating_kpi`**

Note: Insurance accounting is also complex. "Premiums written" represents policies sold, while "premiums earned" (GAAP revenue) is recognized over the policy period. "Premiums written" is an industry KPI.

### Example 9: Rocket Lab Revenue Per Launch

1. Standard GAAP line item? NO
2. Is it revenue data? NO (it's a calculated ratio)
3. Is it a company-specific performance metric? YES (unit economics KPI)
4. **Classification: `operating_kpi`**

---

## Database Schema Reference

### company_metrics Table Structure

```sql
CREATE TABLE company_metrics (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,              -- 'AAPL', 'NVDA', 'AMZN'
  year INTEGER NOT NULL,             -- 2024, 2023, etc.
  period TEXT NOT NULL,              -- 'FY', 'Q1', 'Q2', 'Q3', 'Q4'

  -- Metric identification
  metric_name TEXT NOT NULL,         -- 'segment_revenue', 'daily_active_users'
  metric_category TEXT,              -- 'segment_reporting', 'revenue_disaggregation', 'operating_kpi'

  -- Value
  metric_value NUMERIC NOT NULL,     -- The actual number
  unit TEXT NOT NULL,                -- 'currency', 'count', 'percentage'

  -- Dimensional breakdown (optional)
  dimension_type TEXT,               -- 'product', 'geographic', 'channel', NULL
  dimension_value TEXT,              -- 'iPhone', 'Americas', 'Enterprise', NULL

  -- Metadata
  data_source TEXT,                  -- 'SEC-XBRL', 'manual', 'API'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Example Records

| symbol | year | metric_name | metric_category | metric_value | unit | dimension_type | dimension_value |
|--------|------|-------------|-----------------|--------------|------|----------------|-----------------|
| AAPL | 2024 | segment_revenue | segment_reporting | 201183000000 | currency | product | iPhone |
| AAPL | 2024 | segment_revenue | segment_reporting | 167045000000 | currency | geographic | Americas |
| AMZN | 2024 | revenue_by_category | revenue_disaggregation | 40000000000 | currency | product_category | Subscription services |
| RBLX | 2024 | daily_active_users | operating_kpi | 79500000 | count | NULL | NULL |
| KAVA | 2024 | store_count | operating_kpi | 350 | count | NULL | NULL |
| SBUX | 2024 | store_count | operating_kpi | 16500 | count | geographic | US |

---

## Adding a New Company: Checklist

When adding a new company to the platform, follow this process:

### Step 1: Identify Available Metrics

Review the company's 10-K filing and look for:

1. **Segment Information** (usually in Notes to Financial Statements)
   - What segments do they report?
   - Do they report both revenue AND operating income by segment?

2. **Revenue Disaggregation** (usually in Notes, under Revenue)
   - How do they break down revenue?
   - By product type? Geography? Customer type? Channel?

3. **Operating KPIs** (usually in MD&A or earnings releases)
   - What non-financial metrics do they highlight?
   - User counts? Store counts? Transaction volumes?

### Step 2: Classify Each Metric

Use the decision framework above to classify each metric as:
- `segment_reporting`
- `revenue_disaggregation`
- `operating_kpi`
- Or determine it belongs in `financials_std` instead

### Step 3: Define Database Values

For each metric, determine:
- `metric_name`: A standardized name (e.g., `segment_revenue`, `store_count`)
- `metric_category`: The classification
- `dimension_type`: How the data is broken down (or NULL)
- `dimension_value`: The specific slice (or NULL)
- `unit`: `currency`, `count`, or `percentage`

### Step 4: Create XBRL Mappings (for automated parsing)

If parsing from SEC filings via iXBRL:
- Identify the XBRL axes used by the company
- Map XBRL member names to display names
- Create a mapping file in `lib/ixbrl-mappings/{ticker}.ts`

### Step 5: Ingest and Verify

- Run the parser or manually enter data
- Verify data accuracy against source filings
- Check that charts render correctly

---

## Summary

The classification system ensures that as we add more companies and metrics, the data remains organized and queryable. The three categories map to real accounting and regulatory distinctions:

| Category | What It Represents | Key Identifier |
|----------|-------------------|----------------|
| `segment_reporting` | ASC 280 operating segments | Has its own P&L (operating income) |
| `revenue_disaggregation` | ASC 606 revenue breakdowns | Revenue-only split, no segment P&L |
| `operating_kpi` | Voluntary company metrics | Non-GAAP or non-financial data |

When in doubt, ask: "Does this segment have its own operating income reported?" If yes, it's `segment_reporting`. If it's just a revenue breakdown, it's `revenue_disaggregation`. If it's not revenue at all, it's probably `operating_kpi`.

---

## Related Documentation

- [METRIC_TAXONOMY.md](./METRIC_TAXONOMY.md) - Technical schema and valid combinations
- [IXBRL_PARSER.md](./IXBRL_PARSER.md) - How to parse segment data from SEC filings
- [CLAUDE.md](../CLAUDE.md) - Overall project architecture and conventions
