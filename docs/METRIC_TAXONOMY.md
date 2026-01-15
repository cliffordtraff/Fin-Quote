# Metric Taxonomy

This document defines the accounting-based classification system for metrics stored in the `company_metrics` table.

## Overview

Financial metrics extracted from SEC filings fall into three distinct categories based on their regulatory/accounting basis:

| Category | Accounting Standard | Required? | Description |
|----------|---------------------|-----------|-------------|
| `segment_reporting` | ASC 280 | Yes | Operating segments reviewed by management |
| `revenue_disaggregation` | ASC 606 | Yes | Revenue broken down by type, geography, timing |
| `operating_kpi` | Voluntary | No | Company-specific key performance indicators |

## Category Definitions

### 1. Segment Reporting (ASC 280)

**Accounting Standard**: ASC 280 - Segment Reporting

A **reportable segment** under GAAP must meet these criteria:
1. Engages in business activities that generate revenue and incur expenses
2. Has operating results regularly reviewed by the chief operating decision maker (CODM)
3. Has discrete financial information available

**What's Included**:
- Segment revenue
- Segment operating income/profit
- Segment assets (if reported)

**Examples by Company**:

| Company | Segments |
|---------|----------|
| Apple | iPhone, Mac, iPad, Services, Wearables (product); Americas, Europe, Greater China, Japan, Rest of Asia Pacific (geographic) |
| Amazon | North America, International, AWS |
| Microsoft | Productivity & Business Processes, Intelligent Cloud, More Personal Computing |
| Alphabet | Google Services, Google Cloud, Other Bets |

**Database Values**:
- `metric_category`: `segment_reporting`
- `metric_name`: `segment_revenue`, `segment_operating_income`
- `dimension_type`: `product`, `geographic`, `segment`

---

### 2. Revenue Disaggregation (ASC 606)

**Accounting Standard**: ASC 606 - Revenue from Contracts with Customers

Companies must disaggregate revenue in a way that depicts how the nature, amount, timing, and uncertainty of revenue are affected by economic factors. Common disaggregation approaches:

- **By product/service type** (different from operating segments)
- **By geography** (may overlap with segment reporting)
- **By timing** (point-in-time vs. over time)
- **By sales channel** (direct, indirect, online, retail)
- **By customer type** (B2B, B2C, government)

**What's Included**:
- Revenue by product category (when different from segments)
- Revenue by sales channel
- Revenue by contract type
- Subscription vs. transactional revenue

**Examples by Company**:

| Company | Revenue Categories (ASC 606) |
|---------|------------------------------|
| Amazon | Online stores, Physical stores, Third-party seller services, Subscription services, Advertising, AWS |
| Netflix | Streaming revenue by region |
| Salesforce | Subscription and support, Professional services |

**Database Values**:
- `metric_category`: `revenue_disaggregation`
- `metric_name`: `revenue_by_category`, `revenue_by_channel`
- `dimension_type`: `product_category`, `channel`, `timing`

---

### 3. Operating KPIs (Voluntary Disclosure)

**Accounting Standard**: None (voluntary supplemental disclosure)

Companies disclose operating metrics that investors find useful for understanding business performance. These are not required by GAAP but are commonly reported in earnings releases, 10-K filings, and investor presentations.

**What's Included**:
- Unit counts (stores, subscribers, users)
- Activity metrics (MAU, DAU, transactions)
- Efficiency metrics (revenue per user, same-store sales)
- Capacity metrics (fleet size, square footage)

**Examples by Company**:

| Company | Operating KPIs |
|---------|----------------|
| Starbucks | Store count (by region), Same-store sales growth |
| Netflix | Paid subscribers (by region), ARPU |
| Uber | Monthly active platform consumers, Trips, Gross bookings |
| Meta | Daily/Monthly active users, ARPU |
| Amazon | Prime members (estimated) |
| Kava | Restaurant count, Average unit volume |

**Database Values**:
- `metric_category`: `operating_kpi`
- `metric_name`: `store_count`, `subscriber_count`, `monthly_active_users`, `arpu`
- `dimension_type`: `geographic`, `null` (for company-wide totals)
- `unit`: `count`, `currency`, `percentage`

---

## Database Schema

### company_metrics Table

```sql
CREATE TABLE company_metrics (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,  -- 'FY', 'Q1', 'Q2', 'Q3', 'Q4'

  -- Metric identification
  metric_name TEXT NOT NULL,
  metric_category TEXT,  -- 'segment_reporting', 'revenue_disaggregation', 'operating_kpi'

  -- Value
  metric_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,  -- 'currency', 'count', 'percentage'

  -- Dimensional breakdown (optional)
  dimension_type TEXT,   -- 'product', 'geographic', 'channel', etc.
  dimension_value TEXT,  -- 'iPhone', 'Americas', 'Online', etc.

  -- Metadata
  data_source TEXT,      -- 'SEC-XBRL', 'manual', 'API'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (symbol, year, period, metric_name, dimension_type, dimension_value),
  CHECK (metric_category IN ('segment_reporting', 'revenue_disaggregation', 'operating_kpi') OR metric_category IS NULL)
);
```

### Valid Combinations

| metric_category | metric_name | dimension_type | unit | Example |
|-----------------|-------------|----------------|------|---------|
| `segment_reporting` | `segment_revenue` | `product` | `currency` | Apple iPhone revenue |
| `segment_reporting` | `segment_revenue` | `geographic` | `currency` | Apple Americas revenue |
| `segment_reporting` | `segment_operating_income` | `segment` | `currency` | Microsoft Intelligent Cloud operating income |
| `revenue_disaggregation` | `revenue_by_category` | `product_category` | `currency` | Amazon Subscription services |
| `revenue_disaggregation` | `revenue_by_channel` | `channel` | `currency` | Nike Direct vs Wholesale |
| `operating_kpi` | `store_count` | `geographic` | `count` | Starbucks US stores |
| `operating_kpi` | `store_count` | `null` | `count` | Kava total restaurants |
| `operating_kpi` | `subscriber_count` | `geographic` | `count` | Netflix UCAN subscribers |
| `operating_kpi` | `monthly_active_users` | `null` | `count` | Meta MAU |
| `operating_kpi` | `arpu` | `geographic` | `currency` | Netflix ARPU by region |

---

## XBRL Mapping

When parsing iXBRL filings, use these rules to determine metric category:

### Segment Reporting (ASC 280)
XBRL axes that indicate segment reporting:
- `us-gaap:StatementBusinessSegmentsAxis`
- `srt:ProductOrServiceAxis` (when used with segment-level revenue)

### Revenue Disaggregation (ASC 606)
XBRL axes that indicate revenue disaggregation:
- `us-gaap:ContractWithCustomerSalesChannelAxis`
- `us-gaap:TimingOfTransferOfGoodOrServiceAxis`
- `srt:ProductOrServiceAxis` (when used with non-segment revenue categories)

### Operating KPIs
These are typically not in XBRL tags. They appear in:
- Management Discussion & Analysis (MD&A) section
- Supplemental data tables
- Non-GAAP measures section

May require text parsing or manual extraction.

---

## Adding New Metrics

When adding a new metric type, classify it using this decision tree:

```
Is the metric required by GAAP/SEC?
├── YES: Is it segment-level data reviewed by the CODM?
│   ├── YES → segment_reporting (ASC 280)
│   └── NO → revenue_disaggregation (ASC 606)
└── NO → operating_kpi (voluntary)
```

### Examples

**"Amazon subscription revenue"**
- Required by GAAP? Yes (ASC 606 disaggregation)
- Segment-level? No (Amazon's segments are North America, International, AWS)
- Classification: `revenue_disaggregation`

**"Kava restaurant count"**
- Required by GAAP? No (voluntary disclosure)
- Classification: `operating_kpi`

**"Apple iPhone revenue"**
- Required by GAAP? Yes
- Segment-level? Yes (Apple reports iPhone as a product segment)
- Classification: `segment_reporting`

---

## Migration Notes

### Existing Data Update

All existing `segment_revenue` data in `company_metrics` should be classified as `segment_reporting`:

```sql
UPDATE company_metrics
SET metric_category = 'segment_reporting'
WHERE metric_name = 'segment_revenue';
```

### Parser Updates

The iXBRL parser (`scripts/parse-ixbrl-segments.ts`) should set `metric_category: 'segment_reporting'` for all segment revenue data extracted from SEC filings.
